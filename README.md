# Portabyte TypeScript SDK

The Portabyte TypeScript SDK provides convenient access to the Portabyte API from applications written in server or browser JavaScript. It covers the full file lifecycle: signed upload sessions that stream straight to the edge, delivery URLs for public and private files, and asset management.

It is written in TypeScript, ships with zero dependencies on the native `fetch` API, and runs in browsers, Node 18+, Bun, Deno, and edge runtimes.

## Requirements

Node.js >= 18 or a browser with `fetch` support.

## Installation

```
npm install @portabyte/sdk
```

## Usage

```ts
import { Portabyte } from '@portabyte/sdk';

const portabyte = new Portabyte({
  apiKey: process.env.PORTABYTE_API_KEY, // pbt_live_...
  projectId: process.env.PORTABYTE_PROJECT_ID,
});
```

### Uploading a file

`upload` runs the complete flow — it creates a signed upload session, PUTs the bytes to the Portabyte edge gateway, and verifies the upload server-side — then returns the live asset. If verification fails, the pending session is removed so nothing is orphaned.

```ts
// From bytes (server-side)
const asset = await portabyte.assets.upload(
  { name: 'invoice.pdf', contentType: 'application/pdf', data: bytes },
  { path: 'invoices/2026/may/invoice.pdf', visibility: 'public' },
);

// From a browser File
const asset = await portabyte.assets.upload(file, { visibility: 'public' });
```

Upload options:

| Option        | Description                                                                     | Default     |
| ------------- | ------------------------------------------------------------------------------- | ----------- |
| `path`        | Customer-owned address; uploading to an existing live path replaces that file   | —           |
| `visibility`  | `'private'` or `'public'`                                                        | `'private'` |
| `corsOrigin`  | Browser origin allowed to perform the upload, or `'*'`                          | —           |

> **Note:** a `Blob` without a content type is rejected — pass bytes with an explicit `contentType` instead.

### Delivering files

```ts
const { url, expiresAt, public } = await portabyte.assets.url(asset.id);
```

Public assets return a stable, cacheable URL (`expiresAt` is absent). Private assets return a signed URL that works for 5 minutes; mint a fresh one whenever needed.

### Managing assets

```ts
const page = await portabyte.assets.list({ limit: 20 });
const next = await portabyte.assets.list({ limit: 20, cursor: page.cursor });
const one = await portabyte.assets.get(asset.id);
await portabyte.assets.remove(asset.id);
```

### Auto-pagination

`iterate` yields every asset in the project, fetching pages transparently:

```ts
for await (const asset of portabyte.assets.iterate()) {
  // ...
}
```

## Configuration

| Option       | Description                                                    | Default                 |
| ------------ | -------------------------------------------------------------- | ----------------------- |
| `apiKey`     | Project-scoped API key (`pbt_live_...`)                        | required                |
| `projectId`  | The project every call is scoped to                           | required                |
| `baseUrl`    | Control-plane base URL                                         | `http://localhost:8080` |
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
  projectId,
  fetch: (url, init) => proxyFetch(url as string, { ...init, dispatcher: agent }),
});
```

```ts
// Trace every SDK call
const portabyte = new Portabyte({
  apiKey,
  projectId,
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
  await portabyte.assets.upload(input);
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

describe('invoices', () => {
  it('lists assets', async () => {
    const portabyte = new Portabyte({
      apiKey: 'pbt_live_test',
      projectId: '01KZYQV7S4PNY0JV6FHZ6M2GPX',
      fetch: vi.fn(async () =>
        new Response(JSON.stringify({ records: [], cursor: undefined }), {
          status: 200,
        }),
      ),
    });

    const page = await portabyte.assets.list();
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
