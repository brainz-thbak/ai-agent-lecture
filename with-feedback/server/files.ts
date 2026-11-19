export type AttachmentInput = { name: string; content: string }
export type FileId = string & { readonly __brand: 'FileId' }

export function isFileId(value: unknown): value is FileId {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}

export class FileStoreError extends Error {}

export function createFileStore(origin: string, space: string) {
  const base = new URL(origin)
  if (base.protocol !== 'http:' && base.protocol !== 'https:') {
    throw new Error('FILE_STORE_URL must be an HTTP or HTTPS URL')
  }
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(space)) {
    throw new Error('FILE_STORE_SPACE must contain 1–64 lowercase letters, digits or hyphens and start with a letter or digit')
  }
  base.pathname = `${base.pathname.replace(/\/+$/, '')}/spaces/${space}/`
  base.search = ''
  base.hash = ''

  async function request<T>(path: string, read: (response: Response) => Promise<T>, options?: RequestInit): Promise<T> {
    try {
      const response = await fetch(new URL(path, base), {
        ...options,
        signal: AbortSignal.timeout(3000),
        redirect: 'error',
      })
      return await read(response)
    } catch (cause) {
      throw new FileStoreError('File store request failed', { cause })
    }
  }

  async function checkResponse(response: Response) {
    if (response.ok) return
    await response.body?.cancel()
    throw new Error(`File store returned ${response.status}`)
  }

  return {
    put({ name, content }: AttachmentInput): Promise<FileId> {
      return request('files', async (response) => {
        await checkResponse(response)
        if (response.status !== 201) {
          await response.body?.cancel()
          throw new Error('File store did not create a new file')
        }
        const result: unknown = await response.json()
        if (typeof result !== 'object' || result === null || !('id' in result)
          || !isFileId(result.id)) {
          throw new Error('Invalid file store response')
        }
        return result.id
      }, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-File-Name': encodeURIComponent(name),
        },
        body: Buffer.from(content, 'utf8'),
      })
    },
    read(id: FileId): Promise<Buffer | undefined> {
      return request(`files/${encodeURIComponent(id)}`, async (response) => {
        if (response.status === 404) {
          await response.body?.cancel()
          return undefined
        }
        await checkResponse(response)
        return Buffer.from(await response.arrayBuffer())
      })
    },
    remove(id: FileId): Promise<void> {
      return request(`files/${encodeURIComponent(id)}`, async (response) => {
        if (response.status !== 404) await checkResponse(response)
        await response.body?.cancel()
      }, { method: 'DELETE' })
    },
    usage(): Promise<{ files: number; bytes: number }> {
      return request('usage', async (response) => {
        await checkResponse(response)
        const result: unknown = await response.json()
        if (typeof result !== 'object' || result === null
          || !('files' in result) || typeof result.files !== 'number'
          || !Number.isSafeInteger(result.files) || result.files < 0
          || !('bytes' in result) || typeof result.bytes !== 'number'
          || !Number.isSafeInteger(result.bytes) || result.bytes < 0) {
          throw new Error('Invalid file store usage response')
        }
        return { files: result.files, bytes: result.bytes }
      })
    },
  }
}

export type FileStore = ReturnType<typeof createFileStore>
