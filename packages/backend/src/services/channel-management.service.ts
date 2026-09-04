import type { PrismaClient } from '../../generated/prisma/index.js';
import {
  requirePositiveInt,
  resolveServerTarget,
  type WebQueryPool,
} from './server-resolver.js';

/**
 * The only channel properties a caller may set. The REST UI sends exactly
 * these, and forwarding anything else would let a caller reach WebQuery
 * properties the product never exposes.
 */
export const CHANNEL_WRITE_FIELDS = [
  'channel_name',
  'channel_flag_permanent',
  'channel_flag_semi_permanent',
  'channel_topic',
  'channel_password',
  'cpid',
] as const;

const CHANNEL_MOVE_FIELDS = ['cpid'] as const;
const CHANNEL_PERM_SET_FIELDS = ['permsid', 'permid', 'permvalue'] as const;
const CHANNEL_PERM_REMOVE_FIELDS = ['permsid', 'permid'] as const;

const CHANNEL_LIST_FLAGS: Record<string, string> = {
  '-topic': '',
  '-flags': '',
  '-voice': '',
  '-limits': '',
  '-icon': '',
  '-secondsempty': '',
};

export type ChannelFields = Record<string, unknown>;

export async function listChannels(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
): Promise<unknown> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return client.execute(sid, 'channellist', { ...CHANNEL_LIST_FLAGS });
}

export async function getChannel(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  cid: unknown,
): Promise<unknown> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return client.execute(sid, 'channelinfo', { cid: String(requirePositiveInt(cid, 'cid')) });
}

export async function createChannel(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  fields: ChannelFields,
): Promise<unknown> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return client.execute(sid, 'channelcreate', pickFields(fields, CHANNEL_WRITE_FIELDS));
}

export async function editChannel(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  cid: unknown,
  fields: ChannelFields,
): Promise<unknown> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return client.execute(sid, 'channeledit', {
    cid: String(requirePositiveInt(cid, 'cid')),
    ...pickFields(fields, CHANNEL_WRITE_FIELDS),
  });
}

export async function moveChannel(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  cid: unknown,
  fields: ChannelFields,
): Promise<unknown> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return client.execute(sid, 'channelmove', {
    cid: String(requirePositiveInt(cid, 'cid')),
    ...pickFields(fields, CHANNEL_MOVE_FIELDS),
  });
}

export async function deleteChannel(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  cid: unknown,
  force: unknown = 1,
): Promise<unknown> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return client.execute(sid, 'channeldelete', {
    cid: String(requirePositiveInt(cid, 'cid')),
    force: force ?? 1,
  });
}

export async function setChannelPermission(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  cid: unknown,
  fields: ChannelFields,
): Promise<unknown> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return client.execute(sid, 'channeladdperm', {
    cid: String(requirePositiveInt(cid, 'cid')),
    ...pickFields(fields, CHANNEL_PERM_SET_FIELDS),
  });
}

export async function removeChannelPermission(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  cid: unknown,
  fields: ChannelFields,
): Promise<unknown> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return client.execute(sid, 'channeldelperm', {
    cid: String(requirePositiveInt(cid, 'cid')),
    ...pickFields(fields, CHANNEL_PERM_REMOVE_FIELDS),
  });
}

/** Copy only allowlisted keys; a present `0` (channel root) still counts. */
export function pickFields(
  source: ChannelFields,
  allowed: readonly string[],
): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const key of allowed) {
    if (source[key] !== undefined) picked[key] = source[key];
  }
  return picked;
}
