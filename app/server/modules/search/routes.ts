import { queryOf, sendJson } from '../../core/http.ts'
import { searchArtifacts } from './search.ts'

export const searchRoutes = [
  {
    method: 'GET',
    pattern: /^\/search$/,
    async handle(request, response) {
      sendJson(response, 200, searchArtifacts(queryOf(request).get('q') || ''))
    },
  },
]
