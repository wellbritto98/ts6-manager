import { z } from 'zod';
import {
  createChannel,
  deleteChannel,
  editChannel,
  getChannel,
  listChannels,
  moveChannel,
} from '../../services/channel-management.service.js';
import { asRecord } from '../../services/server-resolver.js';
import { defineTool, type AgentToolDefinition } from '../tool-definition.js';
import { mutationScope, positiveId, virtualServerScope } from './schemas.js';

/** TeamSpeak flags are numeric; the service forwards these values verbatim. */
const channelFlag = z.union([z.literal(0), z.literal(1)]);

/**
 * The only channel properties a caller may set, mirroring
 * `CHANNEL_WRITE_FIELDS` in the channel service. Anything else is rejected
 * by `.strict()` instead of being silently dropped.
 */
const channelWriteFields = {
  channel_flag_permanent: channelFlag.optional(),
  channel_flag_semi_permanent: channelFlag.optional(),
  channel_topic: z.string().max(255).optional(),
  channel_password: z.string().max(128).optional(),
  cpid: z.number().int().nonnegative().optional(),
};

const targetSchema = z.object(virtualServerScope).strict();

export const channelTools: AgentToolDefinition[] = [
  defineTool({
    name: 'list_channels',
    description: 'List every channel of one virtual server with its topic, flags, limits and order.',
    inputSchema: targetSchema,
    risk: 'read',
    run: async (context, input) => ({
      success: true,
      action: 'channels_listed',
      channels: await listChannels(
        context.prisma,
        context.connectionPool,
        input.serverConfigId,
        input.virtualServerId,
      ),
    }),
  }),

  defineTool({
    name: 'get_channel',
    description: 'Read the full property record of one channel, named by its channel id (cid).',
    inputSchema: z.object({ ...virtualServerScope, cid: positiveId }).strict(),
    risk: 'read',
    run: async (context, input) => ({
      success: true,
      action: 'channel_read',
      channel: await getChannel(
        context.prisma,
        context.connectionPool,
        input.serverConfigId,
        input.virtualServerId,
        input.cid,
      ),
    }),
  }),

  defineTool({
    name: 'create_channel',
    description:
      'Create a channel on one virtual server. Only channel_name, the permanent flags, topic, password and the parent id (cpid) can be set.',
    inputSchema: z
      .object({
        ...mutationScope,
        channel_name: z.string().min(1).max(40),
        ...channelWriteFields,
      })
      .strict(),
    risk: 'write',
    run: async (context, input) => {
      const created = asRecord(
        await createChannel(
          context.prisma,
          context.connectionPool,
          input.serverConfigId,
          input.virtualServerId,
          input,
        ),
      );
      return {
        success: true,
        action: 'channel_created',
        channelId: Number(created.cid),
        channelName: input.channel_name,
      };
    },
  }),

  defineTool({
    name: 'edit_channel',
    description:
      'Change properties of an existing channel. Only channel_name, the permanent flags, topic and password can be set.',
    inputSchema: z
      .object({
        ...mutationScope,
        cid: positiveId,
        channel_name: z.string().min(1).max(40).optional(),
        ...channelWriteFields,
      })
      .strict(),
    risk: 'write',
    run: async (context, input) => {
      await editChannel(
        context.prisma,
        context.connectionPool,
        input.serverConfigId,
        input.virtualServerId,
        input.cid,
        input,
      );
      return { success: true, action: 'channel_edited', channelId: input.cid };
    },
  }),

  defineTool({
    name: 'move_channel',
    description: 'Move a channel under a new parent channel. Use cpid 0 to move it to the server root.',
    inputSchema: z
      .object({ ...mutationScope, cid: positiveId, cpid: z.number().int().nonnegative() })
      .strict(),
    risk: 'write',
    run: async (context, input) => {
      await moveChannel(
        context.prisma,
        context.connectionPool,
        input.serverConfigId,
        input.virtualServerId,
        input.cid,
        input,
      );
      return { success: true, action: 'channel_moved', channelId: input.cid, cpid: input.cpid };
    },
  }),

  defineTool({
    name: 'delete_channel',
    description:
      'Delete a channel. With force true the channel is deleted even while clients are inside it. This cannot be undone.',
    inputSchema: z
      .object({ ...mutationScope, cid: positiveId, force: z.boolean().optional() })
      .strict(),
    risk: 'destructive',
    run: async (context, input) => {
      await deleteChannel(
        context.prisma,
        context.connectionPool,
        input.serverConfigId,
        input.virtualServerId,
        input.cid,
        input.force === false ? 0 : 1,
      );
      return { success: true, action: 'channel_deleted', channelId: input.cid };
    },
  }),
];
