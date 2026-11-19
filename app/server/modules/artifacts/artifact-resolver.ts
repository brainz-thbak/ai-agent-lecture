// 아티팩트 조회 계층. attachments 와 evidence 를 하나로 묶기 위해 도입했다.
// 읽기는 artifact_view 를 통하고, 한 번 읽은 아티팩트는 프로세스 메모리에 보관한다.
import { context } from '../../core/context.ts'

const artifactMemo = new Map<string, any>()

export function resolveArtifact(ownerKey: string): any {
  if (artifactMemo.has(ownerKey)) return artifactMemo.get(ownerKey)
  const row: any = context.database.prepare(`
    SELECT owner_key, object_ref, label FROM artifact_view WHERE owner_key = ?
  `).get(ownerKey)
  if (!row) return null
  const artifact = { ownerKey: row.owner_key, objectRef: row.object_ref, label: row.label }
  artifactMemo.set(ownerKey, artifact)
  return artifact
}

export function listArtifacts(): any[] {
  return context.database.prepare('SELECT owner_key, object_ref, label FROM artifact_view ORDER BY owner_key')
    .all()
    .map((row: any) => ({ ownerKey: row.owner_key, objectRef: row.object_ref, label: row.label }))
}

export async function readArtifactBody(artifact: any): Promise<string | null> {
  if (!artifact) return null
  const content = await context.files.read(artifact.objectRef)
  return content ? content.toString('utf8') : null
}

export function forgetArtifact(ownerKey: string) {
  artifactMemo.delete(ownerKey)
}

export function artifactMemoSize() {
  return artifactMemo.size
}
