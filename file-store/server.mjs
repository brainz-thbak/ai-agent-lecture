import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fileIdPattern, openCatalog, spacePattern } from './catalog.mjs';

const host = 'localhost';
const port = Number(process.env.PORT ?? 4100);
const dataDirectory = resolve(
  process.env.FILE_STORE_DATA_DIR ?? fileURLToPath(new URL('.data', import.meta.url)),
);
const maxUploadBytes = 1024 * 1024;
const catalog = openCatalog(dataDirectory);

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(value));
}

function methodNotAllowed(response, allow) {
  response.writeHead(405, { Allow: allow });
  response.end();
}

async function readUpload(request) {
  if (Number(request.headers['content-length']) > maxUploadBytes) {
    return null;
  }

  const chunks = [];
  let bytes = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    bytes += chunk.length;
    if (bytes > maxUploadBytes) {
      return null;
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks, bytes);
}

function readOriginalName(request) {
  const names = request.headersDistinct['x-file-name'];
  if (!names) {
    return { originalName: null };
  }
  if (names.length !== 1) {
    return null;
  }
  let originalName;
  try {
    originalName = decodeURIComponent(names[0]);
  } catch {
    return null;
  }
  if (!originalName || originalName === '.' || originalName === '..' || /[\/\\\u0000-\u001f\u007f]/.test(originalName)) {
    return null;
  }
  return { originalName };
}

async function upload(request, response, space) {
  const name = readOriginalName(request);
  if (!name) {
    response.writeHead(400, { Connection: 'close' }).end();
    request.resume();
    return;
  }

  const content = await readUpload(request);
  if (content === null) {
    response.writeHead(413, { Connection: 'close' }).end();
    request.resume();
    return;
  }

  json(response, 201, { id: catalog.put(space, name.originalName, content) });
}

async function download(request, response, file) {
  if (!file) {
    response.writeHead(404).end();
    return;
  }
  let content;
  try {
    content = await readFile(join(dataDirectory, file.path));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    response.writeHead(404).end();
    return;
  }

  response.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Length': content.length,
  });
  response.end(request.method === 'HEAD' ? undefined : content);
}

async function handleRequest(request, response) {
  const [path] = request.url.split('?');
  if (path === '/health') {
    if (request.method === 'GET') {
      response.writeHead(200).end();
    } else {
      methodNotAllowed(response, 'GET');
    }
    return;
  }

  const [root, prefix, space, resource, id, detail, ...extra] = path.split('/');
  if (root === '' && prefix === 'spaces' && spacePattern.test(space ?? '') && extra.length === 0) {
    if (resource === 'usage' && id === undefined) {
      if (request.method === 'GET') {
        json(response, 200, catalog.usage(space));
      } else {
        methodNotAllowed(response, 'GET');
      }
      return;
    }
    if (resource === 'files' && id === undefined) {
      if (request.method === 'POST') {
        await upload(request, response, space);
      } else {
        methodNotAllowed(response, 'POST');
      }
      return;
    }
    if (resource === 'files' && fileIdPattern.test(id ?? '') && detail === 'metadata') {
      if (request.method !== 'GET') {
        methodNotAllowed(response, 'GET');
      } else {
        const file = catalog.get(space, id);
        if (file) {
          json(response, 200, file);
        } else {
          response.writeHead(404).end();
        }
      }
      return;
    }
    if (resource === 'files' && fileIdPattern.test(id ?? '') && detail === undefined) {
      switch (request.method) {
        case 'GET':
        case 'HEAD':
          await download(request, response, catalog.get(space, id));
          break;
        case 'DELETE':
          catalog.remove(space, id);
          response.writeHead(204).end();
          break;
        default:
          methodNotAllowed(response, 'GET, HEAD, DELETE');
      }
      return;
    }
  }

  response.writeHead(404).end();
}

const server = createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  handleRequest(request, response).catch((error) => {
    if (response.destroyed) {
      return;
    }
    console.error(error);
    response.writeHead(500).end();
  });
});

server.listen(port, host, () => {
  console.log(`File store listening at http://${host}:${server.address().port}`);
});
