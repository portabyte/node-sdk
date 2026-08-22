import { HttpClient } from './client';
import { PortabyteError } from './errors';
import type {
  Asset,
  AssetDeliveryURL,
  CreateSession,
  CreateSessionOptions,
  ListAssetsResult,
  UploadInput,
} from './types';

export interface ListOptions {
  cursor?: string;
  limit?: number;
}

export class AssetsAPI {
  constructor(
    private readonly http: HttpClient,
    private readonly projectId: string,
  ) {}

  /** Creates a signed upload session. Prefer {@link upload}, which runs every step. */
  async create(
    input: {
      name: string;
      contentType: string;
      sizeBytes: number;
    } & CreateSessionOptions,
  ): Promise<CreateSession> {
    const body = {
      name: input.name,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      ...(input.path !== undefined && { path: input.path }),
      ...(input.visibility !== undefined && { visibility: input.visibility }),
      ...(input.corsOrigin !== undefined && { corsOrigin: input.corsOrigin }),
    };
    return this.http.request<CreateSession>({
      method: 'POST',
      path: this.path('assets'),
      body,
    });
  }

  /**
   * Uploads end to end: creates a session, PUTs the bytes to the edge
   * gateway, and verifies server-side. A failed verification removes the
   * pending session so nothing is orphaned.
   */
  async upload(
    input: UploadInput,
    options: CreateSessionOptions = {},
  ): Promise<Asset> {
    const described = describeInput(input);
    const session = await this.create({ ...described, ...options });
    await this.http.putBytes(
      session.uploadUrl,
      described.contentType,
      toBody(input),
    );
    try {
      return await this.http.request<Asset>({
        method: 'POST',
        path: this.path(`assets/${session.id}/uploaded`),
      });
    } catch (error) {
      if (error instanceof PortabyteError && error.status !== 0) {
        await this.remove(session.id).catch(() => undefined);
      }
      throw error;
    }
  }

  async list(options: ListOptions = {}): Promise<ListAssetsResult> {
    const params = new URLSearchParams();
    if (options.cursor) params.set('cursor', options.cursor);
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    const query = params.size > 0 ? `?${params}` : '';
    return this.http.request<ListAssetsResult>({
      method: 'GET',
      path: this.path(`assets${query}`),
    });
  }

  /** Yields every asset in the project, fetching pages transparently. */
  async *iterate(
    options: Omit<ListOptions, 'cursor'> = {},
  ): AsyncGenerator<Asset> {
    let cursor: string | undefined;
    do {
      const page: ListAssetsResult = await this.list({ ...options, cursor });
      for (const asset of page.records) {
        yield asset;
      }
      cursor = page.cursor;
    } while (cursor);
  }

  async get(assetID: string): Promise<Asset> {
    return this.http.request<Asset>({
      method: 'GET',
      path: this.path(`assets/${assetID}`),
    });
  }

  async remove(assetID: string): Promise<void> {
    await this.http.request<void>({
      method: 'DELETE',
      path: this.path(`assets/${assetID}`),
    });
  }

  /**
   * Returns the URL the asset is served from: stable and cacheable for
   * public assets, short-lived signed otherwise.
   */
  async url(assetID: string): Promise<AssetDeliveryURL> {
    return this.http.request<AssetDeliveryURL>({
      method: 'GET',
      path: this.path(`assets/${assetID}/url`),
    });
  }

  private path(suffix: string): string {
    return `/v1/projects/${this.projectId}/${suffix}`;
  }
}

function describeInput(input: UploadInput): {
  name: string;
  contentType: string;
  sizeBytes: number;
} {
  if (input instanceof Blob) {
    const file = input as File;
    if (!input.type) {
      throw new PortabyteError(
        'The file has no content type; pass bytes with an explicit contentType instead.',
        0,
        'invalid_argument',
      );
    }
    return {
      name: file.name || 'upload',
      contentType: input.type,
      sizeBytes: input.size,
    };
  }
  return {
    name: input.name,
    contentType: input.contentType,
    sizeBytes: input.data.byteLength,
  };
}

function toBody(input: UploadInput): Blob | Uint8Array {
  return input instanceof Blob ? input : input.data;
}
