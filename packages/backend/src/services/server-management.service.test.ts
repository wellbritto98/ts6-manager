import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/index.js';
import type { AgentError } from '../agent/agent-error.js';
import {
  getRecentServerLogs,
  getServerDashboard,
  getServerStatus,
  listEnabledServers,
} from './server-management.service.js';
import type { WebQueryPool } from './server-resolver.js';

type ServerRow = {
  id: number;
  name: string;
  host: string;
  webqueryPort: number;
  useHttps: boolean;
  enabled: boolean;
};

const SERVER_ROW: ServerRow = {
  id: 7,
  name: 'Main',
  host: 'ts.example.com',
  webqueryPort: 10080,
  useHttps: false,
  enabled: true,
};

function createPrisma(rows: ServerRow[]) {
  const findMany = vi.fn().mockResolvedValue(rows);
  const findFirst = vi.fn().mockImplementation(
    async ({ where }: { where: { id: number; enabled: boolean } }) =>
      rows.find((row) => row.id === where.id && row.enabled === where.enabled) ?? null,
  );
  const prisma = { tsServerConfig: { findMany, findFirst } } as unknown as PrismaClient;
  return { prisma, findMany, findFirst };
}

function createPool(execute: ReturnType<typeof vi.fn>, connectedIds: number[] = [SERVER_ROW.id]) {
  const pool: WebQueryPool = {
    hasClient: (configId) => connectedIds.includes(configId),
    getClient: () => ({ execute }),
  };
  return pool;
}

