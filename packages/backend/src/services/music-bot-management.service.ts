import type { PrismaClient } from '../../generated/prisma/index.js';
import { AppError } from '../middleware/error-handler.js';
import { validateUrl } from '../utils/url-validator.js';
import type { QueueItem, RepeatMode } from '../voice/playlist/queue.js';
import type { VoiceBot } from '../voice/voice-bot.js';
import type { VoiceBotManager } from '../voice/voice-bot-manager.js';
import {
  downloadAndEnqueue,
  enqueueSpotify,
  isSpotifyUrl,
  loadSpotifyConfig,
  type SpotifyEnqueueResult,
} from '../voice/music-ops.js';

const DEFAULT_VOLUME = 50;
const MIN_VOLUME = 0;
const MAX_VOLUME = 100;

/** Statuses in which the bot holds a voice connection and can play audio. */
const PLAYABLE_STATUSES = new Set(['connected', 'playing', 'paused']);

export interface MusicBotSummary {
  id: number;
  name: string;
  serverConfigId: number;
  serverConfig: unknown;
  nickname: string;
  defaultChannel: string | null;
  voicePort: number;
  volume: number;
  autoStart: boolean;
  status: string;
  nowPlaying: QueueItem | null;
  createdAt: Date;
}

export interface MusicBotState {
  status: string;
  nowPlaying: QueueItem | null;
  position: number;
  duration: number;
  volume: number;
  queue: QueueItem[];
  currentIndex: number;
  shuffle: boolean;
  repeat: RepeatMode;
  isStreaming: boolean;
  videoStream: unknown;
}

export interface MusicQueueView {
  items: QueueItem[];
  shuffle: boolean;
  repeat: RepeatMode;
}

export type PlayMediaResult =
  | { source: 'media'; item: QueueItem; queued: boolean }
  | { source: 'spotify'; spotify: SpotifyEnqueueResult };

export async function listMusicBots(
  prisma: PrismaClient,
  manager: VoiceBotManager,
): Promise<MusicBotSummary[]> {
  const dbBots = await prisma.musicBot.findMany({
    include: { serverConfig: { select: { id: true, name: true, host: true } } },
    orderBy: { id: 'asc' },
  });
  const runtime = new Map(manager.listBots().map((bot) => [bot.id, bot]));

  return dbBots.map((bot) => ({
    id: bot.id,
    name: bot.name,
    serverConfigId: bot.serverConfigId,
    serverConfig: bot.serverConfig,
    nickname: bot.nickname,
    defaultChannel: bot.defaultChannel,
    voicePort: bot.voicePort,
    volume: bot.volume,
    autoStart: bot.autoStart,
    status: runtime.get(bot.id)?.status ?? 'stopped',
    nowPlaying: runtime.get(bot.id)?.nowPlaying ?? null,
    createdAt: bot.createdAt,
  }));
}

export function getMusicBotState(manager: VoiceBotManager, botId: number): MusicBotState {
  const bot = requireBot(manager, botId);
  const progress = bot.playbackProgress;

  return {
    status: bot.status,
    nowPlaying: bot.nowPlaying,
    position: progress?.position ?? 0,
    duration: progress?.duration ?? 0,
    volume: bot.currentConfig.volume,
    queue: bot.queue.getAll(),
    currentIndex: bot.queue.index,
    shuffle: bot.queue.shuffle,
    repeat: bot.queue.repeat,
    isStreaming: bot.isStreaming,
    videoStream: bot.videoStreamStatus,
  };
}

export async function startMusicBot(manager: VoiceBotManager, botId: number): Promise<void> {
  requireBot(manager, botId);
  await manager.startBot(botId);
}

export async function stopMusicBot(manager: VoiceBotManager, botId: number): Promise<void> {
  requireBot(manager, botId);
  await manager.stopBot(botId);
}

/**
 * Queue a media URL on a running bot. Plain URLs go through
 * `downloadAndEnqueue`, which validates them against the SSRF guard before
 * yt-dlp ever runs; Spotify links are resolved through the Spotify importer.
 */
export async function playMediaUrl(
  prisma: PrismaClient,
  manager: VoiceBotManager,
  botId: number,
  url: string,
): Promise<PlayMediaResult> {
  const bot = requirePlayableBot(manager, botId);

  if (isSpotifyUrl(url)) {
    const spotifyConfig = await loadSpotifyConfig(prisma);
    if (!spotifyConfig) {
      throw new AppError(400, 'Spotify is not configured');
    }
    return { source: 'spotify', spotify: await enqueueSpotify(prisma, bot, spotifyConfig, url) };
  }

  // downloadAndEnqueue guards the URL itself, but it reports a blocked URL as
  // a plain Error. Checking here first turns an SSRF attempt into a typed
  // 400 for both callers, and yt-dlp still never sees the URL.
  const check = await validateUrl(url, { allowedProtocols: ['http:', 'https:'] });
  if (!check.valid) {
    throw new AppError(400, `URL blocked: ${check.error}`);
  }

  const { item, queued } = await downloadAndEnqueue(prisma, bot, url);
  return { source: 'media', item, queued };
}

export function pauseMusicBot(manager: VoiceBotManager, botId: number): void {
  requireBot(manager, botId).pause();
}

export function resumeMusicBot(manager: VoiceBotManager, botId: number): void {
  requireBot(manager, botId).resume();
}

export function skipMusicTrack(manager: VoiceBotManager, botId: number): void {
  requireBot(manager, botId).skip();
}

/**
 * Clamp and persist the bot volume. A bot that is not running still gets its
 * stored volume updated, which is what the REST volume control relies on.
 */
export async function setMusicBotVolume(
  prisma: PrismaClient,
  manager: VoiceBotManager,
  botId: number,
  volume: unknown,
): Promise<number> {
  const clamped = clampVolume(volume);
  manager.getBot(botId)?.setVolume(clamped);
  await prisma.musicBot.update({ where: { id: botId }, data: { volume: clamped } });
  return clamped;
}

export function listMusicQueue(manager: VoiceBotManager, botId: number): MusicQueueView {
  const bot = requireBot(manager, botId);
  return { items: bot.queue.getAll(), shuffle: bot.queue.shuffle, repeat: bot.queue.repeat };
}

export function clearMusicQueue(manager: VoiceBotManager, botId: number): void {
  requireBot(manager, botId).queue.clear();
}

function clampVolume(volume: unknown): number {
  const parsed = typeof volume === 'number' ? volume : parseInt(String(volume), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_VOLUME;
  return Math.max(MIN_VOLUME, Math.min(MAX_VOLUME, Math.trunc(parsed)));
}

function requireBot(manager: VoiceBotManager, botId: number): VoiceBot {
  const bot = manager.getBot(botId);
  if (!bot) throw new AppError(404, 'Music bot not found');
  return bot;
}

function requirePlayableBot(manager: VoiceBotManager, botId: number): VoiceBot {
  const bot = requireBot(manager, botId);
  if (!PLAYABLE_STATUSES.has(bot.status)) {
    throw new AppError(400, 'Bot is not connected');
  }
  return bot;
}
