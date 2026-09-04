import { describe, expect, it, vi } from 'vitest';
import { instanceTools } from './instance-tools.js';
import { createToolContext, FAKE_SERVER, findTool } from './tool-fakes.js';

const getInstanceInfo = findTool(instanceTools, 'get_instance_info');
const getHostInfo = findTool(instanceTools, 'get_host_info');
const getVersion = findTool(instanceTools, 'get_version');

const TARGET = { serverConfigId: FAKE_SERVER.id };

describe('instance tools', () => {
  it('reads instance info at sid=0, without a virtualServerId in the schema', async () => {
    const execute = vi.fn().mockResolvedValue([{ serverinstance_guest_serverquery_group: '1' }]);

    await expect(getInstanceInfo.execute(createToolContext({ execute }), TARGET))
      .resolves.toMatchObject({ success: true, action: 'instance_info_read' });
    expect(execute).toHaveBeenCalledWith(0, 'instanceinfo');
  });

  it('reads host info', async () => {
    const execute = vi.fn().mockResolvedValue([{ host_uptime: '123' }]);

    await expect(getHostInfo.execute(createToolContext({ execute }), TARGET))
      .resolves.toMatchObject({ success: true, action: 'host_info_read' });
    expect(execute).toHaveBeenCalledWith(0, 'hostinfo');
  });

  it('reads the server version', async () => {
    const execute = vi.fn().mockResolvedValue([{ version: '6.0.0' }]);

    await expect(getVersion.execute(createToolContext({ execute }), TARGET))
      .resolves.toMatchObject({ success: true, action: 'version_read' });
    expect(execute).toHaveBeenCalledWith(0, 'version');
  });

  it('rejects a virtualServerId field, which is not part of the schema', async () => {
    const execute = vi.fn();

    await expect(
      getInstanceInfo.execute(createToolContext({ execute }), { ...TARGET, virtualServerId: 1 }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(execute).not.toHaveBeenCalled();
  });
});
