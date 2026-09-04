import type { PrismaClient } from '../../generated/prisma/index.js';
import {
  asRecordArray,
  listOrEmpty,
  requirePositiveInt,
  resolveServerTarget,
  type WebQueryPool,
} from './server-resolver.js';

export async function listComplaints(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  tcldbid?: unknown,
): Promise<unknown> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  const params = tcldbid === undefined ? undefined : { tcldbid: String(requirePositiveInt(tcldbid, 'tcldbid')) };
  return listOrEmpty(async () => asRecordArray(await client.execute(sid, 'complainlist', params)));
}

export async function addComplaint(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  tcldbid: unknown,
  message: string,
): Promise<unknown> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return client.execute(sid, 'complainadd', { tcldbid: String(requirePositiveInt(tcldbid, 'tcldbid')), message });
}

export async function deleteComplaint(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  tcldbid: unknown,
  fcldbid: unknown,
): Promise<unknown> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return client.execute(sid, 'complaindel', {
    tcldbid: String(requirePositiveInt(tcldbid, 'tcldbid')),
    fcldbid: String(requirePositiveInt(fcldbid, 'fcldbid')),
  });
}
