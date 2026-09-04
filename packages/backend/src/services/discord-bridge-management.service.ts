import type { DiscordBridge } from '../discord/discord-bridge.js';

/**
 * Read-only Discord bridge status, mirroring `discord.routes.ts`'s GET
 * endpoints exactly. The bot token itself is never read or set here — that
 * stays exclusive to `PUT /api/discord/settings` in the SPA.
 */
export function getDiscordStatus(bridge?: DiscordBridge) {
  return bridge?.getStatus() ?? { enabled: false, running: false, error: 'Bridge not initialized', guildName: null, warnings: [] };
}

export function listDiscordGuilds(bridge?: DiscordBridge) {
  return bridge?.listGuilds() ?? [];
}

export function listDiscordChannels(bridge?: DiscordBridge) {
  return bridge?.listChannels() ?? { text: [], voice: [] };
}

export function listDiscordRoles(bridge?: DiscordBridge) {
  return bridge?.listRoles() ?? [];
}

export async function listDiscordTsChannels(bridge?: DiscordBridge) {
  return bridge ? bridge.listTsChannels() : [];
}
