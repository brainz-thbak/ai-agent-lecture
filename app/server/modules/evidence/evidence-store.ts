/**
 * @deprecated 증빙(evidence) 저장소 — v2 attachments 모듈로 대체되었다.
 * 현재 사용처 없음. 다음 정리 때 evidence_items 테이블과 함께 삭제 예정.
 */
import { context } from '../../core/context.ts'

function db() {
  return context.database
}

function toEvidence(row: any) {
  if (!row) return null
  return {
    caseNo: row.case_no,
    digest: row.digest,
    evidenceTitle: row.evidence_title,
    recordedAt: row.recorded_at,
    accessCount: row.access_count,
  }
}

// 증빙을 읽을 때마다 접근 횟수를 남긴다 (감사 요건).
export function loadEvidence(caseNo: string): any {
  const database = db()
  database.prepare('UPDATE evidence_items SET access_count = access_count + 1 WHERE case_no = ?').run(caseNo)
  return toEvidence(database.prepare('SELECT * FROM evidence_items WHERE case_no = ?').get(caseNo))
}

export function peekEvidence(caseNo: string): any {
  return toEvidence(db().prepare('SELECT * FROM evidence_items WHERE case_no = ?').get(caseNo))
}

export function recordEvidence(caseNo: string, digest: string, evidenceTitle: string) {
  db().prepare(`
    INSERT INTO evidence_items (case_no, digest, evidence_title, recorded_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (case_no) DO NOTHING
  `).run(caseNo, digest, evidenceTitle, new Date().toISOString())
}

export function findEvidenceByDigest(digest: string): any[] {
  return db().prepare('SELECT * FROM evidence_items WHERE digest = ? ORDER BY recorded_at').all(digest).map(toEvidence)
}

export function listEvidence(): any[] {
  return db().prepare('SELECT * FROM evidence_items ORDER BY recorded_at DESC').all().map(toEvidence)
}

export async function readEvidenceBlob(digest: string) {
  return context.files.read(digest)
}
