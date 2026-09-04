import { describe, expect, it, vi } from 'vitest';
import { banTools } from './ban-tools.js';
import { createToolContext, FAKE_SERVER, findTool } from './tool-fakes.js';

const listBans = findTool(banTools, 'list_bans');
const addBan = findTool(banTools, 'add_ban');
const removeBan = findTool(banTools, 'remove_ban');
const removeAllBans = findTool(banTools, 'remove_all_bans');

const TARGET = { serverConfigId: FAKE_SERVER.id, virtualServerId: 1 };

describe('list_bans', () => {
  it('strips the ip field from every ban entry', async () => {
    const execute = vi.fn().mockResolvedValue([{ banid: '1', ip: '203.0.113.4', name: 'troll', reason: 'spam' }]);

    const result = await listBans.execute(createToolContext({ execute }), TARGET);

    expect(result).toEqual({
      success: true,
      action: 'bans_listed',
      bans: [{ banid: '1', name: 'troll', reason: 'spam' }],
    });
  });

  it('reads TeamSpeak error 1281 (no bans) as an empty list, not a failure', async () => {
    const { TSApiError } = await import('../../middleware/error-handler.js');
    const execute = vi.fn().mockRejectedValue(new TSApiError(1281, 'database empty result set'));

    await expect(listBans.execute(createToolContext({ execute }), TARGET))
      .resolves.toEqual({ success: true, action: 'bans_listed', bans: [] });
  });
});

describe('add_ban', () => {
  it('adds a ban by uid, mapping reason to banreason', async () => {
    const execute = vi.fn().mockResolvedValue({ banid: '5' });

    const result = await addBan.execute(createToolContext({ execute }), {
      ...TARGET,
      uid: 'someuid==',
      reason: 'repeated abuse',
    });

    expect(result).toMatchObject({ success: true, action: 'ban_added' });
    expect(execute).toHaveBeenCalledWith(1, 'banadd', { uid: 'someuid==', banreason: 'repeated abuse' });
  });

  it('rejects a ban with no ip, name or uid', async () => {
    const execute = vi.fn();

    await expect(addBan.execute(createToolContext({ execute }), { ...TARGET, reason: 'no target' }))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('is destructive', () => {
    expect(addBan.risk).toBe('destructive');
  });
});

describe('remove_ban', () => {
  it('removes one ban by id', async () => {
    const execute = vi.fn().mockResolvedValue({});

    await expect(removeBan.execute(createToolContext({ execute }), { ...TARGET, banid: 5 }))
      .resolves.toEqual({ success: true, action: 'ban_removed', banid: 5 });
    expect(execute).toHaveBeenCalledWith(1, 'bandel', { banid: '5' });
  });
});

describe('remove_all_bans', () => {
  it('removes every ban', async () => {
    const execute = vi.fn().mockResolvedValue({});

    await expect(removeAllBans.execute(createToolContext({ execute }), TARGET))
      .resolves.toEqual({ success: true, action: 'all_bans_removed' });
    expect(execute).toHaveBeenCalledWith(1, 'bandelall');
  });
});
