import { HttpClient } from './client';
import { PortabyteError } from './errors';
import type {
  Asset,
  AssetDeliveryURL,
  BrowserUploadSession,
  CreateSession,
  CreateSessionRequest,
  ListAssetsResult,
  MultipartPart,
  MultipartUploadOptions,
  MultipartUploadState,
  ResumeUploadRequest,
  UploadRequest,
} from './types';

export interface ListOptions {
  cursor?: string;
  limit?: number;
}

export class FilesAPI {
  constructor(private readonly http: HttpClient) {}

  /** Creates a signed upload session. Prefer {@link upload}, which runs every step. */
  async create(input: CreateSessionRequest): Promise<CreateSession> {
    const body = {
      name: input.name,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      ...(input.path !== undefined && { path: input.path }),
      ...(input.visibility !== undefined && { visibility: input.visibility }),
      ...(input.corsOrigin !== undefined && { corsOrigin: input.corsOrigin }),
    };
    const session = await this.http.request<CreateSession>({
      method: 'POST',
      path: this.path('assets'),
      body,
    });
    if (
      !session || !session.id || !session.uploadUrl || !session.uploadExpiresAt ||
      (session.uploadMode !== 'single' && session.uploadMode !== 'multipart')
    ) {
      throw new PortabyteError('Portabyte returned an invalid upload session.', 0, 'invalid_response');
    }
    return session;
  }

  /**
   * Prepares a direct browser upload. Call this only from your trusted server,
   * then return the result to the browser. The browser uploads bytes directly
   * to uploadUrl; call {@link confirm} from your server once it reports success.
   */
  async prepareBrowserUpload(
    input: CreateSessionRequest,
  ): Promise<BrowserUploadSession> {
    const session = await this.create(input);
    return {
      assetId: session.id,
      uploadUrl: session.uploadUrl,
      uploadExpiresAt: session.uploadExpiresAt,
      uploadMode: session.uploadMode,
      ...(session.partSize !== undefined && { partSize: session.partSize }),
      ...(session.maxConcurrency !== undefined && {
        maxConcurrency: session.maxConcurrency,
      }),
    };
  }

  /**
   * Confirms a completed direct upload and returns its live asset record.
   * Call this from your trusted server, never from a browser.
   */
  async confirm(assetID: string): Promise<Asset> {
    return this.http.request<Asset>({
      method: 'POST',
      path: this.path(`assets/${encodeURIComponent(assetID)}/uploaded`),
    });
  }

  /** Uploads a File, Blob, or bytes end to end. */
  async upload(request: UploadRequest): Promise<Asset> {
    const described = describeUpload(request);
    const { file, multipart } = request;
    const createOptions = {
      ...(request.path !== undefined && { path: request.path }),
      ...(request.visibility !== undefined && { visibility: request.visibility }),
      ...(request.corsOrigin !== undefined && { corsOrigin: request.corsOrigin }),
    };
    const session = await this.create({ ...described, ...createOptions });
    await this.transfer(
      session,
      file,
      described.contentType,
      multipart,
    );
    try {
      return await this.confirm(session.id);
    } catch (error) {
      if (error instanceof PortabyteError && error.status !== 0) {
        await this.remove(session.id).catch(() => undefined);
      }
      throw error;
    }
  }

