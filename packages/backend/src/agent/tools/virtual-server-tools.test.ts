import { describe, expect, it, vi } from 'vitest';
import { FAKE_SERVER, createToolContext, findTool } from './tool-fakes.js';
import { virtualServerTools } from './virtual-server-tools.js';

const editVirtualServer = findTool(virtualServerTools, 'edit_virtual_server');

const TARGET = { serverConfigId: FAKE_SERVER.id, virtualServerId: 1 };

describe('edit_virtual_server', () => {
  it('sets the default server group', async () => {
    const execute = vi.fn().mockResolvedValue({});

    const result = await editVirtualServer.execute(createToolContext({ execute }), {
      ...TARGET,
      virtualserver_default_server_group: 7,
    });

    expect(result).toEqual({
      success: true,
      action: 'virtual_server_edited',
      changed: ['virtualserver_default_server_group'],
    });
    expect(execute).toHaveBeenCalledWith(1, 'serveredit', { virtualserver_default_server_group: 7 });
  });

  it('rejects the join password field, which is not in the schema at all', async () => {
    const execute = vi.fn();

    await expect(
      editVirtualServer.execute(createToolContext({ execute }), {
        ...TARGET,
        virtualserver_password: 'secret',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('is a write-risk tool', () => {
    expect(editVirtualServer.risk).toBe('write');
  });
});
