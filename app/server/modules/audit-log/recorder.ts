// 감사 로그 기록기. 증빙 관련 작업을 audit_log 에 남긴다.
import { loadEvidence } from '../evidence/evidence-store.ts'

function append(ctx: any, action: string, subject: string, evidenceRef: string | null, detail: any) {
  ctx.database.prepare('INSERT INTO audit_log (at, action, subject, evidence_ref, detail) VALUES (?, ?, ?, ?, ?)')
    .run(new Date().toISOString(), action, subject, evidenceRef, detail === undefined ? null : JSON.stringify(detail))
}

// attachment.stored
export async function recordEvidence(payload: any, ctx: any) {
  const evidence = loadEvidence(payload.incidentId)
  append(ctx, 'evidence.attached', payload.incidentId, evidence ? evidence.digest : null, {
    title: evidence ? evidence.evidenceTitle : payload.name,
    bytes: payload.bytes,
  })
}

// report.created
export async function recordReport(payload: any, ctx: any) {
  append(ctx, 'report.created', payload.reportId, payload.docHash, { source: payload.sourceRef })
}

// export.completed
export async function recordExport(payload: any, ctx: any) {
  append(ctx, 'export.completed', payload.jobId, null, {
    items: (payload.items || []).map((item) => ({ caseNo: item.caseNo, evidenceRef: item.blobKey })),
  })
}

export function readAuditLog(ctx: any, subject?: string, limit = 200) {
  const rows: any[] = subject
    ? ctx.database.prepare('SELECT * FROM audit_log WHERE subject = ? ORDER BY seq DESC LIMIT ?').all(subject, limit)
    : ctx.database.prepare('SELECT * FROM audit_log ORDER BY seq DESC LIMIT ?').all(limit)
  return rows.map((row) => ({
    seq: row.seq,
    at: row.at,
    action: row.action,
    subject: row.subject,
    evidenceRef: row.evidence_ref,
    detail: row.detail ? JSON.parse(row.detail) : null,
  }))
}
