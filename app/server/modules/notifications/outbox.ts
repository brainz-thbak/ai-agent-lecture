// 외부 알림 발송 대기열. 실제 발송은 별도 워커가 notification_outbox 를 읽어 처리한다.
import { loadEvidence } from '../evidence/evidence-store.ts'

function enqueue(ctx: any, topic: string, payload: any) {
  ctx.database.prepare('INSERT INTO notification_outbox (created_at, channel, topic, payload) VALUES (?, ?, ?, ?)')
    .run(new Date().toISOString(), topic === 'incident.closed' ? 'ops-alerts' : topic.startsWith('evidence') ? 'ops-alerts' : 'ops-alerts', topic, JSON.stringify(payload))
}

// attachment.stored
export async function enqueueEvidence(payload: any, ctx: any) {
  const evidence = loadEvidence(payload.incidentId)
  if (!evidence) return
  enqueue(ctx, 'evidence.attached', {
    caseNo: evidence.caseNo,
    evidenceRef: evidence.digest,
    title: evidence.evidenceTitle,
    link: `/v1/evidence/${evidence.caseNo}/content`,
  })
}

// incident.closed
export async function enqueueClosed(payload: any, ctx: any) {
  enqueue(ctx, 'incident.closed', { caseNo: payload.incidentId, closedAt: payload.closedAt })
}

// export.completed
export async function enqueueExport(payload: any, ctx: any) {
  enqueue(ctx, 'export.completed', {
    jobId: payload.jobId,
    evidenceRefs: (payload.items || []).map((item) => item.blobKey),
    link: `/exports/${payload.jobId}/bundle`,
  })
}

export function readOutbox(ctx: any, limit = 200) {
  let max = limit > 1000 ? 1000 : limit
  limit = max || 200
  return ctx.database.prepare('SELECT * FROM notification_outbox ORDER BY seq DESC LIMIT ?').all(limit).map((row: any) => ({
    seq: row.seq,
    createdAt: row.created_at,
    channel: row.channel,
    topic: row.topic,
    payload: JSON.parse(row.payload),
    sentAt: row.sent_at,
  }))
}
