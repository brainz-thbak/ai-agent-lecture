import { randomInt, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { transaction } from './database.ts'
import { isFileId } from './files.ts'
import type { FileStore } from './files.ts'
import type { openIncidents } from './incidents.ts'
import type { openReports } from './reports.ts'

const examples = [
  { title: '정산 배치 재시도', name: 'settlement-batch.log', service: 'settlement', message: 'batch attempt exceeded timeout', closed: true, maxDaysAgo: 13 },
  { title: '인증 토큰 갱신 실패', name: 'auth-refresh.log', service: 'auth-service', message: 'refresh token endpoint returned 503', closed: false },
  { title: '백업 작업 지연', name: 'backup-worker.log', service: 'backup-worker', message: 'snapshot queue exceeded threshold', closed: true, minDaysAgo: 14 },
  { title: '결제 API 응답 지연', name: 'payments-gateway.log', service: 'payments-api', message: 'upstream response timeout after 3000ms', closed: false },
]
const legacyExampleIds = ['INC-DEMO-0415', 'INC-DEMO-0416', 'INC-DEMO-0417', 'INC-DEMO-0418']

type DemoStores = {
  database: DatabaseSync
  files: FileStore
  incidents: ReturnType<typeof openIncidents>
  reports: ReturnType<typeof openReports>
}

export function openDemo({ database, files, incidents, reports }: DemoStores) {
  const exampleIds = `
    SELECT id FROM demo_incidents
    UNION
    SELECT id FROM incidents WHERE id IN (${legacyExampleIds.map(() => '?').join(', ')})
  `
  const selectCandidates = database.prepare(`
    SELECT file_id FROM incident_attachments WHERE incident_id IN (${exampleIds})
    UNION
    SELECT file_id FROM reports WHERE source_incident_id IN (${exampleIds})
  `)
  const deleteReports = database.prepare(`DELETE FROM reports WHERE source_incident_id IN (${exampleIds})`)
  const deleteAttachments = database.prepare(`DELETE FROM incident_attachments WHERE incident_id IN (${exampleIds})`)
  const deleteIncidents = database.prepare(`DELETE FROM incidents WHERE id IN (${exampleIds})`)
  const fileReferences = database.prepare(`
    SELECT 1 FROM incident_attachments WHERE file_id = ?
    UNION ALL
    SELECT 1 FROM reports WHERE file_id = ?
    LIMIT 1
  `)
  const enqueueFile = database.prepare(`
    INSERT INTO demo_reset_files (file_id) VALUES (?)
    ON CONFLICT (file_id) DO NOTHING
  `)
  const pendingFiles = database.prepare('SELECT file_id FROM demo_reset_files')
  const dequeueFile = database.prepare('DELETE FROM demo_reset_files WHERE file_id = ?')
  let busy = false

  async function seed() {
    const count = randomInt(5, 16)
    const now = new Date()
    for (let index = 0; index < count; index += 1) {
      const { title, name, service, message, closed, minDaysAgo = 0, maxDaysAgo = 30 } = examples[index % examples.length]
      const date = new Date(now)
      date.setDate(date.getDate() - randomInt(minDaysAgo, maxDaysAgo + 1))
      const createdAt = date.toISOString()
      const id = `INC-DEMO-${randomUUID()}`
      const created = await incidents.create({
        id,
        title,
        createdAt,
        closedAt: closed ? createdAt : undefined,
        demo: true,
        attachment: {
          name,
          content: [
            `${createdAt}  INFO   ${service}  request started`,
            `${createdAt}  WARN   ${service}  retry scheduled`,
            `${createdAt}  ERROR  ${service}  ${message}`,
            '',
          ].join('\n'),
        },
      })
      if (index === 0 && created) {
        reports.create({ id: `AUD-DEMO-${randomUUID()}`, incidentId: id, attachmentId: created.attachmentId })
      }
    }
  }

  async function reset() {
    transaction(database, () => {
      const candidates = selectCandidates.all(...legacyExampleIds, ...legacyExampleIds)
      deleteReports.run(...legacyExampleIds)
      deleteAttachments.run(...legacyExampleIds)
      deleteIncidents.run(...legacyExampleIds)

      for (const { file_id: fileId } of candidates) {
        if (!isFileId(fileId)) throw new Error('Invalid demo file ID')
        if (!fileReferences.get(fileId, fileId)) enqueueFile.run(fileId)
      }
    })

    for (const { file_id: fileId } of pendingFiles.all()) {
      if (!isFileId(fileId)) throw new Error('Invalid pending demo file ID')
      if (!fileReferences.get(fileId, fileId)) await files.remove(fileId)
      dequeueFile.run(fileId)
    }
  }

  return async (action: 'seed' | 'reset') => {
    if (busy) return false
    busy = true
    try {
      if (action === 'seed') await seed()
      else await reset()
      return true
    } finally {
      busy = false
    }
  }
}
