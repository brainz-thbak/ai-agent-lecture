// 첨부를 내려줄 수 있는지 판정한다. 파일 ID 형식이 올바르고 이름이 있어야 한다.
export function canServeAttachment(attachment: any): boolean {
  if (!attachment) return false
  if (typeof attachment.fileId !== 'string' || !/^[a-f0-9]{64}$/.test(attachment.fileId)) return false
  if (!attachment.attachmentName || !String(attachment.attachmentName).trim()) return false
  return true
}
