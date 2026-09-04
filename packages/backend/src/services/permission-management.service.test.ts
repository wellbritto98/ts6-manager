import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/index.js';
import type { AgentError } from '../agent/agent-error.js';
import {
  addClientToServerGroup,
  findPermission,
  getPermissionOverview,
  listChannelGroups,
  listServerGroupMembers,
  listServerGroups,
  removeClientFromServerGroup,
} from './permission-management.service.js';
import type { WebQueryPool } from './server-resolver.js';

const CONFIG_ID = 7;
const SID = 1;

function createFakes(
  handler: (sid: number, command: string, params?: Record<string, unknown>) => unknown = () => [],
  options: { enabled?: boolean } = {},
) {
  const execute = vi.fn().mockImplementation(async (sid: number, command: string, params?: Record<string, unknown>) =>
    handler(sid, command, params),
  );
  const prisma = {
    tsServerConfig: {
      findFirst: vi.fn().mockImplementation(async () =>
        options.enabled === false ? null : { id: CONFIG_ID, name: 'Main', host: 'ts.example.com', webqueryPort: 10080, useHttps: false, enabled: true },
      ),
    },
  } as unknown as PrismaClient;
  const pool: WebQueryPool = { hasClient: () => true, getClient: () => ({ execute }) };
  return { prisma, pool, execute };
}

describe('findPermission', () => {
  it('looks the permission up with permfind', async () => {
    const { prisma, pool, execute } = createFakes(() => [{ permid: '17', permsid: 'b_client_kick' }]);

    const found = await findPermission(prisma, pool, CONFIG_ID, SID, { permsid: 'b_client_kick' });

    expect(found).toEqual([{ permid: '17', permsid: 'b_client_kick' }]);
    expect(execute).toHaveBeenCalledWith(SID, 'permfind', { permsid: 'b_client_kick', permid: undefined });
  });

  it('rejects a query with neither permsid nor permid as INVALID_INPUT', async () => {
    const { prisma, pool, execute } = createFakes();

    await expect(findPermission(prisma, pool, CONFIG_ID, SID, {})).rejects.toEqual(
      expect.objectContaining<Partial<AgentError>>({ code: 'INVALID_INPUT' }),
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it('fails with SERVER_NOT_FOUND without calling WebQuery when the config is disabled', async () => {
    const { prisma, pool, execute } = createFakes(() => [], { enabled: false });

    await expect(findPermission(prisma, pool, CONFIG_ID, SID, { permid: 17 })).rejects.toEqual(
      expect.objectContaining<Partial<AgentError>>({ code: 'SERVER_NOT_FOUND' }),
    );
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('getPermissionOverview', () => {
  it('asks for the whole overview of a client by default', async () => {
    const { prisma, pool, execute } = createFakes();

    await getPermissionOverview(prisma, pool, CONFIG_ID, SID, 42);

    expect(execute).toHaveBeenCalledWith(SID, 'permoverview', { cldbid: '42', cid: 0, permid: 0 });
  });

  it('narrows the overview to a channel and permission when asked', async () => {
    const { prisma, pool, execute } = createFakes();

    await getPermissionOverview(prisma, pool, CONFIG_ID, SID, 42, { cid: 12, permid: 17 });

    expect(execute).toHaveBeenCalledWith(SID, 'permoverview', { cldbid: '42', cid: 12, permid: 17 });
  });
});

describe('group listings', () => {
  it('lists server groups without template and query groups', async () => {
    const { prisma, pool, execute } = createFakes(() => [
      { sgid: '6', name: 'Guest', type: '1' },
      { sgid: '1', name: 'Guest Server Query', type: '2' },
      { sgid: '2', name: 'Guest template', type: '0' },
    ]);

    const groups = await listServerGroups(prisma, pool, CONFIG_ID, SID);

    expect(groups).toEqual([{ sgid: '6', name: 'Guest', type: '1' }]);
    expect(execute).toHaveBeenCalledWith(SID, 'servergrouplist');
  });

  it('lists channel groups with channelgrouplist', async () => {
    const { prisma, pool, execute } = createFakes(() => [{ cgid: '4', name: 'Channel Admin' }]);

    const groups = await listChannelGroups(prisma, pool, CONFIG_ID, SID);

    expect(groups).toEqual([{ cgid: '4', name: 'Channel Admin' }]);
    expect(execute).toHaveBeenCalledWith(SID, 'channelgrouplist');
  });

  it('lists group members with their names', async () => {
    const { prisma, pool, execute } = createFakes(() => [{ cldbid: '42', client_nickname: 'Alice' }]);

    const members = await listServerGroupMembers(prisma, pool, CONFIG_ID, SID, 6);

    expect(members).toEqual([{ cldbid: '42', client_nickname: 'Alice' }]);
    expect(execute).toHaveBeenCalledWith(SID, 'servergroupclientlist', { sgid: '6', '-names': '' });
  });
});

describe('addClientToServerGroup', () => {
  it('adds a client that does not hold the group yet', async () => {
    const { prisma, pool, execute } = createFakes((_sid, command) =>
      command === 'servergroupclientlist' ? [{ cldbid: '11' }] : { ok: true },
    );

    const result = await addClientToServerGroup(prisma, pool, CONFIG_ID, SID, 6, 42);

    expect(result).toEqual({ alreadyInDesiredState: false, result: { ok: true } });
    expect(execute).toHaveBeenCalledWith(SID, 'servergroupaddclient', { sgid: '6', cldbid: '42' });
  });

  it('reports the desired state and skips the add when the client is already a member', async () => {
    const { prisma, pool, execute } = createFakes((_sid, command) =>
      command === 'servergroupclientlist' ? [{ cldbid: '42' }] : { ok: true },
    );

    const result = await addClientToServerGroup(prisma, pool, CONFIG_ID, SID, 6, 42);

    expect(result).toEqual({ alreadyInDesiredState: true });
    expect(execute).not.toHaveBeenCalledWith(SID, 'servergroupaddclient', expect.anything());
  });
});

describe('removeClientFromServerGroup', () => {
  it('removes the client with servergroupdelclient', async () => {
    const { prisma, pool, execute } = createFakes();

    await removeClientFromServerGroup(prisma, pool, CONFIG_ID, SID, 6, 42);

    expect(execute).toHaveBeenCalledWith(SID, 'servergroupdelclient', { sgid: '6', cldbid: '42' });
  });
});
