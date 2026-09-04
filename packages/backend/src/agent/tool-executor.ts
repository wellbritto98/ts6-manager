import { randomUUID } from 'node:crypto';
import type { AgentContext } from './agent-context.js';
import { recordAudit } from './agent-audit.service.js';
import { AgentError } from './agent-error.js';

export type AgentToolRisk = 'read' | 'mutating' | 'destructive';

export interface ToolExecutionResult {
  success: true;
  action: string;
  [key: string]: unknown;
}

export interface ToolSuccess extends ToolExecutionResult {
  requestId: string;
}

export interface AgentToolDefinition {
  name: string;
  risk: AgentToolRisk;
  execute: (context: AgentContext, input: unknown) => Promise<ToolExecutionResult>;
}

export interface AgentToolRegistry {
  getTool: (name: string) => AgentToolDefinition | undefined;
}

export interface ExecuteToolOptions {
  registry: AgentToolRegistry;
  context: AgentContext;
  name: string;
  input: unknown;
}

function getIdempotencyKey(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null || !('idempotencyKey' in input)) {
    return undefined;
  }
  const value = input.idempotencyKey;
  return typeof value === 'string' ? value : undefined;
}

function getServerIds(input: unknown): Pick<Parameters<typeof recordAudit>[1], 'serverConfigId' | 'virtualServerId'> {
  if (typeof input !== 'object' || input === null) {
    return {};
  }
  const values = input as Record<string, unknown>;

  return {
    serverConfigId: typeof values.serverConfigId === 'number' ? values.serverConfigId : undefined,
    virtualServerId: typeof values.virtualServerId === 'number' ? values.virtualServerId : undefined,
  };
}

function isMutating(tool: AgentToolDefinition): boolean {
  return tool.risk === 'mutating' || tool.risk === 'destructive';
}

export async function executeTool({
  registry,
  context,
  name,
  input,
}: ExecuteToolOptions): Promise<ToolSuccess> {
  const requestId = randomUUID();
  const tool = registry.getTool(name);
  if (!tool) {
    throw new AgentError('TOOL_NOT_FOUND', 'Tool not found');
  }

  const idempotencyKey = getIdempotencyKey(input);
  if (idempotencyKey && idempotencyKey.length > 128) {
    throw new AgentError('INVALID_INPUT', 'idempotencyKey must be at most 128 characters');
  }

  if (isMutating(tool) && idempotencyKey) {
    const existing = await context.prisma.aiActionLog.findUnique({
      where: {
        externalUserId_toolName_idempotencyKey: {
          externalUserId: context.actor.externalUserId,
          toolName: tool.name,
          idempotencyKey,
        },
      },
      select: { sanitizedResult: true },
    });
    if (existing?.sanitizedResult) {
      return JSON.parse(existing.sanitizedResult) as ToolSuccess;
    }
  }

  const startTime = Date.now();
  try {
    const result = await tool.execute(context, input);
    const success = { ...result, requestId };
    await recordAudit(context.prisma, {
      requestId,
      actor: context.actor,
      toolName: tool.name,
      risk: tool.risk,
      arguments: input,
      result: success,
      status: 'success',
      idempotencyKey,
      durationMs: Date.now() - startTime,
      chatId: context.chatId,
      messageId: context.messageId,
      ...getServerIds(input),
    });
    return success;
  } catch (error) {
    await recordAudit(context.prisma, {
      requestId,
      actor: context.actor,
      toolName: tool.name,
      risk: tool.risk,
      arguments: input,
      status: 'failure',
      errorCode: error instanceof AgentError ? error.code : 'INTERNAL_ERROR',
      idempotencyKey,
      durationMs: Date.now() - startTime,
      chatId: context.chatId,
      messageId: context.messageId,
      ...getServerIds(input),
    });
    throw error;
  }
}
