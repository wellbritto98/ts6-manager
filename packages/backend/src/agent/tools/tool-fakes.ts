import type { PrismaClient } from '../../../generated/prisma/index.js';
import type { BotEngine } from '../../bot-engine/engine.js';
import type { ConnectionPool } from '../../ts-client/connection-pool.js';
import type { VoiceBotManager } from '../../voice/voice-bot-manager.js';
import type { AgentContext } from '../agent-context.js';
import type { AgentToolDefinition } from '../tool-definition.js';

/** Test-support fakes for the tool layer. Free of any test-framework import. */

export interface FakeServerRow {
  id: number;
  name: string;
  host: string;
  webqueryPort: number;
  useHttps: boolean;
  enabled: boolean;
}

export const FAKE_SERVER: FakeServerRow = {
  id: 7,
  name: 'Main',
  host: 'ts.example.com',
  webqueryPort: 10080,
  useHttps: false,
  enabled: true,
};

export type FakeExecute = (
  sid: number,
  command: string,
  params?: Record<string, unknown>,
) => Promise<unknown>;

export interface ToolContextOptions {
  servers?: FakeServerRow[];
  /** Config ids whose WebQuery client is present in the pool. */
  connectedIds?: number[];
  execute?: FakeExecute;
  prisma?: Record<string, unknown>;
  voiceBotManager?: unknown;
  botEngine?: unknown;
  discordBridge?: unknown;
}

export function createToolContext(options: ToolContextOptions = {}): AgentContext {
  const servers = options.servers ?? [FAKE_SERVER];
  const connectedIds = options.connectedIds ?? servers.map((server) => server.id);
  const execute: FakeExecute = options.execute ?? (async () => ({}));

  const prisma = {
    tsServerConfig: {
      findMany: async () => servers.filter((server) => server.enabled),
      findFirst: async ({ where }: { where: { id: number; enabled: boolean } }) =>
        servers.find((server) => server.id === where.id && server.enabled === where.enabled) ?? null,
    },
    ...options.prisma,
  } as unknown as PrismaClient;

  const connectionPool = {
    hasClient: (configId: number) => connectedIds.includes(configId),
    getClient: () => ({ execute }),
  } as unknown as ConnectionPool;

  return {
    actor: { externalUserId: 'openwebui-admin', role: 'admin' },
    requestId: 'test-request',
    prisma,
    connectionPool,
    voiceBotManager: options.voiceBotManager as VoiceBotManager,
    botEngine: options.botEngine as BotEngine,
    discordBridge: options.discordBridge as AgentContext['discordBridge'],
  };
}

export function findTool(tools: AgentToolDefinition[], name: string): AgentToolDefinition {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Tool "${name}" is not in this tool set`);
  return tool;
}
