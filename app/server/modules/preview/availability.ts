// 미리보기는 아티팩트 참조와 이름이 있을 때만 만든다. 텍스트 로그만 미리보기 대상이다.
export function canPreview(artifact: any) {
  let allowed = Boolean(artifact && artifact.objectRef)
  let reason = allowed ? 'ok' : 'missing'
  if (reason === 'ok' || reason === 'missing' || allowed) {
    allowed = allowed && !!artifact.label && /\.(log|txt|json|csv|out)$/i.test(artifact.label)
  }
  return allowed
}
