import { z } from 'zod';
import {
  getDiscordStatus,
  listDiscordChannels,
  listDiscordGuilds,
  listDiscordRoles,
  listDiscordTsChannels,
} from '../../services/discord-bridge-management.service.js';
import { defineTool, type AgentToolDefinition } from '../tool-definition.js';

/**
 * No `serverConfigId`/`virtualServerId`: the Discord bridge is a single
 * process-wide connection, not scoped per TeamSpeak server. Every tool here
 * is read-only and degrades to an empty/disabled result when the bridge
 * hasn't started — it never throws for a missing bridge.
 */
export const discordTools: AgentToolDefinition[] = [
  defineTool({
    name: 'get_discord_status',
    description: 'Read whether the Discord bridge is enabled, connected, and to which guild.',
    inputSchema: z.object({}).strict(),
    risk: 'read',
    run: async (context) => ({
      success: true,
      action: 'discord_status_read',
      status: getDiscordStatus(context.discordBridge),
    }),
  }),

  defineTool({
    name: 'list_discord_guilds',
    description: 'List the Discord servers (guilds) the bot has been invited to.',
    inputSchema: z.object({}).strict(),
    risk: 'read',
    run: async (context) => ({
      success: true,
      action: 'discord_guilds_listed',
      guilds: listDiscordGuilds(context.discordBridge),
    }),
  }),

  defineTool({
    name: 'list_discord_channels',
    description: 'List the text and voice channels of the guild the Discord bridge is configured for.',
    inputSchema: z.object({}).strict(),
    risk: 'read',
    run: async (context) => ({
      success: true,
      action: 'discord_channels_listed',
      channels: listDiscordChannels(context.discordBridge),
    }),
  }),

  defineTool({
    name: 'list_discord_roles',
    description: 'List the selectable roles of the guild the Discord bridge is configured for.',
    inputSchema: z.object({}).strict(),
    risk: 'read',
    run: async (context) => ({
      success: true,
      action: 'discord_roles_listed',
      roles: listDiscordRoles(context.discordBridge),
    }),
  }),

  defineTool({
    name: 'list_discord_ts_channels',
    description: 'List the TeamSpeak channels of the server the Discord bridge watches.',
    inputSchema: z.object({}).strict(),
    risk: 'read',
    run: async (context) => ({
      success: true,
      action: 'discord_ts_channels_listed',
      channels: await listDiscordTsChannels(context.discordBridge),
    }),
  }),
];
