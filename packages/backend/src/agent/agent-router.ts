import { Router, type Express, type Request } from 'express';
import rateLimit from 'express-rate-limit';
import type { PrismaClient } from '../../generated/prisma/index.js';
import type { BotEngine } from '../bot-engine/engine.js';
import { config } from '../config.js';
import type { DiscordBridge } from '../discord/discord-bridge.js';
import type { ConnectionPool } from '../ts-client/connection-pool.js';
import type { VoiceBotManager } from '../voice/voice-bot-manager.js';
import type { AgentAuthentication } from './agent-auth.js';
import type { AgentContext } from './agent-context.js';
import { createAgentRegistry } from './create-registry.js';
import { createMcpRoutes } from './mcp/mcp.routes.js';
import { createOpenApiRoutes, type AgentRouteDeps } from './openapi/openapi.routes.js';

/** Single mount point shared by every agent adapter. */
export const AGENT_MOUNT_PATH = '/api/agent';

interface AgentLocals {
  prisma: PrismaClient;
  connectionPool: ConnectionPool;
  voiceBotManager: VoiceBotManager;
  botEngine: BotEngine;
  discordBridge?: DiscordBridge;
}

function contextFromAppLocals(
  req: Request,
  auth: AgentAuthentication,
  requestId: string,
): AgentContext {
  const locals = req.app.locals as AgentLocals;

  return {
    actor: auth.actor,
    chatId: auth.chatId,
    messageId: auth.messageId,
    requestId,
    prisma: locals.prisma,
    connectionPool: locals.connectionPool,
    voiceBotManager: locals.voiceBotManager,
    botEngine: locals.botEngine,
    discordBridge: locals.discordBridge,
  };
}

export function defaultAgentRouteDeps(): AgentRouteDeps {
  return {
    authConfig: {
      gatewayToken: config.ai.gatewayToken,
      identityJwtSecret: config.ai.identityJwtSecret,
      allowedUserIds: config.ai.allowedUserIds,
      allowedEmails: config.ai.allowedEmails,
    },
    registry: createAgentRegistry(),
    buildContext: contextFromAppLocals,
  };
}

export function createAgentRouter(deps: AgentRouteDeps): Router {
  const router = Router();

  router.use(rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please slow down' },
  }));
  router.use(createOpenApiRoutes(deps));
  router.use(createMcpRoutes(deps));

  return router;
}

/**
 * Passing `null` keeps the flag-off deployment unchanged: the surface answers
 * 404 rather than falling through to `authMiddleware`, whose 401 would confirm
 * that the route exists.
 */
export function mountAgentGateway(app: Express, deps: AgentRouteDeps | null): void {
  if (!deps) {
    app.use(AGENT_MOUNT_PATH, (_req, res) => {
      res.status(404).json({ error: 'Not found' });
    });
    return;
  }
  app.use(AGENT_MOUNT_PATH, createAgentRouter(deps));
}
