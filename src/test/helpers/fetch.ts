export interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
}

export interface QueuedResponse {
  match: (request: RecordedRequest) => boolean;
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

/** Scripted fetch: matches requests in order and returns queued responses. */
export function makeFetch(responses: QueuedResponse[]) {
  const requests: RecordedRequest[] = [];
  const fetchImpl = (async (
    url: string | URL | Request,
    init?: RequestInit,
  ) => {
    const request: RecordedRequest = {
      url: String(url),
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body,
    };
    requests.push(request);
    const queued = responses.shift();
    if (!queued || !queued.match(request)) {
      throw new Error(`unexpected request: ${request.method} ${request.url}`);
    }
    return new Response(
      queued.body === undefined ? null : JSON.stringify(queued.body),
      {
        status: queued.status,
        headers: queued.headers,
      },
    );
  }) as typeof fetch;
  return { fetchImpl, requests };
}
