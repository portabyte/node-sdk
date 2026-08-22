/**
 * Thrown for any failed Portabyte API request. `status` is `0` when the
 * request never reached the API.
 */
export class PortabyteError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;

  constructor(
    message: string,
    status: number,
    code: string,
    requestId?: string,
  ) {
    super(message);
    this.name = 'PortabyteError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}
