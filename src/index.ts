import { AssetsAPI } from './assets';
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

export const VERSION = '0.1.0';

export interface PortabyteOptions {
  apiKey: string;
  projectId: string;
  baseUrl?: string;
  // idempotent requests only; mutating requests never retry
  maxRetries?: number;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

const DEFAULT_BASE_URL = 'http://localhost:8080';

/** Portabyte client, scoped to one project via its API key. */
export class Portabyte {
  readonly assets: AssetsAPI;

  constructor(options: PortabyteOptions) {
    if (!options.apiKey.startsWith('pbt_live_')) {
      throw new PortabyteError(
        'apiKey must be a project API key starting with "pbt_live_".',
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
    this.assets = new AssetsAPI(http, options.projectId);
  }
}

export { PortabyteError };
export type {
  Asset,
  AssetDeliveryURL,
  CreateSession,
  CreateSessionOptions,
  ListAssetsResult,
  UploadInput,
};
