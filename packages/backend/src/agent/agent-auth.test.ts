import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { AgentError } from './agent-error.js';
import { assertAgentAuth, assertGatewayBearer, verifyOpenWebUiJwt } from './agent-auth.js';

const GATEWAY_TOKEN = 'gateway-token-with-at-least-thirty-two-chars';
const IDENTITY_SECRET = 'identity-secret-with-at-least-thirty-two-chars';

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

describe('verifyOpenWebUiJwt', () => {
  const signIdentity = (
    payload: Record<string, string>,
    options: jwt.SignOptions = {},
  ) => jwt.sign(payload, IDENTITY_SECRET, { algorithm: 'HS256', expiresIn: '5m', ...options });

  it('returns the actor identity from a valid admin JWT', () => {
    const actor = verifyOpenWebUiJwt(signIdentity({
      sub: 'openwebui-admin',
      email: 'admin@example.com',
      name: 'Admin User',
      role: 'admin',
      iss: 'open-webui',
    }), IDENTITY_SECRET);

    expect(actor).toEqual({
      externalUserId: 'openwebui-admin',
      email: 'admin@example.com',
      name: 'Admin User',
      role: 'admin',
    });
  });

  it('rejects an expired identity JWT as unauthenticated', () => {
    const expiredToken = signIdentity({
      sub: 'openwebui-admin',
      role: 'admin',
      iss: 'open-webui',
    }, { expiresIn: '-1s' });

    expect(() => verifyOpenWebUiJwt(expiredToken, IDENTITY_SECRET)).toThrow(
      expect.objectContaining<Partial<AgentError>>({ code: 'UNAUTHENTICATED' }),
    );
  });

  it('rejects an identity JWT with a different issuer as unauthenticated', () => {
    const token = signIdentity({
      sub: 'openwebui-admin',
      role: 'admin',
      iss: 'other',
    });

    expect(() => verifyOpenWebUiJwt(token, IDENTITY_SECRET)).toThrow(
      expect.objectContaining<Partial<AgentError>>({ code: 'UNAUTHENTICATED' }),
    );
  });

  it('rejects a non-admin identity JWT as forbidden', () => {
    const token = signIdentity({
      sub: 'openwebui-user',
      role: 'user',
      iss: 'open-webui',
    });

    expect(() => verifyOpenWebUiJwt(token, IDENTITY_SECRET)).toThrow(
      expect.objectContaining<Partial<AgentError>>({ code: 'FORBIDDEN' }),
    );
  });

  it('does not accept unsigned identity headers without an identity JWT', () => {
    expect(() => assertAgentAuth({
      authorization: `Bearer ${GATEWAY_TOKEN}`,
      'x-openwebui-user-id': 'forged-admin',
      'x-openwebui-user-email': 'admin@example.com',
      'x-openwebui-user-name': 'Forged Admin',
    }, {
      gatewayToken: GATEWAY_TOKEN,
      identityJwtSecret: IDENTITY_SECRET,
      allowedUserIds: [],
      allowedEmails: [],
    })).toThrow(expect.objectContaining<Partial<AgentError>>({ code: 'UNAUTHENTICATED' }));
  });
});
