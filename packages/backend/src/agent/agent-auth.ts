import { createHash, timingSafeEqual } from 'node:crypto';
import { AgentError } from './agent-error.js';

function unauthenticated(): never {
  throw new AgentError('UNAUTHENTICATED', 'Invalid gateway credentials');
}

export function assertGatewayBearer(
  authorization: string | undefined,
  gatewayToken: string | undefined,
): void {
  if (!authorization?.startsWith('Bearer ') || !gatewayToken) {
    unauthenticated();
  }

  const presentedToken = authorization.slice('Bearer '.length);
  const presentedHash = createHash('sha256').update(presentedToken).digest();
  const expectedHash = createHash('sha256').update(gatewayToken).digest();

  if (!timingSafeEqual(presentedHash, expectedHash)) {
    unauthenticated();
  }
}
