import { z } from 'zod';
import {
  addClientToServerGroup,
  findPermission,
  getPermissionOverview,
  listChannelGroups,
  listServerGroups,
  removeChannelPermission,
  removeClientFromServerGroup,
  setChannelPermission,
} from '../../services/permission-management.service.js';
import { defineTool, type AgentToolDefinition } from '../tool-definition.js';
import { mutationScope, positiveId, virtualServerScope } from './schemas.js';

/** A permission is named by its string id or its numeric id; the service requires one. */
const permissionRef = {
  permsid: z.string().min(1).max(64).optional(),
  permid: z.number().int().nonnegative().optional(),
};

const targetSchema = z.object(virtualServerScope).strict();

export const permissionTools: AgentToolDefinition[] = [
  defineTool({
    name: 'find_permission',
    description:
      'Look up where a permission is granted on a virtual server, by permission name (permsid) or numeric id (permid).',
    inputSchema: z.object({ ...virtualServerScope, ...permissionRef }).strict(),
    risk: 'read',
    run: async (context, input) => ({
      success: true,
      action: 'permission_found',
      permissions: await findPermission(
        context.prisma,
        context.connectionPool,
        input.serverConfigId,
        input.virtualServerId,
        { permsid: input.permsid, permid: input.permid },
      ),
    }),
  }),

  defineTool({
    name: 'get_permission_overview',
    description:
      'Read the effective permissions of one client database id, optionally narrowed to a channel or a single permission.',
    inputSchema: z
      .object({
        ...virtualServerScope,
        cldbid: positiveId,
        cid: z.number().int().nonnegative().optional(),
        permid: z.number().int().nonnegative().optional(),
      })
      .strict(),
    risk: 'read',
    run: async (context, input) => ({
      success: true,
      action: 'permission_overview_read',
      permissions: await getPermissionOverview(
        context.prisma,
        context.connectionPool,
        input.serverConfigId,
        input.virtualServerId,
        input.cldbid,
        { cid: input.cid, permid: input.permid },
      ),
    }),
  }),

  defineTool({
    name: 'list_server_groups',
    description: 'List the regular server groups of one virtual server with their id and name.',
    inputSchema: targetSchema,
    risk: 'read',
    run: async (context, input) => ({
      success: true,
      action: 'server_groups_listed',
      groups: await listServerGroups(
        context.prisma,
        context.connectionPool,
        input.serverConfigId,
        input.virtualServerId,
      ),
    }),
  }),

  defineTool({
    name: 'list_channel_groups',
    description: 'List the channel groups of one virtual server with their id and name.',
    inputSchema: targetSchema,
    risk: 'read',
    run: async (context, input) => ({
      success: true,
      action: 'channel_groups_listed',
      groups: await listChannelGroups(
        context.prisma,
        context.connectionPool,
        input.serverConfigId,
        input.virtualServerId,
      ),
    }),
  }),

  defineTool({
    name: 'add_client_to_server_group',
    description:
      'Add a client database id to a server group. A client that already holds the group is reported as already in the desired state.',
    inputSchema: z.object({ ...mutationScope, sgid: positiveId, cldbid: positiveId }).strict(),
    risk: 'write',
    run: async (context, input) => {
      const { alreadyInDesiredState } = await addClientToServerGroup(
        context.prisma,
        context.connectionPool,
        input.serverConfigId,
        input.virtualServerId,
        input.sgid,
        input.cldbid,
      );
      return {
        success: true,
        action: alreadyInDesiredState ? 'already_in_desired_state' : 'client_added_to_server_group',
        sgid: input.sgid,
        cldbid: input.cldbid,
      };
    },
  }),

  defineTool({
    name: 'remove_client_from_server_group',
    description: 'Remove a client database id from a server group, revoking every permission it granted.',
    inputSchema: z.object({ ...mutationScope, sgid: positiveId, cldbid: positiveId }).strict(),
    risk: 'destructive',
    run: async (context, input) => {
      await removeClientFromServerGroup(
        context.prisma,
        context.connectionPool,
        input.serverConfigId,
        input.virtualServerId,
        input.sgid,
        input.cldbid,
      );
      return {
        success: true,
        action: 'client_removed_from_server_group',
        sgid: input.sgid,
        cldbid: input.cldbid,
      };
    },
  }),

  defineTool({
    name: 'set_channel_permission',
    description:
      'Set one permission on one channel, named by permission name (permsid) or numeric id (permid).',
    inputSchema: z
      .object({ ...mutationScope, cid: positiveId, ...permissionRef, permvalue: z.number().int() })
      .strict(),
    risk: 'write',
    run: async (context, input) => {
      await setChannelPermission(
        context.prisma,
        context.connectionPool,
        input.serverConfigId,
        input.virtualServerId,
        input.cid,
        input,
      );
      return {
        success: true,
        action: 'channel_permission_set',
        cid: input.cid,
        permsid: input.permsid,
        permid: input.permid,
        permvalue: input.permvalue,
      };
    },
  }),

  defineTool({
    name: 'remove_channel_permission',
    description: 'Remove one permission from one channel, restoring the inherited value.',
    inputSchema: z.object({ ...mutationScope, cid: positiveId, ...permissionRef }).strict(),
    risk: 'destructive',
    run: async (context, input) => {
      await removeChannelPermission(
        context.prisma,
        context.connectionPool,
        input.serverConfigId,
        input.virtualServerId,
        input.cid,
        input,
      );
      return {
        success: true,
        action: 'channel_permission_removed',
        cid: input.cid,
        permsid: input.permsid,
        permid: input.permid,
      };
    },
  }),
];
