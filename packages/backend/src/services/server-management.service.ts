import type { PrismaClient } from '../../generated/prisma/index.js';
import { redactLogEntries } from './log-redaction.js';
import {
  asOptionalString,
  asRecord,
  asRecordArray,
  PUBLIC_SERVER_SELECT,
  requireEnabledServer,
  requireVirtualServerId,
  toNumber,
  type PublicServerConfig,
  type WebQueryPool,
} from './server-resolver.js';

export interface ServerListEntry extends PublicServerConfig {
  virtualServers: number[];
}

export interface ServerDashboard {
  serverName: string | undefined;
  platform: string | undefined;
  version: string | undefined;
  onlineUsers: number;
  maxClients: number;
  uptime: number;
  channelCount: number;
  bandwidth: { incoming: number; outgoing: number };
  packetloss: number;
  ping: number;
}

export interface RecentLogsOptions {
  lines?: number;
  /** Off only for the admin REST view, which must keep its raw log text. */
  redact?: boolean;
}

const DEFAULT_LOG_LINES = 100;

// One dashboard refresh costs 4 WebQuery commands in a burst, multiplied by
// every open browser tab — a major contributor to the TS server's flood
// counter (error 524). Short shared cache: N tabs cost the same as one.
const dashboardCache = new Map<string, { at: number; payload: ServerDashboard }>();
const DASHBOARD_CACHE_TTL_MS = 5000;

/**
 * Every enabled server config plus the virtual server ids it currently
 * serves. A server whose WebQuery client is absent or failing still appears,
 * with an empty `virtualServers`, so one broken connection cannot hide the
 * rest of the estate.
 */
export async function listEnabledServers(
  prisma: PrismaClient,
  pool: WebQueryPool,
): Promise<ServerListEntry[]> {
  const servers = await prisma.tsServerConfig.findMany({
    where: { enabled: true },
    select: PUBLIC_SERVER_SELECT,
    orderBy: { id: 'asc' },
  });

  const entries: ServerListEntry[] = [];
  for (const server of servers) {
    entries.push({ ...server, virtualServers: await listVirtualServerIds(pool, server.id) });
  }
  return entries;
}

export async function getServerStatus(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
): Promise<Record<string, unknown>> {
  const { client } = await requireEnabledServer(prisma, pool, serverConfigId);
  const sid = requireVirtualServerId(virtualServerId);
  return asRecord(await client.execute(sid, 'serverinfo'));
}

export async function getServerDashboard(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
): Promise<ServerDashboard> {
  const { server, client } = await requireEnabledServer(prisma, pool, serverConfigId);
  const sid = requireVirtualServerId(virtualServerId);

  const cacheKey = `${server.id}:${sid}`;
  const cached = dashboardCache.get(cacheKey);
  if (cached && Date.now() - cached.at < DASHBOARD_CACHE_TTL_MS) {
    return cached.payload;
  }

  const [serverInfo, clientList, channelList, connectionInfo] = await Promise.all([
    client.execute(sid, 'serverinfo'),
    client.execute(sid, 'clientlist'),
    client.execute(sid, 'channellist'),
    client.execute(sid, 'serverrequestconnectioninfo'),
  ]);

  const info = asRecord(serverInfo);
  const connInfo = asRecord(connectionInfo);
  const onlineClients = asRecordArray(clientList).filter((c) => String(c.client_type) === '0');

  const payload: ServerDashboard = {
    serverName: asOptionalString(info.virtualserver_name),
    platform: asOptionalString(info.virtualserver_platform),
    version: asOptionalString(info.virtualserver_version),
    onlineUsers: onlineClients.length,
    maxClients: toNumber(info.virtualserver_maxclients),
    uptime: toNumber(info.virtualserver_uptime),
    channelCount: asRecordArray(channelList).length,
    bandwidth: {
      incoming: toNumber(connInfo.connection_bandwidth_received_last_second_total),
      outgoing: toNumber(connInfo.connection_bandwidth_sent_last_second_total),
    },
    packetloss: toNumber(info.virtualserver_total_packetloss_total),
    ping: toNumber(info.virtualserver_total_ping),
  };

  dashboardCache.set(cacheKey, { at: Date.now(), payload });
  return payload;
}

export async function getRecentServerLogs(
  prisma: PrismaClient,
  pool: WebQueryPool,
  serverConfigId: unknown,
  virtualServerId: unknown,
  options: RecentLogsOptions = {},
): Promise<Array<Record<string, unknown>>> {
  const { client } = await requireEnabledServer(prisma, pool, serverConfigId);
  const sid = requireVirtualServerId(virtualServerId);

  const raw = await client.execute(sid, 'logview', {
    lines: options.lines ?? DEFAULT_LOG_LINES,
    reverse: 1,
    instance: 0,
  });

  const entries = asRecordArray(raw);
  return options.redact === false ? entries : redactLogEntries(entries);
}

async function listVirtualServerIds(pool: WebQueryPool, serverConfigId: number): Promise<number[]> {
  if (!pool.hasClient(serverConfigId)) return [];
  try {
    const list = await pool.getClient(serverConfigId).execute(0, 'serverlist');
    return asRecordArray(list)
      .map((entry) => Number(entry.virtualserver_id))
      .filter((id) => Number.isInteger(id) && id > 0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ServerManagement] serverlist failed for config ${serverConfigId}: ${message}`);
    return [];
  }
}
