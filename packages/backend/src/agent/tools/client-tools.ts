import { z } from 'zod';
import {
  banClient,
  getClient,
  kickClient,
  listClients,
  moveClient,
  pokeClient,
} from '../../services/client-management.service.js';
import { defineTool, type AgentToolDefinition } from '../tool-definition.js';
import { mutationScope, positiveId, virtualServerScope } from './schemas.js';

const targetSchema = z.object(virtualServerScope).strict();

/**
 * `includeIp` is never forwarded from tool input: the agent must not be able
 * to ask for client addresses, so the service default (stripped) always wins.
 */
export const clientTools: AgentToolDefinition[] = [
  defineTool({
    name: 'list_clients',
    description:
      'List the clients currently online on one virtual server with their nickname, channel, unique id and groups. IP addresses are never returned.',
    inputSchema: targetSchema,
    risk: 'read',
    run: async (context, input) => ({
      success: true,
      action: 'clients_listed',
      clients: await listClients(
        context.prisma,
        context.connectionPool,
        input.serverConfigId,
        input.virtualServerId,
      ),
    }),
  }),

  defineTool({
    name: 'get_client',
    description:
      'Read the full record of one online client, named by its session id (clid). IP addresses are never returned.',
    inputSchema: z.object({ ...virtualServerScope, clid: positiveId }).strict(),
    risk: 'read',
    run: async (context, input) => ({
      success: true,
      action: 'client_read',
      client: await getClient(
        context.prisma,
        context.connectionPool,
        input.serverConfigId,
        input.virtualServerId,
        input.clid,
      ),
    }),
  }),

  defineTool({
    name: 'move_client',
    description: 'Move an online client into another channel of the same virtual server.',
    inputSchema: z.object({ ...mutationScope, clid: positiveId, cid: positiveId }).strict(),
    risk: 'write',
    run: async (context, input) => {
      await moveClient(
        context.prisma,
        context.connectionPool,
        input.serverConfigId,
        input.virtualServerId,
        input.clid,
        input.cid,
      );
      return { success: true, action: 'client_moved', clid: input.clid, cid: input.cid };
    },
  }),

  defineTool({
    name: 'poke_client',
    description: 'Send a poke: a short message that pops up on one online client.',
    inputSchema: z
      .object({ ...mutationScope, clid: positiveId, msg: z.string().min(1).max(100) })
      .strict(),
    risk: 'write',
    run: async (context, input) => {
      await pokeClient(
        context.prisma,
        context.connectionPool,
        input.serverConfigId,
        input.virtualServerId,
        input.clid,
        input.msg,
      );
      return { success: true, action: 'client_poked', clid: input.clid };
    },
  }),

  defineTool({
    name: 'kick_client',
    description:
      'Kick an online client from the virtual server. The client can reconnect immediately.',
    inputSchema: z
      .object({ ...mutationScope, clid: positiveId, reason: z.string().max(80).optional() })
      .strict(),
    risk: 'destructive',
    run: async (context, input) => {
      await kickClient(
        context.prisma,
        context.connectionPool,
        input.serverConfigId,
        input.virtualServerId,
        input.clid,
        { reasonmsg: input.reason },
      );
      return { success: true, action: 'client_kicked', clid: input.clid };
    },
  }),

  defineTool({
    name: 'ban_client',
    description:
      'Ban an online client from the virtual server. Duration is in seconds; 0 means permanent.',
    inputSchema: z
      .object({
        ...mutationScope,
        clid: positiveId,
        time: z.number().int().nonnegative().optional(),
        reason: z.string().max(80).optional(),
      })
      .strict(),
    risk: 'destructive',
    run: async (context, input) => {
      await banClient(
        context.prisma,
        context.connectionPool,
        input.serverConfigId,
        input.virtualServerId,
        input.clid,
        { time: input.time, banreason: input.reason },
      );
      return { success: true, action: 'client_banned', clid: input.clid };
    },
  }),
];
