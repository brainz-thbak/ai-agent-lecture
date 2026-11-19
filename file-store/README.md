# File store

Run from the repository root with Node.js 24 or later.

```sh
pnpm --filter file-store start
```

The server listens on `http://localhost:6006`. Set `PORT` to change the port.
Set `FILE_STORE_DATA_DIR` to change the storage directory. The default is
`file-store/.data`. The service stores file bytes at `<space>/<id>` and keeps
the catalog in `metadata.sqlite` in the same directory. When the service
initializes the catalog, it registers existing files in place using their
modification times and a `null` original filename.

## HTTP API

| Request | Response |
| --- | --- |
| `GET /health` | `200` when the server responds. |
| `POST /spaces/:space/files` | Send raw bytes, including an empty body. Each upload returns `201` with JSON `{"id":"<id>"}`. To record the original filename, pass `X-File-Name` with the result of `encodeURIComponent(name)`. An invalid filename returns `400`. A body over 1 MiB returns `413`. |
| `GET /spaces/:space/files/:id` | `200` with the file bytes or `404` if the file is missing. |
| `HEAD /spaces/:space/files/:id` | The same status and headers as `GET`, with an empty body. |
| `DELETE /spaces/:space/files/:id` | `204` whether or not the file exists. |
| `GET /spaces/:space/files/:id/metadata` | `200` with JSON fields `id`, `originalName`, `path`, `bytes`, and `uploadedAt`, or `404` if the file is missing. |
| `GET /spaces/:space/usage` | `200` with JSON counts for available `files` and `bytes` in the space's catalog. |

A space ID contains 1 to 64 lowercase ASCII letters, digits, or hyphens. It
starts with a letter or digit. A file ID contains 64 lowercase hexadecimal
characters. The service generates a new ID for each upload. Metadata `path`
is relative to the storage directory, and `uploadedAt` uses ISO 8601 in UTC.
The `originalName` field is `null` when the request omits the filename header.
