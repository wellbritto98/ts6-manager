import { describe, expect, it, vi } from 'vitest';
import { clientTools } from './client-tools.js';
import { createToolContext, FAKE_SERVER, findTool } from './tool-fakes.js';

const listClients = findTool(clientTools, 'list_clients');
const getClient = findTool(clientTools, 'get_client');
const moveClient = findTool(clientTools, 'move_client');
const pokeClient = findTool(clientTools, 'poke_client');
const kickClient = findTool(clientTools, 'kick_client');
const banClient = findTool(clientTools, 'ban_client');

const TARGET = { serverConfigId: FAKE_SERVER.id, virtualServerId: 1 };

describe('list_clients', () => {
  it('returns the online clients without any address field', async () => {
    const execute = vi.fn().mockResolvedValue([
      { clid: '3', client_nickname: 'Ana', connection_client_ip: '203.0.113.7', client_ip: '203.0.113.7' },
    ]);

    const result = await listClients.execute(createToolContext({ execute }), TARGET);

    expect(result).toEqual({
      success: true,
      action: 'clients_listed',
      clients: [{ clid: '3', client_nickname: 'Ana' }],
    });
    expect(JSON.stringify(result)).not.toContain('203.0.113.7');
  });

  it('never asks WebQuery for the ip flag', async () => {
    const execute = vi.fn().mockResolvedValue([]);

    await listClients.execute(createToolContext({ execute }), TARGET);

    const flags = execute.mock.calls[0][2] as Record<string, string>;
    expect(Object.keys(flags)).not.toContain('-ip');
  });

  it('rejects an attempt to ask for addresses', async () => {
    await expect(listClients.execute(createToolContext(), { ...TARGET, includeIp: true }))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});

describe('get_client', () => {
  it('reads one client by clid without its address', async () => {
    const execute = vi.fn().mockResolvedValue({ clid: '3', client_nickname: 'Ana', connection_client_ip: '203.0.113.7' });

    const result = await getClient.execute(createToolContext({ execute }), { ...TARGET, clid: 3 });

    expect(result).toEqual({
      success: true,
      action: 'client_read',
      client: { clid: '3', client_nickname: 'Ana' },
    });
    expect(execute).toHaveBeenCalledWith(1, 'clientinfo', { clid: '3' });
  });
});

describe('move_client', () => {
  it('moves the named client into the named channel and returns client_moved', async () => {
    const execute = vi.fn().mockResolvedValue({});

    const result = await moveClient.execute(createToolContext({ execute }), {
      ...TARGET,
      clid: 3,
      cid: 9,
    });

    expect(result).toEqual({ success: true, action: 'client_moved', clid: 3, cid: 9 });
    expect(execute).toHaveBeenCalledWith(1, 'clientmove', { clid: '3', cid: '9', cpw: undefined });
  });
});

describe('poke_client', () => {
  it('pokes the client with the given message', async () => {
    const execute = vi.fn().mockResolvedValue({});

    await expect(pokeClient.execute(createToolContext({ execute }), {
      ...TARGET,
      clid: 3,
      msg: 'Please join the lobby',
    })).resolves.toEqual({ success: true, action: 'client_poked', clid: 3 });
    expect(execute).toHaveBeenCalledWith(1, 'clientpoke', { clid: '3', msg: 'Please join the lobby' });
  });
});

describe('kick_client and ban_client', () => {
  it('are both registered as destructive tools', () => {
    expect(kickClient.risk).toBe('destructive');
    expect(banClient.risk).toBe('destructive');
  });

  it('kicks the client from the virtual server', async () => {
    const execute = vi.fn().mockResolvedValue({});

    await expect(kickClient.execute(createToolContext({ execute }), {
      ...TARGET,
      clid: 3,
      reason: 'spam',
    })).resolves.toEqual({ success: true, action: 'client_kicked', clid: 3 });
    expect(execute).toHaveBeenCalledWith(1, 'clientkick', { clid: '3', reasonid: 5, reasonmsg: 'spam' });
  });

  it('bans the client for the requested duration', async () => {
    const execute = vi.fn().mockResolvedValue({});

    await expect(banClient.execute(createToolContext({ execute }), {
      ...TARGET,
      clid: 3,
      time: 600,
      reason: 'spam',
    })).resolves.toEqual({ success: true, action: 'client_banned', clid: 3 });
    expect(execute).toHaveBeenCalledWith(1, 'banclient', { clid: '3', time: 600, banreason: 'spam' });
  });
});
