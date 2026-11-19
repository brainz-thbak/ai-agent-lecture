import { HttpError, sendJson } from '../../core/http.ts'
import { getPreview } from './preview-cache.ts'

export const previewRoutes = [
  {
    method: 'GET',
    pattern: /^\/incidents\/([a-zA-Z0-9_-]{1,64})\/preview$/,
    async handle(request, response, match) {
      const preview = await getPreview(match[1])
      if (!preview) throw new HttpError(404, 'Preview not available')
      sendJson(response, 200, preview)
    },
  },
]
