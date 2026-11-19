import { HttpError, parseAttachment, parseId, parseTitle, readObject, sendJson } from '../../core/http.ts'
import { closeIncident, createIncident, getIncident, listIncidents } from './incidents.ts'

export const incidentRoutes = [
  {
    method: 'GET',
    pattern: /^\/incidents$/,
    async handle(request, response) {
      sendJson(response, 200, listIncidents())
    },
  },
  {
    method: 'POST',
    pattern: /^\/incidents$/,
    async handle(request, response) {
      const body = await readObject(request)
      const created = await createIncident({
        id: parseId(body.id),
        title: parseTitle(body.title),
        attachment: parseAttachment(body.attachment),
      })
      if (!created) throw new HttpError(409, 'Incident already exists')
      sendJson(response, 201, created)
    },
  },
  {
    method: 'GET',
    pattern: /^\/incidents\/([a-zA-Z0-9_-]{1,64})$/,
    async handle(request, response, match) {
      const incident = getIncident(match[1])
      if (!incident) throw new HttpError(404, 'Incident not found')
      sendJson(response, 200, incident)
    },
  },
  {
    method: 'POST',
    pattern: /^\/incidents\/([a-zA-Z0-9_-]{1,64})\/close$/,
    async handle(request, response, match) {
      const incident = await closeIncident(match[1])
      if (!incident) throw new HttpError(404, 'Incident not found')
      sendJson(response, 200, incident)
    },
  },
]
