import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError, TSApiError } from '../middleware/error-handler.js';
import { AgentError, toToolError } from './agent-error.js';
import { mapServiceError } from './map-service-error.js';

describe('mapServiceError', () => {
  it('passes an AgentError through unchanged', () => {
    const original = new AgentError('SERVER_DISCONNECTED', 'Server config 1 is not connected');

    expect(mapServiceError(original)).toBe(original);
  });

  it('maps a 400 AppError to INVALID_INPUT', () => {
    const mapped = mapServiceError(new AppError(400, 'URL blocked: private address'));

    expect(mapped.code).toBe('INVALID_INPUT');
    expect(mapped.message).toBe('URL blocked: private address');
  });

  it('maps a 404 music bot AppError to BOT_NOT_FOUND', () => {
    expect(mapServiceError(new AppError(404, 'Music bot not found')).code).toBe('BOT_NOT_FOUND');
  });

  it('maps a 404 bot flow AppError to BOT_NOT_FOUND', () => {
    expect(mapServiceError(new AppError(404, 'Bot flow not found')).code).toBe('BOT_NOT_FOUND');
  });

  it('maps other 404 AppErrors by subject', () => {
    expect(mapServiceError(new AppError(404, 'Server not found')).code).toBe('SERVER_NOT_FOUND');
    expect(mapServiceError(new AppError(404, 'Client not found')).code).toBe('CLIENT_NOT_FOUND');
    expect(mapServiceError(new AppError(404, 'Channel not found')).code).toBe('CHANNEL_NOT_FOUND');
    expect(mapServiceError(new AppError(404, 'Not found')).code).toBe('INTERNAL_ERROR');
  });

  it('maps a TSApiError to a retryable TEAMSPEAK_ERROR', () => {
    const mapped = mapServiceError(new TSApiError(524, 'flood protection'));

    expect(mapped.code).toBe('TEAMSPEAK_ERROR');
    expect(toToolError(mapped, 'req-1').error.retryable).toBe(true);
  });

  it('maps a ZodError to INVALID_INPUT naming the offending field', () => {
    const schema = z.object({ serverConfigId: z.number().int().positive() }).strict();
    const parsed = schema.safeParse({ serverConfigId: 'one' });

    const mapped = mapServiceError(parsed.success ? undefined : parsed.error);

    expect(mapped.code).toBe('INVALID_INPUT');
    expect(mapped.message).toContain('serverConfigId');
  });

  it('hides the original message of an unknown error behind INTERNAL_ERROR', () => {
    const mapped = mapServiceError(new Error('ENCRYPTION_KEY=super-secret'));

    expect(mapped.code).toBe('INTERNAL_ERROR');
    expect(mapped.message).toBe('An internal error occurred');
  });
});