  /**
   * Continues a previously-created session. Persist the create session and
   * MultipartUploadState after each part to resume after an interruption.
   */
  async resume(
    session: CreateSession,
    request: ResumeUploadRequest,
  ): Promise<Asset> {
    const contentType =
      request.contentType ??
      (request.file instanceof Blob ? request.file.type : '');
    if (
      fileSize(request.file) !== session.sizeBytes ||
      contentType !== session.contentType
    ) {
      throw new PortabyteError(
        'The selected file does not match this upload session.',
        0,
        'invalid_argument',
      );
    }
    await this.transfer(session, request.file, contentType, request);
    return this.confirm(session.id);
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

  async get(assetID: string): Promise<Asset> {
    return this.http.request<Asset>({
      method: 'GET',
      path: this.path(`assets/${encodeURIComponent(assetID)}`),
    });
  }

  async remove(assetID: string): Promise<void> {
    await this.http.request<void>({
      method: 'DELETE',
      path: this.path(`assets/${encodeURIComponent(assetID)}`),
    });
  }

  /**
   * Cancels a multipart transfer and removes its pending asset. The gateway
   * abort is best-effort: removing the pending asset guarantees the object
   * can never be confirmed or delivered, even if its signed URL has expired.
   */
  async cancel(
    session: CreateSession,
    state?: MultipartUploadState,
  ): Promise<void> {
    if (session.uploadMode === 'multipart' && state?.uploadId) {
      await this.http
        .uploadJSON(
          `${session.uploadUrl}/multipart/${encodeURIComponent(state.uploadId)}`,
          'DELETE',
          undefined,
          false,
        )
        .catch(() => undefined);
    }
    await this.remove(session.id);
  }

  /**
   * Returns the URL the asset is served from: stable and cacheable for
   * public assets, short-lived signed otherwise.
   */
  async url(assetID: string): Promise<AssetDeliveryURL> {
    return this.http.request<AssetDeliveryURL>({
      method: 'GET',
      path: this.path(`assets/${encodeURIComponent(assetID)}/url`),
    });
  }

  private path(suffix: string): string {
    return `/v1/${suffix}`;
  }

  private async transfer(
    session: CreateSession,
    body: Blob | Uint8Array,
    contentType: string,
    options?: MultipartUploadOptions,
  ): Promise<void> {
    if (session.uploadMode === 'single') {
      await this.http.putBytes(session.uploadUrl, contentType, body);
      return;
    }
    await this.uploadMultipart(session, body, contentType, options);
  }

  private async uploadMultipart(
    session: CreateSession,
    body: Blob | Uint8Array,
    contentType: string,
    options: MultipartUploadOptions = {},
  ): Promise<void> {
    if (!session.partSize || session.partSize < 5 * 1024 * 1024) {
      throw new PortabyteError(
        'Multipart upload session is missing a valid part size.',
        0,
        'invalid_upload',
      );
    }
    const state: MultipartUploadState = {
      uploadId: options.state?.uploadId,
      parts: [...(options.state?.parts ?? [])],
    };
    if (!state.uploadId) {
      const started = await this.http.uploadJSON<{ uploadId: string }>(
        `${session.uploadUrl}/multipart`,
        'POST',
        {},
        false,
      );
      state.uploadId = started.uploadId;
      await options.onStateChange?.({ ...state, parts: [...state.parts] });
    }
    const uploadId = state.uploadId;
    if (!uploadId) {
      throw new PortabyteError('Upload gateway returned an invalid upload ID.', 0, 'invalid_response');
    }
    const partCount = Math.ceil(session.sizeBytes / session.partSize);
    if (state.parts.some((part) =>
      !Number.isSafeInteger(part.partNumber) || part.partNumber < 1 ||
      part.partNumber > partCount || typeof part.etag !== 'string' || !part.etag
    )) {
      throw new PortabyteError('Multipart state contains an invalid part.', 0, 'invalid_argument');
    }
    const completed = new Map(
      state.parts.map((part) => [part.partNumber, part]),
    );
    const concurrency = Math.max(
      1,
      Math.min(options.concurrency ?? session.maxConcurrency ?? 3, 3),
    );
    let nextPart = 1;
    const uploadNext = async () => {
      for (;;) {
        const partNumber = nextPart;
        nextPart += 1;
        if (partNumber > partCount) return;
        if (completed.has(partNumber)) continue;
        const start = (partNumber - 1) * session.partSize!;
        const end = Math.min(start + session.partSize!, session.sizeBytes);
        const part = await this.http.putBytesJSON<MultipartPart>(
          `${session.uploadUrl}/multipart/${encodeURIComponent(uploadId)}/parts/${partNumber}`,
          contentType,
          sliceBody(body, start, end),
        );
        if (part.partNumber !== partNumber || typeof part.etag !== 'string' || !part.etag) {
          throw new PortabyteError(
            'Upload gateway returned an invalid part.',
            0,
            'invalid_response',
          );
        }
        completed.set(part.partNumber, part);
        state.parts = [...completed.values()].sort(
          (left, right) => left.partNumber - right.partNumber,
        );
        await options.onStateChange?.({ ...state, parts: [...state.parts] });
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(concurrency, partCount) }, uploadNext),
    );
    state.parts = [...completed.values()].sort(
      (left, right) => left.partNumber - right.partNumber,
    );
    await this.http.uploadJSON(
      `${session.uploadUrl}/multipart/${encodeURIComponent(uploadId)}/complete`,
      'POST',
      { parts: state.parts },
      true,
    );
  }
}

function describeUpload(request: UploadRequest): {
  name: string;
  contentType: string;
  sizeBytes: number;
} {
  const filename = request.name ?? fileName(request.file);
  const mimeType =
    request.contentType ?? (request.file instanceof Blob ? request.file.type : '');
  if (!filename) {
    throw new PortabyteError(
      'A file name is required when uploading a Blob or bytes.',
      0,
      'invalid_argument',
    );
  }
  if (!mimeType) {
    throw new PortabyteError(
      'A content type is required when uploading bytes or a Blob without a type.',
      0,
      'invalid_argument',
    );
  }
  return {
    name: filename,
    contentType: mimeType,
    sizeBytes:
      request.file instanceof Blob ? request.file.size : request.file.byteLength,
  };
}

function fileName(file: Blob | Uint8Array): string | undefined {
  if (!(file instanceof Blob)) return undefined;
  const name = (file as Blob & { name?: unknown }).name;
  return typeof name === 'string' && name.length > 0 ? name : undefined;
}

function fileSize(file: Blob | Uint8Array): number {
  return file instanceof Blob ? file.size : file.byteLength;
}

function sliceBody(
  body: Blob | Uint8Array,
  start: number,
  end: number,
): Blob | Uint8Array {
  return body instanceof Blob ? body.slice(start, end) : body.slice(start, end);
}
