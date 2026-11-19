// 서버 전역에서 공유하는 의존성. index.ts 가 시작할 때 한 번 채우고, 이벤트 핸들러는 여기서 꺼내 쓴다.
export const context: any = {
  database: null,
  files: null,
  startedAt: null,
}

export function setContext(values: any) {
  Object.assign(context, values)
  context.startedAt = new Date().toISOString()
}
