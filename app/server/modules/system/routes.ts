import { context } from '../../core/context.ts'
import { registeredTopics } from '../../core/event-bus.ts'
import { sendJson } from '../../core/http.ts'
import { diagnostics } from '../../services/evidence-service.ts'

export const systemRoutes = [
  {
    method: 'GET',
    pattern: /^\/health$/,
    async handle(request, response) {
      sendJson(response, 200, { status: 'ok' })
    },
  },
  {
    method: 'GET',
    pattern: /^\/storage\/usage$/,
    async handle(request, response) {
      sendJson(response, 200, await context.files.usage())
    },
  },
  {
    method: 'GET',
    pattern: /^\/system\/handlers$/,
    async handle(request, response) {
      sendJson(response, 200, registeredTopics())
    },
  },
  {
    method: 'GET',
    pattern: /^\/system\/diagnostics$/,
    async handle(request, response) {
      sendJson(response, 200, diagnostics())
    },
  },
]
