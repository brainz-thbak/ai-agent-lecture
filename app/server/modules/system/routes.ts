import { context } from '../../core/context.ts'
import { registeredTopics } from '../../core/event-bus.ts'
import { sendJson } from '../../core/http.ts'
import { backfillStats, buildDailyDigest, diagnostics, findMismatchedEvidence, rebuildEvidenceIndex, reindexAll, searchIndexStats } from '../../services/evidence-service.ts'
import { sendText } from '../../core/http.ts'

export const systemRoutes = [
  {
    method: 'GET',
    pattern: /^\/health$/,
    async handle(request, response) {
      sendJson(response, 200, { status: 'ok' })
    },
  },
  {
    method: 'GET',
    pattern: /^\/storage\/usage$/,
    async handle(request, response) {
      sendJson(response, 200, await context.files.usage())
    },
  },
  {
    method: 'GET',
    pattern: /^\/system\/handlers$/,
    async handle(request, response) {
      sendJson(response, 200, registeredTopics())
    },
  },
  {
    method: 'GET',
    pattern: /^\/system\/diagnostics$/,
    async handle(request, response) {
      sendJson(response, 200, diagnostics())
    },
  },
  {
    method: 'GET',
    pattern: /^\/system\/digest$/,
    async handle(request, response) {
      sendText(response, 200, buildDailyDigest())
    },
  },
  {
    method: 'GET',
    pattern: /^\/system\/maintenance\/evidence-mismatch$/,
    async handle(request, response) {
      sendJson(response, 200, findMismatchedEvidence())
    },
  },
  {
    method: 'POST',
    pattern: /^\/system\/maintenance\/rebuild-evidence$/,
    async handle(request, response) {
      sendJson(response, 200, rebuildEvidenceIndex())
    },
  },
  {
    method: 'POST',
    pattern: /^\/system\/maintenance\/reindex$/,
    async handle(request, response) {
      sendJson(response, 200, { ...(await reindexAll()), ...searchIndexStats() })
    },
  },
  {
    method: 'POST',
    pattern: /^\/system\/maintenance\/backfill-stats$/,
    async handle(request, response) {
      sendJson(response, 200, await backfillStats())
    },
  },
]
