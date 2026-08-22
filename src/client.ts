import { PortabyteError } from './errors';

export interface RequestOptions {
  method: string;
  path: string;
  body?: unknown;
}

export const SDK_HEADER_NAME = 'X-Portabyte-SDK';

export interface HttpClientOptions {
  baseUrl: string;
  apiKey: string;
  fetchImpl: typeof fetch;
  maxRetries: number;
  timeoutMs: number;
  sdkHeaderValue: string;
}

class RetryableError extends Error {
  constructor(
    readonly retryAfterMs: number | null,
    readonly fallback: PortabyteError,
  ) {
    super('retryable request failure');
  }
}

export class HttpClient {
  constructor(private readonly options: HttpClientOptions) {}

  async request<T>(options: RequestOptions): Promise<T> {
    const idempotent = options.method === 'GET';
    return this.run(idempotent, async () => {
      const response = await this.send(this.options.baseUrl + options.path, {
        method: options.method,
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          [SDK_HEADER_NAME]: this.options.sdkHeaderValue,
          ...(options.body !== undefined || options.method !== 'GET'
            ? { 'Content-Type': 'application/json' }
            : {}),
        },
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
      });
      if (!response.ok) {
        throw await responseError(response, idempotent);
      }
      if (response.status === 204) {
        return undefined as T;
      }
      return (await response.json()) as T;
    });
  }

  // The gateway's CORS policy allows only Content-Type; the signed URL is
  // the authorization, and the runtime sets the exact-match Content-Length.
  async putBytes(
    uploadUrl: string,
    contentType: string,
    data: Blob | Uint8Array,
  ): Promise<void> {
    await this.run(true, async () => {
      const response = await this.send(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: data as BodyInit,
      });
      if (!response.ok) {
        throw await responseError(response, true);
      }
    });
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.options.fetchImpl(url, {
        ...init,
        signal:
          this.options.timeoutMs > 0
            ? AbortSignal.timeout(this.options.timeoutMs)
            : undefined,
      });
    } catch (cause) {
      throw new RetryableError(
        null,
        new PortabyteError(
          cause instanceof Error ? cause.message : 'Network request failed.',
          0,
          'network_error',
        ),
      );
    }
  }

  private async run<T>(
    idempotent: boolean,
    send: () => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await send();
      } catch (error) {
        const retry = error instanceof RetryableError;
        if (!retry || !idempotent || attempt >= this.options.maxRetries) {
          throw retry ? error.fallback : error;
        }
        await sleep(error.retryAfterMs ?? backoffMs(attempt));
      }
    }
  }
}

async function responseError(
  response: Response,
  idempotent: boolean,
): Promise<Error> {
  const error = await errorFromResponse(response);
  if (idempotent && (response.status === 429 || response.status >= 500)) {
    const retryAfter = Number(response.headers.get('retry-after'));
    const retryAfterMs =
      Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter * 1000 : null;
    return new RetryableError(retryAfterMs, error);
  }
  return error;
}

export function backoffMs(attempt: number): number {
  const baseMs = 500;
  const capMs = 8_000;
  return Math.floor(Math.random() * Math.min(capMs, baseMs * 2 ** attempt));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function errorFromResponse(response: Response): Promise<PortabyteError> {
  let code = 'request_failed';
  let message = `Request failed with status ${response.status}.`;
  let requestId: string | undefined;
  try {
    const body = (await response.json()) as {
      code?: string;
      message?: string;
      requestId?: string;
    };
    code = body.code ?? code;
    message = body.message ?? message;
    requestId = body.requestId;
  } catch {
    // non-JSON error body
  }
  return new PortabyteError(message, response.status, code, requestId);
}
