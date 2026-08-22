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
   * Customer-owned address, e.g. `invoices/2026/may/x.pdf` (1–32 segments of
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
};

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

// browser File/Blob, or raw bytes with metadata
export type UploadInput =
  Blob | { name: string; contentType: string; data: Uint8Array };
