import { describe, expect, it, vi } from 'vitest';
import { permissionTools } from './permission-tools.js';
import { createToolContext, FAKE_SERVER, findTool } from './tool-fakes.js';

const findPermission = findTool(permissionTools, 'find_permission');
const getPermissionOverview = findTool(permissionTools, 'get_permission_overview');
const listServerGroups = findTool(permissionTools, 'list_server_groups');
const listChannelGroups = findTool(permissionTools, 'list_channel_groups');
const addClientToServerGroup = findTool(permissionTools, 'add_client_to_server_group');
const removeClientFromServerGroup = findTool(permissionTools, 'remove_client_from_server_group');
const setChannelPermission = findTool(permissionTools, 'set_channel_permission');
const removeChannelPermission = findTool(permissionTools, 'remove_channel_permission');

const TARGET = { serverConfigId: FAKE_SERVER.id, virtualServerId: 1 };

describe('find_permission', () => {
  it('looks the permission up by name', async () => {
    const execute = vi.fn().mockResolvedValue([{ t: '0', id1: '6', id2: '0', p: '17276' }]);

    const result = await findPermission.execute(createToolContext({ execute }), {
      ...TARGET,
      permsid: 'i_channel_needed_join_power',
    });

    expect(result).toMatchObject({ success: true, action: 'permission_found' });
    expect(execute).toHaveBeenCalledWith(1, 'permfind', {
      permsid: 'i_channel_needed_join_power',
      permid: undefined,
    });
  });

  it('rejects a lookup that names neither permsid nor permid', async () => {
    const execute = vi.fn();

    await expect(findPermission.execute(createToolContext({ execute }), TARGET))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('permission and group listings', () => {
  it('reads the effective permissions of a client database id', async () => {
    const execute = vi.fn().mockResolvedValue([{ p: '1', v: '75' }]);

    await expect(getPermissionOverview.execute(createToolContext({ execute }), {
      ...TARGET,
      cldbid: 12,
    })).resolves.toMatchObject({ success: true, action: 'permission_overview_read' });
    expect(execute).toHaveBeenCalledWith(1, 'permoverview', { cldbid: '12', cid: 0, permid: 0 });
  });

  it('lists server groups', async () => {
    const execute = vi.fn().mockResolvedValue([{ sgid: '6', name: 'Guest', type: '1' }]);

    await expect(listServerGroups.execute(createToolContext({ execute }), TARGET))
      .resolves.toMatchObject({ success: true, action: 'server_groups_listed' });
  });

  it('lists channel groups', async () => {
    const execute = vi.fn().mockResolvedValue([{ cgid: '8', name: 'Channel Admin' }]);

    await expect(listChannelGroups.execute(createToolContext({ execute }), TARGET))
      .resolves.toEqual({
        success: true,
        action: 'channel_groups_listed',
        groups: [{ cgid: '8', name: 'Channel Admin' }],
      });
  });
});

describe('add_client_to_server_group', () => {
  it('adds the client and returns client_added_to_server_group', async () => {
    const execute = vi.fn().mockImplementation(async (_sid: number, command: string) =>
      command === 'servergroupclientlist' ? [] : {});

    const result = await addClientToServerGroup.execute(createToolContext({ execute }), {
      ...TARGET,
      sgid: 6,
      cldbid: 12,
    });

    expect(result).toEqual({
      success: true,
      action: 'client_added_to_server_group',
      sgid: 6,
      cldbid: 12,
    });
    expect(execute).toHaveBeenCalledWith(1, 'servergroupaddclient', { sgid: '6', cldbid: '12' });
  });

  it('returns already_in_desired_state without repeating the command for an existing member', async () => {
    const execute = vi.fn().mockImplementation(async (_sid: number, command: string) =>
      command === 'servergroupclientlist' ? [{ cldbid: '12' }] : {});

    const result = await addClientToServerGroup.execute(createToolContext({ execute }), {
      ...TARGET,
      sgid: 6,
      cldbid: 12,
    });

    expect(result).toMatchObject({ success: true, action: 'already_in_desired_state' });
    expect(execute).not.toHaveBeenCalledWith(1, 'servergroupaddclient', expect.anything());
  });
});

describe('channel permission tools', () => {
  it('sets one permission and returns channel_permission_set', async () => {
    const execute = vi.fn().mockResolvedValue({});

    const result = await setChannelPermission.execute(createToolContext({ execute }), {
      ...TARGET,
      cid: 4,
      permsid: 'i_channel_needed_join_power',
      permvalue: 50,
    });

    expect(result).toMatchObject({ success: true, action: 'channel_permission_set', cid: 4 });
    expect(execute).toHaveBeenCalledWith(1, 'channeladdperm', {
      cid: '4',
      permsid: 'i_channel_needed_join_power',
      permvalue: 50,
    });
  });

  it('rejects a permission field outside the allowlist', async () => {
    const execute = vi.fn();

    await expect(setChannelPermission.execute(createToolContext({ execute }), {
      ...TARGET,
      cid: 4,
      permsid: 'i_channel_needed_join_power',
      permvalue: 50,
      permnegated: 1,
    })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('removes one permission and returns channel_permission_removed', async () => {
    const execute = vi.fn().mockResolvedValue({});

    await expect(removeChannelPermission.execute(createToolContext({ execute }), {
      ...TARGET,
      cid: 4,
      permsid: 'i_channel_needed_join_power',
    })).resolves.toMatchObject({ success: true, action: 'channel_permission_removed', cid: 4 });
    expect(execute).toHaveBeenCalledWith(1, 'channeldelperm', {
      cid: '4',
      permsid: 'i_channel_needed_join_power',
    });
  });
});

describe('destructive risk', () => {
  it('marks both removal tools destructive', () => {
    expect(removeClientFromServerGroup.risk).toBe('destructive');
    expect(removeChannelPermission.risk).toBe('destructive');
  });

  it('removes the client from the server group', async () => {
    const execute = vi.fn().mockResolvedValue({});

    await expect(removeClientFromServerGroup.execute(createToolContext({ execute }), {
      ...TARGET,
      sgid: 6,
      cldbid: 12,
    })).resolves.toEqual({
      success: true,
      action: 'client_removed_from_server_group',
      sgid: 6,
      cldbid: 12,
    });
    expect(execute).toHaveBeenCalledWith(1, 'servergroupdelclient', { sgid: '6', cldbid: '12' });
  });
});
