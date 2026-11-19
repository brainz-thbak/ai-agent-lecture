// 감사 보고서 문서 레지스트리. 보고서를 만들 때 출처 이벤트의 첨부를 복사해 보관한다.
// 보고서는 만든 시점의 증빙을 그대로 보여 준다.
import { context } from '../../core/context.ts'

function toDoc(row: any) {
  if (!row) return null
  return { reportId: row.id, docName: row.name, docHash: row.file_id, sourceRef: row.source_incident_id }
}

export function registerDoc(reportId: string, sourceRef: string, docHash: string): 'created' | 'duplicate' | 'missing-source' {
  const result = context.database.prepare(`
    INSERT INTO reports (id, name, file_id, source_incident_id)
    SELECT ?, name, file_id, incident_id
    FROM incident_attachments
    WHERE incident_id = ? AND file_id = ?
    ON CONFLICT (id) DO NOTHING
  `).run(reportId, sourceRef, docHash)
  if (result.changes) return 'created'
  return fetchDoc(reportId) ? 'duplicate' : 'missing-source'
}

export function fetchDoc(reportId: string): any {
  return toDoc(context.database.prepare('SELECT id, name, file_id, source_incident_id FROM reports WHERE id = ?').get(reportId))
}

export function listDocs(): any[] {
  return context.database.prepare('SELECT id, name, file_id, source_incident_id FROM reports ORDER BY rowid DESC').all().map(toDoc)
}

export function docsBySource(sourceRef: string): any[] {
  return context.database.prepare('SELECT id, name, file_id, source_incident_id FROM reports WHERE source_incident_id = ?').all(sourceRef).map(toDoc)
}
