import { afterEach, describe, expect, it, vi } from 'vitest';
import { Portabyte, VERSION } from './index';
import { makeFetch } from './test/helpers/fetch';

// for tests that must never reach the network
const neverFetch: typeof fetch = () =>
  Promise.reject(new Error('fetch must not be called'));

function client(fetchImpl: typeof fetch, overrides = {}) {
  return new Portabyte({
    apiKey: 'pbt_sk_live_test',
    baseUrl: 'https://api.test',
    fetch: fetchImpl,
    ...overrides,
  });
}

describe('Portabyte', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('when the api key lacks the pbt_sk_live_ prefix, then construction throws', () => {
    expect(
      () =>
        new Portabyte({
          apiKey: 'sk_wrong',
          fetch: neverFetch,
        }),
    ).toThrow(/pbt_sk_live_/);
  });

  it('when no fetch is injected, then the global fetch is used', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ records: [] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const portabyte = new Portabyte({
      apiKey: 'pbt_sk_live_test',
      baseUrl: 'https://api.test',
    });
    await portabyte.files.list();

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('when a request is made, then the SDK version header is sent', async () => {
    const { fetchImpl, requests } = makeFetch([
      {
        match: (r) => r.method === 'GET' && r.url.endsWith('/assets'),
        status: 200,
        body: { records: [] },
      },
    ]);
    await client(fetchImpl).files.list();
    expect(requests[0]?.headers['X-Portabyte-SDK']).toBe(
      `typescript/${VERSION}`,
    );
  });

  it('when the base url has a trailing slash, then it is trimmed', async () => {
    const { fetchImpl, requests } = makeFetch([
      {
        match: (r) => r.url === 'https://api.test/v1/assets',
        status: 200,
        body: { records: [] },
      },
    ]);
    await new Portabyte({
      apiKey: 'pbt_sk_live_test',
      baseUrl: 'https://api.test/',
      fetch: fetchImpl,
    }).files.list();
    expect(requests[0]?.url).toBe('https://api.test/v1/assets');
  });

  it('when maxRetries is zero, then idempotent failures surface immediately', async () => {
    const { fetchImpl, requests } = makeFetch([
      {
        match: (r) => r.method === 'GET',
        status: 429,
        body: { code: 'rate_limited', message: 'slow' },
      },
    ]);
    const error = await client(fetchImpl, { maxRetries: 0 })
      .files.list()
      .catch((e) => e);
    expect(error.status).toBe(429);
    expect(requests.length).toBe(1);
  });
});
