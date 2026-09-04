import { describe, expect, it } from 'vitest';
import { AgentError } from './agent-error.js';
import { assertGatewayBearer } from './agent-auth.js';

const GATEWAY_TOKEN = 'gateway-token-with-at-least-thirty-two-chars';

describe('assertGatewayBearer', () => {
  it('accepts a matching bearer token', () => {
    expect(() => assertGatewayBearer(`Bearer ${GATEWAY_TOKEN}`, GATEWAY_TOKEN)).not.toThrow();
  });

  it('rejects a missing bearer token as unauthenticated', () => {
    expect(() => assertGatewayBearer(undefined, GATEWAY_TOKEN)).toThrow(
      expect.objectContaining<Partial<AgentError>>({ code: 'UNAUTHENTICATED' }),
    );
  });

  it('rejects a mismatched bearer token as unauthenticated', () => {
    expect(() => assertGatewayBearer('Bearer incorrect-token', GATEWAY_TOKEN)).toThrow(
      expect.objectContaining<Partial<AgentError>>({ code: 'UNAUTHENTICATED' }),
    );
  });
});
