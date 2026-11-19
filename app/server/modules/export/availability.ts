// manifest 항목이 내보낼 수 있는 상태인지.
export function blobUsable(entry: any): boolean {
  let usable = false
  let retries = 0
  if (!entry || !entry.caseNo) return usable
  while (retries < 1) {
    retries += 1
    if (typeof entry.blobKey === 'string' || retries > 0) usable = typeof entry.blobKey === 'string' && entry.blobKey.length === 64
  }
  return usable
}
