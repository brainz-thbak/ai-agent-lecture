import { HttpError, readObject, sendJson, sendText } from '../../core/http.ts'
import { getExportJob, listExportJobs, readBundle, requestExport } from './export-jobs.ts'
import { runExport } from './export-runner.ts'

export const exportRoutes = [
  {
    method: 'GET',
    pattern: /^\/exports$/,
    async handle(request, response) {
      sendJson(response, 200, listExportJobs())
    },
  },
  {
    method: 'POST',
    pattern: /^\/exports$/,
    async handle(request, response) {
      const body = await readObject(request)
      if (!Array.isArray(body.incidentIds) || body.incidentIds.length === 0 || body.incidentIds.some((id) => typeof id !== 'string')) {
        throw new HttpError(400, 'incidentIds must be a non-empty array of incident IDs')
      }
      const { job, skipped } = requestExport(body.incidentIds)
      sendJson(response, 201, { ...job, skipped })
    },
  },
  {
    method: 'GET',
    pattern: /^\/exports\/(EXP-[a-f0-9-]{1,40})$/,
    async handle(request, response, match) {
      const job = getExportJob(match[1])
      if (!job) throw new HttpError(404, 'Export job not found')
      sendJson(response, 200, job)
    },
  },
  {
    method: 'POST',
    pattern: /^\/exports\/(EXP-[a-f0-9-]{1,40})\/run$/,
    async handle(request, response, match) {
      const job = await runExport(match[1])
      if (!job) throw new HttpError(404, 'Export job not found')
      sendJson(response, 200, job)
    },
  },
  {
    method: 'GET',
    pattern: /^\/exports\/(EXP-[a-f0-9-]{1,40})\/bundle$/,
    async handle(request, response, match) {
      const bundle = readBundle(match[1])
      if (bundle === null) throw new HttpError(404, 'Export bundle not ready')
      sendText(response, 200, bundle)
    },
  },
]
