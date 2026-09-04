import { z } from 'zod';
import {
  getRecentServerLogs,
  getServerDashboard,
  getServerStatus,
  listEnabledServers,
} from '../../services/server-management.service.js';
import { defineTool, type AgentToolDefinition } from '../tool-definition.js';
import { virtualServerScope } from './schemas.js';

const targetSchema = z.object(virtualServerScope).strict();

const logsSchema = z
  .object({
    ...virtualServerScope,
    lines: z.number().int().positive().max(500).optional(),
  })
  .strict();

export const serverTools: AgentToolDefinition[] = [
  defineTool({
    name: 'list_servers',
    description:
      'List the enabled TeamSpeak server configurations and the virtual server ids each one serves. Call this first to learn the serverConfigId and virtualServerId every other tool needs. Credentials are never returned.',
    inputSchema: z.object({}).strict(),
    risk: 'read',
    run: async (context) => ({
      success: true,
      action: 'servers_listed',
      servers: await listEnabledServers(context.prisma, context.connectionPool),
    }),
  }),

  defineTool({
    name: 'get_server_status',
    description:
      'Read the full serverinfo record of one virtual server: name, platform, version, uptime, client counts and slots.',
    inputSchema: targetSchema,
    risk: 'read',
    run: async (context, input) => ({
      success: true,
      action: 'server_status_read',
      status: await getServerStatus(
        context.prisma,
        context.connectionPool,
        input.serverConfigId,
        input.virtualServerId,
      ),
    }),
  }),

  defineTool({
    name: 'get_server_dashboard',
    description:
      'Read the aggregated health summary of one virtual server: online users, channel count, bandwidth, packet loss and ping.',
    inputSchema: targetSchema,
    risk: 'read',
    run: async (context, input) => ({
      success: true,
      action: 'server_dashboard_read',
      dashboard: await getServerDashboard(
        context.prisma,
        context.connectionPool,
        input.serverConfigId,
        input.virtualServerId,
      ),
    }),
  }),

  defineTool({
    name: 'get_recent_server_logs',
    description:
      'Read the most recent log entries of one virtual server, newest first. Secret-looking values are redacted before they are returned.',
    inputSchema: logsSchema,
    risk: 'read',
    run: async (context, input) => ({
      success: true,
      action: 'server_logs_read',
      entries: await getRecentServerLogs(
        context.prisma,
        context.connectionPool,
        input.serverConfigId,
        input.virtualServerId,
        { lines: input.lines },
      ),
    }),
  }),
];
