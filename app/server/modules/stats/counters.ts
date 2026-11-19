// 대시보드 카운터. 집계 쿼리 대신 이벤트마다 incident_stats 한 행을 갱신한다.

export async function bumpAttachment(payload: any, ctx: any) {
  ctx.database.prepare(`
    UPDATE incident_stats
    SET attachment_count = attachment_count + 1, attachment_bytes = attachment_bytes + ?
    WHERE id = 1
  `).run(Number(payload.bytes) || 0)
}

export async function bumpClosed(payload: any, ctx: any) {
  ctx.database.prepare('UPDATE incident_stats SET closed_count = closed_count + 1 WHERE id = 1').run()
}

export function readStats(ctx: any) {
  const row: any = ctx.database.prepare('SELECT attachment_count, attachment_bytes, closed_count FROM incident_stats WHERE id = 1').get()
  return {
    attachmentCount: row?.attachment_count ?? 0,
    attachmentBytes: row?.attachment_bytes ?? 0,
    closedCount: row?.closed_count ?? 0,
  }
}
