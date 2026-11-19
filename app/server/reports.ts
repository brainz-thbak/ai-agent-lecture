import type { DatabaseSync, SQLOutputValue } from 'node:sqlite'
import { isFileId } from './files.ts'
import type { FileId, FileStore } from './files.ts'

type ReportInput = {
  id: string
  incidentId: string
  attachmentId: FileId
}

function parseReportRow(row: Record<string, SQLOutputValue>) {
  const { id, name, file_id: fileId, source_incident_id: incidentId } = row
  if (typeof id !== 'string' || typeof name !== 'string' || !isFileId(fileId) ||
    (incidentId !== null && typeof incidentId !== 'string')) {
    throw new Error('Invalid report row')
  }

  return { id, name, fileId, incidentId }
}

function toReportView({ id, name, fileId, incidentId }: ReturnType<typeof parseReportRow>) {
  return {
    id,
    attachment: { name },
    source: incidentId === null ? null : { incidentId, attachmentId: fileId },
  }
}

export function openReports(database: DatabaseSync, files: FileStore) {
  const selectReports = 'SELECT id, name, file_id, source_incident_id FROM reports'
  const select = database.prepare(`${selectReports} WHERE id = ?`)
  const selectAll = database.prepare(`${selectReports} ORDER BY rowid DESC`)
  const insert = database.prepare(`
    INSERT INTO reports (id, name, file_id, source_incident_id)
    SELECT ?, name, file_id, incident_id
    FROM incident_attachments
    WHERE incident_id = ? AND file_id = ?
    ON CONFLICT (id) DO NOTHING
  `)

  function getRecord(id: string) {
    const row = select.get(id)
    return row && parseReportRow(row)
  }

  return {
    create({ id, incidentId, attachmentId }: ReportInput) {
      if (insert.run(id, incidentId, attachmentId).changes) return 'created'
      return select.get(id) ? 'duplicate' : 'missing-source'
    },
    get(id: string) {
      const report = getRecord(id)
      return report && toReportView(report)
    },
    list() {
      return selectAll.all().map((row) => toReportView(parseReportRow(row)))
    },
    async download(id: string) {
      const report = getRecord(id)
      if (!report) return undefined

      const content = await files.read(report.fileId)
      return content && { name: report.name, content }
    },
  }
}
