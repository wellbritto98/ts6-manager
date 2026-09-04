import { z } from 'zod';
import {
  assignClientChannelGroup,
  createChannelGroup,
  deleteChannelGroup,
  listChannelGroupMembers,
  listChannelGroupPermissions,
  removeChannelGroupPermission,
  renameChannelGroup,
  setChannelGroupPermission,
} from '../../services/channel-group-management.service.js';
import { defineTool, type AgentToolDefinition } from '../tool-definition.js';
import { mutationScope, positiveId, virtualServerScope } from './schemas.js';

const permissionRef = {
  permsid: z.string().min(1).max(64).optional(),
  permid: z.number().int().nonnegative().optional(),
};

const channelGroupType = z.union([z.literal(0), z.literal(1), z.literal(2)]);

export const channelGroupTools: AgentToolDefinition[] = [
  defineTool({
    name: 'list_channel_group_permissions',
    description: 'List every permission assigned directly to one channel group.',
    inputSchema: z.object({ ...virtualServerScope, cgid: positiveId }).strict(),
    risk: 'read',
    run: async (context, input) => ({
      success: true,
      action: 'channel_group_permissions_listed',
      permissions: await listChannelGroupPermissions(
        context.prisma,
        context.connectionPool,
        input.serverConfigId,
        input.virtualServerId,
        input.cgid,
      ),
    }),
  }),

  defineTool({
    name: 'set_channel_group_permission',
    description: 'Set one permission on one channel group, named by permission name (permsid) or numeric id (permid).',
    inputSchema: z
      .object({ ...mutationScope, cgid: positiveId, ...permissionRef, permvalue: z.number().int() })
      .strict(),
    risk: 'write',
    run: async (context, input) => {
      await setChannelGroupPermission(
        context.prisma,
        context.connectionPool,
        input.serverConfigId,
        input.virtualServerId,
        input.cgid,
        input,
      );
      return {
        success: true,
        action: 'channel_group_permission_set',
        cgid: input.cgid,
        permsid: input.permsid,
        permid: input.permid,
        permvalue: input.permvalue,
      };
    },
  }),

  defineTool({
    name: 'remove_channel_group_permission',
    description: 'Remove one permission from one channel group, restoring the inherited value.',
    inputSchema: z.object({ ...mutationScope, cgid: positiveId, ...permissionRef }).strict(),
    risk: 'destructive',
    run: async (context, input) => {
      await removeChannelGroupPermission(
        context.prisma,
        context.connectionPool,
        input.serverConfigId,
        input.virtualServerId,
        input.cgid,
        input,
      );
      return {
        success: true,
        action: 'channel_group_permission_removed',
        cgid: input.cgid,
        permsid: input.permsid,
        permid: input.permid,
      };
    },
  }),

  defineTool({
    name: 'create_channel_group',
    description: 'Create a new channel group. type defaults to 1 (regular, assignable).',
    inputSchema: z.object({ ...mutationScope, name: z.string().min(1).max(40), type: channelGroupType.optional() }).strict(),
    risk: 'write',
    run: async (context, input) => {
      const created = await createChannelGroup(
        context.prisma,
        context.connectionPool,
        input.serverConfigId,
        input.virtualServerId,
        input,
      );
      return { success: true, action: 'channel_group_created', cgid: Number(created.cgid), name: input.name };
    },
  }),

  defineTool({
    name: 'rename_channel_group',
    description: 'Rename an existing channel group.',
    inputSchema: z.object({ ...mutationScope, cgid: positiveId, name: z.string().min(1).max(40) }).strict(),
    risk: 'write',
    run: async (context, input) => {
      await renameChannelGroup(
        context.prisma,
        context.connectionPool,
        input.serverConfigId,
        input.virtualServerId,
        input.cgid,
        input.name,
      );
      return { success: true, action: 'channel_group_renamed', cgid: input.cgid, name: input.name };
    },
  }),

  defineTool({
    name: 'delete_channel_group',
    description: 'Delete a channel group and every permission it held.',
    inputSchema: z.object({ ...mutationScope, cgid: positiveId }).strict(),
    risk: 'destructive',
    run: async (context, input) => {
      await deleteChannelGroup(
        context.prisma,
        context.connectionPool,
        input.serverConfigId,
        input.virtualServerId,
        input.cgid,
      );
      return { success: true, action: 'channel_group_deleted', cgid: input.cgid };
    },
  }),

  defineTool({
    name: 'assign_client_channel_group',
    description: 'Assign a client database id to a channel group within one channel.',
    inputSchema: z.object({ ...mutationScope, cgid: positiveId, cid: positiveId, cldbid: positiveId }).strict(),
    risk: 'write',
    run: async (context, input) => {
      await assignClientChannelGroup(
        context.prisma,
        context.connectionPool,
        input.serverConfigId,
        input.virtualServerId,
        input.cgid,
        input.cid,
        input.cldbid,
      );
      return {
        success: true,
        action: 'client_channel_group_assigned',
        cgid: input.cgid,
        cid: input.cid,
        cldbid: input.cldbid,
      };
    },
  }),

  defineTool({
    name: 'list_channel_group_members',
    description: 'List the clients currently holding one channel group.',
    inputSchema: z.object({ ...virtualServerScope, cgid: positiveId }).strict(),
    risk: 'read',
    run: async (context, input) => ({
      success: true,
      action: 'channel_group_members_listed',
      members: await listChannelGroupMembers(
        context.prisma,
        context.connectionPool,
        input.serverConfigId,
        input.virtualServerId,
        input.cgid,
      ),
    }),
  }),
];
