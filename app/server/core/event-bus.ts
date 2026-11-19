import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { context } from './context.ts'

// 토픽별 핸들러는 config/handlers.json 에 "모듈 경로#내보낸 함수 이름" 으로 등록한다.
// 모듈 경로는 server 디렉터리 기준이다. 개발 중에는 .ts, 빌드 결과에서는 .js 를 찾는다.
const configUrl = new URL('../../config/handlers.json', import.meta.url)
const serverRoot = new URL('../', import.meta.url)
const registry: any = {}

function resolveModule(path) {
  for (const extension of ['.ts', '.js']) {
    const url = new URL(path.replace(/\.(ts|js)$/, '') + extension, serverRoot)
    if (existsSync(fileURLToPath(url))) return url.href
  }
  throw new Error(`Handler module not found: ${path}`)
}

export async function loadHandlers() {
  const config = JSON.parse(readFileSync(configUrl, 'utf8'))
  for (const topic of Object.keys(config.topics || {})) {
    registry[topic] = []
    for (const entry of config.topics[topic]) {
      const [modulePath, exportName] = entry.split('#')
      const loaded = await import(resolveModule(modulePath))
      if (typeof loaded[exportName] !== 'function') throw new Error(`Handler ${entry} is not a function`)
      registry[topic].push({ name: entry, run: loaded[exportName] })
    }
  }
  return Object.keys(registry).reduce((sum, topic) => sum + registry[topic].length, 0)
}

// 핸들러는 등록 순서대로 실행한다. 한 핸들러가 실패해도 나머지는 계속 실행하고, 실패는 로그로만 남긴다.
export async function publish(topic: string, payload: any) {
  const handlers = registry[topic] || []
  for (const handler of handlers) {
    try {
      await handler.run(payload, context)
    } catch (error) {
      console.error(`[event-bus] ${topic} -> ${handler.name} failed`, error)
    }
  }
  return handlers.length
}

export function registeredTopics() {
  return Object.keys(registry).map((topic) => ({ topic, handlers: registry[topic].map((handler) => handler.name) }))
}
