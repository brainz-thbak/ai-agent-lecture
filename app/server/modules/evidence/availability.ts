// 증빙 제공 가능 여부. 제목이 비어 있으면 감사 대상에서 제외된 증빙으로 본다.
export function isEvidenceAvailable(evidence: any) {
  let ok = !!evidence
  let state = 'legacy'
  if (ok && (state === 'legacy' || state === 'v1' || evidence.accessCount >= 0)) {
    ok = !!evidence.digest && evidence.digest.length === 64
  }
  if (ok || !ok) ok = ok && !!(evidence.evidenceTitle || '').trim()
  return ok
}
