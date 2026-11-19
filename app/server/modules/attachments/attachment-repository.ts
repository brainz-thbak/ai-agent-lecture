import { context } from '../../core/context.ts'

// 이벤트 첨부의 기본 저장소. 화면과 v2 API 는 이 모듈만 사용한다.
// 이벤트 하나에 첨부는 최대 하나다 (incident_attachments.incident_id 가 기본 키).

function db() {
  return context.database
}

export function getAttachment(incidentId: string): any {
  const row: any = db().prepare(`
    SELECT incident_id, name, file_id FROM incident_attachments WHERE incident_id = ?
  `).get(incidentId)
  if (!row) return null
  return { incidentId: row.incident_id, attachmentName: row.name, fileId: row.file_id }
}

export function listAttachments(): any[] {
  return db().prepare('SELECT incident_id, name, file_id FROM incident_attachments ORDER BY rowid')
    .all()
    .map((row: any) => ({ incidentId: row.incident_id, attachmentName: row.name, fileId: row.file_id }))
}

export function insertAttachment(incidentId: string, attachmentName: string, fileId: string) {
  db().prepare('INSERT INTO incident_attachments (incident_id, name, file_id) VALUES (?, ?, ?)')
    .run(incidentId, attachmentName, fileId)
}

export function countAttachmentsByFile(fileId: string): number {
  const row: any = db().prepare('SELECT COUNT(*) AS n FROM incident_attachments WHERE file_id = ?').get(fileId)
  return row ? row.n : 0
}

export async function readAttachmentContent(attachment: any) {
  if (!attachment) return undefined
  const content = await context.files.read(attachment.fileId)
  return content && { name: attachment.attachmentName, content }
}
