import { z } from 'zod';
import { deleteMessage, getMessage, listMessages, sendMessage } from '../../services/message-management.service.js';
import { defineTool, type AgentToolDefinition } from '../tool-definition.js';
import { mutationScope, positiveId, virtualServerScope } from './schemas.js';

export const messageTools: AgentToolDefinition[] = [
  defineTool({
    name: 'list_messages',
    description: "List the virtual server's offline messages (metadata only, not each message body).",
    inputSchema: z.object(virtualServerScope).strict(),
    risk: 'read',
    run: async (context, input) => ({
      success: true,
      action: 'messages_listed',
      messages: await listMessages(context.prisma, context.connectionPool, input.serverConfigId, input.virtualServerId),
    }),
  }),

  defineTool({
    name: 'get_message',
    description: 'Read the full subject and body of one offline message.',
    inputSchema: z.object({ ...virtualServerScope, msgid: positiveId }).strict(),
    risk: 'read',
    run: async (context, input) => ({
      success: true,
      action: 'message_read',
      message: await getMessage(context.prisma, context.connectionPool, input.serverConfigId, input.virtualServerId, input.msgid),
    }),
  }),

  defineTool({
    name: 'send_message',
    description: "Send an offline message to a client, named by their TeamSpeak unique id (cluid, not the client's database id).",
    inputSchema: z
      .object({
        ...mutationScope,
        cluid: z.string().min(1).max(64),
        subject: z.string().min(1).max(200),
        message: z.string().min(1).max(1024),
      })
      .strict(),
    risk: 'write',
    run: async (context, input) => {
      await sendMessage(context.prisma, context.connectionPool, input.serverConfigId, input.virtualServerId, input);
      return { success: true, action: 'message_sent', cluid: input.cluid };
    },
  }),

  defineTool({
    name: 'delete_message',
    description: 'Delete one offline message by its msgid.',
    inputSchema: z.object({ ...mutationScope, msgid: positiveId }).strict(),
    risk: 'destructive',
    run: async (context, input) => {
      await deleteMessage(context.prisma, context.connectionPool, input.serverConfigId, input.virtualServerId, input.msgid);
      return { success: true, action: 'message_deleted', msgid: input.msgid };
    },
  }),
];
