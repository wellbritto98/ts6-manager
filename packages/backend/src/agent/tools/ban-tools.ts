import { z } from 'zod';
import { addBan, listBans, removeAllBans, removeBan } from '../../services/ban-management.service.js';
import { defineTool, type AgentToolDefinition } from '../tool-definition.js';
import { mutationScope, positiveId, virtualServerScope } from './schemas.js';

export const banTools: AgentToolDefinition[] = [
  defineTool({
    name: 'list_bans',
    description: 'List the ban entries on one virtual server. IP addresses are never returned.',
    inputSchema: z.object(virtualServerScope).strict(),
    risk: 'read',
    run: async (context, input) => ({
      success: true,
      action: 'bans_listed',
      bans: await listBans(context.prisma, context.connectionPool, input.serverConfigId, input.virtualServerId),
    }),
  }),

  defineTool({
    name: 'add_ban',
    description:
      'Ban an IP, client unique id, or nickname from one virtual server. At least one of ip, uid or name is required. time is the duration in seconds (0 or omitted means permanent).',
    inputSchema: z
      .object({
        ...mutationScope,
        ip: z.string().max(45).optional(),
        name: z.string().max(64).optional(),
        uid: z.string().max(64).optional(),
        time: z.number().int().nonnegative().optional(),
        reason: z.string().max(200).optional(),
      })
      .strict(),
    risk: 'destructive',
    run: async (context, input) => {
      const created = await addBan(context.prisma, context.connectionPool, input.serverConfigId, input.virtualServerId, input);
      return { success: true, action: 'ban_added', ban: created };
    },
  }),

  defineTool({
    name: 'remove_ban',
    description: 'Remove one ban entry by its banid.',
    inputSchema: z.object({ ...mutationScope, banid: positiveId }).strict(),
    risk: 'destructive',
    run: async (context, input) => {
      await removeBan(context.prisma, context.connectionPool, input.serverConfigId, input.virtualServerId, input.banid);
      return { success: true, action: 'ban_removed', banid: input.banid };
    },
  }),

  defineTool({
    name: 'remove_all_bans',
    description: 'Remove every ban entry on one virtual server. Cannot be undone.',
    inputSchema: z.object(mutationScope).strict(),
    risk: 'destructive',
    run: async (context, input) => {
      await removeAllBans(context.prisma, context.connectionPool, input.serverConfigId, input.virtualServerId);
      return { success: true, action: 'all_bans_removed' };
    },
  }),
];
