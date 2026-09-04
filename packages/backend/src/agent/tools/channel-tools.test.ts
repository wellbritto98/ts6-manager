import { describe, expect, it, vi } from 'vitest';
import { channelTools } from './channel-tools.js';
import { createToolContext, FAKE_SERVER, findTool } from './tool-fakes.js';

const listChannels = findTool(channelTools, 'list_channels');
const getChannel = findTool(channelTools, 'get_channel');
const createChannel = findTool(channelTools, 'create_channel');
const editChannel = findTool(channelTools, 'edit_channel');
const moveChannel = findTool(channelTools, 'move_channel');
const deleteChannel = findTool(channelTools, 'delete_channel');

const TARGET = { serverConfigId: FAKE_SERVER.id, virtualServerId: 1 };

describe('list_channels and get_channel', () => {
  it('lists the channels of the named virtual server', async () => {
    const execute = vi.fn().mockResolvedValue([{ cid: '1', channel_name: 'Lobby' }]);

    await expect(listChannels.execute(createToolContext({ execute }), TARGET)).resolves.toEqual({
      success: true,
      action: 'channels_listed',
      channels: [{ cid: '1', channel_name: 'Lobby' }],
    });
  });

  it('reads one channel by cid', async () => {
    const execute = vi.fn().mockResolvedValue({ cid: '4', channel_name: 'Lobby' });

    await expect(getChannel.execute(createToolContext({ execute }), { ...TARGET, cid: 4 }))
      .resolves.toEqual({
        success: true,
        action: 'channel_read',
        channel: { cid: '4', channel_name: 'Lobby' },
      });
    expect(execute).toHaveBeenCalledWith(1, 'channelinfo', { cid: '4' });
  });
});

describe('create_channel', () => {
  it('creates the channel and returns channel_created with the new id and name', async () => {
    const execute = vi.fn().mockResolvedValue({ cid: '12' });

    const result = await createChannel.execute(createToolContext({ execute }), {
      ...TARGET,
      channel_name: 'Support',
      channel_flag_permanent: 1,
      cpid: 0,
    });

    expect(result).toEqual({
      success: true,
      action: 'channel_created',
      channelId: 12,
      channelName: 'Support',
    });
    expect(execute).toHaveBeenCalledWith(1, 'channelcreate', {
      channel_name: 'Support',
      channel_flag_permanent: 1,
      cpid: 0,
    });
  });

  it('rejects a field outside the create allowlist as INVALID_INPUT', async () => {
    const execute = vi.fn();

    await expect(createChannel.execute(createToolContext({ execute }), {
      ...TARGET,
      channel_name: 'Support',
      channel_needed_talk_power: 100,
    })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects an actor identity field as INVALID_INPUT', async () => {
    await expect(createChannel.execute(createToolContext(), {
      ...TARGET,
      channel_name: 'Support',
      role: 'admin',
    })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('accepts an idempotencyKey and rejects one longer than 128 characters', async () => {
    const execute = vi.fn().mockResolvedValue({ cid: '13' });
    const context = createToolContext({ execute });

    await expect(createChannel.execute(context, {
      ...TARGET,
      channel_name: 'Support',
      idempotencyKey: 'create-support',
    })).resolves.toMatchObject({ action: 'channel_created' });

    await expect(createChannel.execute(context, {
      ...TARGET,
      channel_name: 'Support',
      idempotencyKey: 'x'.repeat(129),
    })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});

describe('edit_channel and move_channel', () => {
  it('edits only the allowlisted fields', async () => {
    const execute = vi.fn().mockResolvedValue({});

    await expect(editChannel.execute(createToolContext({ execute }), {
      ...TARGET,
      cid: 4,
      channel_topic: 'Open',
    })).resolves.toEqual({ success: true, action: 'channel_edited', channelId: 4 });
    expect(execute).toHaveBeenCalledWith(1, 'channeledit', { cid: '4', channel_topic: 'Open' });
  });

  it('moves a channel under the requested parent', async () => {
    const execute = vi.fn().mockResolvedValue({});

    await expect(moveChannel.execute(createToolContext({ execute }), { ...TARGET, cid: 4, cpid: 2 }))
      .resolves.toEqual({ success: true, action: 'channel_moved', channelId: 4, cpid: 2 });
    expect(execute).toHaveBeenCalledWith(1, 'channelmove', { cid: '4', cpid: 2 });
  });
});

describe('delete_channel', () => {
  it('is registered as a destructive tool', () => {
    expect(deleteChannel.risk).toBe('destructive');
  });

  it('deletes the channel and returns channel_deleted', async () => {
    const execute = vi.fn().mockResolvedValue({});

    await expect(deleteChannel.execute(createToolContext({ execute }), { ...TARGET, cid: 4 }))
      .resolves.toEqual({ success: true, action: 'channel_deleted', channelId: 4 });
    expect(execute).toHaveBeenCalledWith(1, 'channeldelete', { cid: '4', force: 1 });
  });
});
