import { describe, expect, it } from 'vitest';
import { Portabyte } from './index';
import { makeFetch } from './test/helpers/fetch';

const PROJECT = '01KZYQV7S4PNY0JV6FHZ6M2GPX';

function client(fetchImpl: typeof fetch) {
  return new Portabyte({
    apiKey: 'pbt_live_test',
    projectId: PROJECT,
    baseUrl: 'https://api.test',
    fetch: fetchImpl,
  });
}

const asset = {
  id: '01KZYT82F710WSC95QQ2A365DD',
  projectId: PROJECT,
  name: 'logo.png',
  contentType: 'image/png',
  sizeBytes: 3,
  visibility: 'private',
  createdAt: '2026-08-22T00:00:00Z',
};

const session = {
  ...asset,
  uploadUrl: 'https://gateway.test/v1/uploads/tok',
  uploadExpiresAt: '2026-08-22T00:15:00Z',
};

describe('upload', () => {
  it('when uploading bytes, then create, PUT, and confirm run in order', async () => {
    const { fetchImpl, requests } = makeFetch([
      {
        match: (r) => r.method === 'POST' && r.url.endsWith('/assets'),
        status: 201,
        body: session,
      },
      {
        match: (r) => r.method === 'PUT' && r.url === session.uploadUrl,
        status: 201,
      },
      {
        match: (r) =>
          r.method === 'POST' && r.url.endsWith(`/${asset.id}/uploaded`),
        status: 200,
        body: asset,
      },
    ]);

    const result = await client(fetchImpl).assets.upload(
      {
        name: 'logo.png',
        contentType: 'image/png',
        data: new Uint8Array([1, 2, 3]),
      },
      { path: 'brand/logo.png', visibility: 'public' },
    );

    expect(result.id).toBe(asset.id);
    expect(requests[0]?.headers.Authorization).toBe('Bearer pbt_live_test');
    expect(JSON.parse(String(requests[0]?.body))).toEqual({
      name: 'logo.png',
      contentType: 'image/png',
      sizeBytes: 3,
      path: 'brand/logo.png',
      visibility: 'public',
    });
    expect(requests[1]?.headers['Content-Type']).toBe('image/png');
    expect(requests[1]?.headers.Authorization).toBeUndefined();
  });

  it('when verification fails, then the pending session is removed', async () => {
    const { fetchImpl, requests } = makeFetch([
      {
        match: (r) => r.method === 'POST' && r.url.endsWith('/assets'),
        status: 201,
        body: session,
      },
      { match: (r) => r.method === 'PUT', status: 201 },
      {
        match: (r) => r.method === 'POST' && r.url.endsWith('/uploaded'),
        status: 400,
        body: { code: 'invalid_upload', message: 'nope' },
      },
      {
        match: (r) => r.method === 'DELETE' && r.url.endsWith(`/${asset.id}`),
        status: 204,
      },
    ]);

    await expect(
      client(fetchImpl).assets.upload({
        name: 'logo.png',
        contentType: 'image/png',
        data: new Uint8Array([1]),
      }),
    ).rejects.toMatchObject({ code: 'invalid_upload' });
    expect(requests.at(-1)?.method).toBe('DELETE');
  });

  it('when a Blob has no content type, then upload rejects before any request', async () => {
    const { fetchImpl, requests } = makeFetch([]);
    await expect(
      client(fetchImpl).assets.upload(new Blob(['x'])),
    ).rejects.toThrow(/content type/);
    expect(requests.length).toBe(0);
  });
});

describe('url', () => {
  it('when the asset is private, then the minted url is returned', async () => {
    const { fetchImpl } = makeFetch([
      {
        match: (r) => r.method === 'GET' && r.url.endsWith(`/${asset.id}/url`),
        status: 200,
        body: {
          url: 'https://gateway.test/v1/signed/tok',
          expiresAt: '2026-08-22T00:05:00Z',
          public: false,
        },
      },
    ]);
    const url = await client(fetchImpl).assets.url(asset.id);
    expect(url.public).toBe(false);
    expect(url.url).toContain('/v1/signed/');
  });
});

describe('iterate', () => {
  it('when iterating, then every page is fetched transparently', async () => {
    const { fetchImpl, requests } = makeFetch([
      {
        match: (r) => !r.url.includes('cursor'),
        status: 200,
        body: { records: [{ ...asset, id: '01AAAA' }], cursor: 'next' },
      },
      {
        match: (r) => r.url.includes('cursor=next'),
        status: 200,
        body: { records: [{ ...asset, id: '01BBBB' }] },
      },
    ]);

    const ids: string[] = [];
    for await (const a of client(fetchImpl).assets.iterate({ limit: 1 })) {
      ids.push(a.id);
    }
    expect(ids).toEqual(['01AAAA', '01BBBB']);
    expect(requests.length).toBe(2);
  });
});

describe('list', () => {
  it('when paginating, then the cursor and limit are query parameters', async () => {
    const { fetchImpl, requests } = makeFetch([
      {
        match: (r) => r.url.includes('cursor=next&limit=5'),
        status: 200,
        body: { records: [] },
      },
    ]);
    await client(fetchImpl).assets.list({ cursor: 'next', limit: 5 });
    expect(requests[0]?.url).toContain('/assets?cursor=next&limit=5');
  });
});

describe('remove', () => {
  it('when removing, then a 204 resolves without a body', async () => {
    const { fetchImpl } = makeFetch([
      { match: (r) => r.method === 'DELETE', status: 204 },
    ]);
    await expect(
      client(fetchImpl).assets.remove(asset.id),
    ).resolves.toBeUndefined();
  });
});
