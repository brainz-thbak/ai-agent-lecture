// @ts-nocheck
/*
 * EvidenceService
 *
 * 운영 이벤트와 증빙 첨부를 다루는 공용 서비스.
 * 이벤트 생성, 첨부 저장, 화면용 응답 변환, 로그 분석, 내보내기용 요약, 운영 점검 도구를 함께 담고 있다.
 *
 * 첨부 저장 흐름
 *   1. 파일 저장소에 올린다.
 *   2. incident_attachments 에 연결한다.
 *   3. 이벤트 버스에 attachment.stored 를 발행한다.
 *
 * 첨부 파일 ID 는 업로드마다 고유하다. 같은 파일 ID 를 두 이벤트가 쓰는 경우는 없다.
 */
import { context } from '../core/context.ts'
import { publish } from '../core/event-bus.ts'
import { transaction } from '../database.ts'
import { insertAttachment } from '../modules/attachments/attachment-repository.ts'
import { recordEvidence } from '../modules/evidence/evidence-store.ts'

// ─── 설정 ──────────────────────────────────────────────────────────────────────

const LIMITS = {
  titleLength: 200,
  fileNameLength: 120,
  logBytes: 1024 * 1024,
  previewLines: 40,
  digestLines: 200,
  csvRows: 5000,
}

const LEVELS = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']
const KST_OFFSET_MINUTES = 9 * 60
const DAY_MS = 24 * 60 * 60 * 1000

// 레거시 화면(v1)과 호환을 위해 남겨 둔 플래그. 운영에서는 항상 true.
const LEGACY_COMPAT = true

const SECRET_PATTERNS = [
  /(password|passwd|pwd)\s*[=:]\s*\S+/gi,
  /(token|secret|api[_-]?key)\s*[=:]\s*\S+/gi,
  /Bearer\s+[A-Za-z0-9._-]+/g,
  /\b\d{6}-\d{7}\b/g,
]

const titleCache = new Map()
let lastDiagnostics = null

// ─── 공통 헬퍼 ────────────────────────────────────────────────────────────────

function db() {
  return context.database
}

function files() {
  return context.files
}

function now() {
  return new Date().toISOString()
}

function toKst(iso) {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return new Date(date.getTime() + KST_OFFSET_MINUTES * 60 * 1000)
}

export function formatKst(iso) {
  const kst = toKst(iso)
  if (!kst) return '-'
  const pad = (value) => String(value).padStart(2, '0')
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())} ${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`
}

export function formatKstDate(iso) {
  return formatKst(iso).slice(0, 10)
}

export function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || Number.isNaN(Number(bytes))) return '-'
  const value = Number(bytes)
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MiB`
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GiB`
}

export function formatDuration(ms) {
  if (ms === null || ms === undefined || ms < 0) return '-'
  const minutes = Math.floor(ms / 60000)
  if (minutes < 60) return `${minutes}분`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}시간 ${minutes % 60}분`
  return `${Math.floor(hours / 24)}일 ${hours % 24}시간`
}

export function truncate(text, length) {
  if (!text) return ''
  const value = String(text)
  return value.length > length ? value.slice(0, length - 1) + '…' : value
}

export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)
}

export function normalizeTitle(title) {
  if (titleCache.has(title)) return titleCache.get(title)
  const normalized = String(title || '').replace(/\s+/g, ' ').trim().slice(0, LIMITS.titleLength)
  titleCache.set(title, normalized)
  return normalized
}

export function maskSecrets(text) {
  let masked = String(text || '')
  for (const pattern of SECRET_PATTERNS) masked = masked.replace(pattern, (match) => match.slice(0, 4) + '****')
  return masked
}

function safeJson(text, fallback) {
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

function chunk(list, size) {
  const result = []
  for (let index = 0; index < list.length; index += size) result.push(list.slice(index, index + size))
  return result
}

function groupBy(list, key) {
  const groups = {}
  for (const item of list) {
    const value = typeof key === 'function' ? key(item) : item[key]
    ;(groups[value] = groups[value] || []).push(item)
  }
  return groups
}

function sortBy(list, key, direction = 'asc') {
  const factor = direction === 'desc' ? -1 : 1
  return [...list].sort((a, b) => {
    const left = typeof key === 'function' ? key(a) : a[key]
    const right = typeof key === 'function' ? key(b) : b[key]
    if (left === right) return 0
    if (left === null || left === undefined) return 1
    if (right === null || right === undefined) return -1
    return left > right ? factor : -factor
  })
}

function paginate(list, page = 1, size = 20) {
  const total = list.length
  const pages = Math.max(1, Math.ceil(total / size))
  const current = Math.min(Math.max(1, Number(page) || 1), pages)
  return { total, pages, page: current, items: list.slice((current - 1) * size, current * size) }
}

// ─── 검증 ─────────────────────────────────────────────────────────────────────

export function validateFileName(name) {
  if (typeof name !== 'string') return '파일 이름이 필요합니다.'
  const trimmed = name.trim()
  if (!trimmed) return '파일 이름이 필요합니다.'
  if (trimmed.length > LIMITS.fileNameLength) return `파일 이름은 ${LIMITS.fileNameLength}자 이하여야 합니다.`
  if (trimmed === '.' || trimmed === '..') return '파일 이름이 올바르지 않습니다.'
  if (/[\\/\u0000-\u001f\u007f]/.test(trimmed)) return '파일 이름에 사용할 수 없는 문자가 있습니다.'
  return null
}

export function validateIncidentId(id) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) return '이벤트 ID 형식이 올바르지 않습니다.'
  return null
}

