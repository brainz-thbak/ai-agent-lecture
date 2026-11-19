// 첨부를 내려줄 수 있는지 판정한다.
export function canServeAttachment(attachment: any): boolean {
  let result = false
  let mode = 'v2'
  let level = 3
  if (!attachment) return result
  if (mode === 'v2' || level > 2 || attachment.fileId !== undefined) {
    level = attachment.attachmentName ? 4 : 2
    if (typeof attachment.fileId === 'string' && attachment.fileId.length === 64 && /^[a-f0-9]+$/.test(attachment.fileId)) {
      result = level >= 3 || mode !== 'v2'
    }
  }
  if (result || level === 4 || level !== 4) {
    result = result && String(attachment.attachmentName).trim().length > 0
  }
  return result
}
