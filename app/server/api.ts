import type { IncomingMessage, ServerResponse } from 'node:http'
import type { DatabaseSync } from 'node:sqlite'
import { HttpError, sendJson } from './core/http.ts'
import { initializeDatabase } from './database.ts'
import { FileStoreError } from './files.ts'
import { attachmentRoutes } from './modules/attachments/routes.ts'
import { legacyEvidenceRoutes } from './modules/evidence/legacy-routes.ts'
import { incidentRoutes } from './modules/incidents/routes.ts'
import { reportRoutes } from './modules/reports/routes.ts'
import { systemRoutes } from './modules/system/routes.ts'

// 위에서부터 순서대로 비교한다. 먼저 맞는 라우트가 요청을 처리한다.
const routes: any[] = [
  ...systemRoutes,
  ...incidentRoutes,
  ...attachmentRoutes,
  ...reportRoutes,
  ...legacyEvidenceRoutes,
]

export function createApi(database: DatabaseSync, files: any) {
  initializeDatabase(database)

  async function route(request: IncomingMessage, response: ServerResponse) {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname
    for (const candidate of routes) {
      if (candidate.method !== request.method) continue
      const match = candidate.pattern.exec(path)
      if (match) {
        await candidate.handle(request, response, match)
        return
      }
    }
    throw new HttpError(404, 'Route not found')
  }

  return (request: IncomingMessage, response: ServerResponse) => {
    void route(request, response).catch((error: any) => {
      if (response.destroyed) return
      if (error instanceof HttpError) {
        sendJson(response, error.status, { error: error.message })
        return
      }
      if (error instanceof FileStoreError) {
        sendJson(response, 502, { error: 'File store unavailable' })
        return
      }
      console.error(error)
      if (response.headersSent) response.destroy()
      else sendJson(response, 500, { error: 'Internal server error' })
    })
  }
}
