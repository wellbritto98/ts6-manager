import { describe, expect, it } from 'vitest';
import { AgentError, toToolError, type AgentErrorCode } from './agent-error.js';

const ALL_CODES: AgentErrorCode[] = [
  'INVALID_INPUT',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'SERVER_NOT_FOUND',
  'SERVER_DISCONNECTED',
  'CHANNEL_NOT_FOUND',
  'CLIENT_NOT_FOUND',
  'BOT_NOT_FOUND',
  'CONFLICT',
  'TIMEOUT',
  'TEAMSPEAK_ERROR',
  'INTERNAL_ERROR',
  'TOOL_NOT_FOUND',
];

describe('toToolError', () => {
  it.each(ALL_CODES)('serializes %s in the public tool failure shape', (code) => {
    expect(toToolError(new AgentError(code, 'Tool failed'), 'request-123')).toEqual({
      success: false,
      error: {
        code,
        message: 'Tool failed',
        retryable: ['TIMEOUT', 'SERVER_DISCONNECTED', 'TEAMSPEAK_ERROR'].includes(code),
      },
      requestId: 'request-123',
    });
  });

  it('marks timeout and TeamSpeak failures as retryable', () => {
    expect(toToolError(new AgentError('TIMEOUT'), 'request-1').error.retryable).toBe(true);
    expect(toToolError(new AgentError('TEAMSPEAK_ERROR'), 'request-2').error.retryable).toBe(true);
  });

  it('does not mark not-found, forbidden, or invalid input failures as retryable', () => {
    expect(toToolError(new AgentError('SERVER_NOT_FOUND'), 'request-1').error.retryable).toBe(false);
    expect(toToolError(new AgentError('FORBIDDEN'), 'request-2').error.retryable).toBe(false);
    expect(toToolError(new AgentError('INVALID_INPUT'), 'request-3').error.retryable).toBe(false);
  });

  it('does not include a stack trace in the serialized error', () => {
    const result = toToolError(new AgentError('INTERNAL_ERROR', 'Private stack'), 'request-123');

    expect(result).not.toHaveProperty('stack');
    expect(result.error).not.toHaveProperty('stack');
  });

  it('converts unknown errors to a non-retryable internal error', () => {
    expect(toToolError(new Error('database password leaked'), 'request-123')).toEqual({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An internal error occurred',
        retryable: false,
      },
      requestId: 'request-123',
    });
  });
});
