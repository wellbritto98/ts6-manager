import { z } from 'zod';
import {
  createChannelDirectory,
  deleteChannelFile,
  listChannelFiles,
} from '../../services/channel-file-management.service.js';
import { defineTool, type AgentToolDefinition } from '../tool-definition.js';
import { mutationScope, positiveId, virtualServerScope } from './schemas.js';

export const channelFileTools: AgentToolDefinition[] = [
  defineTool({
    name: 'list_channel_files',
    description:
      "List the files and subdirectories in one channel's file storage. Requires SSH access to be configured for the server.",
    inputSchema: z.object({ ...virtualServerScope, cid: positiveId, path: z.string().max(500).optional() }).strict(),
    risk: 'read',
    run: async (context, input) => ({
      success: true,
      action: 'channel_files_listed',
      files: await listChannelFiles(
        context.prisma,
        context.botEngine,
        input.serverConfigId,
        input.virtualServerId,
        input.cid,
        input.path,
      ),
    }),
  }),

  defineTool({
    name: 'create_channel_directory',
    description: "Create a subdirectory in one channel's file storage. Requires SSH access to be configured for the server.",
    inputSchema: z.object({ ...mutationScope, cid: positiveId, dirname: z.string().min(1).max(255) }).strict(),
    risk: 'write',
    run: async (context, input) => {
      await createChannelDirectory(
        context.prisma,
        context.botEngine,
        input.serverConfigId,
        input.virtualServerId,
        input.cid,
        input.dirname,
      );
      return { success: true, action: 'channel_directory_created', cid: input.cid, dirname: input.dirname };
    },
  }),

  defineTool({
    name: 'delete_channel_file',
    description: "Delete one file or directory in a channel's file storage. Requires SSH access to be configured for the server.",
    inputSchema: z.object({ ...mutationScope, cid: positiveId, name: z.string().min(1).max(255) }).strict(),
    risk: 'destructive',
    run: async (context, input) => {
      await deleteChannelFile(
        context.prisma,
        context.botEngine,
        input.serverConfigId,
        input.virtualServerId,
        input.cid,
        input.name,
      );
      return { success: true, action: 'channel_file_deleted', cid: input.cid, name: input.name };
    },
  }),
];
