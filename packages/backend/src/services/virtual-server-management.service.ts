import type { PrismaClient } from '../../generated/prisma/index.js';
import { pickFields } from './channel-management.service.js';
import { resolveServerTarget, type WebQueryPool } from './server-resolver.js';

/**
 * Safe `serveredit` fields. Mirrors `virtual-servers.routes.ts`'s
 * `ALLOWED_SERVER_EDIT_PARAMS`, minus `virtualserver_password`: the agent
 * gateway never lets a model set or read the server's join password.
 */
export const VIRTUAL_SERVER_EDIT_FIELDS = [
  'virtualserver_name',
  'virtualserver_welcomemessage',
  'virtualserver_maxclients',
  'virtualserver_hostmessage',
  'virtualserver_hostmessage_mode',
  'virtualserver_default_server_group',
  'virtualserver_default_channel_group',
  'virtualserver_default_channel_admin_group',
  'virtualserver_hostbanner_url',
  'virtualserver_hostbanner_gfx_url',
  'virtualserver_hostbanner_gfx_interval',
  'virtualserver_hostbanner_mode',
  'virtualserver_hostbutton_tooltip',
  'virtualserver_hostbutton_url',
  'virtualserver_hostbutton_gfx_url',
  'virtualserver_icon_id',
  'virtualserver_codec_encryption_mode',
  'virtualserver_needed_identity_security_level',
  'virtualserver_min_client_version',
  'virtualserver_antiflood_points_tick_reduce',
  'virtualserver_antiflood_points_needed_command_block',
  'virtualserver_antiflood_points_needed_ip_block',
  'virtualserver_log_client',
  'virtualserver_log_query',
  'virtualserver_log_channel',
  'virtualserver_log_permissions',
  'virtualserver_log_server',
  'virtualserver_log_filetransfer',
] as const;

export async function editVirtualServer(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  fields: Record<string, unknown>,
): Promise<unknown> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return client.execute(sid, 'serveredit', pickFields(fields, VIRTUAL_SERVER_EDIT_FIELDS));
}
