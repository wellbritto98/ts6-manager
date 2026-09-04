import { createHash, timingSafeEqual } from 'node:crypto';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import type { AgentActor } from './agent-context.js';
import { AgentError } from './agent-error.js';

function unauthenticated(): never {
  throw new AgentError('UNAUTHENTICATED', 'Invalid gateway credentials');
}

function forbidden(): never {
  throw new AgentError('FORBIDDEN', 'Agent access is forbidden');
}

export interface AgentAuthConfig {
  gatewayToken: string | undefined;
  identityJwtSecret: string | undefined;
  allowedUserIds: string[];
  allowedEmails: string[];
}

export interface AgentAuthHeaders {
  authorization?: string;
  'x-openwebui-user-jwt'?: string;
  'x-openwebui-chat-id'?: string;
  'x-openwebui-message-id'?: string;
}

export interface AgentAuthentication {
  actor: AgentActor;
  chatId?: string;
  messageId?: string;
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

export function verifyOpenWebUiJwt(
  token: string | undefined,
  identityJwtSecret: string | undefined,
): AgentActor {
  if (!token || !identityJwtSecret) {
    unauthenticated();
  }

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, identityJwtSecret, {
      algorithms: ['HS256'],
      issuer: 'open-webui',
    }) as JwtPayload;
  } catch {
    unauthenticated();
  }

  if (
    typeof payload.sub !== 'string'
    || typeof payload.exp !== 'number'
    || typeof payload.role !== 'string'
  ) {
    unauthenticated();
  }
  if (payload.role !== 'admin') {
    forbidden();
  }

  return {
    externalUserId: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    name: typeof payload.name === 'string' ? payload.name : undefined,
    role: 'admin',
  };
}

export function assertAgentAuth(
  headers: AgentAuthHeaders,
  authConfig: AgentAuthConfig,
): AgentAuthentication {
  assertGatewayBearer(headers.authorization, authConfig.gatewayToken);
  const actor = verifyOpenWebUiJwt(
    headers['x-openwebui-user-jwt'],
    authConfig.identityJwtSecret,
  );

  return {
    actor,
    chatId: headers['x-openwebui-chat-id'],
    messageId: headers['x-openwebui-message-id'],
  };
}
