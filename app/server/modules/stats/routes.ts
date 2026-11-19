import { context } from '../../core/context.ts'
import { sendJson } from '../../core/http.ts'
import { readStats } from './counters.ts'

export const statsRoutes = [
  {
    method: 'GET',
    pattern: /^\/stats$/,
    async handle(request, response) {
      sendJson(response, 200, readStats(context))
    },
  },
]
