import { HttpError, sendAttachment } from '../../core/http.ts'
import { getAttachment, readAttachmentContent } from './attachment-repository.ts'
import { canServeAttachment } from './availability.ts'

export const attachmentRoutes = [
  {
    method: 'GET',
    pattern: /^\/incidents\/([a-zA-Z0-9_-]{1,64})\/attachment$/,
    async handle(request, response, match) {
      const attachment = getAttachment(match[1])
      if (!canServeAttachment(attachment)) throw new HttpError(404, 'Attachment not found')
      sendAttachment(response, await readAttachmentContent(attachment))
    },
  },
]
