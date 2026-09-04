import { describe, expect, it, vi } from 'vitest';
import { channelFileTools } from './channel-file-tools.js';
import { createToolContext, FAKE_SERVER, findTool } from './tool-fakes.js';

const listChannelFiles = findTool(channelFileTools, 'list_channel_files');
const createChannelDirectory = findTool(channelFileTools, 'create_channel_directory');
const deleteChannelFile = findTool(channelFileTools, 'delete_channel_file');

const TARGET = { serverConfigId: FAKE_SERVER.id, virtualServerId: 1 };

function fakeBotEngine(executeCommand: ReturnType<typeof vi.fn>) {
  return { getEventBridge: () => ({ executeCommand }) };
}

describe('list_channel_files', () => {
  it('parses the raw ServerQuery response', async () => {
    const executeCommand = vi.fn().mockResolvedValue('name=song.mp3 size=1024|name=covers');
    const botEngine = fakeBotEngine(executeCommand);

    const result = await listChannelFiles.execute(createToolContext({ botEngine }), { ...TARGET, cid: 4 });

    expect(result).toMatchObject({ success: true, action: 'channel_files_listed' });
    expect(executeCommand).toHaveBeenCalledWith(FAKE_SERVER.id, 1, 'ftgetfilelist cid=4 cpw= path=\\/');
  });

  it('returns an empty list for TS error 1281 (empty directory)', async () => {
    const executeCommand = vi.fn().mockRejectedValue(new Error('TS error 1281: database empty result set'));
    const botEngine = fakeBotEngine(executeCommand);

    await expect(
      listChannelFiles.execute(createToolContext({ botEngine }), { ...TARGET, cid: 4 }),
    ).resolves.toEqual({ success: true, action: 'channel_files_listed', files: [] });
  });

  it('reports SSH misconfiguration as SERVER_DISCONNECTED', async () => {
    const executeCommand = vi.fn().mockRejectedValue(new Error('SSH not connected for this server'));
    const botEngine = fakeBotEngine(executeCommand);

    await expect(
      listChannelFiles.execute(createToolContext({ botEngine }), { ...TARGET, cid: 4 }),
    ).rejects.toMatchObject({ code: 'SERVER_DISCONNECTED' });
  });
});

describe('create_channel_directory', () => {
  it('creates a directory', async () => {
    const executeCommand = vi.fn().mockResolvedValue('');
    const botEngine = fakeBotEngine(executeCommand);

    const result = await createChannelDirectory.execute(createToolContext({ botEngine }), {
      ...TARGET,
      cid: 4,
      dirname: 'covers',
    });

    expect(result).toEqual({ success: true, action: 'channel_directory_created', cid: 4, dirname: 'covers' });
    expect(executeCommand).toHaveBeenCalledWith(FAKE_SERVER.id, 1, 'ftcreatedir cid=4 cpw= dirname=covers');
  });
});

describe('delete_channel_file', () => {
  it('is destructive and deletes one file', async () => {
    const executeCommand = vi.fn().mockResolvedValue('');
    const botEngine = fakeBotEngine(executeCommand);
    expect(deleteChannelFile.risk).toBe('destructive');

    const result = await deleteChannelFile.execute(createToolContext({ botEngine }), {
      ...TARGET,
      cid: 4,
      name: 'old.mp3',
    });

    expect(result).toEqual({ success: true, action: 'channel_file_deleted', cid: 4, name: 'old.mp3' });
    expect(executeCommand).toHaveBeenCalledWith(FAKE_SERVER.id, 1, 'ftdeletefile cid=4 cpw= name=old.mp3');
  });
});
