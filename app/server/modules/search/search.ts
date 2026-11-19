import { context } from '../../core/context.ts'

function snippet(body: string, needle: string) {
  const index = body.toLowerCase().indexOf(needle)
  if (index < 0) return body.slice(0, 120)
  const start = Math.max(0, index - 40)
  return (start > 0 ? '…' : '') + body.slice(start, index + needle.length + 80)
}

export function searchArtifacts(query: string, limit = 50) {
  const needle = String(query || '').trim().toLowerCase()
  if (!needle) return []
  const like = `%${needle.replace(/[%_]/g, (character) => `\\${character}`)}%`
  const rows: any[] = context.database.prepare(`
    SELECT attachment_hash, owner_key, label, body, indexed_at
    FROM search_index
    WHERE lower(label) LIKE ? ESCAPE '\\' OR lower(body) LIKE ? ESCAPE '\\'
    ORDER BY indexed_at DESC
    LIMIT ?
  `).all(like, like, limit)
  return rows.map((row) => ({
    incidentId: row.owner_key,
    name: row.label,
    attachmentHash: row.attachment_hash,
    snippet: snippet(row.body, needle),
    indexedAt: row.indexed_at,
  }))
}
