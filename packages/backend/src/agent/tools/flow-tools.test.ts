import { describe, expect, it, vi } from 'vitest';
import { flowTools } from './flow-tools.js';
import { createToolContext, findTool } from './tool-fakes.js';

const listBotFlows = findTool(flowTools, 'list_bot_flows');
const getBotFlow = findTool(flowTools, 'get_bot_flow');
const enableBotFlow = findTool(flowTools, 'enable_bot_flow');
const disableBotFlow = findTool(flowTools, 'disable_bot_flow');

const FLOW_ROW = {
  id: 3,
  name: 'Welcome',
  description: null,
  serverConfigId: 7,
  virtualServerId: 1,
  enabled: true,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  flowData: JSON.stringify({ nodes: [{ id: 'n1', config: { secret: 'super-secret-value' } }] }),
};

function createFakes() {
  const update = vi.fn();
  const engine = { enableFlow: vi.fn(), disableFlow: vi.fn() };
  const context = createToolContext({
    botEngine: engine,
    prisma: {
      botFlow: {
        findMany: async () => [{ ...FLOW_ROW, _count: { executions: 4 } }],
        findUnique: async ({ where }: { where: { id: number } }) =>
          (where.id === FLOW_ROW.id ? FLOW_ROW : null),
        update,
      },
    },
  });
  return { context, engine, update };
}

describe('list_bot_flows', () => {
  it('returns flow metadata without the flow graph', async () => {
    const { context } = createFakes();

    const result = await listBotFlows.execute(context, {});

    expect(result).toEqual({
      success: true,
      action: 'bot_flows_listed',
      flows: [{
        id: 3,
        name: 'Welcome',
        description: null,
        serverConfigId: 7,
        virtualServerId: 1,
        enabled: true,
        createdAt: new Date(0),
        updatedAt: new Date(0),
        executionCount: 4,
      }],
    });
    expect(JSON.stringify(result)).not.toContain('super-secret-value');
  });
});

describe('get_bot_flow', () => {
  it('returns one flow with credential-named fields redacted', async () => {
    const { context } = createFakes();

    const result = await getBotFlow.execute(context, { flowId: 3 });

    expect(result).toMatchObject({ success: true, action: 'bot_flow_read', flow: { id: 3, name: 'Welcome' } });
    expect(JSON.stringify(result)).not.toContain('super-secret-value');
    expect(JSON.stringify(result)).toContain('[REDACTED]');
  });

  it('reports an unknown flow as BOT_NOT_FOUND', async () => {
    const { context } = createFakes();

    await expect(getBotFlow.execute(context, { flowId: 99 }))
      .rejects.toMatchObject({ code: 'BOT_NOT_FOUND' });
  });
});

describe('enable_bot_flow and disable_bot_flow', () => {
  it('enables the flow in the database and in the engine', async () => {
    const { context, engine, update } = createFakes();

    await expect(enableBotFlow.execute(context, { flowId: 3 }))
      .resolves.toEqual({ success: true, action: 'bot_flow_enabled', flowId: 3 });
    expect(update).toHaveBeenCalledWith({ where: { id: 3 }, data: { enabled: true } });
    expect(engine.enableFlow).toHaveBeenCalledWith(3);
  });

  it('disables the flow and is registered as destructive', async () => {
    const { context, engine, update } = createFakes();

    expect(disableBotFlow.risk).toBe('destructive');
    await expect(disableBotFlow.execute(context, { flowId: 3 }))
      .resolves.toEqual({ success: true, action: 'bot_flow_disabled', flowId: 3 });
    expect(update).toHaveBeenCalledWith({ where: { id: 3 }, data: { enabled: false } });
    expect(engine.disableFlow).toHaveBeenCalledWith(3);
  });
});
