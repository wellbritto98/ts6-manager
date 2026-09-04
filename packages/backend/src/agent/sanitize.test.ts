import { describe, expect, it } from 'vitest';
import { sanitizeForLog } from './sanitize.js';

describe('sanitizeForLog', () => {
  it('redacts every case-insensitive secret key', () => {
    const value = sanitizeForLog({
      apiKey: 'key',
      PASSWORD: 'password',
      Token: 'token',
      cookie: 'cookie',
      secret: 'secret',
      authorization: 'authorization',
      certificate: 'certificate',
    });

    expect(value).toEqual({
      apiKey: '[REDACTED]',
      PASSWORD: '[REDACTED]',
      Token: '[REDACTED]',
      cookie: '[REDACTED]',
      secret: '[REDACTED]',
      authorization: '[REDACTED]',
      certificate: '[REDACTED]',
    });
  });

  it('redacts secret keys in nested objects', () => {
    expect(sanitizeForLog({ connection: { apiKey: 'private-key' } })).toEqual({
      connection: { apiKey: '[REDACTED]' },
    });
  });

  it('walks array values', () => {
    expect(sanitizeForLog([{ token: 'private-token' }, 'safe-value'])).toEqual([
      { token: '[REDACTED]' },
      'safe-value',
    ]);
  });

  it('truncates strings longer than 8000 characters', () => {
    expect(sanitizeForLog('x'.repeat(8001))).toHaveLength(8000);
  });

  it('replaces cyclic references without throwing', () => {
    const value: { self?: unknown } = {};
    value.self = value;

    expect(sanitizeForLog(value)).toEqual({ self: '[Cycle]' });
  });
});