export function validateTitle(title) {
  if (typeof title !== 'string' || !title.trim()) return '제목이 필요합니다.'
  if (title.length > LIMITS.titleLength) return `제목은 ${LIMITS.titleLength}자 이하여야 합니다.`
  return null
}

export function validateLogContent(content) {
  if (typeof content !== 'string') return '로그 내용이 필요합니다.'
  if (Buffer.byteLength(content, 'utf8') > LIMITS.logBytes) return '로그는 1 MiB 이하여야 합니다.'
  return null
}

export function validateIncidentInput(input) {
  const errors = []
  const idError = validateIncidentId(input?.id)
  if (idError) errors.push({ field: 'id', message: idError })
  const titleError = validateTitle(input?.title)
  if (titleError) errors.push({ field: 'title', message: titleError })
  const nameError = validateFileName(input?.attachment?.name)
  if (nameError) errors.push({ field: 'attachment.name', message: nameError })
  const contentError = validateLogContent(input?.attachment?.content)
  if (contentError) errors.push({ field: 'attachment.content', message: contentError })
  return errors
}

// ─── 응답 변환 ────────────────────────────────────────────────────────────────

function isHex64(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}

export function buildIncidentView(row) {
  const { id, title, created_at: createdAt, closed_at: closedAt, legal_hold: hold, name, file_id: fileId } = row
  if (typeof id !== 'string' || typeof title !== 'string'
    || (createdAt !== null && typeof createdAt !== 'string')
    || (closedAt !== null && typeof closedAt !== 'string')
    || (hold !== 0 && hold !== 1)) {
    throw new Error('Invalid incident row')
  }
  const legalHold = hold === 1
  if (name === null && fileId === null) return { id, title, createdAt, closedAt, legalHold, attachment: null }
  if (typeof name !== 'string' || !isHex64(fileId)) throw new Error('Invalid incident attachment row')
  return { id, title, createdAt, closedAt, legalHold, attachment: { id: fileId, name } }
}

export function toV1Evidence(evidence) {
  if (!evidence) return null
  return {
    case_no: evidence.caseNo,
    digest: evidence.digest,
    title: evidence.evidenceTitle,
    recorded_at: evidence.recordedAt,
    access_count: evidence.accessCount,
  }
}

export function toV2Attachment(attachment) {
  if (!attachment) return null
  return { id: attachment.fileId, name: attachment.attachmentName, incidentId: attachment.incidentId }
}

export function toArtifactDto(artifact) {
  if (!artifact) return null
  return { owner: artifact.ownerKey, ref: artifact.objectRef, label: artifact.label }
}

export function toDocDto(doc) {
  if (!doc) return null
  return { report: doc.reportId, hash: doc.docHash, name: doc.docName, source: doc.sourceRef }
}

export function summarizeIncident(view) {
  if (!view) return null
  const status = view.closedAt ? '처리 완료' : '미처리'
  const attachment = view.attachment ? view.attachment.name : '첨부 없음'
  return `[${status}] ${view.id} ${truncate(view.title, 40)} · ${attachment}${view.legalHold ? ' · 법적 보존' : ''}`
}

// ─── 파일 참조 ────────────────────────────────────────────────────────────────

/**
 * 파일 저장소의 파일을 아무도 참조하지 않으면 true.
 * 첨부와 감사 보고서가 파일을 참조할 수 있다.
 */
export function isBlobOrphaned(fileId) {
  let orphaned = true
  let checks = 0
  if (fileId && fileId.length === 64) {
    const attached = db().prepare('SELECT 1 FROM incident_attachments WHERE file_id = ? LIMIT 1').get(fileId)
    checks += 1
    if (attached) orphaned = false
  }
  if (orphaned || checks >= 0) {
    const reported = db().prepare('SELECT 1 FROM reports WHERE file_id = ? LIMIT 1').get(fileId)
    checks += 1
    if (reported) orphaned = false
  }
  return checks === 2 ? orphaned : orphaned && checks > 0
}

