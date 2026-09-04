import type { PrismaClient } from '../../generated/prisma/index.js';
import {
  asRecord,
  asRecordArray,
  requirePositiveInt,
  resolveServerTarget,
  type WebQueryPool,
} from './server-resolver.js';

/** Fields that carry a client's address; stripped unless IPs were asked for. */
const IP_FIELDS = ['connection_client_ip', 'client_ip'] as const;

const CLIENT_LIST_FLAGS: Record<string, string> = {
  '-uid': '',
  '-away': '',
  '-voice': '',
  '-times': '',
  '-groups': '',
  '-info': '',
  '-country': '',
};

const DEFAULT_KICK_REASON_ID = 5;

export interface ClientReadOptions {
  /** Off by default: the agent never receives client addresses. */
  includeIp?: boolean;
}

export interface KickOptions {
  reasonid?: number;
  reasonmsg?: string;
}

export interface BanOptions {
  time?: number;
  banreason?: string;
}

export interface MoveOptions {
  cpw?: string;
}

export async function listClients(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  options: ClientReadOptions = {},
): Promise<Array<Record<string, unknown>>> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  const flags = { ...CLIENT_LIST_FLAGS };
  if (options.includeIp) flags['-ip'] = '';

  const result = asRecordArray(await client.execute(sid, 'clientlist', flags));
  return options.includeIp ? result : result.map(stripIpFields);
}

export async function getClient(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  clid: unknown,
  options: ClientReadOptions = {},
): Promise<unknown> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  const result = await client.execute(sid, 'clientinfo', {
    clid: String(requirePositiveInt(clid, 'clid')),
  });
  return options.includeIp ? result : stripIpFields(asRecord(result));
}

export async function moveClient(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  clid: unknown,
  cid: unknown,
  options: MoveOptions = {},
): Promise<unknown> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return client.execute(sid, 'clientmove', {
    clid: String(requirePositiveInt(clid, 'clid')),
    cid: String(requirePositiveInt(cid, 'cid')),
    cpw: options.cpw,
  });
}

export async function pokeClient(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  clid: unknown,
  msg: string,
): Promise<unknown> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return client.execute(sid, 'clientpoke', {
    clid: String(requirePositiveInt(clid, 'clid')),
    msg,
  });
}

export async function kickClient(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  clid: unknown,
  options: KickOptions = {},
): Promise<unknown> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return client.execute(sid, 'clientkick', {
    clid: String(requirePositiveInt(clid, 'clid')),
    reasonid: options.reasonid || DEFAULT_KICK_REASON_ID,
    reasonmsg: options.reasonmsg,
  });
}

export async function banClient(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  clid: unknown,
  options: BanOptions = {},
): Promise<unknown> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return client.execute(sid, 'banclient', {
    clid: String(requirePositiveInt(clid, 'clid')),
    time: options.time || 0,
    banreason: options.banreason,
  });
}

function stripIpFields(entry: Record<string, unknown>): Record<string, unknown> {
  if (!IP_FIELDS.some((field) => field in entry)) return entry;
  const copy = { ...entry };
  for (const field of IP_FIELDS) delete copy[field];
  return copy;
}
