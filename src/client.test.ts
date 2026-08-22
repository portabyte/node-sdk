import { describe, expect, it } from 'vitest';
import { backoffMs, HttpClient } from './client';
import type { HttpClientOptions } from './client';
import { PortabyteError } from './errors';
import { makeFetch } from './test/helpers/fetch';

const MAX_RETRIES = 2;

function http(
  fetchImpl: typeof fetch,
  overrides: Partial<Omit<HttpClientOptions, 'fetchImpl'>> = {},
) {
  return new HttpClient({
    baseUrl: 'https://api.test',
    apiKey: 'pbt_live_test',
    maxRetries: MAX_RETRIES,
    timeoutMs: 30_000,
    sdkHeaderValue: 'typescript/0.1.0',
    fetchImpl,
    ...overrides,
  });
}

describe('HttpClient retries', () => {
  it('when a GET gets a 429 with Retry-After, then it retries and succeeds', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return calls === 1
        ? new Response(
            JSON.stringify({ code: 'rate_limited', message: 'slow' }),
            {
              status: 429,
              headers: { 'retry-after': '0' },
            },
          )
        : new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    const result = await http(fetchImpl).request<{ ok: boolean }>({
      method: 'GET',
      path: '/x',
    });
    expect(result.ok).toBe(true);
    expect(calls).toBe(2);
  });

  it('when retries are exhausted, then the last API error surfaces', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response(
        JSON.stringify({ code: 'rate_limited', message: 'still slow' }),
        {
          status: 429,
          headers: { 'retry-after': '0' },
        },
      );
    }) as typeof fetch;

    const error = await http(fetchImpl)
      .request<PortabyteError>({ method: 'GET', path: '/x' })
      .catch((e): PortabyteError => e);
    expect(error).toBeInstanceOf(PortabyteError);
    expect(error.status).toBe(429);
    expect(error.code).toBe('rate_limited');
    expect(calls).toBe(MAX_RETRIES + 1);
  });

  it('when a POST fails with 5xx, then it never retries', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response(
        JSON.stringify({ code: 'internal_error', message: 'boom' }),
        { status: 500 },
      );
    }) as typeof fetch;

    const error = await http(fetchImpl)
      .request<PortabyteError>({ method: 'POST', path: '/x', body: {} })
      .catch((e): PortabyteError => e);
    expect(error.status).toBe(500);
    expect(calls).toBe(1);
  });

  it('when the network fails on a GET, then it retries with backoff', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      if (calls === 1) throw new TypeError('fetch failed');
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    const result = await http(fetchImpl).request<{ ok: boolean }>({
      method: 'GET',
      path: '/x',
    });
    expect(result.ok).toBe(true);
    expect(calls).toBe(2);
  });

  it('when the network fails on a POST, then a network_error surfaces without retry', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      throw new TypeError('fetch failed');
    }) as typeof fetch;

    const error = await http(fetchImpl)
      .request<PortabyteError>({ method: 'POST', path: '/x', body: {} })
      .catch((e): PortabyteError => e);
    expect(error.status).toBe(0);
    expect(error.code).toBe('network_error');
    expect(calls).toBe(1);
  });
});

describe('HttpClient responses', () => {
  it('when a request maps an error body, then code and requestId carry over', async () => {
    const { fetchImpl } = makeFetch([
      {
        match: (r) => r.method === 'GET',
        status: 403,
        body: {
          code: 'api_key_forbidden',
          message: 'no scope',
          requestId: 'req-9',
        },
      },
    ]);
    const error = await http(fetchImpl)
      .request<PortabyteError>({ method: 'GET', path: '/x' })
      .catch((e): PortabyteError => e);
    expect(error).toBeInstanceOf(PortabyteError);
    expect(error.code).toBe('api_key_forbidden');
    expect(error.requestId).toBe('req-9');
  });

  it('when a 204 is returned, then the result is undefined', async () => {
    const { fetchImpl } = makeFetch([
      { match: (r) => r.method === 'DELETE', status: 204 },
    ]);
    await expect(
      http(fetchImpl).request({ method: 'DELETE', path: '/x' }),
    ).resolves.toBeUndefined();
  });

  it('when a timeout is configured, then the request carries an abort signal', async () => {
    let seenSignal: AbortSignal | undefined;
    const fetchImpl: typeof fetch = async (_url, init) => {
      seenSignal = init?.signal ?? undefined;
      return new Response(null, { status: 204 });
    };

    await http(fetchImpl).request({ method: 'GET', path: '/x' });
    expect(seenSignal).toBeInstanceOf(AbortSignal);
  });
});

describe('backoffMs', () => {
  it('stays within the capped exponential bound', () => {
    for (let attempt = 0; attempt < 6; attempt++) {
      const bound = Math.min(8_000, 500 * 2 ** attempt);
      for (let sample = 0; sample < 50; sample++) {
        const delay = backoffMs(attempt);
        expect(delay).toBeGreaterThanOrEqual(0);
        expect(delay).toBeLessThan(bound + 1);
      }
    }
  });
});