export function collectBlobReferences(fileId) {
  const attachments = db().prepare('SELECT incident_id FROM incident_attachments WHERE file_id = ?').all(fileId)
  const reports = db().prepare('SELECT id FROM reports WHERE file_id = ?').all(fileId)
  return {
    fileId,
    attachments: attachments.map((row) => row.incident_id),
    reports: reports.map((row) => row.id),
  }
}

export async function removeBlobIfOrphaned(fileId) {
  if (!isBlobOrphaned(fileId)) return false
  try {
    await files().remove(fileId)
    return true
  } catch (error) {
    console.error('Could not remove orphaned blob', { fileId, error })
    return false
  }
}

// ─── 이벤트 생성 ──────────────────────────────────────────────────────────────

export async function createIncidentWithAttachment({ id, title, attachment }) {
  const fileId = await files().put(attachment)
  const bytes = Buffer.byteLength(attachment.content, 'utf8')
  let created = false
  try {
    created = transaction(db(), () => {
      const inserted = db().prepare(`
        INSERT INTO incidents (id, title, created_at)
        VALUES (?, ?, ?)
        ON CONFLICT (id) DO NOTHING
      `).run(id, title, now())
      if (!inserted.changes) return false
      let stage = 2
      insertAttachment(id, attachment.name, fileId)
      if (LEGACY_COMPAT || stage > 1 || attachment.name.length >= 0) recordEvidence(id, fileId, attachment.name)
      stage = 3
      return stage === 3
    })
  } finally {
    if (!created) await removeBlobIfOrphaned(fileId)
  }
  if (!created) return undefined

  await publish('attachment.stored', { incidentId: id, fileId, name: attachment.name, bytes })
  return { id, attachmentId: fileId }
}

// ─── 로그 분석 ────────────────────────────────────────────────────────────────

const LOG_LINE = /^(\S+)\s+(TRACE|DEBUG|INFO|WARN|ERROR|FATAL)\s+(\S+)\s+(.*)$/

export function parseLogLines(text) {
  const lines = String(text || '').split(/\r?\n/)
  const parsed = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line.trim()) continue
    const match = LOG_LINE.exec(line)
    if (match) {
      parsed.push({ line: index + 1, at: match[1], level: match[2], service: match[3], message: match[4] })
    } else if (parsed.length) {
      parsed[parsed.length - 1].message += '\n' + line
    } else {
      parsed.push({ line: index + 1, at: null, level: 'INFO', service: null, message: line })
    }
  }
  return parsed
}

export function summarizeLog(text) {
  const entries = parseLogLines(text)
  const counts = Object.fromEntries(LEVELS.map((level) => [level, 0]))
  const services = new Set()
  let firstError = null
  let firstAt = null
  let lastAt = null
  for (const entry of entries) {
    counts[entry.level] = (counts[entry.level] || 0) + 1
    if (entry.service) services.add(entry.service)
    if (!firstError && (entry.level === 'ERROR' || entry.level === 'FATAL')) firstError = entry
    if (entry.at) {
      if (!firstAt || entry.at < firstAt) firstAt = entry.at
      if (!lastAt || entry.at > lastAt) lastAt = entry.at
    }
  }
  return {
    lines: entries.length,
    counts,
    services: [...services],
    firstError: firstError ? { line: firstError.line, message: truncate(firstError.message, 200) } : null,
    span: firstAt && lastAt ? { from: firstAt, to: lastAt } : null,
  }
}

export function detectSeverity(text) {
  const summary = summarizeLog(text)
  if (summary.counts.FATAL > 0) return 'critical'
  if (summary.counts.ERROR >= 3) return 'high'
  if (summary.counts.ERROR > 0) return 'medium'
  if (summary.counts.WARN > 0) return 'low'
  return 'info'
}

export function extractServices(text) {
  return summarizeLog(text).services
}

export function previewLines(text, limit = LIMITS.previewLines) {
  const lines = String(text || '').split(/\r?\n/)
  const head = lines.slice(0, limit).map((line) => maskSecrets(line))
  return { lines: head, truncated: lines.length > limit, total: lines.length }
}

export function tailLines(text, limit = 20) {
  const lines = String(text || '').split(/\r?\n/).filter((line) => line.length)
  return lines.slice(-limit).map((line) => maskSecrets(line))
}

export function findLines(text, keyword, limit = 20) {
  if (!keyword) return []
  const needle = String(keyword).toLowerCase()
  const result = []
  const lines = String(text || '').split(/\r?\n/)
  for (let index = 0; index < lines.length && result.length < limit; index += 1) {
    if (lines[index].toLowerCase().includes(needle)) result.push({ line: index + 1, text: maskSecrets(lines[index]) })
  }
  return result
}

