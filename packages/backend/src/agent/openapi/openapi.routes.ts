import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import {
  assertAgentAuth,
  assertGatewayBearer,
  type AgentAuthConfig,
  type AgentAuthHeaders,
  type AgentAuthentication,
} from '../agent-auth.js';
import type { AgentContext } from '../agent-context.js';
import { AgentError, toToolError, type AgentErrorCode } from '../agent-error.js';
import type { AgentToolDefinition } from '../tool-definition.js';
import { executeTool, type AgentToolRegistry } from '../tool-executor.js';
import { buildOpenApiDocument } from './openapi-document.js';

export interface AgentToolCatalog extends AgentToolRegistry {
  listExposed(): AgentToolDefinition[];
}

export interface AgentRouteDeps {
  authConfig: AgentAuthConfig;
  registry: AgentToolCatalog;
  buildContext(req: Request, auth: AgentAuthentication, requestId: string): AgentContext;
  /** Base URL advertised in the document, e.g. `http://backend:3001`. */
  serverUrl?: string;
}

/**
 * Transport-level statuses only. Every other code answers 200 carrying the
 * failure body, so the model reads the code instead of a bare HTTP error.
 */
const HTTP_STATUS_BY_CODE: Partial<Record<AgentErrorCode, number>> = {
  INVALID_INPUT: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  TOOL_NOT_FOUND: 404,
};

export function statusForToolError(error: unknown): number {
  if (!(error instanceof AgentError)) return 500;
  return HTTP_STATUS_BY_CODE[error.code] ?? 200;
}

function readAuthHeaders(req: Request): AgentAuthHeaders {
  return {
    authorization: req.header('authorization'),
    'x-openwebui-user-jwt': req.header('x-openwebui-user-jwt'),
    'x-openwebui-chat-id': req.header('x-openwebui-chat-id'),
    'x-openwebui-message-id': req.header('x-openwebui-message-id'),
  };
}

/** Never echoes the presented credential: only the mapped code and message. */
function sendFailure(res: Response, error: unknown, requestId: string): void {
  res.status(statusForToolError(error)).json(toToolError(error, requestId));
}

export function createOpenApiRoutes(deps: AgentRouteDeps): Router {
  const router = Router();

  // The document itself is not user-scoped, so it needs the service bearer
  // only. No identity JWT is required to import the tool list.
  router.get('/openapi.json', (req, res) => {
    try {
      assertGatewayBearer(req.header('authorization'), deps.authConfig.gatewayToken);
    } catch (error) {
      sendFailure(res, error, randomUUID());
      return;
    }
    res.json(buildOpenApiDocument({
      tools: deps.registry.listExposed(),
      serverUrl: deps.serverUrl,
    }));
  });

  router.post('/tools/:toolName', async (req, res) => {
    const requestId = randomUUID();
    try {
      const auth = assertAgentAuth(readAuthHeaders(req), deps.authConfig);
      const result = await executeTool({
        registry: deps.registry,
        context: deps.buildContext(req, auth, requestId),
        name: req.params.toolName,
        input: req.body,
      });
      res.json(result);
    } catch (error) {
      sendFailure(res, error, requestId);
    }
  });

  return router;
}
