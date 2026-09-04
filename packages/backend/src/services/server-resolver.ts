import type { PrismaClient } from '../../generated/prisma/index.js';
import { AgentError } from '../agent/agent-error.js';
import { TSApiError } from '../middleware/error-handler.js';

/** The slice of `WebQueryClient` the shared services depend on. */
export interface WebQueryExecutor {
  execute(sid: number, command: string, params?: Record<string, unknown>): Promise<unknown>;
}

/** The slice of `ConnectionPool` the shared services depend on. */
export interface WebQueryPool {
  hasClient(configId: number): boolean;
  getClient(configId: number): WebQueryExecutor;
}

/** Server fields safe to hand to any caller: never `apiKey` or `sshPassword`. */
export const PUBLIC_SERVER_SELECT = {
  id: true,
  name: true,
  host: true,
  webqueryPort: true,
  useHttps: true,
  enabled: true,
} as const;

export interface PublicServerConfig {
  id: number;
  name: string;
  host: string;
  webqueryPort: number;
  useHttps: boolean;
  enabled: boolean;
}

export function requirePositiveInt(value: unknown, field: string): number {
  const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isInteger(parsed) || parsed <= 0) {
    throw new AgentError('INVALID_INPUT', `${field} must be a positive integer`);
  }
  return parsed;
}

/** A virtual server is always named explicitly: never defaulted to 1. */
export function requireVirtualServerId(virtualServerId: unknown): number {
  return requirePositiveInt(virtualServerId, 'virtualServerId');
}

export function getWebQuery(pool: WebQueryPool, serverConfigId: number): WebQueryExecutor {
  if (!pool.hasClient(serverConfigId)) {
    throw new AgentError('SERVER_DISCONNECTED', `Server config ${serverConfigId} is not connected`);
  }
  return pool.getClient(serverConfigId);
}

/**
 * Look up an explicitly named server config without requiring a WebQuery
 * client — for the one tool category (channel files) that reaches TeamSpeak
 * over SSH instead. `requireEnabledServer` below layers the WebQuery check
 * on top of this for every other category.
 */
export async function requireServerRecord(
  prisma: PrismaClient,
  serverConfigId: unknown,
): Promise<PublicServerConfig> {
  const id = requirePositiveInt(serverConfigId, 'serverConfigId');
  const server = await prisma.tsServerConfig.findFirst({
    where: { id, enabled: true },
    select: PUBLIC_SERVER_SELECT,
  });
  if (!server) {
    throw new AgentError('SERVER_NOT_FOUND', `Server config ${id} does not exist or is disabled`);
  }
  return server;
}

/**
 * Resolve an explicitly named server config to its WebQuery client. A missing
 * or disabled config fails before any WebQuery call is made, and the first
 * configured server is never used as a fallback.
 */
export async function requireEnabledServer(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
): Promise<{ server: PublicServerConfig; client: WebQueryExecutor }> {
  const server = await requireServerRecord(prisma, serverConfigId);
  return { server, client: getWebQuery(pool, server.id) };
}

/** Resolve both halves of a virtual-server target in one step. */
export async function resolveServerTarget(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
): Promise<{ server: PublicServerConfig; client: WebQueryExecutor; sid: number }> {
  const { server, client } = await requireEnabledServer(prisma, pool, serverConfigId);
  return { server, client, sid: requireVirtualServerId(virtualServerId) };
}

/**
 * WebQuery answers an empty list with TS error 1281 (database_empty_result)
 * instead of an empty body — verified live against `banlist`, `complainlist`
 * and `messagelist`. Every "list" style call in the agent tool layer wraps
 * itself in this so "nothing to list" reads as an empty array, not a
 * TEAMSPEAK_ERROR the model has to explain away.
 */
export async function listOrEmpty<T>(fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof TSApiError && err.code === 1281) return [];
    throw err;
  }
}

/** WebQuery bodies are untyped JSON; narrow them without spreading `any`. */
export function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is Record<string, unknown> => isRecord(entry));
  }
  return isRecord(value) ? [value] : [];
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    const first = value[0];
    return isRecord(first) ? first : {};
  }
  return isRecord(value) ? value : {};
}

export function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
