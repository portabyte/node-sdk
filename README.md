# Portabyte Node.js SDK

Upload, deliver, and manage files from trusted TypeScript server code. The SDK has no runtime package dependencies and uses your runtime's built-in `fetch`.

> Keep `pbt_sk_live_` API keys on your server. Do not use this SDK in browser code, mobile apps, or browser extensions.

## Install

```sh
npm install @portabyte/node
```

The SDK requires Node.js 18 or later.

## Upload a file

Create a client with a project API key, then pass a file to `files.upload`. The SDK creates the upload session, transfers the bytes, confirms the asset, and returns the live file record.

```ts
import { readFile } from 'node:fs/promises';
import { Portabyte } from '@portabyte/node';

const portabyte = new Portabyte({
  apiKey: process.env.PORTABYTE_API_KEY!,
});

const asset = await portabyte.files.upload({
  file: await readFile('./summary.pdf'),
  name: 'summary.pdf',
  contentType: 'application/pdf',
  visibility: 'public',
});

console.log(asset.publicUrl);
```

When your server receives a web `File`, such as through a route handler's `FormData`, pass it directly. The SDK reads its filename, MIME type, and size:

```ts
const asset = await portabyte.files.upload({
  file,
  path: 'reports/2026/may/summary.pdf',
  visibility: 'private',
});
```

Use `path` when you want one current file at a stable application-owned address. Uploading another confirmed file to that path replaces the current one.

## Deliver a file

Request a delivery URL with the file's ID:

```ts
const delivery = await portabyte.files.url(asset.id);

if (delivery.public) {
  console.log(delivery.url);
} else {
  console.log(delivery.expiresAt);
}
```

Public files return stable URLs. Private files return short-lived signed URLs. Request a new private URL whenever an authorized recipient needs the file.

## Resume a large upload

Files of 32 MiB or larger use multipart upload automatically. For an upload that must survive a process restart, create a session and persist multipart state after each completed part:

```ts
const session = await portabyte.files.create({
  name: 'recording.mp4',
  contentType: 'video/mp4',
  sizeBytes: video.size,
});

const asset = await portabyte.files.resume(session, {
  file: video,
  state: savedUploadState,
  onStateChange: saveUploadState,
});
```

Resume with the same byte size and MIME type. Multipart upload sessions expire after 12 hours.

## Manage files

Use the file ID to retrieve metadata, list a project page, or delete a file:

```ts
const file = await portabyte.files.get(asset.id);
const page = await portabyte.files.list({ limit: 20 });
await portabyte.files.remove(file.id);
```

Pass `page.cursor` to `files.list` to retrieve the next page.

## Configure the client

| Option       | Description                                                  | Default                     |
| ------------ | ------------------------------------------------------------ | --------------------------- |
| `apiKey`     | Project API key that starts with `pbt_sk_live_`              | Required                    |
| `baseUrl`    | Control-plane API URL                                        | `https://api.portabyte.dev` |
| `maxRetries` | Retries for idempotent requests                              | `2`                         |
| `timeoutMs`  | Timeout for each request in milliseconds; set `0` to disable | `30000`                     |
| `fetch`      | Custom `fetch` implementation                                | Runtime `fetch`             |

The SDK retries `GET` requests and upload-byte requests after network failures, `429` responses, and `5xx` responses. It does not retry state-changing API calls.

## Upload directly from a browser

Keep your API key on your server. Prepare the upload on your server, return the browser-safe session to the client, then confirm it on your server after the browser has uploaded the bytes.

Before using this flow, set your frontend's origin once in **Console → Project → Settings → Upload defaults → Default CORS origin** (for example, `https://app.example.com`). The SDK uses that project default when `corsOrigin` is omitted. Pass `corsOrigin` only when a particular upload needs a different allowed origin.

```ts
// Your server route: POST /api/uploads/prepare
const upload = await portabyte.files.prepareBrowserUpload({
  name: file.name,
  contentType: file.type,
  sizeBytes: file.size,
  visibility: 'public',
});

// Return `upload` to the browser. Never return PORTABYTE_API_KEY.
```

```ts
// Browser code
await fetch(upload.uploadUrl, {
  method: 'PUT',
  headers: { 'Content-Type': file.type },
  body: file,
});

// Tell your server the upload completed, then on the server:
const asset = await portabyte.files.confirm(upload.assetId);
```

For multipart sessions, use `uploadMode`, `partSize`, and `maxConcurrency` to upload parts through the same signed upload URL. Your server must still call `confirm` once the multipart upload completes.

## Handle errors

Failed requests throw `PortabyteError`, which includes the HTTP status, a stable error code, and a request ID when the API returns one:

```ts
import { PortabyteError } from '@portabyte/node';

try {
  await portabyte.files.upload(uploadRequest);
} catch (error) {
  if (error instanceof PortabyteError) {
    console.error(error.status, error.code, error.requestId);
  }
}
```

## Learn more

- [Getting started](https://portabyte.dev/docs/getting-started/node-sdk)
- [REST API reference](https://portabyte.dev/docs/api-reference)
- [Browser uploads](https://portabyte.dev/docs/upload-delivery/browser-uploads)
- [Public and private files](https://portabyte.dev/docs/upload-delivery/public-and-private-files)

## License

[MIT](./LICENSE)
