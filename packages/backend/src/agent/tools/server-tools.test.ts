import { describe, expect, it, vi } from 'vitest';
import { serverTools } from './server-tools.js';
import { createToolContext, FAKE_SERVER, findTool } from './tool-fakes.js';

const listServers = findTool(serverTools, 'list_servers');
const getServerStatus = findTool(serverTools, 'get_server_status');
const getServerDashboard = findTool(serverTools, 'get_server_dashboard');
const getRecentServerLogs = findTool(serverTools, 'get_recent_server_logs');

describe('list_servers', () => {
  it('returns the enabled configs with their virtual server ids and no credentials', async () => {
    const execute = vi.fn().mockResolvedValue([{ virtualserver_id: '1' }, { virtualserver_id: '2' }]);

    const result = await listServers.execute(createToolContext({ execute }), {});

    expect(result).toEqual({
      success: true,
      action: 'servers_listed',
      servers: [{ ...FAKE_SERVER, virtualServers: [1, 2] }],
    });
    expect(JSON.stringify(result)).not.toContain('apiKey');
    expect(JSON.stringify(result)).not.toContain('sshPassword');
  });

  it('returns an empty list when no config is enabled', async () => {
    const context = createToolContext({ servers: [{ ...FAKE_SERVER, enabled: false }] });

    await expect(listServers.execute(context, {})).resolves.toEqual({
      success: true,
      action: 'servers_listed',
      servers: [],
    });
  });

  it('rejects unknown input fields', async () => {
    await expect(listServers.execute(createToolContext(), { role: 'admin' }))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});

describe('get_server_status', () => {
  it('returns the serverinfo record of the named virtual server', async () => {
    const execute = vi.fn().mockResolvedValue({ virtualserver_name: 'Main' });

    const result = await getServerStatus.execute(createToolContext({ execute }), {
      serverConfigId: FAKE_SERVER.id,
      virtualServerId: 3,
    });

    expect(result).toEqual({
      success: true,
      action: 'server_status_read',
      status: { virtualserver_name: 'Main' },
    });
    expect(execute).toHaveBeenCalledWith(3, 'serverinfo');
  });

  it('rejects a missing serverConfigId as INVALID_INPUT', async () => {
    await expect(getServerStatus.execute(createToolContext(), { virtualServerId: 1 }))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('rejects a non-integer serverConfigId as INVALID_INPUT', async () => {
    await expect(getServerStatus.execute(createToolContext(), {
      serverConfigId: 1.5,
      virtualServerId: 1,
    })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('reports a disabled config as SERVER_NOT_FOUND without calling WebQuery', async () => {
    const execute = vi.fn();
    const context = createToolContext({ servers: [{ ...FAKE_SERVER, enabled: false }], execute });

    await expect(getServerStatus.execute(context, {
      serverConfigId: FAKE_SERVER.id,
      virtualServerId: 1,
    })).rejects.toMatchObject({ code: 'SERVER_NOT_FOUND' });
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('get_server_dashboard', () => {
  it('returns the aggregated health summary', async () => {
    const execute = vi.fn().mockImplementation(async (_sid: number, command: string) => {
      if (command === 'serverinfo') return { virtualserver_name: 'Main', virtualserver_maxclients: '32' };
      if (command === 'clientlist') return [{ client_type: '0' }, { client_type: '1' }];
      if (command === 'channellist') return [{ cid: '1' }];
      return {};
    });

    const result = await getServerDashboard.execute(createToolContext({ execute }), {
      serverConfigId: FAKE_SERVER.id,
      virtualServerId: 41,
    });

    expect(result).toMatchObject({
      success: true,
      action: 'server_dashboard_read',
      dashboard: { serverName: 'Main', onlineUsers: 1, maxClients: 32, channelCount: 1 },
    });
  });
});

describe('get_recent_server_logs', () => {
  it('returns redacted log entries and honours the requested line count', async () => {
    const execute = vi.fn().mockResolvedValue([{ l: 'token=abcdef1234567890abcdef1234567890' }]);

    const result = await getRecentServerLogs.execute(createToolContext({ execute }), {
      serverConfigId: FAKE_SERVER.id,
      virtualServerId: 1,
      lines: 20,
    });

    expect(result).toMatchObject({ success: true, action: 'server_logs_read' });
    expect(JSON.stringify(result)).not.toContain('abcdef1234567890abcdef1234567890');
    expect(execute).toHaveBeenCalledWith(1, 'logview', { lines: 20, reverse: 1, instance: 0 });
  });
});
