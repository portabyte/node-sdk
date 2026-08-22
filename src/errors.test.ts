import { describe, expect, it } from 'vitest';
import { PortabyteError } from './errors';

describe('PortabyteError', () => {
  it('when constructed with all fields, then carries them', () => {
    const error = new PortabyteError('slow down', 429, 'rate_limited', 'req-1');
    expect(error.name).toBe('PortabyteError');
    expect(error.message).toBe('slow down');
    expect(error.status).toBe(429);
    expect(error.code).toBe('rate_limited');
    expect(error.requestId).toBe('req-1');
  });

  it('when constructed without a request id, then requestId is undefined', () => {
    const error = new PortabyteError('boom', 500, 'internal_error');
    expect(error.requestId).toBeUndefined();
  });
});
