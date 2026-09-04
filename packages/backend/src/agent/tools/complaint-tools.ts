import { z } from 'zod';
import { addComplaint, deleteComplaint, listComplaints } from '../../services/complaint-management.service.js';
import { defineTool, type AgentToolDefinition } from '../tool-definition.js';
import { mutationScope, positiveId, virtualServerScope } from './schemas.js';

export const complaintTools: AgentToolDefinition[] = [
  defineTool({
    name: 'list_complaints',
    description: 'List complaints on one virtual server, optionally narrowed to complaints filed against one client database id.',
    inputSchema: z.object({ ...virtualServerScope, tcldbid: positiveId.optional() }).strict(),
    risk: 'read',
    run: async (context, input) => ({
      success: true,
      action: 'complaints_listed',
      complaints: await listComplaints(
        context.prisma,
        context.connectionPool,
        input.serverConfigId,
        input.virtualServerId,
        input.tcldbid,
      ),
    }),
  }),

  defineTool({
    name: 'add_complaint',
    description: 'File a complaint against a client database id.',
    inputSchema: z.object({ ...mutationScope, tcldbid: positiveId, message: z.string().min(1).max(200) }).strict(),
    risk: 'write',
    run: async (context, input) => {
      await addComplaint(
        context.prisma,
        context.connectionPool,
        input.serverConfigId,
        input.virtualServerId,
        input.tcldbid,
        input.message,
      );
      return { success: true, action: 'complaint_added', tcldbid: input.tcldbid };
    },
  }),

  defineTool({
    name: 'delete_complaint',
    description: 'Delete one complaint, identified by the target and filer client database ids.',
    inputSchema: z.object({ ...mutationScope, tcldbid: positiveId, fcldbid: positiveId }).strict(),
    risk: 'destructive',
    run: async (context, input) => {
      await deleteComplaint(
        context.prisma,
        context.connectionPool,
        input.serverConfigId,
        input.virtualServerId,
        input.tcldbid,
        input.fcldbid,
      );
      return { success: true, action: 'complaint_deleted', tcldbid: input.tcldbid, fcldbid: input.fcldbid };
    },
  }),
];
