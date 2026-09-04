import type { PrismaClient } from '../../generated/prisma/index.js';
import { sanitizeForLog } from '../agent/sanitize.js';
import { AppError } from '../middleware/error-handler.js';

/**
 * The engine surface the flow service needs. `executeFlow` is deliberately
 * absent: BotEngine keeps it private and there is no safe manual run path,
 * so no caller of this service can trigger a flow.
 */
export interface FlowEngine {
  enableFlow(flowId: number): Promise<void>;
  disableFlow(flowId: number): Promise<void>;
}

export interface BotFlowSummary {
  id: number;
  name: string;
  description: string | null;
  serverConfigId: number;
  virtualServerId: number;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  executionCount: number;
}

export interface BotFlowDetail {
  id: number;
  name: string;
  description: string | null;
  serverConfigId: number;
  virtualServerId: number;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  /** Parsed flow graph. Credential-named fields are redacted by default. */
  flowData: unknown;
}

export interface BotFlowReadOptions {
  /** Off only for the admin flow editor, which must round-trip its secrets. */
  redactSecrets?: boolean;
}

/** Flow metadata only: the graph itself can embed webhook secrets. */
export async function listBotFlows(prisma: PrismaClient): Promise<BotFlowSummary[]> {
  const flows = await prisma.botFlow.findMany({
    include: { _count: { select: { executions: true } } },
    orderBy: { id: 'asc' },
  });

  return flows.map((flow) => ({
    id: flow.id,
    name: flow.name,
    description: flow.description,
    serverConfigId: flow.serverConfigId,
    virtualServerId: flow.virtualServerId,
    enabled: flow.enabled,
    createdAt: flow.createdAt,
    updatedAt: flow.updatedAt,
    executionCount: flow._count.executions,
  }));
}

export async function getBotFlow(
  prisma: PrismaClient,
  botId: number,
  options: BotFlowReadOptions = {},
): Promise<BotFlowDetail> {
  const flow = await prisma.botFlow.findUnique({ where: { id: botId } });
  if (!flow) throw new AppError(404, 'Bot flow not found');

  const flowData: unknown = JSON.parse(flow.flowData);
  return {
    id: flow.id,
    name: flow.name,
    description: flow.description,
    serverConfigId: flow.serverConfigId,
    virtualServerId: flow.virtualServerId,
    enabled: flow.enabled,
    createdAt: flow.createdAt,
    updatedAt: flow.updatedAt,
    flowData: options.redactSecrets === false ? flowData : sanitizeForLog(flowData),
  };
}

export async function enableBotFlow(
  prisma: PrismaClient,
  engine: FlowEngine | undefined,
  botId: number,
): Promise<{ enabled: true }> {
  await prisma.botFlow.update({ where: { id: botId }, data: { enabled: true } });
  if (engine) await engine.enableFlow(botId);
  return { enabled: true };
}

export async function disableBotFlow(
  prisma: PrismaClient,
  engine: FlowEngine | undefined,
  botId: number,
): Promise<{ enabled: false }> {
  await prisma.botFlow.update({ where: { id: botId }, data: { enabled: false } });
  if (engine) await engine.disableFlow(botId);
  return { enabled: false };
}
