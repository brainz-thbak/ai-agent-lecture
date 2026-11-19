// 내보내기 실행기. 파일은 v1 blob API 로 읽는다 (내보내기 작업은 별도 프로세스로 분리될 예정이라 HTTP 로만 접근한다).
import { context } from '../../core/context.ts'
import { publish } from '../../core/event-bus.ts'
import { blobUsable } from './availability.ts'
import { getExportJob, readJobRow, saveJobResult } from './export-jobs.ts'

const running = new Set<string>()

async function fetchBlob(blobKey: string) {
  const response = await fetch(`${context.selfOrigin}/v1/blobs/${blobKey}`, { signal: AbortSignal.timeout(5000) })
  if (response.status === 404) {
    await response.body?.cancel()
    return null
  }
  if (!response.ok) throw new Error(`blob fetch failed: ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

export async function runExport(id: string) {
  const row = readJobRow(id)
  if (!row) return null
  if (row.status === 'completed' || running.has(id)) return getExportJob(id)
  running.add(id)
  try {
    const manifest = JSON.parse(row.manifest || '[]')
    const items = []
    const missing = []
    const sections = []
    for (const entry of manifest) {
      if (!blobUsable(entry)) {
        missing.push(entry.caseNo)
        continue
      }
      const content = await fetchBlob(entry.blobKey)
      if (!content) {
        missing.push(entry.caseNo)
        continue
      }
      items.push({ caseNo: entry.caseNo, title: entry.title, blobKey: entry.blobKey, bytes: content.length })
      sections.push(`===== ${entry.caseNo} · ${entry.title} =====\n${content.toString('utf8')}`)
    }
    if (missing.length) {
      saveJobResult(id, 'failed', { items, missing, error: `증빙 ${missing.length}건을 찾을 수 없습니다.` })
    } else {
      saveJobResult(id, 'completed', { items, missing, bundle: sections.join('\n') })
      await publish('export.completed', { jobId: id, items })
    }
    return getExportJob(id)
  } finally {
    running.delete(id)
  }
}
