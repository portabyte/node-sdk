import { FilesAPI } from './assets';
import { HttpClient } from './client';
import { PortabyteError } from './errors';
import type {
  Asset,
  AssetDeliveryURL,
  AssetVisibility,
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
  UploadFileOptions,
} from './types';
import type { ListOptions } from './assets';

export const VERSION = '0.0.4';

export interface PortabyteOptions {
  apiKey: string;
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
    if (
      !options ||
      typeof options.apiKey !== 'string' ||
      !options.apiKey.startsWith('pbt_sk_live_')
    ) {
      throw new PortabyteError(
        'apiKey must be a server API key starting with "pbt_sk_live_".',
        0,
        'invalid_argument',
      );
    }
    if (
      options.maxRetries !== undefined &&
      (!Number.isSafeInteger(options.maxRetries) || options.maxRetries < 0)
    ) {
      throw new PortabyteError(
        'maxRetries must be a non-negative integer.',
        0,
        'invalid_argument',
      );
    }
    if (
      options.timeoutMs !== undefined &&
      (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 0)
    ) {
      throw new PortabyteError(
        'timeoutMs must be a non-negative integer.',
        0,
        'invalid_argument',
      );
    }
    const http = new HttpClient({
      baseUrl: DEFAULT_BASE_URL,
      apiKey: options.apiKey,
      fetchImpl: options.fetch ?? fetch,
      maxRetries: options.maxRetries ?? 2,
      timeoutMs: options.timeoutMs ?? 30_000,
      sdkHeaderValue: `typescript/${VERSION}`,
    });
    this.files = new FilesAPI(http);
  }
}

export { FilesAPI, PortabyteError };
export type {
  Asset,
  AssetDeliveryURL,
  AssetVisibility,
  BrowserUploadSession,
  CreateSession,
  CreateSessionOptions,
  CreateSessionRequest,
  ListAssetsResult,
  ListOptions,
  MultipartPart,
  MultipartUploadOptions,
  MultipartUploadState,
  ResumeUploadRequest,
  UploadRequest,
  UploadFileOptions,
};
