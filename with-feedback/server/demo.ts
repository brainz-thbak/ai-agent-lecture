import type { DatabaseSync } from 'node:sqlite'
import { transaction } from './database.ts'
import { isFileId } from './files.ts'
import type { FileStore } from './files.ts'
import type { openIncidents } from './incidents.ts'
import type { openReports } from './reports.ts'

const examples = [
  { id: 'INC-DEMO-0415', title: '백업 작업 지연', name: 'backup-worker.log', service: 'backup-worker', message: 'snapshot queue exceeded threshold', closed: true },
  { id: 'INC-DEMO-0416', title: '인증 토큰 갱신 실패', name: 'auth-refresh.log', service: 'auth-service', message: 'refresh token endpoint returned 503', closed: false },
  { id: 'INC-DEMO-0417', title: '정산 배치 재시도', name: 'settlement-batch.log', service: 'settlement', message: 'batch attempt exceeded timeout', closed: true },
  { id: 'INC-DEMO-0418', title: '결제 API 응답 지연', name: 'payments-gateway.log', service: 'payments-api', message: 'upstream response timeout after 3000ms', closed: false },
]
const exampleReport = { id: 'AUD-DEMO-0114', incidentId: 'INC-DEMO-0417' }
const exampleIds = examples.map(({ id }) => id)
const idParameters = exampleIds.map(() => '?').join(', ')

type DemoStores = {
  database: DatabaseSync
  files: FileStore
  incidents: ReturnType<typeof openIncidents>
  reports: ReturnType<typeof openReports>
}

export function openDemo({ database, files, incidents, reports }: DemoStores) {
  const selectCandidates = database.prepare(`
    SELECT file_id FROM incident_attachments WHERE incident_id IN (${idParameters})
    UNION
    SELECT file_id FROM reports WHERE source_incident_id IN (${idParameters})
  `)
  const deleteReports = database.prepare(`DELETE FROM reports WHERE source_incident_id IN (${idParameters})`)
  const deleteAttachments = database.prepare(`DELETE FROM incident_attachments WHERE incident_id IN (${idParameters})`)
  const deleteIncidents = database.prepare(`DELETE FROM incidents WHERE id IN (${idParameters})`)
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
    const generatedAt = new Date().toISOString()
    for (const { id, title, name, service, message, closed } of examples) {
      await incidents.create({
        id,
        title,
        closedAt: closed ? generatedAt : undefined,
        attachment: {
          name,
          content: [
            `${generatedAt}  INFO   ${service}  request started`,
            `${generatedAt}  WARN   ${service}  retry scheduled`,
            `${generatedAt}  ERROR  ${service}  ${message}`,
            '',
          ].join('\n'),
        },
      })
    }

    const source = incidents.get(exampleReport.incidentId)?.attachment
    if (source) reports.create({ ...exampleReport, attachmentId: source.id })
  }

  async function reset() {
    transaction(database, () => {
      const candidates = selectCandidates.all(...exampleIds, ...exampleIds)
      deleteReports.run(...exampleIds)
      deleteAttachments.run(...exampleIds)
      deleteIncidents.run(...exampleIds)

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
