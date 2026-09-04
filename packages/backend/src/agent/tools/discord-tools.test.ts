import { describe, expect, it } from 'vitest';
import { discordTools } from './discord-tools.js';
import { createToolContext, findTool } from './tool-fakes.js';

const getDiscordStatus = findTool(discordTools, 'get_discord_status');
const listDiscordGuilds = findTool(discordTools, 'list_discord_guilds');
const listDiscordChannels = findTool(discordTools, 'list_discord_channels');
const listDiscordRoles = findTool(discordTools, 'list_discord_roles');
const listDiscordTsChannels = findTool(discordTools, 'list_discord_ts_channels');

describe('discord tools without a running bridge', () => {
  it('reports a disabled status instead of throwing', async () => {
    await expect(getDiscordStatus.execute(createToolContext(), {})).resolves.toMatchObject({
      success: true,
      action: 'discord_status_read',
      status: { enabled: false, running: false },
    });
  });

  it('returns empty lists instead of throwing', async () => {
    await expect(listDiscordGuilds.execute(createToolContext(), {})).resolves.toEqual({
      success: true,
      action: 'discord_guilds_listed',
      guilds: [],
    });
    await expect(listDiscordChannels.execute(createToolContext(), {})).resolves.toEqual({
      success: true,
      action: 'discord_channels_listed',
      channels: { text: [], voice: [] },
    });
    await expect(listDiscordRoles.execute(createToolContext(), {})).resolves.toEqual({
      success: true,
      action: 'discord_roles_listed',
      roles: [],
    });
    await expect(listDiscordTsChannels.execute(createToolContext(), {})).resolves.toEqual({
      success: true,
      action: 'discord_ts_channels_listed',
      channels: [],
    });
  });
});

describe('discord tools with a running bridge', () => {
  it('reads the bridge status', async () => {
    const discordBridge = {
      getStatus: () => ({ enabled: true, running: true, error: null, guildName: 'My Server', warnings: [] }),
      listGuilds: () => [{ id: '1', name: 'My Server' }],
      listChannels: () => ({ text: [{ id: '2', name: 'general' }], voice: [] }),
      listRoles: () => [{ id: '3', name: 'Admin' }],
      listTsChannels: async () => [{ cid: '1', name: 'Lobby' }],
    };

    await expect(getDiscordStatus.execute(createToolContext({ discordBridge }), {})).resolves.toMatchObject({
      status: { enabled: true, guildName: 'My Server' },
    });
    await expect(listDiscordGuilds.execute(createToolContext({ discordBridge }), {})).resolves.toMatchObject({
      guilds: [{ id: '1', name: 'My Server' }],
    });
  });
});
