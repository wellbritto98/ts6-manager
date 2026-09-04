import { z } from 'zod';
import {
  disableBotFlow,
  enableBotFlow,
  getBotFlow,
  listBotFlows,
} from '../../services/bot-flow-management.service.js';
import { defineTool, type AgentToolDefinition } from '../tool-definition.js';
import { idempotencyKey, positiveId } from './schemas.js';

/**
 * Flows can only be listed, read and toggled. There is no run tool:
 * `BotEngine.executeFlow` is private and has no safe manual entry point, so
 * `run_bot_flow` is on the registry's forbidden list.
 */
const flowMutationSchema = z.object({ flowId: positiveId, idempotencyKey }).strict();

export const flowTools: AgentToolDefinition[] = [
  defineTool({
    name: 'list_bot_flows',
    description:
      'List the bot automation flows with their id, name, target server and whether they are enabled. The flow graph itself is not returned.',
    inputSchema: z.object({}).strict(),
    risk: 'read',
    run: async (context) => ({
      success: true,
      action: 'bot_flows_listed',
      flows: await listBotFlows(context.prisma),
    }),
  }),

  defineTool({
    name: 'get_bot_flow',
    description:
      'Read one bot flow: its metadata plus the flow graph with credential-named fields redacted.',
    inputSchema: z.object({ flowId: positiveId }).strict(),
    risk: 'read',
    run: async (context, input) => ({
      success: true,
      action: 'bot_flow_read',
      flow: await getBotFlow(context.prisma, input.flowId),
    }),
  }),

  defineTool({
    name: 'enable_bot_flow',
    description: 'Enable a bot flow so the engine starts reacting to its triggers.',
    inputSchema: flowMutationSchema,
    risk: 'write',
    run: async (context, input) => {
      await enableBotFlow(context.prisma, context.botEngine, input.flowId);
      return { success: true, action: 'bot_flow_enabled', flowId: input.flowId };
    },
  }),

  defineTool({
    name: 'disable_bot_flow',
    description: 'Disable a bot flow so the engine stops reacting to its triggers.',
    inputSchema: flowMutationSchema,
    risk: 'destructive',
    run: async (context, input) => {
      await disableBotFlow(context.prisma, context.botEngine, input.flowId);
      return { success: true, action: 'bot_flow_disabled', flowId: input.flowId };
    },
  }),
];
