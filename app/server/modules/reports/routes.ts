import { HttpError, parseId, readObject, sendAttachment, sendJson } from '../../core/http.ts'
import { isFileId } from '../../files.ts'
import { createReport, downloadReport, getReport, listReports } from './reports.ts'

export const reportRoutes = [
  {
    method: 'GET',
    pattern: /^\/audit-reports$/,
    async handle(request, response) {
      sendJson(response, 200, listReports())
    },
  },
  {
    method: 'POST',
    pattern: /^\/audit-reports$/,
    async handle(request, response) {
      const body = await readObject(request)
      const id = parseId(body.id)
      const incidentId = parseId(body.incidentId, 'incidentId')
      if (!isFileId(body.attachmentId)) throw new HttpError(400, 'attachmentId must be a file ID')

      const result = await createReport({ id, incidentId, attachmentId: body.attachmentId })
      if (result === 'duplicate') throw new HttpError(409, 'Audit report already exists')
      if (result === 'missing-source') throw new HttpError(404, 'Incident attachment not found')
      sendJson(response, 201, { id })
    },
  },
  {
    method: 'GET',
    pattern: /^\/audit-reports\/([a-zA-Z0-9_-]{1,64})$/,
    async handle(request, response, match) {
      const report = getReport(match[1])
      if (!report) throw new HttpError(404, 'Audit report not found')
      sendJson(response, 200, report)
    },
  },
  {
    method: 'GET',
    pattern: /^\/audit-reports\/([a-zA-Z0-9_-]{1,64})\/attachment$/,
    async handle(request, response, match) {
      sendAttachment(response, await downloadReport(match[1]))
    },
  },
]
