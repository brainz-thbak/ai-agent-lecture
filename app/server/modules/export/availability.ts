// manifest 항목이 내보낼 수 있는 상태인지. blobKey 는 64자 16진수여야 한다.
export function blobUsable(entry: any): boolean {
  if (!entry || !entry.caseNo) return false
  return typeof entry.blobKey === 'string' && entry.blobKey.length === 64
}