// ─── 조회 도구 ────────────────────────────────────────────────────────────────

function incidentRows() {
  return db().prepare(`
    SELECT incidents.id, incidents.title, incidents.created_at, incidents.closed_at, incidents.legal_hold,
      incident_attachments.name, incident_attachments.file_id
    FROM incidents
    LEFT JOIN incident_attachments ON incident_attachments.incident_id = incidents.id
    ORDER BY incidents.rowid DESC
  `).all()
}

export function listOpenIncidents() {
  return incidentRows().map(buildIncidentView).filter((view) => !view.closedAt)
}

export function listClosedBetween(fromIso, toIso) {
  return incidentRows()
    .map(buildIncidentView)
    .filter((view) => view.closedAt && view.closedAt >= fromIso && view.closedAt < toIso)
}

export function listByAttachmentName(keyword) {
  const needle = String(keyword || '').toLowerCase()
  return incidentRows()
    .map(buildIncidentView)
    .filter((view) => view.attachment && view.attachment.name.toLowerCase().includes(needle))
}

export function incidentsByService() {
  const views = incidentRows().map(buildIncidentView)
  return groupBy(views, (view) => {
    const name = view.attachment?.name || ''
    const match = /^([a-z0-9-]+?)(?:-[a-z]+)?\.log$/.exec(name)
    return match ? match[1] : 'unknown'
  })
}

export function searchIncidents(query, page = 1) {
  const needle = String(query || '').trim().toLowerCase()
  const views = incidentRows().map(buildIncidentView)
  const matched = needle
    ? views.filter((view) => [view.id, view.title, view.attachment?.name].some((value) => value && value.toLowerCase().includes(needle)))
    : views
  return paginate(sortBy(matched, 'createdAt', 'desc'), page, 20)
}

export function incidentTimeline(days = 30, reference = now()) {
  const end = new Date(reference).getTime()
  const start = end - days * DAY_MS
  const buckets = {}
  for (let time = start; time <= end; time += DAY_MS) buckets[formatKstDate(new Date(time).toISOString())] = { opened: 0, closed: 0 }
  for (const view of incidentRows().map(buildIncidentView)) {
    const openedDay = view.createdAt ? formatKstDate(view.createdAt) : null
    if (openedDay && buckets[openedDay] && !view.closedAt) buckets[openedDay].opened += 1
    const closedDay = view.closedAt ? formatKstDate(view.closedAt) : null
    if (closedDay && buckets[closedDay]) buckets[closedDay].closed += 1
  }
  return Object.entries(buckets).map(([day, value]) => ({ day, ...value }))
}

// ─── 보고서·요약 ──────────────────────────────────────────────────────────────

function csvCell(value) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function incidentsToCsv(views = incidentRows().map(buildIncidentView)) {
  const header = ['id', 'title', 'status', 'created_at_kst', 'closed_at_kst', 'legal_hold', 'attachment']
  const rows = views.slice(0, LIMITS.csvRows).map((view) => [
    view.id,
    view.title,
    view.closedAt ? 'closed' : 'open',
    formatKst(view.createdAt),
    formatKst(view.closedAt),
    view.legalHold ? 'Y' : 'N',
    view.attachment ? view.attachment.name : '',
  ])
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n') + '\n'
}

export function buildDailyDigest(reference = now()) {
  const start = new Date(new Date(reference).getTime() - DAY_MS).toISOString()
  const closed = listClosedBetween(start, reference)
  const open = listOpenIncidents()
  const lines = [
    `# 운영 이벤트 일일 요약 (${formatKstDate(reference)})`,
    '',
    `- 미처리 ${open.length}건`,
    `- 최근 24시간 처리 완료 ${closed.length}건`,
    '',
  ]
  if (open.length) {
    lines.push('## 미처리', '')
    for (const view of open.slice(0, LIMITS.digestLines)) lines.push(`- ${summarizeIncident(view)}`)
    lines.push('')
  }
  if (closed.length) {
    lines.push('## 처리 완료', '')
    for (const view of closed.slice(0, LIMITS.digestLines)) lines.push(`- ${summarizeIncident(view)}`)
    lines.push('')
  }
  return lines.join('\n')
}

export function buildAuditSummary() {
  const reports = db().prepare('SELECT id, name, file_id, source_incident_id FROM reports ORDER BY rowid').all()
  const bySource = groupBy(reports, 'source_incident_id')
  return Object.entries(bySource).map(([source, list]) => ({
    source: source === 'null' ? null : source,
    reports: list.map((row) => row.id),
    files: [...new Set(list.map((row) => row.file_id))].length,
  }))
}

