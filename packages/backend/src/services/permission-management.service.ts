import type { PrismaClient } from '../../generated/prisma/index.js';
import { filterRegularServerGroups } from '../utils/server-group-filter.js';
import {
  asRecord,
  asRecordArray,
  listOrEmpty,
  requirePositiveInt,
  resolveServerTarget,
  type WebQueryPool,
} from './server-resolver.js';
import { AgentError } from '../agent/agent-error.js';
import { pickFields } from './channel-management.service.js';

export { removeChannelPermission, setChannelPermission } from './channel-management.service.js';

const SERVER_GROUP_PERM_SET_FIELDS = ['permsid', 'permid', 'permvalue', 'permnegated', 'permskip'] as const;
const SERVER_GROUP_PERM_REMOVE_FIELDS = ['permsid', 'permid'] as const;

export type ServerGroupPermissionFields = Record<string, unknown>;

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

export async function listServerGroupPermissions(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  sgid: unknown,
): Promise<unknown> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return listOrEmpty(async () => asRecordArray(await client.execute(sid, 'servergrouppermlist', {
    sgid: String(requirePositiveInt(sgid, 'sgid')),
    '-permsid': '',
  })));
}

/**
 * TeamSpeak's WebQuery rejects `servergroupaddperm` with "parameter not
 * found" unless `permnegated` and `permskip` are BOTH present, even when the
 * caller only wants to set a value (verified live: this failed for a plain
 * read-only permission with no special negated/skip semantics, not just the
 * power permissions the caller was actually trying to set). Default both to
 * 0 so they behave like the TeamSpeak client's own defaults unless a caller
 * overrides them.
 */
export async function setServerGroupPermission(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  sgid: unknown,
  fields: ServerGroupPermissionFields,
): Promise<unknown> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return client.execute(sid, 'servergroupaddperm', {
    sgid: String(requirePositiveInt(sgid, 'sgid')),
    permnegated: 0,
    permskip: 0,
    ...pickFields(fields, SERVER_GROUP_PERM_SET_FIELDS),
  });
}

export async function removeServerGroupPermission(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  sgid: unknown,
  fields: ServerGroupPermissionFields,
): Promise<unknown> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return client.execute(sid, 'servergroupdelperm', {
    sgid: String(requirePositiveInt(sgid, 'sgid')),
    ...pickFields(fields, SERVER_GROUP_PERM_REMOVE_FIELDS),
  });
}

export async function createServerGroup(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  fields: { name: string; type?: number },
): Promise<Record<string, unknown>> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return asRecord(await client.execute(sid, 'servergroupadd', { name: fields.name, type: fields.type }));
}

export async function renameServerGroup(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  sgid: unknown,
  name: string,
): Promise<unknown> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return client.execute(sid, 'servergrouprename', { sgid: String(requirePositiveInt(sgid, 'sgid')), name });
}

export async function deleteServerGroup(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  sgid: unknown,
): Promise<unknown> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return client.execute(sid, 'servergroupdel', { sgid: String(requirePositiveInt(sgid, 'sgid')), force: 1 });
}

export interface CopyServerGroupOptions {
  tsgid?: number;
  name?: string;
  type?: number;
}

/**
 * `servergroupcopy`: `ssgid` is the source group. Omitting `tsgid` (or
 * passing 0) creates a brand-new target group, which TeamSpeak requires a
 * `name` for — checked here so a caller gets `INVALID_INPUT` instead of a
 * confusing TeamSpeak error.
 *
 * TeamSpeak's WebQuery rejects the command with "parameter not found" unless
 * `name` and `type` are BOTH present, even when copying onto an existing
 * group (`tsgid` nonzero) where they have no visible effect (verified
 * live: copying onto an existing group with a different `name` did not
 * rename it). To avoid ever depending on that being true forever, when
 * `tsgid` is set and the caller didn't name new values, the target group's
 * own current name/type are read back and resent unchanged — a no-op
 * regardless of how the server actually treats those fields in this mode.
 */
export async function copyServerGroupPermissions(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  ssgid: unknown,
  options: CopyServerGroupOptions,
): Promise<unknown> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  const source = String(requirePositiveInt(ssgid, 'ssgid'));
  const targetId = options.tsgid;

  if ((targetId === undefined || targetId === 0) && !options.name) {
    throw new AgentError('INVALID_INPUT', 'name is required when tsgid is omitted or 0 (creating a new group)');
  }

  let name = options.name;
  let type = options.type;
  if (targetId !== undefined && targetId !== 0 && (name === undefined || type === undefined)) {
    const groups = asRecordArray(await client.execute(sid, 'servergrouplist'));
    const target = groups.find((group) => String(group.sgid) === String(targetId));
    if (!target) {
      throw new AgentError('INVALID_INPUT', `Server group ${targetId} does not exist`);
    }
    name ??= String(target.name);
    type ??= Number(target.type);
  }

  return client.execute(sid, 'servergroupcopy', { ssgid: source, tsgid: targetId, name, type });
}
