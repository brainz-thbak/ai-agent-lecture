// 증빙 내보내기 작업. 요청 시점의 증빙 목록을 manifest 로 고정해 두고, 실행할 때 그 목록대로 파일을 모은다.
import { randomUUID } from 'node:crypto'
import { context } from '../../core/context.ts'
import { loadEvidence } from '../evidence/evidence-store.ts'
import { blobUsable } from './availability.ts'

function toJob(row: any) {
  if (!row) return null
  const manifest = JSON.parse(row.manifest || '[]')
  const result = row.result ? JSON.parse(row.result) : null
  return {
    id: row.id,
    status: row.status,
    requestedAt: row.requested_at,
    completedAt: row.completed_at,
    items: manifest.map((entry: any) => ({ caseNo: entry.caseNo, title: entry.title, blobKey: entry.blobKey })),
    result: result && { items: result.items, missing: result.missing, error: result.error },
  }
}

export function requestExport(caseNos: string[]) {
  const manifest = []
  const skipped = []
  for (const caseNo of caseNos) {
    const evidence = loadEvidence(caseNo)
    const entry = evidence && { caseNo, blobKey: evidence.digest, title: evidence.evidenceTitle }
    if (blobUsable(entry)) manifest.push(entry)
    else skipped.push(caseNo)
  }
  const id = `EXP-${randomUUID().slice(0, 8)}`
  context.database.prepare('INSERT INTO export_jobs (id, status, requested_at, manifest) VALUES (?, ?, ?, ?)')
    .run(id, 'queued', new Date().toISOString(), JSON.stringify(manifest))
  return { job: getExportJob(id), skipped }
}

export function getExportJob(id: string): any {
  return toJob(context.database.prepare('SELECT * FROM export_jobs WHERE id = ?').get(id))
}

export function listExportJobs(): any[] {
  return context.database.prepare('SELECT * FROM export_jobs ORDER BY requested_at DESC').all().map(toJob)
}

export function readJobRow(id: string): any {
  return context.database.prepare('SELECT * FROM export_jobs WHERE id = ?').get(id)
}

export function saveJobResult(id: string, status: string, result: any) {
  context.database.prepare('UPDATE export_jobs SET status = ?, completed_at = ?, result = ? WHERE id = ?')
    .run(status, new Date().toISOString(), JSON.stringify(result), id)
}

export function readBundle(id: string): string | null {
  const row = readJobRow(id)
  if (!row || !row.result) return null
  return JSON.parse(row.result).bundle ?? null
}
