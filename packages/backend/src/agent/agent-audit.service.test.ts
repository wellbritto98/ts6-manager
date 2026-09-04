import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/index.js';
import { recordAudit } from './agent-audit.service.js';

function createPrisma() {
  const create = vi.fn().mockResolvedValue({});
  return {
    prisma: { aiActionLog: { create } } as unknown as PrismaClient,
    create,
  };
}

const entry = {
  requestId: 'request-1',
  actor: {
    externalUserId: 'openwebui-admin',
    email: 'admin@example.com',
    name: 'Admin User',
    role: 'admin' as const,
  },
  toolName: 'create_channel',
  risk: 'mutating',
  arguments: { token: 'private-token', serverConfigId: 1 },
  result: { success: true, action: 'channel_created' },
  status: 'success' as const,
  chatId: 'chat-1',
  messageId: 'message-1',
  idempotencyKey: 'request-key',
  durationMs: 42,
};

describe('recordAudit', () => {
  it('writes a successful action with its actor and sanitized arguments', async () => {
    const { prisma, create } = createPrisma();

    await recordAudit(prisma, entry);

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        requestId: 'request-1',
        externalUserId: 'openwebui-admin',
        actorEmail: 'admin@example.com',
        actorName: 'Admin User',
        toolName: 'create_channel',
        risk: 'mutating',
        sanitizedArguments: JSON.stringify({ token: '[REDACTED]', serverConfigId: 1 }),
        status: 'success',
        durationMs: 42,
      }),
    });
  });

  it('writes a failed action with its error code and chat metadata', async () => {
    const { prisma, create } = createPrisma();

    await recordAudit(prisma, {
      ...entry,
      result: undefined,
      status: 'failure',
      errorCode: 'FORBIDDEN',
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'failure',
        errorCode: 'FORBIDDEN',
        chatId: 'chat-1',
        messageId: 'message-1',
        sanitizedResult: null,
      }),
    });
  });

  it('swallows a Prisma write failure', async () => {
    const error = new Error('database unavailable');
    const create = vi.fn().mockRejectedValue(error);
    const prisma = { aiActionLog: { create } } as unknown as PrismaClient;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(recordAudit(prisma, entry)).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith('Failed to write AI action audit log', error);

    consoleError.mockRestore();
  });
});
