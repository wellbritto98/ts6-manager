import { describe, expect, it, vi } from 'vitest';
import { serverGroupTools } from './server-group-tools.js';
import { createToolContext, FAKE_SERVER, findTool } from './tool-fakes.js';

const listServerGroupPermissions = findTool(serverGroupTools, 'list_server_group_permissions');
const setServerGroupPermission = findTool(serverGroupTools, 'set_server_group_permission');
const removeServerGroupPermission = findTool(serverGroupTools, 'remove_server_group_permission');
const copyServerGroupPermissions = findTool(serverGroupTools, 'copy_server_group_permissions');
const createServerGroup = findTool(serverGroupTools, 'create_server_group');
const renameServerGroup = findTool(serverGroupTools, 'rename_server_group');
const deleteServerGroup = findTool(serverGroupTools, 'delete_server_group');

const TARGET = { serverConfigId: FAKE_SERVER.id, virtualServerId: 1 };

describe('list_server_group_permissions', () => {
  it('lists the permissions of one server group', async () => {
    const execute = vi.fn().mockResolvedValue([{ permsid: 'b_serverinstance_help_view', permvalue: '1' }]);

    const result = await listServerGroupPermissions.execute(createToolContext({ execute }), {
      ...TARGET,
      sgid: 7,
    });

    expect(result).toMatchObject({ success: true, action: 'server_group_permissions_listed' });
    expect(execute).toHaveBeenCalledWith(1, 'servergrouppermlist', { sgid: '7', '-permsid': '' });
  });
});

describe('set_server_group_permission', () => {
  it('sets one permission and returns server_group_permission_set', async () => {
    const execute = vi.fn().mockResolvedValue({});

    const result = await setServerGroupPermission.execute(createToolContext({ execute }), {
      ...TARGET,
      sgid: 7,
      permsid: 'i_channel_needed_join_power',
      permvalue: 50,
    });

    expect(result).toMatchObject({ success: true, action: 'server_group_permission_set', sgid: 7 });
    expect(execute).toHaveBeenCalledWith(1, 'servergroupaddperm', {
      sgid: '7',
      permsid: 'i_channel_needed_join_power',
      permvalue: 50,
    });
  });

  it('rejects a field outside the allowlist', async () => {
    const execute = vi.fn();

    await expect(
      setServerGroupPermission.execute(createToolContext({ execute }), {
        ...TARGET,
        sgid: 7,
        permsid: 'i_channel_needed_join_power',
        permvalue: 50,
        permnegated: 1,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('remove_server_group_permission', () => {
  it('is destructive and removes one permission', async () => {
    const execute = vi.fn().mockResolvedValue({});
    expect(removeServerGroupPermission.risk).toBe('destructive');

    await expect(
      removeServerGroupPermission.execute(createToolContext({ execute }), {
        ...TARGET,
        sgid: 7,
        permsid: 'i_channel_needed_join_power',
      }),
    ).resolves.toMatchObject({ success: true, action: 'server_group_permission_removed', sgid: 7 });
    expect(execute).toHaveBeenCalledWith(1, 'servergroupdelperm', {
      sgid: '7',
      permsid: 'i_channel_needed_join_power',
    });
  });
});

describe('copy_server_group_permissions', () => {
  it('copies permissions onto an existing group, resending its own name/type unchanged', async () => {
    const execute = vi.fn().mockImplementation(async (_sid: number, command: string) =>
      command === 'servergrouplist' ? [{ sgid: '9', name: 'poczinha', type: '1' }] : {});

    const result = await copyServerGroupPermissions.execute(createToolContext({ execute }), {
      ...TARGET,
      ssgid: 7,
      tsgid: 9,
    });

    expect(result).toMatchObject({ success: true, action: 'server_group_permissions_copied', ssgid: 7, tsgid: 9 });
    expect(execute).toHaveBeenCalledWith(1, 'servergrouplist');
    expect(execute).toHaveBeenCalledWith(1, 'servergroupcopy', {
      ssgid: '7',
      tsgid: 9,
      name: 'poczinha',
      type: 1,
    });
  });

  it('rejects copying onto a target group that does not exist', async () => {
    const execute = vi.fn().mockImplementation(async (_sid: number, command: string) =>
      command === 'servergrouplist' ? [] : {});

    await expect(
      copyServerGroupPermissions.execute(createToolContext({ execute }), { ...TARGET, ssgid: 7, tsgid: 99 }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(execute).not.toHaveBeenCalledWith(1, 'servergroupcopy', expect.anything());
  });

  it('creates a brand-new target group when tsgid is omitted', async () => {
    const execute = vi.fn().mockResolvedValue({});

    const result = await copyServerGroupPermissions.execute(createToolContext({ execute }), {
      ...TARGET,
      ssgid: 7,
      name: 'poczinha-copy',
      type: 1,
    });

    expect(result).toMatchObject({ success: true, action: 'server_group_permissions_copied', ssgid: 7 });
    expect(execute).toHaveBeenCalledWith(1, 'servergroupcopy', {
      ssgid: '7',
      tsgid: undefined,
      name: 'poczinha-copy',
      type: 1,
    });
  });

  it('requires a name when creating a brand-new target group', async () => {
    const execute = vi.fn();

    await expect(
      copyServerGroupPermissions.execute(createToolContext({ execute }), { ...TARGET, ssgid: 7 }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('create_server_group', () => {
  it('creates a group and returns its new sgid', async () => {
    const execute = vi.fn().mockResolvedValue([{ sgid: '11' }]);

    const result = await createServerGroup.execute(createToolContext({ execute }), {
      ...TARGET,
      name: 'Moderators',
    });

    expect(result).toEqual({ success: true, action: 'server_group_created', sgid: 11, name: 'Moderators' });
    expect(execute).toHaveBeenCalledWith(1, 'servergroupadd', { name: 'Moderators', type: undefined });
  });
});

describe('rename_server_group', () => {
  it('renames a group', async () => {
    const execute = vi.fn().mockResolvedValue({});

    await expect(
      renameServerGroup.execute(createToolContext({ execute }), { ...TARGET, sgid: 7, name: 'Trusted' }),
    ).resolves.toEqual({ success: true, action: 'server_group_renamed', sgid: 7, name: 'Trusted' });
    expect(execute).toHaveBeenCalledWith(1, 'servergrouprename', { sgid: '7', name: 'Trusted' });
  });
});

describe('delete_server_group', () => {
  it('is destructive and deletes a group', async () => {
    const execute = vi.fn().mockResolvedValue({});
    expect(deleteServerGroup.risk).toBe('destructive');

    await expect(
      deleteServerGroup.execute(createToolContext({ execute }), { ...TARGET, sgid: 9 }),
    ).resolves.toEqual({ success: true, action: 'server_group_deleted', sgid: 9 });
    expect(execute).toHaveBeenCalledWith(1, 'servergroupdel', { sgid: '9', force: 1 });
  });
});
