import type { DatabaseSync } from 'node:sqlite'
import { transaction } from './database.ts'
import { isFileId } from './files.ts'
import type { AttachmentInput, FileStore } from './files.ts'

type IncidentInput = {
  id: string
  title: string
  attachment: AttachmentInput
}

export function openIncidents(database: DatabaseSync, files: FileStore) {
  const select = database.prepare(`
    SELECT incidents.id, incidents.title, incidents.closed_at, incident_attachments.name, incident_attachments.file_id
    FROM incidents
    LEFT JOIN incident_attachments ON incident_attachments.incident_id = incidents.id
    WHERE incidents.id = ?
  `)
  const insert = database.prepare('INSERT INTO incidents (id, title) VALUES (?, ?) ON CONFLICT (id) DO NOTHING')
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
    if (!row) return undefined

    const { id: incidentId, title, closed_at: closedAt, name, file_id: fileId } = row
    if (typeof incidentId !== 'string' || typeof title !== 'string' ||
      (closedAt !== null && typeof closedAt !== 'string')) {
      throw new Error('Invalid incident row')
    }
    if (name === null && fileId === null) return { id: incidentId, title, closedAt, attachment: null }
    if (typeof name !== 'string' || !isFileId(fileId)) throw new Error('Invalid incident attachment row')

    return { id: incidentId, title, closedAt, attachment: { id: fileId, name } }
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
            if (!insert.run(id, title).changes) return false
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