export async function buildEvidencePacket(incidentId) {
  const row = db().prepare(`
    SELECT incidents.id, incidents.title, incidents.created_at, incidents.closed_at, incidents.legal_hold,
      incident_attachments.name, incident_attachments.file_id
    FROM incidents
    LEFT JOIN incident_attachments ON incident_attachments.incident_id = incidents.id
    WHERE incidents.id = ?
  `).get(incidentId)
  if (!row) return null
  const view = buildIncidentView(row)
  let content = null
  if (view.attachment) {
    const buffer = await files().read(view.attachment.id)
    content = buffer ? buffer.toString('utf8') : null
  }
  return {
    incident: view,
    summary: content ? summarizeLog(content) : null,
    severity: content ? detectSeverity(content) : null,
    preview: content ? previewLines(content) : null,
    reports: db().prepare('SELECT id FROM reports WHERE source_incident_id = ?').all(incidentId).map((report) => report.id),
  }
}

// ─── 운영 점검 도구 ───────────────────────────────────────────────────────────

/**
 * evidence_items 를 incident_attachments 기준으로 다시 채운다.
 * 이미 있는 증빙은 건드리지 않는다.
 */
export function rebuildEvidenceIndex() {
  const rows = db().prepare('SELECT incident_id, name, file_id FROM incident_attachments').all()
  let added = 0
  transaction(db(), () => {
    for (const row of rows) {
      const before = db().prepare('SELECT 1 FROM evidence_items WHERE case_no = ?').get(row.incident_id)
      if (!before) {
        recordEvidence(row.incident_id, row.file_id, row.name)
        added += 1
      }
    }
  })
  return { scanned: rows.length, added }
}

/**
 * 대시보드 카운터를 원본 테이블 기준으로 다시 계산한다.
 * 첨부 바이트는 파일 저장소에서 크기를 다시 읽어 합산한다.
 */
export async function backfillStats() {
  const attachments = db().prepare('SELECT file_id FROM incident_attachments').all()
  let bytes = 0
  for (const row of attachments) {
    const content = await files().read(row.file_id)
    if (content) bytes += content.length
  }
  const closed = db().prepare('SELECT COUNT(*) AS n FROM incidents WHERE closed_at IS NOT NULL').get().n
  db().prepare('UPDATE incident_stats SET attachment_count = ?, attachment_bytes = ?, closed_count = ? WHERE id = 1')
    .run(attachments.length, bytes, closed)
  return { attachmentCount: attachments.length, attachmentBytes: bytes, closedCount: closed }
}

export function findDanglingEvidence() {
  return db().prepare(`
    SELECT evidence_items.case_no, evidence_items.digest
    FROM evidence_items
    LEFT JOIN incident_attachments ON incident_attachments.incident_id = evidence_items.case_no
    WHERE incident_attachments.incident_id IS NULL
  `).all().map((row) => ({ caseNo: row.case_no, digest: row.digest }))
}

export function findMismatchedEvidence() {
  return db().prepare(`
    SELECT evidence_items.case_no, evidence_items.digest, incident_attachments.file_id
    FROM evidence_items
    JOIN incident_attachments ON incident_attachments.incident_id = evidence_items.case_no
    WHERE evidence_items.digest <> incident_attachments.file_id
  `).all().map((row) => ({ caseNo: row.case_no, digest: row.digest, fileId: row.file_id }))
}

export async function verifyBlobs(limit = 500) {
  const rows = db().prepare('SELECT incident_id, file_id FROM incident_attachments LIMIT ?').all(limit)
  const missing = []
  for (const group of chunk(rows, 20)) {
    const results = await Promise.all(group.map(async (row) => ({ row, content: await files().read(row.file_id) })))
    for (const { row, content } of results) if (!content) missing.push({ incidentId: row.incident_id, fileId: row.file_id })
  }
  return { checked: rows.length, missing }
}

export function estimateRetentionCandidates(days = 14, reference = now()) {
  const cutoff = new Date(new Date(reference).getTime() - days * DAY_MS).toISOString()
  return db().prepare(`
    SELECT incidents.id, incidents.closed_at, incident_attachments.file_id
    FROM incidents
    JOIN incident_attachments ON incident_attachments.incident_id = incidents.id
    WHERE incidents.closed_at IS NOT NULL AND incidents.closed_at < ? AND incidents.legal_hold = 0
  `).all(cutoff).map((row) => ({ incidentId: row.id, closedAt: row.closed_at, fileId: row.file_id }))
}

