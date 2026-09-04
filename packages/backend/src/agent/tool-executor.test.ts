import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { PrismaClient } from '../../generated/prisma/index.js';
import type { AgentContext } from './agent-context.js';
import { AgentError } from './agent-error.js';
import type { AgentToolDefinition } from './tool-definition.js';
import { executeTool, type AgentToolRegistry } from './tool-executor.js';

function createContext(prisma: PrismaClient): AgentContext {
  return {
    actor: { externalUserId: 'openwebui-admin', role: 'admin' },
    requestId: 'unused',
    prisma,
  } as unknown as AgentContext;
}

function createRegistry(tool: Omit<AgentToolDefinition, 'description' | 'inputSchema'>): AgentToolRegistry {
  const full: AgentToolDefinition = { description: tool.name, inputSchema: z.unknown(), ...tool };
  return { getTool: (name) => name === tool.name ? full : undefined };
}

describe('executeTool', () => {
  it('runs a mutating tool once and returns its stored outcome on an idempotent retry', async () => {
    let storedResult: string | null = null;
    const create = vi.fn().mockImplementation(async ({ data }: { data: { sanitizedResult: string | null } }) => {
      storedResult = data.sanitizedResult;
    });
    const findUnique = vi.fn().mockImplementation(async () => (
      storedResult === null ? null : { sanitizedResult: storedResult }
    ));
    const prisma = { aiActionLog: { create, findUnique } } as unknown as PrismaClient;
    const execute = vi.fn().mockResolvedValue({ success: true, action: 'channel_created', channelId: 12 });
    const registry = createRegistry({ name: 'create_channel', risk: 'write', execute });
    const context = createContext(prisma);
    const input = { idempotencyKey: 'create-12' };

    const first = await executeTool({ registry, context, name: 'create_channel', input });
    const second = await executeTool({ registry, context, name: 'create_channel', input });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(first.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects an idempotency key longer than 128 characters', async () => {
    const prisma = { aiActionLog: { create: vi.fn(), findUnique: vi.fn() } } as unknown as PrismaClient;
    const execute = vi.fn().mockResolvedValue({ success: true, action: 'channel_created' });
    const registry = createRegistry({ name: 'create_channel', risk: 'write', execute });

    await expect(executeTool({
      registry,
      context: createContext(prisma),
      name: 'create_channel',
      input: { idempotencyKey: 'x'.repeat(129) },
    })).rejects.toEqual(expect.objectContaining<Partial<AgentError>>({ code: 'INVALID_INPUT' }));
  });

  it('records already_in_desired_state as the successful result', async () => {
    const create = vi.fn().mockResolvedValue({});
    const prisma = {
      aiActionLog: { create, findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;
    const execute = vi.fn().mockResolvedValue({ success: true, action: 'already_in_desired_state' });
    const registry = createRegistry({ name: 'add_client_to_group', risk: 'write', execute });

    await executeTool({
      registry,
      context: createContext(prisma),
      name: 'add_client_to_group',
      input: { idempotencyKey: 'member-42' },
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'success',
        sanitizedResult: expect.stringContaining('already_in_desired_state'),
      }),
    });
  });

  it('does not retry execution when audit persistence fails', async () => {
    const prisma = {
      aiActionLog: {
        create: vi.fn().mockRejectedValue(new Error('database unavailable')),
        findUnique: vi.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaClient;
    const execute = vi.fn().mockResolvedValue({ success: true, action: 'channel_created' });
    const registry = createRegistry({ name: 'create_channel', risk: 'write', execute });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await executeTool({
      registry,
      context: createContext(prisma),
      name: 'create_channel',
      input: { idempotencyKey: 'retry-safe' },
    });

    expect(execute).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  it('records a failure when tool execution throws', async () => {
    const create = vi.fn().mockResolvedValue({});
    const prisma = {
      aiActionLog: { create, findUnique: vi.fn() },
    } as unknown as PrismaClient;
    const execute = vi.fn().mockRejectedValue(new AgentError('SERVER_NOT_FOUND', 'Server not found'));
    const registry = createRegistry({ name: 'get_server_status', risk: 'read', execute });

    await expect(executeTool({
      registry,
      context: createContext(prisma),
      name: 'get_server_status',
      input: {},
    })).rejects.toEqual(expect.objectContaining<Partial<AgentError>>({ code: 'SERVER_NOT_FOUND' }));

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'failure',
        errorCode: 'SERVER_NOT_FOUND',
      }),
    });
  });
});
