import express, { type Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { mountAgentGateway } from '../agent-router.js';
import { createAgentRegistry } from '../create-registry.js';
import { createToolContext } from '../tools/tool-fakes.js';
import type { AgentRouteDeps } from './openapi.routes.js';

const GATEWAY_TOKEN = 'gateway-token-that-is-long-enough-01';
const IDENTITY_SECRET = 'identity-secret-that-is-long-enough-1';

function identityJwt(role: string): string {
  return jwt.sign(
    { sub: 'openwebui-admin', email: 'admin@example.com', name: 'Admin', role },
    IDENTITY_SECRET,
    { algorithm: 'HS256', issuer: 'open-webui', expiresIn: '5m' },
  );
}

function enabledDeps(): AgentRouteDeps {
  return {
    authConfig: {
      gatewayToken: GATEWAY_TOKEN,
      identityJwtSecret: IDENTITY_SECRET,
      allowedUserIds: [],
      allowedEmails: [],
    },
    registry: createAgentRegistry({ destructiveToolsEnabled: false }),
    buildContext: (_req, auth, requestId) => ({
      ...createToolContext({
        prisma: {
          aiActionLog: { create: async () => ({}), findUnique: async () => null },
        },
      }),
      actor: auth.actor,
      requestId,
    }),
  };
}

function createTestApp(deps: AgentRouteDeps | null): Express {
  const app = express();
  app.use(express.json());
  mountAgentGateway(app, deps);
  return app;
}

describe('agent gateway with the AI flag off', () => {
  it('answers 404 for the document and for a tool call', async () => {
    const app = createTestApp(null);

    expect((await request(app).get('/api/agent/openapi.json')).status).toBe(404);
    expect((await request(app).post('/api/agent/tools/list_servers').send({})).status).toBe(404);
  });
});

describe('GET /api/agent/openapi.json', () => {
  it('answers 401 UNAUTHENTICATED without a gateway bearer', async () => {
    const response = await request(createTestApp(enabledDeps())).get('/api/agent/openapi.json');

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('answers 401 UNAUTHENTICATED for a wrong gateway bearer', async () => {
    const response = await request(createTestApp(enabledDeps()))
      .get('/api/agent/openapi.json')
      .set('Authorization', 'Bearer not-the-gateway-token');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('serves the agent-only document for the gateway bearer alone', async () => {
    const response = await request(createTestApp(enabledDeps()))
      .get('/api/agent/openapi.json')
      .set('Authorization', `Bearer ${GATEWAY_TOKEN}`);

    expect(response.status).toBe(200);
    expect(Object.keys(response.body.paths).every((path: string) =>
      path.startsWith('/api/agent/tools/'))).toBe(true);
  });
});

describe('POST /api/agent/tools/:toolName', () => {
  it('executes a read tool for a gateway bearer plus an admin identity JWT', async () => {
    const response = await request(createTestApp(enabledDeps()))
      .post('/api/agent/tools/list_servers')
      .set('Authorization', `Bearer ${GATEWAY_TOKEN}`)
      .set('X-OpenWebUI-User-Jwt', identityJwt('admin'))
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.action).toBe('servers_listed');
    expect(response.body.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('answers 401 UNAUTHENTICATED when the identity JWT is missing', async () => {
    const response = await request(createTestApp(enabledDeps()))
      .post('/api/agent/tools/list_servers')
      .set('Authorization', `Bearer ${GATEWAY_TOKEN}`)
      .send({});

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('answers 403 FORBIDDEN when the identity JWT role is not admin', async () => {
    const response = await request(createTestApp(enabledDeps()))
      .post('/api/agent/tools/list_servers')
      .set('Authorization', `Bearer ${GATEWAY_TOKEN}`)
      .set('X-OpenWebUI-User-Jwt', identityJwt('user'))
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('answers 404 TOOL_NOT_FOUND for a name outside the registry', async () => {
    const response = await request(createTestApp(enabledDeps()))
      .post('/api/agent/tools/execute_sql')
      .set('Authorization', `Bearer ${GATEWAY_TOKEN}`)
      .set('X-OpenWebUI-User-Jwt', identityJwt('admin'))
      .send({});

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('TOOL_NOT_FOUND');
  });

  it('answers 400 INVALID_INPUT for an unknown field in the body', async () => {
    const response = await request(createTestApp(enabledDeps()))
      .post('/api/agent/tools/list_servers')
      .set('Authorization', `Bearer ${GATEWAY_TOKEN}`)
      .set('X-OpenWebUI-User-Jwt', identityJwt('admin'))
      .send({ role: 'admin' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_INPUT');
    expect(response.body.error.retryable).toBe(false);
  });
});
