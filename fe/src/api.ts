export type Incident = {
  id: string
  title: string
  closedAt: string | null
  attachment: { id: string; name: string } | null
}

export type Report = {
  id: string
  attachment: { name: string }
  source: { incidentId: string; attachmentId: string } | null
}

type Usage = { files: number; bytes: number }
export type Workspace = { incidents: Incident[]; reports: Report[]; usage: Usage | null }

export class ApiError extends Error {
  readonly status: number

  constructor(status: number) {
    super('API request failed')
    this.status = status
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isIncident(value: unknown): value is Incident {
  return isObject(value) && typeof value.id === 'string' && typeof value.title === 'string'
    && (typeof value.closedAt === 'string' || value.closedAt === null)
    && (value.attachment === null || (isObject(value.attachment)
      && typeof value.attachment.id === 'string' && typeof value.attachment.name === 'string'))
}

function isReport(value: unknown): value is Report {
  return isObject(value) && typeof value.id === 'string'
    && isObject(value.attachment) && typeof value.attachment.name === 'string'
    && (value.source === null || (isObject(value.source) && typeof value.source.incidentId === 'string'
      && typeof value.source.attachmentId === 'string'))
}

function isUsage(value: unknown): value is Usage {
  return isObject(value) && typeof value.files === 'number' && typeof value.bytes === 'number'
}

async function request(path: string, options?: RequestInit) {
  const response = await fetch(`/api${path}`, { signal: AbortSignal.timeout(8000), ...options })
  if (!response.ok) throw new ApiError(response.status)
  return response
}

async function readList<T>(path: string, isItem: (value: unknown) => value is T): Promise<T[]> {
  const response = await request(path)
  const data: unknown = await response.json()
  if (!Array.isArray(data) || !data.every(isItem)) throw new Error('Invalid list response')
  return data
}

async function readUsage() {
  const response = await request('/storage/usage')
  const data: unknown = await response.json()
  if (!isUsage(data)) throw new Error('Invalid usage response')
  return data
}

export async function readWorkspace(): Promise<Workspace> {
  const [incidents, reports, usage] = await Promise.all([
    readList('/incidents', isIncident),
    readList('/audit-reports', isReport),
    readUsage().catch(() => null),
  ])
  return { incidents, reports, usage }
}

export async function seedExamples() {
  await request('/demo/seed', { method: 'POST' })
}

export async function resetExamples() {
  await request('/demo/reset', { method: 'POST' })
}

export async function closeIncident(id: string) {
  await request(`/incidents/${encodeURIComponent(id)}/close`, { method: 'POST' })
}

export async function createReport(id: string, incidentId: string, attachmentId: string) {
  await request('/audit-reports', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, incidentId, attachmentId }),
  })
}

export function attachmentPath(collection: 'incidents' | 'audit-reports', id: string) {
  return `/${collection}/${encodeURIComponent(id)}/attachment`
}

export async function readAttachment(path: string, signal: AbortSignal) {
  return (await request(path, { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) })).text()
}

export async function downloadAttachment(path: string, name: string) {
  const response = await request(path)
  const url = URL.createObjectURL(await response.blob())
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function actionError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 400) return '입력값을 확인해 주세요.'
    if (error.status === 404) return '데이터를 찾을 수 없습니다. 목록을 새로고침해 주세요.'
    if (error.status === 409) return '이미 등록된 ID입니다. 다른 ID를 사용해 주세요.'
    if (error.status === 502) return '파일 저장소에 연결할 수 없습니다.'
  }
  return '요청을 완료하지 못했습니다. API 연결을 확인하고 다시 시도해 주세요.'
}
