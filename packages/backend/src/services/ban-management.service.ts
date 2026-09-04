import type { PrismaClient } from '../../generated/prisma/index.js';
import { pickFields } from './channel-management.service.js';
import {
  asRecordArray,
  listOrEmpty,
  requirePositiveInt,
  resolveServerTarget,
  type WebQueryPool,
} from './server-resolver.js';
import { AgentError } from '../agent/agent-error.js';

const BAN_ADD_FIELDS = ['ip', 'name', 'uid', 'time', 'banreason'] as const;

export interface AddBanFields {
  ip?: string;
  name?: string;
  uid?: string;
  time?: number;
  reason?: string;
}

/**
 * `banlist` always includes the banned IP; strip it, same convention as
 * `list_clients`. Also: TeamSpeak answers an empty ban list with TS error
 * 1281 (database_empty_result) instead of an empty body — verified live —
 * so that specific error means "no bans", not a failure.
 */
export async function listBans(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
): Promise<Array<Record<string, unknown>>> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  const bans = await listOrEmpty(async () => asRecordArray(await client.execute(sid, 'banlist')));
  return bans.map(stripBanIp);
}

export async function addBan(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  fields: AddBanFields,
): Promise<unknown> {
  if (!fields.ip && !fields.name && !fields.uid) {
    throw new AgentError('INVALID_INPUT', 'At least one of ip, name or uid is required');
  }
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  const mapped = { ...fields, banreason: fields.reason };
  return client.execute(sid, 'banadd', pickFields(mapped, BAN_ADD_FIELDS));
}

export async function removeBan(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  banid: unknown,
): Promise<unknown> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return client.execute(sid, 'bandel', { banid: String(requirePositiveInt(banid, 'banid')) });
}

export async function removeAllBans(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
): Promise<unknown> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return client.execute(sid, 'bandelall');
}

function stripBanIp(entry: Record<string, unknown>): Record<string, unknown> {
  if (!('ip' in entry)) return entry;
  const copy = { ...entry };
  delete copy.ip;
  return copy;
}
