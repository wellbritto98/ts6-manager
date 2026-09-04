import { describe, expect, it, vi } from 'vitest';
import { messageTools } from './message-tools.js';
import { createToolContext, FAKE_SERVER, findTool } from './tool-fakes.js';

const listMessages = findTool(messageTools, 'list_messages');
const getMessage = findTool(messageTools, 'get_message');
const sendMessage = findTool(messageTools, 'send_message');
const deleteMessage = findTool(messageTools, 'delete_message');

const TARGET = { serverConfigId: FAKE_SERVER.id, virtualServerId: 1 };

describe('list_messages', () => {
  it('lists offline messages', async () => {
    const execute = vi.fn().mockResolvedValue([]);

    await expect(listMessages.execute(createToolContext({ execute }), TARGET))
      .resolves.toMatchObject({ success: true, action: 'messages_listed' });
    expect(execute).toHaveBeenCalledWith(1, 'messagelist');
  });

  it('reads TeamSpeak error 1281 (no messages) as an empty list', async () => {
    const { TSApiError } = await import('../../middleware/error-handler.js');
    const execute = vi.fn().mockRejectedValue(new TSApiError(1281, 'database empty result set'));

    await expect(listMessages.execute(createToolContext({ execute }), TARGET))
      .resolves.toEqual({ success: true, action: 'messages_listed', messages: [] });
  });
});

describe('get_message', () => {
  it('reads one message', async () => {
    const execute = vi.fn().mockResolvedValue([{ msgid: '3', subject: 'Hi' }]);

    await expect(getMessage.execute(createToolContext({ execute }), { ...TARGET, msgid: 3 }))
      .resolves.toMatchObject({ success: true, action: 'message_read' });
    expect(execute).toHaveBeenCalledWith(1, 'messageget', { msgid: '3' });
  });
});

describe('send_message', () => {
  it('sends a message and drops any unrelated field', async () => {
    const execute = vi.fn().mockResolvedValue({});

    const result = await sendMessage.execute(createToolContext({ execute }), {
      ...TARGET,
      cluid: 'client-uid==',
      subject: 'Welcome',
      message: 'Hello there',
    });

    expect(result).toEqual({ success: true, action: 'message_sent', cluid: 'client-uid==' });
    expect(execute).toHaveBeenCalledWith(1, 'messageadd', {
      cluid: 'client-uid==',
      subject: 'Welcome',
      message: 'Hello there',
    });
  });
});

describe('delete_message', () => {
  it('is destructive and deletes one message', async () => {
    const execute = vi.fn().mockResolvedValue({});
    expect(deleteMessage.risk).toBe('destructive');

    await expect(deleteMessage.execute(createToolContext({ execute }), { ...TARGET, msgid: 3 }))
      .resolves.toEqual({ success: true, action: 'message_deleted', msgid: 3 });
    expect(execute).toHaveBeenCalledWith(1, 'messagedel', { msgid: '3' });
  });
});
