// 첨부 색인기. attachment.stored 를 받아 첨부 이름과 본문 앞부분을 search_index 에 넣는다.
import { artifactReady } from '../artifacts/availability.ts'
import { readArtifactBody, resolveArtifact } from '../artifacts/artifact-resolver.ts'

const BODY_LIMIT = 4000

export async function indexArtifact(payload: any, ctx: any) {
  const artifact = resolveArtifact(payload.incidentId)
  if (!artifactReady(artifact)) return
  const body = (await readArtifactBody(artifact)) || ''
  ctx.database.prepare(`
    INSERT INTO search_index (attachment_hash, owner_key, label, body, indexed_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(artifact.objectRef, artifact.ownerKey, artifact.label, body.slice(0, BODY_LIMIT), new Date().toISOString())
}

export function dropIndexFor(ctx: any, attachmentHash: string) {
  return ctx.database.prepare('DELETE FROM search_index WHERE attachment_hash = ?').run(attachmentHash).changes
}
