import type { PrismaClient } from '../../generated/prisma/index.js';
import { requireEnabledServer, type WebQueryPool } from './server-resolver.js';

export async function getInstanceInfo(prisma: PrismaClient, pool: WebQueryPool, serverConfigId: unknown): Promise<unknown> {
  const { client } = await requireEnabledServer(prisma, pool, serverConfigId);
  return client.execute(0, 'instanceinfo');
}

export async function getHostInfo(prisma: PrismaClient, pool: WebQueryPool, serverConfigId: unknown): Promise<unknown> {
  const { client } = await requireEnabledServer(prisma, pool, serverConfigId);
  return client.execute(0, 'hostinfo');
}

export async function getVersion(prisma: PrismaClient, pool: WebQueryPool, serverConfigId: unknown): Promise<unknown> {
  const { client } = await requireEnabledServer(prisma, pool, serverConfigId);
  return client.execute(0, 'version');
}
