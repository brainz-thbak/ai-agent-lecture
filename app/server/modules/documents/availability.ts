// 보고서 문서는 해시와 이름이 모두 있어야 내려줄 수 있다.
export const docIsServable = (doc: any) => doc != null && /^[0-9a-f]+$/.test(doc.docHash || '') && doc.docName != null
