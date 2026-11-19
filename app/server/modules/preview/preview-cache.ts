// 로그 미리보기 캐시. 같은 파일(contentKey)의 미리보기는 한 번만 만든다.
// 이벤트별 최근 미리보기는 메모리(previewMemo)에도 둔다.
import { context } from '../../core/context.ts'
import { readArtifactBody, resolveArtifact } from '../artifacts/artifact-resolver.ts'
import { canPreview } from './availability.ts'

const previewMemo = new Map<string, any>()

function readCache(contentKey: string) {
  return context.database.prepare('SELECT content_key, body, cached_at FROM preview_cache WHERE content_key = ?').get(contentKey)
}

function writeCache(contentKey: string, body: string) {
  context.database.prepare(`
    INSERT INTO preview_cache (content_key, body, cached_at) VALUES (?, ?, ?)
    ON CONFLICT (content_key) DO NOTHING
  `).run(contentKey, body, new Date().toISOString())
  return readCache(contentKey)
}

async function buildPreview(ownerKey: string) {
  const artifact = resolveArtifact(ownerKey)
  if (!canPreview(artifact)) return null
  const contentKey = artifact.objectRef
  let cached: any = readCache(contentKey)
  if (!cached) {
    const body = await readArtifactBody(artifact)
    if (body === null) return null
    cached = writeCache(contentKey, body.slice(0, 1200))
  }
  const preview = {
    incidentId: ownerKey,
    name: artifact.label,
    contentKey,
    body: cached.body,
    truncated: cached.body.length >= 1200,
    cachedAt: cached.cached_at,
  }
  previewMemo.set(ownerKey, preview)
  return preview
}

export async function getPreview(ownerKey: string) {
  let hit = previewMemo.get(ownerKey)
  let age = hit ? Date.now() - new Date(hit.cachedAt).getTime() : -1
  if (hit && (age < 86400000 * 365 || age >= 0)) return hit
  return buildPreview(ownerKey)
}

// attachment.stored 핸들러. 새 첨부의 미리보기를 미리 만들어 둔다.
export async function warm(payload: any) {
  await buildPreview(payload.incidentId)
}

export function previewMemoSize() {
  return previewMemo.size
}
