import { describe, expect, it, vi } from 'vitest';
import { channelGroupTools } from './channel-group-tools.js';
import { createToolContext, FAKE_SERVER, findTool } from './tool-fakes.js';

const listChannelGroupPermissions = findTool(channelGroupTools, 'list_channel_group_permissions');
const setChannelGroupPermission = findTool(channelGroupTools, 'set_channel_group_permission');
const removeChannelGroupPermission = findTool(channelGroupTools, 'remove_channel_group_permission');
const createChannelGroup = findTool(channelGroupTools, 'create_channel_group');
const renameChannelGroup = findTool(channelGroupTools, 'rename_channel_group');
const deleteChannelGroup = findTool(channelGroupTools, 'delete_channel_group');
const assignClientChannelGroup = findTool(channelGroupTools, 'assign_client_channel_group');
const listChannelGroupMembers = findTool(channelGroupTools, 'list_channel_group_members');

const TARGET = { serverConfigId: FAKE_SERVER.id, virtualServerId: 1 };

describe('list_channel_group_permissions', () => {
  it('lists the permissions of one channel group', async () => {
    const execute = vi.fn().mockResolvedValue([{ permsid: 'i_channel_needed_join_power', permvalue: '50' }]);

    await expect(
      listChannelGroupPermissions.execute(createToolContext({ execute }), { ...TARGET, cgid: 5 }),
    ).resolves.toMatchObject({ success: true, action: 'channel_group_permissions_listed' });
    expect(execute).toHaveBeenCalledWith(1, 'channelgrouppermlist', { cgid: '5', '-permsid': '' });
  });
});

describe('set_channel_group_permission', () => {
  it('sets one permission', async () => {
    const execute = vi.fn().mockResolvedValue({});

    const result = await setChannelGroupPermission.execute(createToolContext({ execute }), {
      ...TARGET,
      cgid: 5,
      permsid: 'i_channel_needed_join_power',
      permvalue: 50,
    });

    expect(result).toMatchObject({ success: true, action: 'channel_group_permission_set', cgid: 5 });
    expect(execute).toHaveBeenCalledWith(1, 'channelgroupaddperm', {
      cgid: '5',
      permsid: 'i_channel_needed_join_power',
      permvalue: 50,
      permnegated: 0,
      permskip: 0,
    });
  });

  it('forwards explicit permnegated/permskip instead of the default', async () => {
    const execute = vi.fn().mockResolvedValue({});

    await setChannelGroupPermission.execute(createToolContext({ execute }), {
      ...TARGET,
      cgid: 5,
      permsid: 'i_channel_needed_join_power',
      permvalue: 50,
      permnegated: 1,
      permskip: 1,
    });

    expect(execute).toHaveBeenCalledWith(1, 'channelgroupaddperm', {
      cgid: '5',
      permsid: 'i_channel_needed_join_power',
      permvalue: 50,
      permnegated: 1,
      permskip: 1,
    });
  });

  it('rejects a field outside the allowlist', async () => {
    const execute = vi.fn();

    await expect(
      setChannelGroupPermission.execute(createToolContext({ execute }), {
        ...TARGET,
        cgid: 5,
        permsid: 'i_channel_needed_join_power',
        permvalue: 50,
        bogus: 1,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('remove_channel_group_permission', () => {
  it('is destructive and removes one permission', async () => {
    const execute = vi.fn().mockResolvedValue({});
    expect(removeChannelGroupPermission.risk).toBe('destructive');

    await expect(
      removeChannelGroupPermission.execute(createToolContext({ execute }), {
        ...TARGET,
        cgid: 5,
        permsid: 'i_channel_needed_join_power',
      }),
    ).resolves.toMatchObject({ success: true, action: 'channel_group_permission_removed', cgid: 5 });
    expect(execute).toHaveBeenCalledWith(1, 'channelgroupdelperm', {
      cgid: '5',
      permsid: 'i_channel_needed_join_power',
    });
  });
});

describe('create_channel_group', () => {
  it('creates a group and returns its new cgid', async () => {
    const execute = vi.fn().mockResolvedValue([{ cgid: '11' }]);

    const result = await createChannelGroup.execute(createToolContext({ execute }), { ...TARGET, name: 'VIP' });

    expect(result).toEqual({ success: true, action: 'channel_group_created', cgid: 11, name: 'VIP' });
    expect(execute).toHaveBeenCalledWith(1, 'channelgroupadd', { name: 'VIP', type: undefined });
  });
});

describe('rename_channel_group', () => {
  it('renames a group', async () => {
    const execute = vi.fn().mockResolvedValue({});

    await expect(
      renameChannelGroup.execute(createToolContext({ execute }), { ...TARGET, cgid: 5, name: 'Trusted' }),
    ).resolves.toEqual({ success: true, action: 'channel_group_renamed', cgid: 5, name: 'Trusted' });
    expect(execute).toHaveBeenCalledWith(1, 'channelgrouprename', { cgid: '5', name: 'Trusted' });
  });
});

describe('delete_channel_group', () => {
  it('is destructive and deletes a group', async () => {
    const execute = vi.fn().mockResolvedValue({});
    expect(deleteChannelGroup.risk).toBe('destructive');

    await expect(
      deleteChannelGroup.execute(createToolContext({ execute }), { ...TARGET, cgid: 5 }),
    ).resolves.toEqual({ success: true, action: 'channel_group_deleted', cgid: 5 });
    expect(execute).toHaveBeenCalledWith(1, 'channelgroupdel', { cgid: '5', force: 1 });
  });
});

describe('assign_client_channel_group', () => {
  it('assigns a client to a channel group within one channel', async () => {
    const execute = vi.fn().mockResolvedValue({});

    const result = await assignClientChannelGroup.execute(createToolContext({ execute }), {
      ...TARGET,
      cgid: 5,
      cid: 3,
      cldbid: 12,
    });

    expect(result).toEqual({
      success: true,
      action: 'client_channel_group_assigned',
      cgid: 5,
      cid: 3,
      cldbid: 12,
    });
    expect(execute).toHaveBeenCalledWith(1, 'setclientchannelgroup', { cgid: '5', cid: '3', cldbid: '12' });
  });
});

describe('list_channel_group_members', () => {
  it('lists the clients holding a channel group', async () => {
    const execute = vi.fn().mockResolvedValue([{ cldbid: '12' }]);

    await expect(
      listChannelGroupMembers.execute(createToolContext({ execute }), { ...TARGET, cgid: 5 }),
    ).resolves.toMatchObject({ success: true, action: 'channel_group_members_listed' });
    expect(execute).toHaveBeenCalledWith(1, 'channelgroupclientlist', { cgid: '5' });
  });
});
