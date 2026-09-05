import { z } from 'zod';
import {
  copyServerGroupPermissions,
  createServerGroup,
  deleteServerGroup,
  listServerGroupPermissions,
  removeServerGroupPermission,
  renameServerGroup,
  setServerGroupPermission,
} from '../../services/permission-management.service.js';
import { defineTool, type AgentToolDefinition } from '../tool-definition.js';
import { mutationScope, positiveId, virtualServerScope } from './schemas.js';

/** A permission is named by its string id or its numeric id; the service requires one. */
const permissionRef = {
  permsid: z.string().min(1).max(64).optional(),
  permid: z.number().int().nonnegative().optional(),
};

/** TeamSpeak defaults both to 0; expose them so a caller can opt into negated/skip semantics. */
const permFlag = z.union([z.literal(0), z.literal(1)]);

const serverGroupType = z.union([z.literal(0), z.literal(1), z.literal(2)]);

export const serverGroupTools: AgentToolDefinition[] = [
  defineTool({
    name: 'list_server_group_permissions',
    description: 'List every permission assigned directly to one server group.',
    inputSchema: z.object({ ...virtualServerScope, sgid: positiveId }).strict(),
    risk: 'read',
    run: async (context, input) => ({
      success: true,
      action: 'server_group_permissions_listed',
      permissions: await listServerGroupPermissions(
        context.prisma,
        context.connectionPool,
        input.serverConfigId,
        input.virtualServerId,
        input.sgid,
      ),
    }),
  }),

  defineTool({
    name: 'set_server_group_permission',
    description: 'Set one permission on one server group, named by permission name (permsid) or numeric id (permid).',
    inputSchema: z
      .object({
        ...mutationScope,
        sgid: positiveId,
        ...permissionRef,
        permvalue: z.number().int(),
        permnegated: permFlag.optional(),
        permskip: permFlag.optional(),
      })
      .strict(),
    risk: 'write',
    run: async (context, input) => {
      await setServerGroupPermission(
        context.prisma,
        context.connectionPool,
        input.serverConfigId,
        input.virtualServerId,
        input.sgid,
        input,
      );
      return {
        success: true,
        action: 'server_group_permission_set',
        sgid: input.sgid,
        permsid: input.permsid,
        permid: input.permid,
        permvalue: input.permvalue,
      };
    },
  }),

  defineTool({
    name: 'remove_server_group_permission',
    description: 'Remove one permission from one server group, restoring the inherited value.',
    inputSchema: z.object({ ...mutationScope, sgid: positiveId, ...permissionRef }).strict(),
    risk: 'destructive',
    run: async (context, input) => {
      await removeServerGroupPermission(
        context.prisma,
        context.connectionPool,
        input.serverConfigId,
        input.virtualServerId,
        input.sgid,
        input,
      );
      return {
        success: true,
        action: 'server_group_permission_removed',
        sgid: input.sgid,
        permsid: input.permsid,
        permid: input.permid,
      };
    },
  }),

  defineTool({
    name: 'copy_server_group_permissions',
    description:
      'Copy every permission from one server group (ssgid) onto another existing group (tsgid), or onto a brand-new group (omit tsgid or pass 0, and supply name).',
    inputSchema: z
      .object({
        ...mutationScope,
        ssgid: positiveId,
        tsgid: z.number().int().nonnegative().optional(),
        name: z.string().min(1).max(40).optional(),
        type: serverGroupType.optional(),
      })
      .strict(),
    risk: 'write',
    run: async (context, input) => {
      await copyServerGroupPermissions(
        context.prisma,
        context.connectionPool,
        input.serverConfigId,
        input.virtualServerId,
        input.ssgid,
        input,
      );
      return {
        success: true,
        action: 'server_group_permissions_copied',
        ssgid: input.ssgid,
        tsgid: input.tsgid,
      };
    },
  }),

  defineTool({
    name: 'create_server_group',
    description: 'Create a new server group. type defaults to 1 (regular, assignable).',
    inputSchema: z.object({ ...mutationScope, name: z.string().min(1).max(40), type: serverGroupType.optional() }).strict(),
    risk: 'write',
    run: async (context, input) => {
      const created = await createServerGroup(
        context.prisma,
        context.connectionPool,
        input.serverConfigId,
        input.virtualServerId,
        input,
      );
      return {
        success: true,
        action: 'server_group_created',
        sgid: Number(created.sgid),
        name: input.name,
      };
    },
  }),

  defineTool({
    name: 'rename_server_group',
    description: 'Rename an existing server group.',
    inputSchema: z.object({ ...mutationScope, sgid: positiveId, name: z.string().min(1).max(40) }).strict(),
    risk: 'write',
    run: async (context, input) => {
      await renameServerGroup(
        context.prisma,
        context.connectionPool,
        input.serverConfigId,
        input.virtualServerId,
        input.sgid,
        input.name,
      );
      return { success: true, action: 'server_group_renamed', sgid: input.sgid, name: input.name };
    },
  }),

  defineTool({
    name: 'delete_server_group',
    description: 'Delete a server group and every permission it held. Clients holding it lose those permissions.',
    inputSchema: z.object({ ...mutationScope, sgid: positiveId }).strict(),
    risk: 'destructive',
    run: async (context, input) => {
      await deleteServerGroup(
        context.prisma,
        context.connectionPool,
        input.serverConfigId,
        input.virtualServerId,
        input.sgid,
      );
      return { success: true, action: 'server_group_deleted', sgid: input.sgid };
    },
  }),
];
