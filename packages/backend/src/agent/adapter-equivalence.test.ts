import express, { type Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createAgentRegistry } from './create-registry.js';
import { buildMcpToolRegistrations } from './mcp/mcp-server.js';
import { createOpenApiRoutes, type AgentRouteDeps } from './openapi/openapi.routes.js';
import { createToolContext } from './tools/tool-fakes.js';

const GATEWAY_TOKEN = 'gateway-token-that-is-long-enough-01';
const IDENTITY_SECRET = 'identity-secret-that-is-long-enough-1';

const registry = createAgentRegistry({ destructiveToolsEnabled: false });

function createContext() {
  return createToolContext({
    prisma: { aiActionLog: { create: async () => ({}), findUnique: async () => null } },
  });
}

function openApiApp(): Express {
  const deps: AgentRouteDeps = {
    authConfig: {
      gatewayToken: GATEWAY_TOKEN,
      identityJwtSecret: IDENTITY_SECRET,
      allowedUserIds: [],
      allowedEmails: [],
    },
    registry,
    buildContext: (_req, auth, requestId) => ({ ...createContext(), actor: auth.actor, requestId }),
  };

  const app = express();
  app.use(express.json());
  app.use('/api/agent', createOpenApiRoutes(deps));
  return app;
}

/** The outcome fields the spec requires both adapters to agree on. */
interface Outcome {
  success: boolean;
  action?: string;
  errorCode?: string;
}

function toOutcome(payload: {
  success: boolean;
  action?: string;
  error?: { code: string };
}): Outcome {
  return { success: payload.success, action: payload.action, errorCode: payload.error?.code };
}

async function throughOpenApi(toolName: string, input: unknown): Promise<Outcome> {
  const response = await request(openApiApp())
    .post(`/api/agent/tools/${toolName}`)
    .set('Authorization', `Bearer ${GATEWAY_TOKEN}`)
    .set(
      'X-OpenWebUI-User-Jwt',
      jwt.sign({ sub: 'openwebui-admin', role: 'admin' }, IDENTITY_SECRET, {
        algorithm: 'HS256',
        issuer: 'open-webui',
        expiresIn: '5m',
      }),
    )
    .send(input as object);

  return toOutcome(response.body);
}

async function throughMcp(toolName: string, input: unknown): Promise<Outcome> {
  const registration = buildMcpToolRegistrations({ registry, createContext })
    .find((candidate) => candidate.name === toolName);
  if (!registration) throw new Error(`Tool "${toolName}" is not registered for MCP`);

  const result = await registration.handler(input);
  const block = result.content?.[0];
  const text = block?.type === 'text' ? block.text : '';

  return toOutcome(JSON.parse(text));
}

describe('OpenAPI and MCP adapter equivalence', () => {
  it('produces the same success action for list_servers', async () => {
    const openApi = await throughOpenApi('list_servers', {});
    const mcp = await throughMcp('list_servers', {});

    expect(openApi).toEqual({ success: true, action: 'servers_listed', errorCode: undefined });
    expect(mcp).toEqual(openApi);
  });

  it('produces the same INVALID_INPUT code for an unknown extra field', async () => {
    const openApi = await throughOpenApi('list_servers', { role: 'admin' });
    const mcp = await throughMcp('list_servers', { role: 'admin' });

    expect(openApi).toEqual({ success: false, action: undefined, errorCode: 'INVALID_INPUT' });
    expect(mcp).toEqual(openApi);
  });

  it('produces the same TOOL_NOT_FOUND code for a forbidden generic tool', async () => {
    const openApi = await throughOpenApi('execute_sql', {});

    expect(openApi).toEqual({ success: false, action: undefined, errorCode: 'TOOL_NOT_FOUND' });
    expect(buildMcpToolRegistrations({ registry, createContext })
      .some((registration) => registration.name === 'execute_sql')).toBe(false);
  });
});
