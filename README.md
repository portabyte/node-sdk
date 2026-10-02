<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/logo-horizontal-white.svg">
  <img src="assets/logo-horizontal-color.svg" alt="Portabyte" width="260">
</picture>

# Portabyte Node.js SDK

Upload, deliver, and manage files from a Node.js server with `@portabyte/node`.

[![npm version](https://img.shields.io/npm/v/@portabyte/node)](https://www.npmjs.com/package/@portabyte/node)
[![CI](https://github.com/portabyte/node-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/portabyte/node-sdk/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

## Requirements

- Node.js 18 or later
- A Portabyte project API key (`pbt_sk_live_...`)

Keep the key on your server. This SDK is not for browser code.

## Install

```sh
npm install @portabyte/node
```

## Quick start

Create a [project API key](https://portabyte.dev/docs/getting-started/api-keys), then place a PDF named `summary.pdf` beside your script:

```sh
export PORTABYTE_API_KEY="pbt_sk_live_your_key_here"
```

Save this as `quickstart.mjs`:

```js
import { readFile } from 'node:fs/promises';
import { Portabyte } from '@portabyte/node';

const portabyte = new Portabyte({
  apiKey: process.env.PORTABYTE_API_KEY,
});

const asset = await portabyte.files.upload({
  file: await readFile('./summary.pdf'),
  name: 'summary.pdf',
  contentType: 'application/pdf',
  visibility: 'public',
});

console.log(asset.id, asset.publicUrl);
```

Run `node quickstart.mjs`. The SDK creates an upload session, sends the bytes to its signed upload URL, and confirms the file. The API endpoint is built in; you only configure the project key.

## Common tasks

```js
// Use an asset ID returned by upload() or list().
const asset = await portabyte.files.get(assetId);
const delivery = await portabyte.files.url(assetId);
const page = await portabyte.files.list({ limit: 20 });
const nextPage = page.cursor
  ? await portabyte.files.list({ cursor: page.cursor, limit: 20 })
  : null;
await portabyte.files.remove(assetId);
```

Public files have stable delivery URLs. Private files receive short-lived signed URLs; request a new one when needed. Set `path` during upload to replace the current file at an application-owned path.

The SDK automatically uses multipart upload for large files. To recover from an interrupted upload, use `files.create()` and `files.resume()` with persisted multipart state. See the [Node.js SDK guide](https://portabyte.dev/docs/getting-started/node-sdk) for that flow.

For uploads directly from a browser, call `files.prepareBrowserUpload()` and `files.confirm()` on your server. Send only the browser-safe session to the browser; never send the API key. See [Browser uploads](https://portabyte.dev/docs/upload-delivery/browser-uploads).

## Errors

Failed requests throw `PortabyteError`:

```js
import { PortabyteError } from '@portabyte/node';

try {
  await portabyte.files.get(assetId);
} catch (error) {
  if (error instanceof PortabyteError) {
    console.error(error.status, error.code, error.requestId);
  } else {
    throw error;
  }
}
```

## Client options

| Option | Purpose | Default |
| --- | --- | --- |
| `apiKey` | Server API key scoped to a project | Required |
| `maxRetries` | Retries for safe requests | `2` |
| `timeoutMs` | Per-request timeout in milliseconds (`0` disables it) | `30000` |
| `baseUrl` | Override the API endpoint for local development or tests | `https://api.portabyte.dev` |
| `fetch` | Supply a different Fetch implementation | Runtime `fetch` |

The SDK retries reads and byte transfers on network failures, `429`, and `5xx`. It does not retry state-changing API requests.

## When to use this SDK

Use it on a trusted server to upload and manage files, prepare direct browser uploads, and request delivery URLs. A browser can send file bytes to a signed upload URL prepared by your server; it must never receive your project API key.

## Documentation

- [Node.js SDK guide](https://portabyte.dev/docs/getting-started/node-sdk)
- [REST API reference](https://portabyte.dev/docs/api-reference)
- [Public and private files](https://portabyte.dev/docs/upload-delivery/public-and-private-files)

## Development

```sh
pnpm install
pnpm run verify
pnpm run build
```

Report SDK bugs in [GitHub issues](https://github.com/portabyte/node-sdk/issues).

## License

[MIT](./LICENSE)
