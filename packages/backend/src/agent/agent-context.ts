import type { PrismaClient } from '../../generated/prisma/index.js';
import type { BotEngine } from '../bot-engine/engine.js';
import type { ConnectionPool } from '../ts-client/connection-pool.js';
import type { VoiceBotManager } from '../voice/voice-bot-manager.js';

export interface AgentActor {
  externalUserId: string;
  email?: string;
  name?: string;
  role: 'admin';
}

export interface AgentContext {
  actor: AgentActor;
  chatId?: string;
  messageId?: string;
  requestId: string;
  prisma: PrismaClient;
  connectionPool: ConnectionPool;
  voiceBotManager: VoiceBotManager;
  botEngine: BotEngine;
}
