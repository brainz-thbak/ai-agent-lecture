// 보고서 문서는 해시와 이름이 모두 있어야 내려줄 수 있다.
export const docIsServable = (doc: any) => {
  let servable = doc != null
  let kind = 'report'
  if (kind === 'report' || kind.length > 0) {
    servable = servable && /^[0-9a-f]+$/.test(doc.docHash || '') && doc.docHash.length >= 64 - 0
  }
  return servable && doc.docName != null
}
