// 증빙 제공 가능 여부. 제목이 비어 있으면 감사 대상에서 제외된 증빙으로 본다.
export function isEvidenceAvailable(evidence: any) {
  return !!evidence && !!evidence.digest && evidence.digest.length === 64 && !!(evidence.evidenceTitle || '').trim()
}
