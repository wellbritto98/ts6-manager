import type { PrismaClient } from '../../generated/prisma/index.js';
import { pickFields } from './channel-management.service.js';
import {
  asRecord,
  asRecordArray,
  listOrEmpty,
  requirePositiveInt,
  resolveServerTarget,
  type WebQueryPool,
} from './server-resolver.js';

const CHANNEL_GROUP_PERM_SET_FIELDS = ['permsid', 'permid', 'permvalue'] as const;
const CHANNEL_GROUP_PERM_REMOVE_FIELDS = ['permsid', 'permid'] as const;

export type ChannelGroupPermissionFields = Record<string, unknown>;

export async function listChannelGroupPermissions(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  cgid: unknown,
): Promise<unknown> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return listOrEmpty(async () => asRecordArray(await client.execute(sid, 'channelgrouppermlist', {
    cgid: String(requirePositiveInt(cgid, 'cgid')),
    '-permsid': '',
  })));
}

export async function setChannelGroupPermission(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  cgid: unknown,
  fields: ChannelGroupPermissionFields,
): Promise<unknown> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return client.execute(sid, 'channelgroupaddperm', {
    cgid: String(requirePositiveInt(cgid, 'cgid')),
    ...pickFields(fields, CHANNEL_GROUP_PERM_SET_FIELDS),
  });
}

export async function removeChannelGroupPermission(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  cgid: unknown,
  fields: ChannelGroupPermissionFields,
): Promise<unknown> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return client.execute(sid, 'channelgroupdelperm', {
    cgid: String(requirePositiveInt(cgid, 'cgid')),
    ...pickFields(fields, CHANNEL_GROUP_PERM_REMOVE_FIELDS),
  });
}

export async function createChannelGroup(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  fields: { name: string; type?: number },
): Promise<Record<string, unknown>> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return asRecord(await client.execute(sid, 'channelgroupadd', { name: fields.name, type: fields.type }));
}

export async function renameChannelGroup(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  cgid: unknown,
  name: string,
): Promise<unknown> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return client.execute(sid, 'channelgrouprename', { cgid: String(requirePositiveInt(cgid, 'cgid')), name });
}

export async function deleteChannelGroup(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  cgid: unknown,
): Promise<unknown> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return client.execute(sid, 'channelgroupdel', { cgid: String(requirePositiveInt(cgid, 'cgid')), force: 1 });
}

export async function assignClientChannelGroup(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  cgid: unknown,
  cid: unknown,
  cldbid: unknown,
): Promise<unknown> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return client.execute(sid, 'setclientchannelgroup', {
    cgid: String(requirePositiveInt(cgid, 'cgid')),
    cid: String(requirePositiveInt(cid, 'cid')),
    cldbid: String(requirePositiveInt(cldbid, 'cldbid')),
  });
}

export async function listChannelGroupMembers(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  cgid: unknown,
): Promise<unknown> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return listOrEmpty(async () =>
    asRecordArray(await client.execute(sid, 'channelgroupclientlist', { cgid: String(requirePositiveInt(cgid, 'cgid')) })),
  );
}
