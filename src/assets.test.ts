import { describe, expect, it } from 'vitest';
import { Portabyte } from './index';
import { makeFetch } from './test/helpers/fetch';

const PROJECT = '01KZYQV7S4PNY0JV6FHZ6M2GPX';

function client(fetchImpl: typeof fetch) {
  return new Portabyte({
    apiKey: 'pbt_sk_live_test',
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
  visibility: 'private' as const,
  createdAt: '2026-08-22T00:00:00Z',
};

const session = {
  ...asset,
  uploadUrl: 'https://gateway.test/v1/uploads/tok',
  uploadExpiresAt: '2026-08-22T00:15:00Z',
  uploadMode: 'single' as const,
};

describe('upload', () => {
  it('when a session is multipart, then parts upload before completion and verification', async () => {
    const partSize = 5 * 1024 * 1024;
    const multipartSession = {
      ...session,
      sizeBytes: partSize + 1,
      uploadMode: 'multipart' as const,
      partSize,
      maxConcurrency: 1,
    };
    const { fetchImpl, requests } = makeFetch([
      {
        match: (r) => r.method === 'POST' && r.url.endsWith('/assets'),
        status: 201,
        body: multipartSession,
      },
      {
        match: (r) => r.method === 'POST' && r.url.endsWith('/multipart'),
        status: 201,
        body: { uploadId: 'upload-1' },
      },
      {
        match: (r) => r.method === 'PUT' && r.url.endsWith('/parts/1'),
        status: 200,
        body: { partNumber: 1, etag: 'part-1' },
      },
      {
        match: (r) => r.method === 'PUT' && r.url.endsWith('/parts/2'),
        status: 200,
        body: { partNumber: 2, etag: 'part-2' },
      },
      {
        match: (r) => r.method === 'POST' && r.url.endsWith('/complete'),
        status: 201,
        body: { etag: 'complete' },
      },
      {
        match: (r) => r.method === 'POST' && r.url.endsWith('/uploaded'),
        status: 200,
        body: asset,
      },
    ]);

    await client(fetchImpl).assets.upload({
      name: 'video.mp4',
      contentType: 'video/mp4',
      data: new Uint8Array(partSize + 1),
    });

    expect(requests).toHaveLength(6);
    expect(requests[2]?.headers['Content-Type']).toBe('video/mp4');
    expect(JSON.parse(String(requests[4]?.body))).toEqual({
      parts: [
        { partNumber: 1, etag: 'part-1' },
        { partNumber: 2, etag: 'part-2' },
      ],
    });
  });

  it('when visibility is omitted, then the server applies its default', async () => {
    const publicSession = { ...session, visibility: 'public' as const };
    const { fetchImpl, requests } = makeFetch([
      {
        match: (r) => r.method === 'POST' && r.url.endsWith('/assets'),
        status: 201,
        body: publicSession,
      },
    ]);

    await client(fetchImpl).assets.create({
      name: 'logo.png',
      contentType: 'image/png',
      sizeBytes: 3,
    });

    expect(JSON.parse(String(requests[0]?.body))).toEqual({
      name: 'logo.png',
      contentType: 'image/png',
      sizeBytes: 3,
    });
  });

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
    expect(requests[0]?.headers.Authorization).toBe('Bearer pbt_sk_live_test');
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
          url: 'https://gateway.test/s/tok',
          expiresAt: '2026-08-22T00:05:00Z',
          public: false,
        },
      },
    ]);
    const url = await client(fetchImpl).assets.url(asset.id);
    expect(url.public).toBe(false);
    expect(url.url).toContain('/s/');
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

describe('cancel', () => {
  it('when a multipart session is cancelled, then its transfer is aborted and the pending asset is removed', async () => {
    const multipartSession = {
      ...session,
      uploadMode: 'multipart' as const,
      partSize: 5 * 1024 * 1024,
    };
    const { fetchImpl, requests } = makeFetch([
      {
        match: (r) =>
          r.method === 'DELETE' && r.url.endsWith('/multipart/upload-1'),
        status: 204,
      },
      {
        match: (r) => r.method === 'DELETE' && r.url.endsWith(`/${asset.id}`),
        status: 204,
      },
    ]);

    await client(fetchImpl).assets.cancel(multipartSession, {
      uploadId: 'upload-1',
      parts: [],
    });

    expect(requests).toHaveLength(2);
  });
});
