import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/index.js';
import type { AppError } from '../middleware/error-handler.js';
import * as flowService from './bot-flow-management.service.js';
import {
  disableBotFlow,
  enableBotFlow,
  getBotFlow,
  listBotFlows,
  type FlowEngine,
} from './bot-flow-management.service.js';

const FLOW_ID = 4;

const FLOW_GRAPH = {
  nodes: [
    { id: 'n1', type: 'trigger_event', config: { path: '/hook', secret: 'webhook-secret-value' } },
    { id: 'n2', type: 'action_http', config: { url: 'https://example.com', headers: { Authorization: 'Bearer abc123' } } },
  ],
  edges: [],
};

const FLOW_ROW = {
  id: FLOW_ID,
  name: 'Greeter',
  description: 'welcomes clients',
  flowData: JSON.stringify(FLOW_GRAPH),
  serverConfigId: 1,
  virtualServerId: 2,
  enabled: false,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-02-01T00:00:00Z'),
};

function createFakes(row: typeof FLOW_ROW | null = FLOW_ROW) {
  const findMany = vi.fn().mockResolvedValue(row ? [{ ...row, _count: { executions: 9 } }] : []);
  const findUnique = vi.fn().mockResolvedValue(row);
  const update = vi.fn().mockResolvedValue({});
  const prisma = { botFlow: { findMany, findUnique, update } } as unknown as PrismaClient;
  const engine: FlowEngine = { enableFlow: vi.fn(), disableFlow: vi.fn() };
  return { prisma, engine, findMany, update };
}

describe('listBotFlows', () => {
  it('returns flow metadata with the execution count and no flow graph', async () => {
    const { prisma } = createFakes();

    const flows = await listBotFlows(prisma);

    expect(flows).toEqual([{
      id: FLOW_ID,
      name: 'Greeter',
      description: 'welcomes clients',
      serverConfigId: 1,
      virtualServerId: 2,
      enabled: false,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-02-01T00:00:00Z'),
      executionCount: 9,
    }]);
    expect(Object.keys(flows[0])).not.toContain('flowData');
  });
});

describe('getBotFlow', () => {
  it('returns the parsed graph with the webhook secret and auth header redacted', async () => {
    const { prisma } = createFakes();

    const flow = await getBotFlow(prisma, FLOW_ID);

    expect(flow.flowData).toEqual({
      nodes: [
        { id: 'n1', type: 'trigger_event', config: { path: '/hook', secret: '[REDACTED]' } },
        {
          id: 'n2',
          type: 'action_http',
          config: { url: 'https://example.com', headers: { Authorization: '[REDACTED]' } },
        },
      ],
      edges: [],
    });
    expect(JSON.stringify(flow.flowData)).not.toContain('webhook-secret-value');
    expect(JSON.stringify(flow.flowData)).not.toContain('Bearer abc123');
    expect(flow).toMatchObject({ id: FLOW_ID, name: 'Greeter', enabled: false, virtualServerId: 2 });
  });

  it('returns the raw graph when the editor asks for it', async () => {
    const { prisma } = createFakes();

    const flow = await getBotFlow(prisma, FLOW_ID, { redactSecrets: false });

    expect(flow.flowData).toEqual(FLOW_GRAPH);
  });

  it('fails with a 404 when the flow does not exist', async () => {
    const { prisma } = createFakes(null);

    await expect(getBotFlow(prisma, FLOW_ID)).rejects.toEqual(
      expect.objectContaining<Partial<AppError>>({ statusCode: 404, message: 'Bot flow not found' }),
    );
  });
});

describe('enableBotFlow / disableBotFlow', () => {
  it('enables the flow in the database and in the engine', async () => {
    const { prisma, engine, update } = createFakes();

    await expect(enableBotFlow(prisma, engine, FLOW_ID)).resolves.toEqual({ enabled: true });
    expect(update).toHaveBeenCalledWith({ where: { id: FLOW_ID }, data: { enabled: true } });
    expect(engine.enableFlow).toHaveBeenCalledWith(FLOW_ID);
  });

  it('disables the flow in the database and in the engine', async () => {
    const { prisma, engine, update } = createFakes();

    await expect(disableBotFlow(prisma, engine, FLOW_ID)).resolves.toEqual({ enabled: false });
    expect(update).toHaveBeenCalledWith({ where: { id: FLOW_ID }, data: { enabled: false } });
    expect(engine.disableFlow).toHaveBeenCalledWith(FLOW_ID);
  });

  it('still persists the flag when no engine is wired', async () => {
    const { prisma, update } = createFakes();

    await expect(enableBotFlow(prisma, undefined, FLOW_ID)).resolves.toEqual({ enabled: true });
    expect(update).toHaveBeenCalledWith({ where: { id: FLOW_ID }, data: { enabled: true } });
  });
});

describe('flow execution surface', () => {
  it('exposes no way to run a flow', () => {
    expect(Object.keys(flowService).filter((name) => /^(execute|run)/i.test(name))).toEqual([]);
  });
});
