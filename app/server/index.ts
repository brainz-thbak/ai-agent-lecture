import { mkdirSync } from 'node:fs'
import { createServer } from 'node:http'
import { basename, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createApi } from './api.ts'
import { setContext } from './core/context.ts'
import { loadHandlers } from './core/event-bus.ts'
import { createFileStore } from './files.ts'

const project = basename(resolve(import.meta.dirname, '..'))
const port = Number(process.env.PORT ?? 8080)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer from 1 to 65535')
}

const directory = resolve(process.env.DEMO_DATA_DIR ?? '.data/evidence')
const files = createFileStore(process.env.FILE_STORE_URL ?? 'http://localhost:6006', process.env.FILE_STORE_SPACE ?? project)
mkdirSync(directory, { recursive: true })
const database = new DatabaseSync(join(directory, 'metadata.sqlite'))
const server = createServer(createApi(database, files))
setContext({ database, files })
await loadHandlers()

server.listen(port, 'localhost', () => {
  process.stdout.write(`Evidence demo listening at http://localhost:${port}\n`)
})

function stop() {
  server.close(() => database.close())
}

process.once('SIGINT', stop)
process.once('SIGTERM', stop)
