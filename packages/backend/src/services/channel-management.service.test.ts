import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/index.js';
import type { AgentError } from '../agent/agent-error.js';
import {
  createChannel,
  deleteChannel,
  editChannel,
  getChannel,
  listChannels,
  moveChannel,
  removeChannelPermission,
  setChannelPermission,
} from './channel-management.service.js';
import type { WebQueryPool } from './server-resolver.js';

const CONFIG_ID = 7;
const SID = 2;

function createFakes(options: { enabled?: boolean } = {}) {
  const execute = vi.fn().mockResolvedValue([{ cid: '12' }]);
  const prisma = {
    tsServerConfig: {
      findFirst: vi.fn().mockImplementation(async () =>
        options.enabled === false ? null : { id: CONFIG_ID, name: 'Main', host: 'ts.example.com', webqueryPort: 10080, useHttps: false, enabled: true },
      ),
    },
  } as unknown as PrismaClient;
  const pool: WebQueryPool = {
    hasClient: () => true,
    getClient: () => ({ execute }),
  };
  return { prisma, pool, execute };
}

describe('createChannel', () => {
  it('forwards only the allowlisted channel fields and drops unknown keys', async () => {
    const { prisma, pool, execute } = createFakes();

    await createChannel(prisma, pool, CONFIG_ID, SID, {
      channel_name: 'Lobby',
      channel_flag_permanent: 1,
      channel_flag_semi_permanent: 0,
      channel_topic: 'welcome',
      channel_password: 'hunter2',
      cpid: 0,
      channel_needed_talk_power: 75,
      channel_flag_default: 1,
      sid: 99,
    });

    expect(execute).toHaveBeenCalledWith(SID, 'channelcreate', {
      channel_name: 'Lobby',
      channel_flag_permanent: 1,
      channel_flag_semi_permanent: 0,
      channel_topic: 'welcome',
      channel_password: 'hunter2',
      cpid: 0,
    });
  });

  it('omits allowlisted fields the caller did not send', async () => {
    const { prisma, pool, execute } = createFakes();

    await createChannel(prisma, pool, CONFIG_ID, SID, { channel_name: 'Lobby', channel_flag_permanent: 1 });

    expect(execute).toHaveBeenCalledWith(SID, 'channelcreate', {
      channel_name: 'Lobby',
      channel_flag_permanent: 1,
    });
  });

  it('fails with SERVER_NOT_FOUND without calling WebQuery when the config is disabled', async () => {
    const { prisma, pool, execute } = createFakes({ enabled: false });

    await expect(createChannel(prisma, pool, CONFIG_ID, SID, { channel_name: 'Lobby' })).rejects.toEqual(
      expect.objectContaining<Partial<AgentError>>({ code: 'SERVER_NOT_FOUND' }),
    );
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('editChannel', () => {
  it('sends the channel id with only the allowlisted fields', async () => {
    const { prisma, pool, execute } = createFakes();

    await editChannel(prisma, pool, CONFIG_ID, SID, 12, {
      channel_name: 'Renamed',
      channel_topic: 'topic',
      channel_maxclients: 5,
    });

    expect(execute).toHaveBeenCalledWith(SID, 'channeledit', {
      cid: '12',
      channel_name: 'Renamed',
      channel_topic: 'topic',
    });
  });
});

describe('moveChannel', () => {
  it('moves a channel to the named parent and ignores other fields', async () => {
    const { prisma, pool, execute } = createFakes();

    await moveChannel(prisma, pool, CONFIG_ID, SID, 12, { cpid: 0, order: 3 });

    expect(execute).toHaveBeenCalledWith(SID, 'channelmove', { cid: '12', cpid: 0 });
  });
});

describe('deleteChannel', () => {
  it('calls channeldelete with force enabled by default', async () => {
    const { prisma, pool, execute } = createFakes();

    await deleteChannel(prisma, pool, CONFIG_ID, SID, 12);

    expect(execute).toHaveBeenCalledWith(SID, 'channeldelete', { cid: '12', force: 1 });
  });
});

describe('listChannels', () => {
  it('requests channellist with the flags the channel tree needs', async () => {
    const { prisma, pool, execute } = createFakes();

    await listChannels(prisma, pool, CONFIG_ID, SID);

    expect(execute).toHaveBeenCalledWith(SID, 'channellist', {
      '-topic': '', '-flags': '', '-voice': '', '-limits': '', '-icon': '', '-secondsempty': '',
    });
  });
});

describe('getChannel', () => {
  it('reads channelinfo for the named channel', async () => {
    const { prisma, pool, execute } = createFakes();

    await getChannel(prisma, pool, CONFIG_ID, SID, 12);

    expect(execute).toHaveBeenCalledWith(SID, 'channelinfo', { cid: '12' });
  });
});

describe('channel permissions', () => {
  it('sets only the named permission on the named channel', async () => {
    const { prisma, pool, execute } = createFakes();

    await setChannelPermission(prisma, pool, CONFIG_ID, SID, 12, {
      permsid: 'i_channel_needed_join_power',
      permvalue: 50,
      permskip: 1,
    });

    expect(execute).toHaveBeenCalledWith(SID, 'channeladdperm', {
      cid: '12',
      permsid: 'i_channel_needed_join_power',
      permvalue: 50,
    });
  });

  it('removes only the named permission from the named channel', async () => {
    const { prisma, pool, execute } = createFakes();

    await removeChannelPermission(prisma, pool, CONFIG_ID, SID, 12, {
      permsid: 'i_channel_needed_join_power',
      permvalue: 50,
    });

    expect(execute).toHaveBeenCalledWith(SID, 'channeldelperm', {
      cid: '12',
      permsid: 'i_channel_needed_join_power',
    });
  });
});