describe('listEnabledServers', () => {
  it('returns each enabled config with its virtual server ids and no credential fields', async () => {
    const { prisma, findMany } = createPrisma([SERVER_ROW]);
    const execute = vi.fn().mockResolvedValue([
      { virtualserver_id: '1', virtualserver_name: 'TeamSpeak ]I[' },
      { virtualserver_id: '2', virtualserver_name: 'Second' },
    ]);

    const result = await listEnabledServers(prisma, createPool(execute));

    expect(result).toEqual([{ ...SERVER_ROW, virtualServers: [1, 2] }]);
    expect(Object.keys(result[0])).not.toContain('apiKey');
    expect(Object.keys(result[0])).not.toContain('sshPassword');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { enabled: true },
        select: expect.not.objectContaining({ apiKey: true, sshPassword: true }),
      }),
    );
    expect(execute).toHaveBeenCalledWith(0, 'serverlist');
  });

  it('reports an empty virtual server list instead of failing when a server is disconnected', async () => {
    const { prisma } = createPrisma([SERVER_ROW, { ...SERVER_ROW, id: 8, name: 'Offline' }]);
    const execute = vi.fn().mockResolvedValue([{ virtualserver_id: '1' }]);

    const result = await listEnabledServers(prisma, createPool(execute, [SERVER_ROW.id]));

    expect(result).toEqual([
      { ...SERVER_ROW, virtualServers: [1] },
      { ...SERVER_ROW, id: 8, name: 'Offline', virtualServers: [] },
    ]);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('returns an empty list when no config is enabled', async () => {
    const { prisma } = createPrisma([]);
    const execute = vi.fn();

    await expect(listEnabledServers(prisma, createPool(execute, []))).resolves.toEqual([]);
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('getServerStatus', () => {
  it('reads serverinfo for the named virtual server', async () => {
    const { prisma } = createPrisma([SERVER_ROW]);
    const execute = vi.fn().mockResolvedValue([{ virtualserver_name: 'Main' }]);

    const status = await getServerStatus(prisma, createPool(execute), SERVER_ROW.id, 3);

    expect(status).toEqual({ virtualserver_name: 'Main' });
    expect(execute).toHaveBeenCalledWith(3, 'serverinfo');
  });

  it('fails with SERVER_NOT_FOUND and no WebQuery call when the config is disabled', async () => {
    const { prisma } = createPrisma([{ ...SERVER_ROW, enabled: false }]);
    const execute = vi.fn();

    await expect(getServerStatus(prisma, createPool(execute), SERVER_ROW.id, 1)).rejects.toEqual(
      expect.objectContaining<Partial<AgentError>>({ code: 'SERVER_NOT_FOUND' }),
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it('fails with SERVER_NOT_FOUND and no WebQuery call when the config does not exist', async () => {
    const { prisma } = createPrisma([]);
    const execute = vi.fn();

    await expect(getServerStatus(prisma, createPool(execute), 999, 1)).rejects.toEqual(
      expect.objectContaining<Partial<AgentError>>({ code: 'SERVER_NOT_FOUND' }),
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects a non-integer serverConfigId with INVALID_INPUT before touching the database', async () => {
    const { prisma, findFirst } = createPrisma([SERVER_ROW]);
    const execute = vi.fn();

    await expect(getServerStatus(prisma, createPool(execute), 'main', 1)).rejects.toEqual(
      expect.objectContaining<Partial<AgentError>>({ code: 'INVALID_INPUT' }),
    );
    expect(findFirst).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects a missing virtualServerId with INVALID_INPUT instead of defaulting to 1', async () => {
    const { prisma } = createPrisma([SERVER_ROW]);
    const execute = vi.fn();

    await expect(getServerStatus(prisma, createPool(execute), SERVER_ROW.id, undefined)).rejects.toEqual(
      expect.objectContaining<Partial<AgentError>>({ code: 'INVALID_INPUT' }),
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it('fails with SERVER_DISCONNECTED when the pool holds no client for the config', async () => {
    const { prisma } = createPrisma([SERVER_ROW]);
    const execute = vi.fn();

    await expect(getServerStatus(prisma, createPool(execute, []), SERVER_ROW.id, 1)).rejects.toEqual(
      expect.objectContaining<Partial<AgentError>>({ code: 'SERVER_DISCONNECTED' }),
    );
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('getServerDashboard', () => {
  const dashboardExecute = () =>
    vi.fn().mockImplementation(async (_sid: number, command: string) => {
      if (command === 'serverinfo') {
        return [{
          virtualserver_name: 'Main',
          virtualserver_platform: 'Linux',
          virtualserver_version: '3.13.7',
          virtualserver_maxclients: '32',
          virtualserver_uptime: '1200',
          virtualserver_total_packetloss_total: '0.5',
          virtualserver_total_ping: '18',
        }];
      }
      if (command === 'clientlist') {
        return [{ client_type: '0' }, { client_type: '1' }, { client_type: '0' }];
      }
      if (command === 'channellist') return [{ cid: '1' }, { cid: '2' }];
      return [{
        connection_bandwidth_received_last_second_total: '4096',
        connection_bandwidth_sent_last_second_total: '2048',
      }];
    });

  it('aggregates serverinfo, clients, channels and bandwidth into the dashboard payload', async () => {
    const { prisma } = createPrisma([{ ...SERVER_ROW, id: 21 }]);
    const execute = dashboardExecute();

    const payload = await getServerDashboard(prisma, createPool(execute, [21]), 21, 1);

    expect(payload).toEqual({
      serverName: 'Main',
      platform: 'Linux',
      version: '3.13.7',
      onlineUsers: 2,
      maxClients: 32,
      uptime: 1200,
      channelCount: 2,
      bandwidth: { incoming: 4096, outgoing: 2048 },
      packetloss: 0.5,
      ping: 18,
    });
  });

  it('serves a repeat call from the short cache instead of a second WebQuery burst', async () => {
    const { prisma } = createPrisma([{ ...SERVER_ROW, id: 22 }]);
    const execute = dashboardExecute();
    const pool = createPool(execute, [22]);

    const first = await getServerDashboard(prisma, pool, 22, 1);
    const second = await getServerDashboard(prisma, pool, 22, 1);

    expect(second).toEqual(first);
    expect(execute).toHaveBeenCalledTimes(4);
  });
});

describe('getRecentServerLogs', () => {
  it('redacts credential-shaped values from log lines and credential-named fields', async () => {
    const { prisma } = createPrisma([SERVER_ROW]);
    const execute = vi.fn().mockResolvedValue([
      { l: 'query login apikey=BAAJfW3kQ9uT2mLpXs81 from 10.0.0.5' },
      { l: 'token BAAeXjNvw8Qa7Lm2Rk4Ty6Vb9Zc1Nd3Ef5Gh7Jk9Lm0Pq2Rs4Tu6 accepted' },
      { token: 'BAAJfW3kQ9uT2mLpXs81' },
    ]);

    const logs = await getRecentServerLogs(prisma, createPool(execute), SERVER_ROW.id, 1);

    expect(logs).toEqual([
      { l: 'query login apikey=[REDACTED] from 10.0.0.5' },
      { l: 'token [REDACTED] accepted' },
      { token: '[REDACTED]' },
    ]);
    expect(execute).toHaveBeenCalledWith(1, 'logview', { lines: 100, reverse: 1, instance: 0 });
  });

  it('returns the raw log text when redaction is switched off for the admin REST view', async () => {
    const { prisma } = createPrisma([SERVER_ROW]);
    const execute = vi.fn().mockResolvedValue([{ l: 'query login apikey=BAAJfW3kQ9uT2mLpXs81' }]);

    const logs = await getRecentServerLogs(prisma, createPool(execute), SERVER_ROW.id, 1, {
      lines: 50,
      redact: false,
    });

    expect(logs).toEqual([{ l: 'query login apikey=BAAJfW3kQ9uT2mLpXs81' }]);
    expect(execute).toHaveBeenCalledWith(1, 'logview', { lines: 50, reverse: 1, instance: 0 });
  });
});
