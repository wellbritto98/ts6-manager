import { z } from 'zod';
import { getHostInfo, getInstanceInfo, getVersion } from '../../services/instance-management.service.js';
import { defineTool, type AgentToolDefinition } from '../tool-definition.js';
import { serverScope } from './schemas.js';

/**
 * Instance-level commands (sid=0) are not scoped to one virtual server, so
 * these tools take only `serverConfigId` — an exception to the "almost every
 * tool needs virtualServerId" rule stated in the tool catalog. `instanceedit`
 * is deliberately not wrapped: it changes settings shared by every virtual
 * server on the instance, a larger blast radius than any other write tool.
 */
export const instanceTools: AgentToolDefinition[] = [
  defineTool({
    name: 'get_instance_info',
    description: 'Read TeamSpeak instance-wide settings shared by every virtual server (default groups, flood limits, etc.).',
    inputSchema: z.object(serverScope).strict(),
    risk: 'read',
    run: async (context, input) => ({
      success: true,
      action: 'instance_info_read',
      info: await getInstanceInfo(context.prisma, context.connectionPool, input.serverConfigId),
    }),
  }),

  defineTool({
    name: 'get_host_info',
    description: 'Read the TeamSpeak host machine metrics (uptime, connection and packet counters).',
    inputSchema: z.object(serverScope).strict(),
    risk: 'read',
    run: async (context, input) => ({
      success: true,
      action: 'host_info_read',
      info: await getHostInfo(context.prisma, context.connectionPool, input.serverConfigId),
    }),
  }),

  defineTool({
    name: 'get_version',
    description: 'Read the TeamSpeak server software version and platform.',
    inputSchema: z.object(serverScope).strict(),
    risk: 'read',
    run: async (context, input) => ({
      success: true,
      action: 'version_read',
      version: await getVersion(context.prisma, context.connectionPool, input.serverConfigId),
    }),
  }),
];
