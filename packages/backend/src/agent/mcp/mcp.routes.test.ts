import express, { type Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { config } from '../../config.js';
import { createAgentRegistry } from '../create-registry.js';
import type { AgentRouteDeps } from '../openapi/openapi.routes.js';
import { createToolContext } from '../tools/tool-fakes.js';
import { createMcpRoutes } from './mcp.routes.js';

const GATEWAY_TOKEN = 'gateway-token-that-is-long-enough-01';
const IDENTITY_SECRET = 'identity-secret-that-is-long-enough-1';

function adminJwt(): string {
  return jwt.sign(
    { sub: 'openwebui-admin', email: 'admin@example.com', role: 'admin' },
    IDENTITY_SECRET,
    { algorithm: 'HS256', issuer: 'open-webui', expiresIn: '5m' },
  );
}

function createTestApp(): Express {
  const deps: AgentRouteDeps = {
    authConfig: {
      gatewayToken: GATEWAY_TOKEN,
      identityJwtSecret: IDENTITY_SECRET,
      allowedUserIds: [],
      allowedEmails: [],
    },
    registry: createAgentRegistry({ destructiveToolsEnabled: false }),
    buildContext: (_req, auth, requestId) => ({
      ...createToolContext({
        prisma: { aiActionLog: { create: async () => ({}), findUnique: async () => null } },
      }),
      actor: auth.actor,
      requestId,
    }),
  };

  const app = express();
  app.use(express.json());
  app.use('/api/agent', createMcpRoutes(deps));
  return app;
}

describe('POST /api/agent/mcp origin handling', () => {
  it('rejects a present Origin outside the allowlist with 403 before auth', async () => {
    const response = await request(createTestApp())
      .post('/api/agent/mcp')
      .set('Origin', 'http://evil.example')
      .send({ jsonrpc: '2.0', id: 1, method: 'initialize' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('lets an absent Origin through to authentication', async () => {
    const response = await request(createTestApp())
      .post('/api/agent/mcp')
      .send({ jsonrpc: '2.0', id: 1, method: 'initialize' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('lets the Open WebUI container origin through to authentication', async () => {
    const response = await request(createTestApp())
      .post('/api/agent/mcp')
      .set('Origin', 'http://open-webui:8080')
      .send({ jsonrpc: '2.0', id: 1, method: 'initialize' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('lets the configured frontend origin through to authentication', async () => {
    const response = await request(createTestApp())
      .post('/api/agent/mcp')
      .set('Origin', config.frontendUrl)
      .send({ jsonrpc: '2.0', id: 1, method: 'initialize' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });
});

describe('POST /api/agent/mcp transport', () => {
  it('reaches the stateless transport once both credentials verify', async () => {
    const response = await request(createTestApp())
      .post('/api/agent/mcp')
      .set('Authorization', `Bearer ${GATEWAY_TOKEN}`)
      .set('X-OpenWebUI-User-Jwt', adminJwt())
      .set('Accept', 'application/json, text/event-stream')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      });

    expect(response.status).toBe(200);
    expect(response.text).toContain('ts6-manager');
    expect(response.headers['mcp-session-id']).toBeUndefined();
  });
});
