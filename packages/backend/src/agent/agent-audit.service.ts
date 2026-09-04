import type { PrismaClient } from '../../generated/prisma/index.js';
import type { AgentActor } from './agent-context.js';
import { sanitizeForLog } from './sanitize.js';

export interface AuditEntry {
  requestId: string;
  actor: AgentActor;
  toolName: string;
  risk: string;
  arguments: unknown;
  result?: unknown;
  status: 'success' | 'failure';
  errorCode?: string;
  chatId?: string;
  messageId?: string;
  idempotencyKey?: string;
  serverConfigId?: number;
  virtualServerId?: number;
  durationMs?: number;
}

function stringifySanitized(value: unknown): string {
  return JSON.stringify(sanitizeForLog(value)) ?? 'null';
}

export async function writeAiActionLog(prisma: PrismaClient, entry: AuditEntry): Promise<void> {
  await prisma.aiActionLog.create({
    data: {
      requestId: entry.requestId,
      idempotencyKey: entry.idempotencyKey,
      externalUserId: entry.actor.externalUserId,
      actorEmail: entry.actor.email,
      actorName: entry.actor.name,
      chatId: entry.chatId,
      messageId: entry.messageId,
      serverConfigId: entry.serverConfigId,
      virtualServerId: entry.virtualServerId,
      toolName: entry.toolName,
      risk: entry.risk,
      sanitizedArguments: stringifySanitized(entry.arguments),
      sanitizedResult: entry.result === undefined ? null : stringifySanitized(entry.result),
      status: entry.status,
      errorCode: entry.errorCode,
      durationMs: entry.durationMs,
    },
  });
}

export async function recordAudit(prisma: PrismaClient, entry: AuditEntry): Promise<void> {
  try {
    await writeAiActionLog(prisma, entry);
  } catch (error) {
    console.error('Failed to write AI action audit log', error);
  }
}
