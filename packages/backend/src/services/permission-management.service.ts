import type { PrismaClient } from '../../generated/prisma/index.js';
import { filterRegularServerGroups } from '../utils/server-group-filter.js';
import {
  asRecordArray,
  requirePositiveInt,
  resolveServerTarget,
  type WebQueryPool,
} from './server-resolver.js';
import { AgentError } from '../agent/agent-error.js';

export { removeChannelPermission, setChannelPermission } from './channel-management.service.js';

export interface PermissionQuery {
  permsid?: string;
  permid?: number;
}

export interface PermissionOverviewOptions {
  cid?: number;
  permid?: number;
}

export interface GroupMembershipResult {
  alreadyInDesiredState: boolean;
  result?: unknown;
}

export async function findPermission(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  query: PermissionQuery,
): Promise<unknown> {
  if (query.permsid === undefined && query.permid === undefined) {
    throw new AgentError('INVALID_INPUT', 'permsid or permid is required');
  }
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return client.execute(sid, 'permfind', { permsid: query.permsid, permid: query.permid });
}

export async function getPermissionOverview(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  cldbid: unknown,
  options: PermissionOverviewOptions = {},
): Promise<unknown> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return client.execute(sid, 'permoverview', {
    cldbid: String(requirePositiveInt(cldbid, 'cldbid')),
    cid: options.cid ?? 0,
    permid: options.permid ?? 0,
  });
}

export async function listServerGroups(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
): Promise<unknown> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return filterRegularServerGroups(await client.execute(sid, 'servergrouplist'));
}

export async function listChannelGroups(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
): Promise<unknown> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return client.execute(sid, 'channelgrouplist');
}

export async function listServerGroupMembers(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  sgid: unknown,
): Promise<Array<Record<string, unknown>>> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return asRecordArray(await client.execute(sid, 'servergroupclientlist', {
    sgid: String(requirePositiveInt(sgid, 'sgid')),
    '-names': '',
  }));
}

/**
 * Add a client to a server group. A client that already holds the group is
 * reported as such and the TeamSpeak command is not repeated, which keeps a
 * retried tool call from producing a second side effect.
 */
export async function addClientToServerGroup(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  sgid: unknown,
  cldbid: unknown,
): Promise<GroupMembershipResult> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  const groupId = String(requirePositiveInt(sgid, 'sgid'));
  const clientDbId = String(requirePositiveInt(cldbid, 'cldbid'));

  const members = asRecordArray(await client.execute(sid, 'servergroupclientlist', { sgid: groupId }));
  if (members.some((member) => String(member.cldbid) === clientDbId)) {
    return { alreadyInDesiredState: true };
  }

  const result = await client.execute(sid, 'servergroupaddclient', { sgid: groupId, cldbid: clientDbId });
  return { alreadyInDesiredState: false, result };
}

export async function removeClientFromServerGroup(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  sgid: unknown,
  cldbid: unknown,
): Promise<unknown> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return client.execute(sid, 'servergroupdelclient', {
    sgid: String(requirePositiveInt(sgid, 'sgid')),
    cldbid: String(requirePositiveInt(cldbid, 'cldbid')),
  });
}