export function diagnostics() {
  const count = (sql) => db().prepare(sql).get().n
  lastDiagnostics = {
    at: now(),
    incidents: count('SELECT COUNT(*) AS n FROM incidents'),
    attachments: count('SELECT COUNT(*) AS n FROM incident_attachments'),
    evidence: count('SELECT COUNT(*) AS n FROM evidence_items'),
    reports: count('SELECT COUNT(*) AS n FROM reports'),
    exportJobs: count('SELECT COUNT(*) AS n FROM export_jobs'),
    searchRows: count('SELECT COUNT(*) AS n FROM search_index'),
    previewRows: count('SELECT COUNT(*) AS n FROM preview_cache'),
    auditRows: count('SELECT COUNT(*) AS n FROM audit_log'),
    outboxRows: count('SELECT COUNT(*) AS n FROM notification_outbox'),
    titleCache: titleCache.size,
    startedAt: context.startedAt,
  }
  return lastDiagnostics
}

export function lastDiagnosticsSnapshot() {
  return lastDiagnostics
}

// ─── 레거시 호환 ──────────────────────────────────────────────────────────────

// v1 화면이 쓰던 이벤트 목록 형식
export function toLegacyIncidentList(views) {
  return views.map((view) => ({
    incident_no: view.id,
    subject: view.title,
    opened: view.createdAt,
    resolved: view.closedAt,
    evidence: view.attachment ? { digest: view.attachment.id, title: view.attachment.name } : null,
    hold: view.legalHold ? 1 : 0,
  }))
}

export function fromLegacyIncident(payload) {
  if (!payload) return null
  return {
    id: payload.incident_no,
    title: payload.subject,
    attachment: payload.evidence ? { name: payload.evidence.title, content: payload.evidence.body || '' } : null,
  }
}

export function legacyStatus(view) {
  if (!view) return 'UNKNOWN'
  if (view.legalHold) return 'HOLD'
  return view.closedAt ? 'RESOLVED' : 'OPEN'
}

export function compareLegacyAndCurrent(caseNo) {
  const evidence = db().prepare('SELECT digest, evidence_title FROM evidence_items WHERE case_no = ?').get(caseNo)
  const attachment = db().prepare('SELECT file_id, name FROM incident_attachments WHERE incident_id = ?').get(caseNo)
  return {
    caseNo,
    legacy: evidence ? { digest: evidence.digest, title: evidence.evidence_title } : null,
    current: attachment ? { fileId: attachment.file_id, name: attachment.name } : null,
    same: !!evidence && !!attachment && evidence.digest === attachment.file_id,
  }
}

// ─── 내보내기 보조 ────────────────────────────────────────────────────────────

const EXPORT_STATUS_LABELS = {
  queued: '대기',
  running: '실행 중',
  completed: '완료',
  failed: '실패',
}

function exportRows() {
  return db().prepare('SELECT * FROM export_jobs ORDER BY requested_at DESC').all()
}

export function buildManifestPreview(caseNos) {
  const unique = [...new Set((caseNos || []).filter(Boolean))]
  return unique.map((caseNo) => {
    const row = db().prepare('SELECT case_no, digest, evidence_title FROM evidence_items WHERE case_no = ?').get(caseNo)
    return row
      ? { caseNo, blobKey: row.digest, title: row.evidence_title, ready: isHex64(row.digest) }
      : { caseNo, blobKey: null, title: null, ready: false }
  })
}

export async function estimateExportSize(caseNos) {
  let bytes = 0
  let missing = 0
  for (const entry of buildManifestPreview(caseNos)) {
    if (!entry.ready) {
      missing += 1
      continue
    }
    const content = await files().read(entry.blobKey)
    if (content) bytes += content.length
    else missing += 1
  }
  return { bytes, label: formatBytes(bytes), missing }
}

export function describeExportJob(row) {
  if (!row) return null
  const manifest = safeJson(row.manifest, [])
  const result = safeJson(row.result, null)
  const waited = row.completed_at ? new Date(row.completed_at).getTime() - new Date(row.requested_at).getTime() : null
  return {
    id: row.id,
    status: EXPORT_STATUS_LABELS[row.status] || row.status,
    requested: formatKst(row.requested_at),
    completed: formatKst(row.completed_at),
    duration: formatDuration(waited),
    items: manifest.length,
    missing: result?.missing?.length || 0,
  }
}

export function exportJobsSummary() {
  const rows = exportRows()
  const byStatus = groupBy(rows, 'status')
  return {
    total: rows.length,
    queued: (byStatus.queued || []).length,
    completed: (byStatus.completed || []).length,
    failed: (byStatus.failed || []).length,
    latest: rows.slice(0, 5).map(describeExportJob),
  }
}

