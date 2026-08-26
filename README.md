# Portabyte TypeScript SDK

The Portabyte TypeScript SDK provides convenient server-side access to the Portabyte API. It covers the full file lifecycle: signed upload sessions that stream straight to the edge, delivery URLs for public and private files, and asset management.

It is written in TypeScript, ships with zero dependencies on the native `fetch` API, and runs in trusted Node 18+, Bun, Deno, and edge server runtimes.

## Requirements

Node.js >= 18 or another trusted server runtime with `fetch` support.

## Installation

```
npm install @portabyte/sdk
```

## Usage

```ts
import { Portabyte } from '@portabyte/sdk';

const portabyte = new Portabyte({
  apiKey: process.env.PORTABYTE_API_KEY, // pbt_sk_live_...
});
```

### Uploading a file

Pass a browser `File` to `files.upload`. The SDK creates the upload session, transfers the bytes, verifies the upload, and returns the live asset.

```ts
const asset = await portabyte.files.upload({
  file,
  path: 'reports/2026/may/summary.pdf',
  visibility: 'public',
});
```

For a `Blob` without a filename or raw bytes, provide `name` and `contentType`:

```ts
await portabyte.files.upload({
  file: bytes,
  name: 'summary.pdf',
  contentType: 'application/pdf',
});
```

`path`, `visibility`, and `corsOrigin` are optional. Uploading to an existing `path` replaces the current live file at that path.

### Large & resumable uploads

Portabyte automatically uses multipart upload for files of 32 MiB or larger. It sends 8 MiB parts with up to 3 concurrent requests, retries failed parts, and completes the object only after every part succeeds.

For an upload that must survive a process restart, create the session yourself and persist both the session and the multipart state emitted by `onStateChange`. Call `resume` with the same file to continue it. Multipart sessions are valid for 12 hours.

```ts
const session = await portabyte.files.create({
  name: 'recording.mp4',
  contentType: 'video/mp4',
  sizeBytes: video.size,
});

await portabyte.files.resume(session, {
  file: video,
  state: savedState,
  onStateChange: async (nextState) => {
    await saveUploadState(session, nextState);
  },
});
```

### Delivering files

```ts
const { url, expiresAt, public } = await portabyte.files.url(asset.id);
```

Public assets return a stable, cacheable URL (`expiresAt` is absent). Private assets return a signed URL that works for 5 minutes; mint a fresh one whenever needed.

### Managing assets

```ts
const page = await portabyte.files.list({ limit: 20 });
const next = await portabyte.files.list({ limit: 20, cursor: page.cursor });
const one = await portabyte.files.get(asset.id);
await portabyte.files.remove(asset.id);
```

## Configuration

| Option       | Description                                                    | Default                 |
| ------------ | -------------------------------------------------------------- | ----------------------- |
| `apiKey`     | Project-scoped server API key (`pbt_sk_live_...`)               | required                |
| `baseUrl`    | Control-plane base URL                                         | `https://api.portabyte.dev` |
| `maxRetries` | Retries for idempotent requests (network errors, 429s, 5xxs)   | `2`                     |
| `timeoutMs`  | Per-request timeout in milliseconds                            | `30000`                 |
| `fetch`      | Fetch implementation; inject to test or route through a proxy  | global `fetch`          |

### Timeout

Every request runs under `timeoutMs`. Node's `fetch` has no default timeout; the SDK applies one so hung requests cannot hang forever. Set `timeoutMs: 0` to disable.

### Network retries

Idempotent requests (GETs and the upload PUT) retry automatically on network errors, 429s, and 5xxs with capped exponential backoff and full jitter, honoring the API's `Retry-After` header.

> **Note:** mutating requests (`create`, confirm, `remove`) never retry — a replayed create would open a second upload session.

### Custom fetch

The `fetch` option replaces the global `fetch` for every request the SDK makes. Most callers never need it; it exists for corporate proxies, tracing, and runtimes without a global `fetch`:

```ts
// Route SDK traffic through a corporate proxy (undici)
import { ProxyAgent, fetch as proxyFetch } from 'undici';

const agent = new ProxyAgent('http://proxy.corp:8080');
const portabyte = new Portabyte({
  apiKey,
  fetch: (url, init) => proxyFetch(url as string, { ...init, dispatcher: agent }),
});
```

```ts
// Trace every SDK call
const portabyte = new Portabyte({
  apiKey,
  fetch: async (url, init) => {
    const span = tracer.startSpan('portabyte');
    try {
      return await fetch(url, init);
    } finally {
      span.end();
    }
  },
});
```

## Errors

Failed API calls throw a `PortabyteError` carrying `status` (0 when the request never reached the API), a machine-readable `code` such as `rate_limited` or `api_key_invalid`, and the API's `requestId`:

```ts
import { PortabyteError } from '@portabyte/sdk';

try {
  await portabyte.files.upload(input);
} catch (error) {
  if (error instanceof PortabyteError && error.status === 429) {
    // respect the rate-limit window before retrying
  }
}
```

## Testing

The client accepts an injected `fetch`, so your tests need no network and no global mocking. Any fetch-shaped function works — for example, one that returns a fixed response:

```ts
import { Portabyte } from '@portabyte/sdk';
import { vi, describe, it, expect } from 'vitest';

describe('reports', () => {
  it('lists assets', async () => {
    const portabyte = new Portabyte({
      apiKey: 'pbt_sk_live_test',
      fetch: vi.fn(async () =>
        new Response(JSON.stringify({ records: [], cursor: undefined }), {
          status: 200,
        }),
      ),
    });

    const page = await portabyte.files.list();
    expect(page.records).toEqual([]);
  });
});
```

## Support

For issues and feature requests, open an issue on GitHub. For API questions, see the Portabyte API reference.

## Development

| Command          | Description                           |
| ---------------- | ------------------------------------- |
| `pnpm build`     | Build with tsup (CJS + ESM, dts)     |
| `pnpm test`      | Run tests with vitest                 |
| `pnpm lint`      | Lint with eslint                      |
| `pnpm typecheck` | Type-check with tsc                   |
| `pnpm verify`    | Lint, test, and type-check in one run |

## License

[MIT](./LICENSE)
