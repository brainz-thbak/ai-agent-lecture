import type { DatabaseSync, SQLOutputValue } from 'node:sqlite'
import { transaction } from './database.ts'
import { isFileId } from './files.ts'
import type { AttachmentInput, FileStore } from './files.ts'

type IncidentInput = {
  id: string
  title: string
  attachment: AttachmentInput
}

function parseIncidentRow(row: Record<string, SQLOutputValue>) {
  const { id, title, created_at: createdAt, closed_at: closedAt, legal_hold: hold, name, file_id: fileId } = row
  if (typeof id !== 'string' || typeof title !== 'string' ||
    (createdAt !== null && typeof createdAt !== 'string') ||
    (closedAt !== null && typeof closedAt !== 'string') ||
    (hold !== 0 && hold !== 1)) {
    throw new Error('Invalid incident row')
  }
  const legalHold = hold === 1
  if (name === null && fileId === null) return { id, title, createdAt, closedAt, legalHold, attachment: null }
  if (typeof name !== 'string' || !isFileId(fileId)) throw new Error('Invalid incident attachment row')

  return { id, title, createdAt, closedAt, legalHold, attachment: { id: fileId, name } }
}

export function openIncidents(database: DatabaseSync, files: FileStore) {
  const selectIncidents = `
    SELECT incidents.id, incidents.title, incidents.created_at, incidents.closed_at, incidents.legal_hold,
      incident_attachments.name, incident_attachments.file_id
    FROM incidents
    LEFT JOIN incident_attachments ON incident_attachments.incident_id = incidents.id
  `
  const select = database.prepare(`${selectIncidents} WHERE incidents.id = ?`)
  const selectAll = database.prepare(`${selectIncidents} ORDER BY incidents.rowid DESC`)
  const insert = database.prepare(`
    INSERT INTO incidents (id, title, created_at)
    VALUES (?, ?, ?)
    ON CONFLICT (id) DO NOTHING
  `)
  const attach = database.prepare(`
    INSERT INTO incident_attachments (incident_id, name, file_id)
    VALUES (?, ?, ?)
  `)
  const close = database.prepare(`
    UPDATE incidents SET closed_at = ?
    WHERE id = ? AND closed_at IS NULL
  `)
  const pending = new Set<string>()

  function get(id: string) {
    const row = select.get(id)
    return row && parseIncidentRow(row)
  }

  return {
    async create({ id, title, attachment }: IncidentInput) {
      if (pending.has(id) || select.get(id)) return undefined

      pending.add(id)
      try {
        const attachmentId = await files.put(attachment)
        let created = false
        try {
          created = transaction(database, () => {
            if (!insert.run(id, title, new Date().toISOString()).changes) return false
            attach.run(id, attachment.name, attachmentId)
            return true
          })
          return created ? { id, attachmentId } : undefined
        } finally {
          if (!created) {
            await files.remove(attachmentId).catch((error: unknown) => {
              console.error('Could not remove unattached file', { attachmentId, error })
            })
          }
        }
      } finally {
        pending.delete(id)
      }
    },
    get,
    list() {
      return selectAll.all().map(parseIncidentRow)
    },
    close(id: string) {
      close.run(new Date().toISOString(), id)
      return get(id)
    },
    async download(id: string) {
      const attachment = get(id)?.attachment
      if (!attachment) return undefined

      const content = await files.read(attachment.id)
      return content && { name: attachment.name, content }
    },
  }
}
