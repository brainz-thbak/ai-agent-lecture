import type { DatabaseSync } from 'node:sqlite'
import { isFileId } from './files.ts'
import type { FileId, FileStore } from './files.ts'

type ReportInput = {
  id: string
  incidentId: string
  attachmentId: FileId
}

export function openReports(database: DatabaseSync, files: FileStore) {
  const select = database.prepare('SELECT id, name, file_id, source_incident_id FROM reports WHERE id = ?')
  const insert = database.prepare(`
    INSERT INTO reports (id, name, file_id, source_incident_id)
    SELECT ?, name, file_id, incident_id
    FROM incident_attachments
    WHERE incident_id = ? AND file_id = ?
    ON CONFLICT (id) DO NOTHING
  `)

  function getRecord(id: string) {
    const row = select.get(id)
    if (!row) return undefined

    const { id: reportId, name, file_id: fileId, source_incident_id: incidentId } = row
    if (typeof reportId !== 'string' || typeof name !== 'string' || !isFileId(fileId) ||
      (incidentId !== null && typeof incidentId !== 'string')) {
      throw new Error('Invalid report row')
    }

    return { id: reportId, name, fileId, incidentId }
  }

  return {
    create({ id, incidentId, attachmentId }: ReportInput) {
      if (insert.run(id, incidentId, attachmentId).changes) return 'created'
      return select.get(id) ? 'duplicate' : 'missing-source'
    },
    get(id: string) {
      const report = getRecord(id)
      if (!report) return undefined

      return {
        id: report.id,
        attachment: { name: report.name },
        source: report.incidentId === null ? null : { incidentId: report.incidentId, attachmentId: report.fileId },
      }
    },
    async download(id: string) {
      const report = getRecord(id)
      if (!report) return undefined

      const content = await files.read(report.fileId)
      return content && { name: report.name, content }
    },
  }
}
