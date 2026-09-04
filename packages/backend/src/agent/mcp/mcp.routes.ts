import { randomUUID } from 'node:crypto';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import { Router, type Request, type Response } from 'express';
import { config } from '../../config.js';
import { assertAgentAuth } from '../agent-auth.js';
import { AgentError, toToolError } from '../agent-error.js';
import { statusForToolError, type AgentRouteDeps } from '../openapi/openapi.routes.js';
import { createTs6McpServer } from './mcp-server.js';

/** Open WebUI reaches the backend over the Docker network under this name. */
const OPEN_WEBUI_ORIGINS = ['http://open-webui:8080', 'http://open-webui'];

export function mcpAllowedOrigins(): string[] {
  return [config.frontendUrl, ...OPEN_WEBUI_ORIGINS];
}

/**
 * A missing `Origin` is allowed: MCP clients calling from inside the Docker
 * network do not send one. A present value must match the allowlist, which
 * keeps a browser on another site from driving the transport.
 */
export function isOriginAllowed(origin: string | undefined): boolean {
  return origin === undefined || mcpAllowedOrigins().includes(origin);
}

async function handleMcpRequest(req: Request, res: Response, deps: AgentRouteDeps): Promise<void> {
  const requestId = randomUUID();
  try {
    if (!isOriginAllowed(req.header('origin'))) {
      throw new AgentError('FORBIDDEN', 'Origin is not allowed to reach the MCP endpoint');
    }
    const auth = assertAgentAuth(
      {
        authorization: req.header('authorization'),
        'x-openwebui-user-jwt': req.header('x-openwebui-user-jwt'),
        'x-openwebui-chat-id': req.header('x-openwebui-chat-id'),
        'x-openwebui-message-id': req.header('x-openwebui-message-id'),
      },
      deps.authConfig,
    );

    // Stateless: one server and one transport per request, both closed with it.
    const server = createTs6McpServer({
      registry: deps.registry,
      createContext: () => deps.buildContext(req, auth, randomUUID()),
    });
    const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    if (res.headersSent) return;
    res.status(statusForToolError(error)).json(toToolError(error, requestId));
  }
}

export function createMcpRoutes(deps: AgentRouteDeps): Router {
  const router = Router();
  const handler = (req: Request, res: Response) => handleMcpRequest(req, res, deps);

  router.get('/mcp', handler);
  router.post('/mcp', handler);

  return router;
}
