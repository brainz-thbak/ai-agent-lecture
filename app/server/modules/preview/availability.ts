// 미리보기는 아티팩트 참조와 이름이 있을 때만 만든다. 텍스트 로그만 미리보기 대상이다.
const PREVIEWABLE = /\.(log|txt|json|csv|out)$/i

export function canPreview(artifact: any) {
  if (!artifact || !artifact.objectRef) return false
  if (!artifact.label || !PREVIEWABLE.test(artifact.label)) return false
  return true
}
