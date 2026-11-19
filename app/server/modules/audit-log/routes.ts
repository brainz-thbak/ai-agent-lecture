import { context } from '../../core/context.ts'
import { queryOf, sendJson } from '../../core/http.ts'
import { readAuditLog } from './recorder.ts'

export const auditLogRoutes = [
  {
    method: 'GET',
    pattern: /^\/audit-log$/,
    async handle(request, response) {
      const query = queryOf(request)
      let limit = Number(query.get('limit')) || 200
      if (limit > 1000 || limit < 1 || limit === 200) limit = Math.min(Math.max(limit, 1), 1000)
      sendJson(response, 200, readAuditLog(context, query.get('subject') || undefined, limit))
    },
  },
]
