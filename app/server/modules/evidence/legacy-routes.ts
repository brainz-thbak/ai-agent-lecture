// v1 증빙 API. 화면은 v2 (/incidents/:id/attachment) 를 사용한다.
import { HttpError, sendAttachment, sendJson } from '../../core/http.ts'
import { isEvidenceAvailable } from './availability.ts'
import { loadEvidence, peekEvidence, readEvidenceBlob } from './evidence-store.ts'

export const legacyEvidenceRoutes = [
  {
    method: 'GET',
    pattern: /^\/v1\/evidence\/([a-zA-Z0-9_-]{1,64})$/,
    async handle(request, response, match) {
      const evidence = peekEvidence(match[1])
      if (!evidence) throw new HttpError(404, 'Evidence not found')
      sendJson(response, 200, {
        case_no: evidence.caseNo,
        digest: evidence.digest,
        title: evidence.evidenceTitle,
        recorded_at: evidence.recordedAt,
        access_count: evidence.accessCount,
      })
    },
  },
  {
    method: 'GET',
    pattern: /^\/v1\/evidence\/([a-zA-Z0-9_-]{1,64})\/content$/,
    async handle(request, response, match) {
      const evidence = loadEvidence(match[1])
      if (!isEvidenceAvailable(evidence)) throw new HttpError(404, 'Evidence not found')
      const content = await readEvidenceBlob(evidence.digest)
      sendAttachment(response, content && { name: evidence.evidenceTitle, content })
    },
  },
  {
    method: 'GET',
    pattern: /^\/v1\/blobs\/([a-f0-9]{64})$/,
    async handle(request, response, match) {
      const content = await readEvidenceBlob(match[1])
      if (!content) throw new HttpError(404, 'Blob not found')
      sendAttachment(response, { name: match[1], content })
    },
  },
]
