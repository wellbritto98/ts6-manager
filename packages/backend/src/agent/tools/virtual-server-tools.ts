import { z } from 'zod';
import { editVirtualServer } from '../../services/virtual-server-management.service.js';
import { defineTool, type AgentToolDefinition } from '../tool-definition.js';
import { mutationScope } from './schemas.js';

const boolFlag = z.union([z.literal(0), z.literal(1)]);
const nonNegativeInt = z.number().int().nonnegative();

/**
 * `virtualserver_password` is deliberately absent: the agent gateway never
 * lets a model set the server's join password. Every other field mirrors
 * `virtual-servers.routes.ts`'s `ALLOWED_SERVER_EDIT_PARAMS`.
 */
export const virtualServerTools: AgentToolDefinition[] = [
  defineTool({
    name: 'edit_virtual_server',
    description:
      'Edit virtual server settings: name, welcome/host messages, banner/button branding, default groups (server/channel/channel-admin), client limits and logging flags. Never sets the server password.',
    inputSchema: z
      .object({
        ...mutationScope,
        virtualserver_name: z.string().min(1).max(64).optional(),
        virtualserver_welcomemessage: z.string().max(1024).optional(),
        virtualserver_maxclients: nonNegativeInt.optional(),
        virtualserver_hostmessage: z.string().max(200).optional(),
        virtualserver_hostmessage_mode: nonNegativeInt.optional(),
        virtualserver_default_server_group: nonNegativeInt.optional(),
        virtualserver_default_channel_group: nonNegativeInt.optional(),
        virtualserver_default_channel_admin_group: nonNegativeInt.optional(),
        virtualserver_hostbanner_url: z.string().max(500).optional(),
        virtualserver_hostbanner_gfx_url: z.string().max(500).optional(),
        virtualserver_hostbanner_gfx_interval: nonNegativeInt.optional(),
        virtualserver_hostbanner_mode: nonNegativeInt.optional(),
        virtualserver_hostbutton_tooltip: z.string().max(200).optional(),
        virtualserver_hostbutton_url: z.string().max(500).optional(),
        virtualserver_hostbutton_gfx_url: z.string().max(500).optional(),
        virtualserver_icon_id: z.number().int().optional(),
        virtualserver_codec_encryption_mode: nonNegativeInt.optional(),
        virtualserver_needed_identity_security_level: nonNegativeInt.optional(),
        virtualserver_min_client_version: nonNegativeInt.optional(),
        virtualserver_antiflood_points_tick_reduce: nonNegativeInt.optional(),
        virtualserver_antiflood_points_needed_command_block: nonNegativeInt.optional(),
        virtualserver_antiflood_points_needed_ip_block: nonNegativeInt.optional(),
        virtualserver_log_client: boolFlag.optional(),
        virtualserver_log_query: boolFlag.optional(),
        virtualserver_log_channel: boolFlag.optional(),
        virtualserver_log_permissions: boolFlag.optional(),
        virtualserver_log_server: boolFlag.optional(),
        virtualserver_log_filetransfer: boolFlag.optional(),
      })
      .strict(),
    risk: 'write',
    run: async (context, input) => {
      const { serverConfigId, virtualServerId, idempotencyKey: _idempotencyKey, ...fields } = input;
      await editVirtualServer(context.prisma, context.connectionPool, serverConfigId, virtualServerId, fields);
      return { success: true, action: 'virtual_server_edited', changed: Object.keys(fields) };
    },
  }),
];