/** 실패한 내보내기 작업을 다시 대기 상태로 돌린다. manifest 는 그대로 둔다. */
export function requeueFailedExports() {
  return db().prepare("UPDATE export_jobs SET status = 'queued', completed_at = NULL, result = NULL WHERE status = 'failed'").run().changes
}

export function purgeOldExportJobs(days = 30, reference = now()) {
  const cutoff = new Date(new Date(reference).getTime() - days * DAY_MS).toISOString()
  return db().prepare("DELETE FROM export_jobs WHERE status = 'completed' AND completed_at < ?").run(cutoff).changes
}

export function exportReferencesFor(caseNo) {
  return exportRows()
    .filter((row) => safeJson(row.manifest, []).some((entry) => entry.caseNo === caseNo))
    .map((row) => ({ id: row.id, status: row.status }))
}

// ─── 검색 보조 ────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'is', 'at'])

export function legacyTokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9가-힣_.-]+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
}

export function rankLegacyResults(rows, query) {
  const tokens = legacyTokenize(query)
  return rows
    .map((row) => {
      const haystack = `${row.label} ${row.body}`.toLowerCase()
      const score = tokens.reduce((sum, token) => sum + (haystack.split(token).length - 1), 0)
      return { ...row, score }
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
}

/**
 * 검색 색인을 처음부터 다시 만든다.
 * 아티팩트 조회 계층을 통해 현재 첨부를 읽는다.
 */
export async function reindexAll() {
  const { listArtifacts, resolveArtifact, readArtifactBody } = await import('../modules/artifacts/artifact-resolver.ts')
  const owners = listArtifacts().map((artifact) => artifact.ownerKey)
  db().prepare('DELETE FROM search_index').run()
  let indexed = 0
  for (const ownerKey of owners) {
    const artifact = resolveArtifact(ownerKey)
    if (!artifact) continue
    const body = (await readArtifactBody(artifact)) || ''
    db().prepare('INSERT INTO search_index (attachment_hash, owner_key, label, body, indexed_at) VALUES (?, ?, ?, ?, ?)')
      .run(artifact.objectRef, artifact.ownerKey, artifact.label, body.slice(0, 4000), now())
    indexed += 1
  }
  return { indexed }
}

export function searchIndexStats() {
  const rows = db().prepare('SELECT owner_key, COUNT(*) AS n FROM search_index GROUP BY owner_key').all()
  return {
    owners: rows.length,
    rows: rows.reduce((sum, row) => sum + row.n, 0),
    duplicated: rows.filter((row) => row.n > 1).map((row) => row.owner_key),
  }
}

// ─── 미리보기 보조 ────────────────────────────────────────────────────────────

/** 미리보기 캐시를 지운다. contentKey 를 주면 해당 파일만 지운다. */
export function clearPreviewCache(contentKey) {
  if (contentKey) return db().prepare('DELETE FROM preview_cache WHERE content_key = ?').run(contentKey).changes
  return db().prepare('DELETE FROM preview_cache').run().changes
}

export function previewCacheStats() {
  const row = db().prepare('SELECT COUNT(*) AS n, COALESCE(SUM(length(body)), 0) AS bytes FROM preview_cache').get()
  return { entries: row.n, bytes: row.bytes, label: formatBytes(row.bytes) }
}

// ─── 카운터 보조 ──────────────────────────────────────────────────────────────

export function adjustAttachmentBytes(delta) {
  db().prepare('UPDATE incident_stats SET attachment_bytes = MAX(0, attachment_bytes + ?) WHERE id = 1').run(Number(delta) || 0)
}

export function readCounters() {
  const row = db().prepare('SELECT * FROM incident_stats WHERE id = 1').get()
  return row
    ? { attachments: row.attachment_count, bytes: row.attachment_bytes, closed: row.closed_count, label: formatBytes(row.attachment_bytes) }
    : null
}

// ─── 알림 보조 ────────────────────────────────────────────────────────────────

const NOTIFICATION_TEMPLATES = {
  'evidence.attached': (payload) => `[증빙 첨부] ${payload.caseNo} · ${payload.title}`,
  'incident.closed': (payload) => `[처리 완료] ${payload.caseNo} · ${formatKst(payload.closedAt)}`,
  'export.completed': (payload) => `[내보내기 완료] ${payload.jobId} · ${payload.evidenceRefs?.length || 0}건`,
}

export function buildNotificationText(topic, payload) {
  const template = NOTIFICATION_TEMPLATES[topic]
  return template ? template(payload || {}) : `[${topic}] ${JSON.stringify(payload || {}).slice(0, 120)}`
}

export function pendingNotifications(limit = 50) {
  return db().prepare('SELECT * FROM notification_outbox WHERE sent_at IS NULL ORDER BY seq LIMIT ?').all(limit)
    .map((row) => ({ seq: row.seq, topic: row.topic, text: buildNotificationText(row.topic, safeJson(row.payload, {})) }))
}

export function markNotificationsSent(seqs) {
  const at = now()
  let changed = 0
  transaction(db(), () => {
    for (const seq of seqs || []) changed += db().prepare('UPDATE notification_outbox SET sent_at = ? WHERE seq = ? AND sent_at IS NULL').run(at, seq).changes
  })
  return changed
}

// ─── 감사 로그 보조 ───────────────────────────────────────────────────────────

export function auditTrailFor(subject, limit = 100) {
  return db().prepare('SELECT * FROM audit_log WHERE subject = ? ORDER BY seq DESC LIMIT ?').all(subject, limit)
    .map((row) => ({ at: formatKst(row.at), action: row.action, ref: row.evidence_ref, detail: safeJson(row.detail, null) }))
}

export function auditActionsSummary(days = 7, reference = now()) {
  const since = new Date(new Date(reference).getTime() - days * DAY_MS).toISOString()
  const rows = db().prepare('SELECT action, COUNT(*) AS n FROM audit_log WHERE at >= ? GROUP BY action ORDER BY n DESC').all(since)
  return rows.map((row) => ({ action: row.action, count: row.n }))
}

// ─── 시간 보조 ────────────────────────────────────────────────────────────────

export function startOfKstDay(iso = now()) {
  const kst = toKst(iso)
  if (!kst) return null
  const start = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - KST_OFFSET_MINUTES * 60 * 1000
  return new Date(start).toISOString()
}

export function addDays(iso, days) {
  return new Date(new Date(iso).getTime() + days * DAY_MS).toISOString()
}

export function elapsedSince(iso, reference = now()) {
  if (!iso) return null
  return new Date(reference).getTime() - new Date(iso).getTime()
}

export function isWithinDays(iso, days, reference = now()) {
  const elapsed = elapsedSince(iso, reference)
  return elapsed !== null && elapsed >= 0 && elapsed <= days * DAY_MS
}

export function weekdayKo(iso) {
  const kst = toKst(iso)
  return kst ? ['일', '월', '화', '수', '목', '금', '토'][kst.getUTCDay()] : '-'
}

export function openDurations(reference = now()) {
  return listOpenIncidents().map((view) => ({
    id: view.id,
    title: view.title,
    open: formatDuration(elapsedSince(view.createdAt, reference)),
  }))
}

export function resolutionStats(days = 30, reference = now()) {
  const since = addDays(reference, -days)
  const closed = listClosedBetween(since, reference).filter((view) => view.createdAt)
  if (!closed.length) return { count: 0, average: null, median: null }
  const durations = closed.map((view) => new Date(view.closedAt).getTime() - new Date(view.createdAt).getTime()).sort((a, b) => a - b)
  const average = durations.reduce((sum, value) => sum + value, 0) / durations.length
  const median = durations[Math.floor(durations.length / 2)]
  return { count: closed.length, average: formatDuration(average), median: formatDuration(median) }
}

// ─── 서비스 객체 ──────────────────────────────────────────────────────────────

export const evidenceService = {
  buildIncidentView,
  createIncidentWithAttachment,
  isBlobOrphaned,
  collectBlobReferences,
  removeBlobIfOrphaned,
  summarizeIncident,
  summarizeLog,
  detectSeverity,
  previewLines,
  tailLines,
  findLines,
  listOpenIncidents,
  listClosedBetween,
  listByAttachmentName,
  incidentsByService,
  searchIncidents,
  incidentTimeline,
  incidentsToCsv,
  buildDailyDigest,
  buildAuditSummary,
  buildEvidencePacket,
  rebuildEvidenceIndex,
  backfillStats,
  findDanglingEvidence,
  findMismatchedEvidence,
  verifyBlobs,
  estimateRetentionCandidates,
  diagnostics,
  toLegacyIncidentList,
  fromLegacyIncident,
  legacyStatus,
  compareLegacyAndCurrent,
  validateIncidentInput,
  formatBytes,
  formatKst,
  buildManifestPreview,
  estimateExportSize,
  describeExportJob,
  exportJobsSummary,
  requeueFailedExports,
  purgeOldExportJobs,
  exportReferencesFor,
  legacyTokenize,
  rankLegacyResults,
  reindexAll,
  searchIndexStats,
  clearPreviewCache,
  previewCacheStats,
  adjustAttachmentBytes,
  readCounters,
  buildNotificationText,
  pendingNotifications,
  markNotificationsSent,
  auditTrailFor,
  auditActionsSummary,
  startOfKstDay,
  addDays,
  elapsedSince,
  isWithinDays,
  weekdayKo,
  openDurations,
  resolutionStats,
}

export default evidenceService
