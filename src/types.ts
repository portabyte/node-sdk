export type AssetVisibility = 'private' | 'public';

export interface Asset {
  id: string;
  projectId: string;
  name: string;
  contentType: string;
  sizeBytes: number;
  path?: string;
  etag?: string;
  visibility: AssetVisibility;
  publicUrl?: string;
  createdAt: string;
}

export interface CreateSessionOptions {
  /**
   * Customer-owned address, e.g. `reports/2026/may/x.pdf` (1–32 segments of
   * letters, digits, `.`, `_`, `~`, `-`). Uploading to a path that already
   * has a live file replaces it.
   */
  path?: string;
  visibility?: AssetVisibility;
  // browser origin allowed to perform the upload ('https://…' or '*')
  corsOrigin?: string;
}

export type CreateSession = Asset & {
  uploadUrl: string;
  uploadExpiresAt: string;
  uploadMode: 'single' | 'multipart';
  /** Present only when uploadMode is multipart. */
  partSize?: number;
  /** Recommended maximum simultaneous part uploads. */
  maxConcurrency?: number;
};

export interface MultipartPart {
  partNumber: number;
  etag: string;
}

/** Persist this alongside the create session to resume a multipart upload. */
export interface MultipartUploadState {
  uploadId?: string;
  parts: MultipartPart[];
}

export interface MultipartUploadOptions {
  /** State from an earlier interrupted multipart upload. */
  state?: MultipartUploadState;
  /** Called after a part completes; persist the state here to enable resume. */
  onStateChange?: (state: MultipartUploadState) => void | Promise<void>;
  /** Defaults to Portabyte's recommendation, capped at 3. */
  concurrency?: number;
}

/**
 * The preferred input for an end-to-end upload.
 *
 * Pass a browser `File` directly. For a `Blob` without a filename or raw
 * bytes, provide `name` and `contentType`.
 */
export interface UploadRequest extends CreateSessionOptions {
  file: Blob | Uint8Array;
  name?: string;
  contentType?: string;
  multipart?: MultipartUploadOptions;
}

/** Input for resuming a previously-created multipart upload. */
export interface ResumeUploadRequest extends MultipartUploadOptions {
  file: Blob | Uint8Array;
  contentType?: string;
}

export interface ListAssetsResult {
  records: Asset[];
  // absent on the last page
  cursor?: string;
}

export interface AssetDeliveryURL {
  url: string;
  // absent for stable public URLs
  expiresAt?: string;
  public: boolean;
}
