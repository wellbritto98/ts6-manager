import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/index.js';
import type { AgentError } from '../agent/agent-error.js';
import {
  banClient,
  getClient,
  kickClient,
  listClients,
  moveClient,
  pokeClient,
} from './client-management.service.js';
import type { WebQueryPool } from './server-resolver.js';

const CONFIG_ID = 7;
const SID = 1;

const LIST_FLAGS = {
  '-uid': '', '-away': '', '-voice': '', '-times': '', '-groups': '', '-info': '', '-country': '',
};

function createFakes(result: unknown = [{ clid: '5' }], options: { enabled?: boolean } = {}) {
  const execute = vi.fn().mockResolvedValue(result);
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

describe('listClients', () => {
  it('omits the -ip flag and strips address fields by default', async () => {
    const { prisma, pool, execute } = createFakes([
      { clid: '5', client_nickname: 'Alice', connection_client_ip: '10.0.0.5' },
      { clid: '6', client_nickname: 'Bob', client_ip: '10.0.0.6' },
    ]);

    const clients = await listClients(prisma, pool, CONFIG_ID, SID);

    expect(clients).toEqual([
      { clid: '5', client_nickname: 'Alice' },
      { clid: '6', client_nickname: 'Bob' },
    ]);
    expect(execute).toHaveBeenCalledWith(SID, 'clientlist', LIST_FLAGS);
  });

  it('requests and keeps addresses when the caller asks for IPs', async () => {
    const { prisma, pool, execute } = createFakes([
      { clid: '5', connection_client_ip: '10.0.0.5' },
    ]);

    const clients = await listClients(prisma, pool, CONFIG_ID, SID, { includeIp: true });

    expect(clients).toEqual([{ clid: '5', connection_client_ip: '10.0.0.5' }]);
    expect(execute).toHaveBeenCalledWith(SID, 'clientlist', { ...LIST_FLAGS, '-ip': '' });
  });

  it('fails with SERVER_NOT_FOUND without calling WebQuery when the config is disabled', async () => {
    const { prisma, pool, execute } = createFakes([], { enabled: false });

    await expect(listClients(prisma, pool, CONFIG_ID, SID)).rejects.toEqual(
      expect.objectContaining<Partial<AgentError>>({ code: 'SERVER_NOT_FOUND' }),
    );
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('getClient', () => {
  it('reads clientinfo and strips the address by default', async () => {
    const { prisma, pool, execute } = createFakes([
      { client_nickname: 'Alice', connection_client_ip: '10.0.0.5' },
    ]);

    const client = await getClient(prisma, pool, CONFIG_ID, SID, 5);

    expect(client).toEqual({ client_nickname: 'Alice' });
    expect(execute).toHaveBeenCalledWith(SID, 'clientinfo', { clid: '5' });
  });

  it('returns the raw clientinfo payload when IPs are requested', async () => {
    const raw = [{ client_nickname: 'Alice', connection_client_ip: '10.0.0.5' }];
    const { prisma, pool } = createFakes(raw);

    await expect(getClient(prisma, pool, CONFIG_ID, SID, 5, { includeIp: true })).resolves.toBe(raw);
  });
});

describe('moveClient', () => {
  it('calls clientmove with the client and target channel', async () => {
    const { prisma, pool, execute } = createFakes();

    await moveClient(prisma, pool, CONFIG_ID, SID, 5, 12);

    expect(execute).toHaveBeenCalledWith(SID, 'clientmove', { clid: '5', cid: '12', cpw: undefined });
  });

  it('forwards the channel password when one is given', async () => {
    const { prisma, pool, execute } = createFakes();

    await moveClient(prisma, pool, CONFIG_ID, SID, 5, 12, { cpw: 'hunter2' });

    expect(execute).toHaveBeenCalledWith(SID, 'clientmove', { clid: '5', cid: '12', cpw: 'hunter2' });
  });

  it('rejects a non-integer channel id with INVALID_INPUT', async () => {
    const { prisma, pool, execute } = createFakes();

    await expect(moveClient(prisma, pool, CONFIG_ID, SID, 5, 'lobby')).rejects.toEqual(
      expect.objectContaining<Partial<AgentError>>({ code: 'INVALID_INPUT' }),
    );
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('pokeClient', () => {
  it('calls clientpoke with the message', async () => {
    const { prisma, pool, execute } = createFakes();

    await pokeClient(prisma, pool, CONFIG_ID, SID, 5, 'hello');

    expect(execute).toHaveBeenCalledWith(SID, 'clientpoke', { clid: '5', msg: 'hello' });
  });
});

describe('kickClient', () => {
  it('kicks from the server by default', async () => {
    const { prisma, pool, execute } = createFakes();

    await kickClient(prisma, pool, CONFIG_ID, SID, 5);

    expect(execute).toHaveBeenCalledWith(SID, 'clientkick', {
      clid: '5',
      reasonid: 5,
      reasonmsg: undefined,
    });
  });

  it('honours an explicit reason id and message', async () => {
    const { prisma, pool, execute } = createFakes();

    await kickClient(prisma, pool, CONFIG_ID, SID, 5, { reasonid: 4, reasonmsg: 'spam' });

    expect(execute).toHaveBeenCalledWith(SID, 'clientkick', { clid: '5', reasonid: 4, reasonmsg: 'spam' });
  });
});

describe('banClient', () => {
  it('bans permanently by default', async () => {
    const { prisma, pool, execute } = createFakes();

    await banClient(prisma, pool, CONFIG_ID, SID, 5);

    expect(execute).toHaveBeenCalledWith(SID, 'banclient', {
      clid: '5',
      time: 0,
      banreason: undefined,
    });
  });

  it('honours an explicit duration and reason', async () => {
    const { prisma, pool, execute } = createFakes();

    await banClient(prisma, pool, CONFIG_ID, SID, 5, { time: 600, banreason: 'flood' });

    expect(execute).toHaveBeenCalledWith(SID, 'banclient', { clid: '5', time: 600, banreason: 'flood' });
  });
});
