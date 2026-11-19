import type { IncomingMessage, ServerResponse } from 'node:http'
import type { DatabaseSync } from 'node:sqlite'
import { initializeDatabase } from './database.ts'
import type { FileStore, AttachmentInput } from './files.ts'
import { FileStoreError, isFileId } from './files.ts'
import { openIncidents } from './incidents.ts'
import { openReports } from './reports.ts'

const idPattern = /^[a-zA-Z0-9_-]{1,64}$/
const bodyLimit = 1024 * 1024

class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function readObject(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0

  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    if (!Buffer.isBuffer(chunk)) throw new HttpError(400, 'Invalid request body')
    size += chunk.length
    if (size > bodyLimit) {
      request.resume()
      throw new HttpError(413, 'Request body exceeds 1 MiB')
    }
    chunks.push(chunk)
  }

  let body: unknown
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'Valid JSON is required')
  }

  if (!isObject(body)) throw new HttpError(400, 'A JSON object is required')
  return body
}

function parseId(value: unknown, field = 'id'): string {
  if (typeof value !== 'string' || !idPattern.test(value)) {
    throw new HttpError(400, `${field} must contain 1–64 letters, digits, hyphens or underscores`)
  }
  return value
}

function parseTitle(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpError(400, 'title is required')
  }
  return value
}

function parseAttachment(value: unknown): AttachmentInput {
  if (!isObject(value) || typeof value.name !== 'string' || value.name.trim().length === 0
    || value.name.length > 120 || typeof value.content !== 'string') {
    throw new HttpError(400, 'attachment requires a name and text content')
  }
  if (value.name === '.' || value.name === '..' || /[\\/\u0000-\u001f\u007f]/.test(value.name)) {
    throw new HttpError(400, 'attachment name must be a filename')
  }
  return { name: Buffer.from(value.name).toString('utf8'), content: value.content }
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(body))
}

function sendAttachment(response: ServerResponse, attachment: { name: string; content: Buffer } | undefined) {
  if (!attachment) throw new HttpError(404, 'Attachment not found')

  const filename = encodeURIComponent(attachment.name)
    .replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16)}`)
  response.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    'Content-Length': attachment.content.length,
    'Cache-Control': 'no-store',
  })
  response.end(attachment.content)
}

export function createApi(database: DatabaseSync, files: FileStore) {
  initializeDatabase(database)
  const incidents = openIncidents(database, files)
  const reports = openReports(database, files)

  async function route(request: IncomingMessage, response: ServerResponse) {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname
    const method = request.method

    if (method === 'GET' && path === '/health') {
      sendJson(response, 200, { status: 'ok' })
      return
    }

    if (method === 'POST' && path === '/incidents') {
      const body = await readObject(request)
      const created = await incidents.create({
        id: parseId(body.id),
        title: parseTitle(body.title),
        attachment: parseAttachment(body.attachment),
      })
      if (!created) throw new HttpError(409, 'Incident already exists')
      sendJson(response, 201, created)
      return
    }

    const [, incidentId, incidentAction] = /^\/incidents\/([a-zA-Z0-9_-]{1,64})(?:\/(close|attachment))?$/.exec(path) ?? []
    if (method === 'GET' && incidentId && incidentAction === undefined) {
      const incident = incidents.get(incidentId)
      if (!incident) throw new HttpError(404, 'Incident not found')
      sendJson(response, 200, incident)
      return
    }

    if (method === 'POST' && incidentId && incidentAction === 'close') {
      const incident = incidents.close(incidentId)
      if (!incident) throw new HttpError(404, 'Incident not found')
      sendJson(response, 200, incident)
      return
    }

    if (method === 'GET' && incidentId && incidentAction === 'attachment') {
      sendAttachment(response, await incidents.download(incidentId))
      return
    }

    if (method === 'POST' && path === '/audit-reports') {
      const body = await readObject(request)
      const id = parseId(body.id)
      const incidentId = parseId(body.incidentId, 'incidentId')
      const attachmentId = body.attachmentId
      if (!isFileId(attachmentId)) throw new HttpError(400, 'attachmentId must be a file ID')

      const result = reports.create({ id, incidentId, attachmentId })
      if (result === 'duplicate') throw new HttpError(409, 'Audit report already exists')
      if (result === 'missing-source') throw new HttpError(404, 'Incident attachment not found')
      sendJson(response, 201, { id })
      return
    }

    const [, reportId, reportAction] = /^\/audit-reports\/([a-zA-Z0-9_-]{1,64})(?:\/(attachment))?$/.exec(path) ?? []
    if (method === 'GET' && reportId && reportAction === undefined) {
      const report = reports.get(reportId)
      if (!report) throw new HttpError(404, 'Audit report not found')
      sendJson(response, 200, report)
      return
    }

    if (method === 'GET' && reportId && reportAction === 'attachment') {
      sendAttachment(response, await reports.download(reportId))
      return
    }

    if (method === 'GET' && path === '/storage/usage') {
      sendJson(response, 200, await files.usage())
      return
    }

    throw new HttpError(404, 'Route not found')
  }

  return (request: IncomingMessage, response: ServerResponse) => {
    void route(request, response).catch((error: unknown) => {
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
