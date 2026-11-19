import type { IncomingMessage, ServerResponse } from 'node:http'

const idPattern = /^[a-zA-Z0-9_-]{1,64}$/
const bodyLimit = 1024 * 1024

export class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function isObject(value: any) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function readObject(request: IncomingMessage): Promise<any> {
  const chunks = []
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

  let body
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null')
  } catch {
    throw new HttpError(400, 'Valid JSON is required')
  }

  if (!isObject(body)) throw new HttpError(400, 'A JSON object is required')
  return body
}

// 본문이 없어도 되는 요청용. 비어 있으면 빈 객체를 돌려준다.
export async function readOptionalObject(request: IncomingMessage): Promise<any> {
  const chunks = []
  for await (const chunk of request.iterator({ destroyOnReturn: false })) chunks.push(chunk)
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (!text) return {}
  try {
    const parsed = JSON.parse(text)
    return isObject(parsed) ? parsed : {}
  } catch {
    throw new HttpError(400, 'Valid JSON is required')
  }
}

export function parseId(value: any, field = 'id'): string {
  if (typeof value !== 'string' || !idPattern.test(value)) {
    throw new HttpError(400, `${field} must contain 1–64 letters, digits, hyphens or underscores`)
  }
  return value
}

export function parseTitle(value: any): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpError(400, 'title is required')
  }
  return value
}

export function parseAttachment(value: any) {
  if (!isObject(value) || typeof value.name !== 'string' || value.name.trim().length === 0
    || value.name.length > 120 || typeof value.content !== 'string') {
    throw new HttpError(400, 'attachment requires a name and text content')
  }
  if (value.name === '.' || value.name === '..' || /[\\/\u0000-\u001f\u007f]/.test(value.name)) {
    throw new HttpError(400, 'attachment name must be a filename')
  }
  return { name: Buffer.from(value.name).toString('utf8'), content: value.content }
}

export function sendJson(response: ServerResponse, status: number, body: any) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(body))
}

export function sendText(response: ServerResponse, status: number, text: string) {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(text)
}

export function sendAttachment(response: ServerResponse, attachment: any) {
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

export function queryOf(request: IncomingMessage) {
  return new URL(request.url ?? '/', 'http://localhost').searchParams
}
