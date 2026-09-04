import { describe, expect, it, vi } from 'vitest';
import { complaintTools } from './complaint-tools.js';
import { createToolContext, FAKE_SERVER, findTool } from './tool-fakes.js';

const listComplaints = findTool(complaintTools, 'list_complaints');
const addComplaint = findTool(complaintTools, 'add_complaint');
const deleteComplaint = findTool(complaintTools, 'delete_complaint');

const TARGET = { serverConfigId: FAKE_SERVER.id, virtualServerId: 1 };

describe('list_complaints', () => {
  it('lists every complaint when no filter is given', async () => {
    const execute = vi.fn().mockResolvedValue([]);

    await expect(listComplaints.execute(createToolContext({ execute }), TARGET))
      .resolves.toMatchObject({ success: true, action: 'complaints_listed' });
    expect(execute).toHaveBeenCalledWith(1, 'complainlist', undefined);
  });

  it('filters by target client database id', async () => {
    const execute = vi.fn().mockResolvedValue([]);

    await listComplaints.execute(createToolContext({ execute }), { ...TARGET, tcldbid: 12 });
    expect(execute).toHaveBeenCalledWith(1, 'complainlist', { tcldbid: '12' });
  });

  it('reads TeamSpeak error 1281 (no complaints) as an empty list', async () => {
    const { TSApiError } = await import('../../middleware/error-handler.js');
    const execute = vi.fn().mockRejectedValue(new TSApiError(1281, 'database empty result set'));

    await expect(listComplaints.execute(createToolContext({ execute }), TARGET))
      .resolves.toEqual({ success: true, action: 'complaints_listed', complaints: [] });
  });
});

describe('add_complaint', () => {
  it('files a complaint', async () => {
    const execute = vi.fn().mockResolvedValue({});

    await expect(
      addComplaint.execute(createToolContext({ execute }), { ...TARGET, tcldbid: 12, message: 'spamming' }),
    ).resolves.toEqual({ success: true, action: 'complaint_added', tcldbid: 12 });
    expect(execute).toHaveBeenCalledWith(1, 'complainadd', { tcldbid: '12', message: 'spamming' });
  });
});

describe('delete_complaint', () => {
  it('is destructive and deletes one complaint', async () => {
    const execute = vi.fn().mockResolvedValue({});
    expect(deleteComplaint.risk).toBe('destructive');

    await expect(
      deleteComplaint.execute(createToolContext({ execute }), { ...TARGET, tcldbid: 12, fcldbid: 5 }),
    ).resolves.toEqual({ success: true, action: 'complaint_deleted', tcldbid: 12, fcldbid: 5 });
    expect(execute).toHaveBeenCalledWith(1, 'complaindel', { tcldbid: '12', fcldbid: '5' });
  });
});
