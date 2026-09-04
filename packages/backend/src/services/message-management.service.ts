import type { PrismaClient } from '../../generated/prisma/index.js';
import { pickFields } from './channel-management.service.js';
import {
  asRecordArray,
  listOrEmpty,
  requirePositiveInt,
  resolveServerTarget,
  type WebQueryPool,
} from './server-resolver.js';

const MESSAGE_SEND_FIELDS = ['cluid', 'subject', 'message'] as const;

export async function listMessages(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
): Promise<unknown> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return listOrEmpty(async () => asRecordArray(await client.execute(sid, 'messagelist')));
}

export async function getMessage(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  msgid: unknown,
): Promise<unknown> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return client.execute(sid, 'messageget', { msgid: String(requirePositiveInt(msgid, 'msgid')) });
}

export async function sendMessage(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  fields: Record<string, unknown>,
): Promise<unknown> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return client.execute(sid, 'messageadd', pickFields(fields, MESSAGE_SEND_FIELDS));
}

export async function deleteMessage(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  msgid: unknown,
): Promise<unknown> {
  const { client, sid } = await resolveServerTarget(prisma, pool, serverConfigId, virtualServerId);
  return client.execute(sid, 'messagedel', { msgid: String(requirePositiveInt(msgid, 'msgid')) });
}
