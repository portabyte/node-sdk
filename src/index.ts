import { FilesAPI } from './assets';
import { HttpClient } from './client';
import { PortabyteError } from './errors';
import type {
  Asset,
  AssetDeliveryURL,
  BrowserUploadSession,
  CreateSession,
  CreateSessionOptions,
  CreateSessionRequest,
  ListAssetsResult,
  MultipartPart,
  MultipartUploadOptions,
  MultipartUploadState,
  ResumeUploadRequest,
  UploadRequest,
} from './types';

export const VERSION = '0.0.1';

export interface PortabyteOptions {
  apiKey: string;
  baseUrl?: string;
  // idempotent requests only; mutating requests never retry
  maxRetries?: number;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

const DEFAULT_BASE_URL = 'https://api.portabyte.dev';

/**
 * Server-side Portabyte client. Its API key is scoped to one project, so a
 * project ID is never required in application configuration.
 */
export class Portabyte {
  /** Preferred API for application file uploads. */
  readonly files: FilesAPI;

  constructor(options: PortabyteOptions) {
    if (!options.apiKey.startsWith('pbt_sk_live_')) {
      throw new PortabyteError(
        'apiKey must be a server API key starting with "pbt_sk_live_".',
        0,
        'invalid_argument',
      );
    }
    const http = new HttpClient({
      baseUrl: (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, ''),
      apiKey: options.apiKey,
      fetchImpl: options.fetch ?? fetch,
      maxRetries: options.maxRetries ?? 2,
      timeoutMs: options.timeoutMs ?? 30_000,
      sdkHeaderValue: `typescript/${VERSION}`,
    });
    this.files = new FilesAPI(http);
  }
}

export { PortabyteError };
export type {
  Asset,
  AssetDeliveryURL,
  BrowserUploadSession,
  CreateSession,
  CreateSessionOptions,
  CreateSessionRequest,
  ListAssetsResult,
  MultipartPart,
  MultipartUploadOptions,
  MultipartUploadState,
  ResumeUploadRequest,
  UploadRequest,
};
