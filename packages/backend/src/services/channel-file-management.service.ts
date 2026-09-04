import { parseQueryResponse, tsEscape } from '@ts6/common';
import type { PrismaClient } from '../../generated/prisma/index.js';
import type { BotEngine } from '../bot-engine/engine.js';
import { TSApiError } from '../middleware/error-handler.js';
import { AgentError } from '../agent/agent-error.js';
import { requirePositiveInt, requireServerRecord, requireVirtualServerId } from './server-resolver.js';

/**
 * File-transfer commands (`ft*`) have no WebQuery HTTP equivalent — they only
 * exist over ServerQuery, so this reuses the bot engine's shared SSH
 * connection (same one used for bot-flow events) instead of `connectionPool`.
 * `requireServerRecord` still runs first purely for the enabled/exists check
 * (not `requireEnabledServer`, which also demands a live WebQuery client —
 * irrelevant here and would wrongly reject a server whose SSH works fine but
 * whose WebQuery connection happens to be down).
 */
async function sshExecute(
  botEngine: BotEngine,
  configId: number,
  sid: number,
  command: string,
  params: Record<string, string>,
): Promise<Record<string, string>[]> {
  const bridge = botEngine.getEventBridge();
  const paramStr = Object.entries(params)
    .map(([key, value]) => `${key}=${tsEscape(value)}`)
    .join(' ');
  const fullCommand = paramStr ? `${command} ${paramStr}` : command;

  let rawResponse: string;
  try {
    rawResponse = await bridge.executeCommand(configId, sid, fullCommand);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const match = message.match(/^TS error (\d+): (.+)$/);
    if (match) {
      throw new TSApiError(parseInt(match[1], 10), match[2]);
    }
    if (message.includes('SSH not connected') || message.includes('SSH credentials')) {
      throw new AgentError(
        'SERVER_DISCONNECTED',
        'SSH is not configured or not connected for this server; file browsing requires SSH access',
      );
    }
    throw err;
  }

  return rawResponse.trim() ? parseQueryResponse(rawResponse) : [];
}

export async function listChannelFiles(
  prisma: PrismaClient,
  botEngine: BotEngine,
  serverConfigId: unknown,
  virtualServerId: unknown,
  cid: unknown,
  path = '/',
): Promise<Record<string, string>[]> {
  const server = await requireServerRecord(prisma, serverConfigId);
  const sid = requireVirtualServerId(virtualServerId);
  try {
    return await sshExecute(botEngine, server.id, sid, 'ftgetfilelist', {
      cid: String(requirePositiveInt(cid, 'cid')),
      cpw: '',
      path,
    });
  } catch (err) {
    // TS error 1281 = database_empty_result: an empty directory, not a failure.
    if (err instanceof TSApiError && err.code === 1281) return [];
    throw err;
  }
}

export async function createChannelDirectory(
  prisma: PrismaClient,
  botEngine: BotEngine,
  serverConfigId: unknown,
  virtualServerId: unknown,
  cid: unknown,
  dirname: string,
): Promise<unknown> {
  const server = await requireServerRecord(prisma, serverConfigId);
  const sid = requireVirtualServerId(virtualServerId);
  return sshExecute(botEngine, server.id, sid, 'ftcreatedir', {
    cid: String(requirePositiveInt(cid, 'cid')),
    cpw: '',
    dirname,
  });
}

export async function deleteChannelFile(
  prisma: PrismaClient,
  botEngine: BotEngine,
  serverConfigId: unknown,
  virtualServerId: unknown,
  cid: unknown,
  name: string,
): Promise<unknown> {
  const server = await requireServerRecord(prisma, serverConfigId);
  const sid = requireVirtualServerId(virtualServerId);
  return sshExecute(botEngine, server.id, sid, 'ftdeletefile', {
    cid: String(requirePositiveInt(cid, 'cid')),
    cpw: '',
    name,
  });
}
