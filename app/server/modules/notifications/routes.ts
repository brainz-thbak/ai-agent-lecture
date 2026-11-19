import { context } from '../../core/context.ts'
import { sendJson } from '../../core/http.ts'
import { readOutbox } from './outbox.ts'

export const notificationRoutes = [
  {
    method: 'GET',
    pattern: /^\/notifications\/outbox$/,
    async handle(request, response) {
      sendJson(response, 200, readOutbox(context))
    },
  },
]
