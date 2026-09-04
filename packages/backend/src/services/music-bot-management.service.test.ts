import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/index.js';
import type { AppError } from '../middleware/error-handler.js';
import type { VoiceBotManager } from '../voice/voice-bot-manager.js';
import {
  clearMusicQueue,
  getMusicBotState,
  listMusicBots,
  listMusicQueue,
  pauseMusicBot,
  playMediaUrl,
  resumeMusicBot,
  setMusicBotVolume,
  skipMusicTrack,
  startMusicBot,
  stopMusicBot,
} from './music-bot-management.service.js';

const downloadYouTube = vi.fn();

vi.mock('../voice/audio/youtube.js', () => ({
  downloadYouTube: (...args: unknown[]) => downloadYouTube(...args),
  searchYouTube: vi.fn(),
}));

const enqueueSpotify = vi.fn();
const loadSpotifyConfig = vi.fn();

vi.mock('../voice/music-ops.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../voice/music-ops.js')>();
  return {
    ...actual,
    enqueueSpotify: (...args: unknown[]) => enqueueSpotify(...args),
    loadSpotifyConfig: (...args: unknown[]) => loadSpotifyConfig(...args),
  };
});

const BOT_ID = 3;

function createBot(status = 'connected') {
  const queue = {
    items: [{ id: 'yt_a', title: 'A', filePath: '/m/a.opus', source: 'youtube' }],
    getAll: vi.fn(function (this: void) { return queue.items; }),
    add: vi.fn((item: unknown) => { queue.items.push(item as never); }),
    playAt: vi.fn(),
    clear: vi.fn(() => { queue.items = []; }),
    index: 0,
    shuffle: false,
    repeat: 'off',
    get length() { return queue.items.length; },
  };
  return {
    status,
    nowPlaying: { id: 'yt_a', title: 'A' },
    playbackProgress: { position: 12, duration: 180 },
    currentConfig: { volume: 40, serverConfigId: 1 },
    isStreaming: false,
    videoStreamStatus: { active: false },
    queue,
    play: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    skip: vi.fn(),
    setVolume: vi.fn(),
  };
}

function createManager(bot: ReturnType<typeof createBot> | undefined) {
  const manager = {
    getBot: vi.fn(() => bot),
    listBots: vi.fn(() => (bot ? [{ id: BOT_ID, status: bot.status, nowPlaying: bot.nowPlaying }] : [])),
    startBot: vi.fn(),
    stopBot: vi.fn(),
  };
  return { manager: manager as unknown as VoiceBotManager, spies: manager };
}

function createPrisma() {
  const update = vi.fn().mockResolvedValue({});
  const upsert = vi.fn().mockResolvedValue({});
  const findMany = vi.fn().mockResolvedValue([{
    id: BOT_ID,
    name: 'Radio',
    serverConfigId: 1,
    serverConfig: { id: 1, name: 'Main', host: 'ts.example.com' },
    nickname: 'MusicBot',
    defaultChannel: 'Lobby',
    voicePort: 9987,
    volume: 40,
    autoStart: false,
    identityData: 'secret-identity-blob',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  }]);
  const prisma = {
    musicBot: { findMany, update },
    musicRequest: { upsert },
  } as unknown as PrismaClient;
  return { prisma, update, findMany };
}

beforeEach(() => {
  vi.clearAllMocks();
  loadSpotifyConfig.mockResolvedValue(null);
  downloadYouTube.mockResolvedValue({
    filePath: '/m/new.opus',
    info: { id: 'newid', title: 'New Song', artist: 'Someone', duration: 210 },
  });
});

describe('listMusicBots', () => {
  it('returns the public bot fields with runtime status and never the identity blob', async () => {
    const { prisma } = createPrisma();
    const { manager } = createManager(createBot('playing'));

    const bots = await listMusicBots(prisma, manager);

    expect(bots).toEqual([{
      id: BOT_ID,
      name: 'Radio',
      serverConfigId: 1,
      serverConfig: { id: 1, name: 'Main', host: 'ts.example.com' },
      nickname: 'MusicBot',
      defaultChannel: 'Lobby',
      voicePort: 9987,
      volume: 40,
      autoStart: false,
      status: 'playing',
      nowPlaying: { id: 'yt_a', title: 'A' },
      createdAt: new Date('2026-01-01T00:00:00Z'),
    }]);
    expect(Object.keys(bots[0])).not.toContain('identityData');
  });

  it('reports a bot with no runtime instance as stopped', async () => {
    const { prisma } = createPrisma();
    const { manager } = createManager(undefined);

    const bots = await listMusicBots(prisma, manager);

    expect(bots[0]).toMatchObject({ status: 'stopped', nowPlaying: null });
  });
});

describe('getMusicBotState', () => {
  it('reports status, now playing, volume and the queue', () => {
    const { manager } = createManager(createBot('paused'));

    const state = getMusicBotState(manager, BOT_ID);

    expect(state).toMatchObject({
      status: 'paused',
      nowPlaying: { id: 'yt_a', title: 'A' },
      volume: 40,
      position: 12,
      duration: 180,
      queue: [{ id: 'yt_a', title: 'A', filePath: '/m/a.opus', source: 'youtube' }],
      currentIndex: 0,
      shuffle: false,
      repeat: 'off',
    });
  });

  it('fails with a 404 when the bot does not exist', () => {
    const { manager } = createManager(undefined);

    expect(() => getMusicBotState(manager, BOT_ID)).toThrow(
      expect.objectContaining<Partial<AppError>>({ statusCode: 404, message: 'Music bot not found' }),
    );
  });
});

describe('startMusicBot / stopMusicBot', () => {
  it('delegates start and stop to the manager', async () => {
    const { manager, spies } = createManager(createBot());

    await startMusicBot(manager, BOT_ID);
    await stopMusicBot(manager, BOT_ID);

    expect(spies.startBot).toHaveBeenCalledWith(BOT_ID);
    expect(spies.stopBot).toHaveBeenCalledWith(BOT_ID);
  });

  it('fails with a 404 and does not start when the bot does not exist', async () => {
    const { manager, spies } = createManager(undefined);

    await expect(startMusicBot(manager, BOT_ID)).rejects.toEqual(
      expect.objectContaining<Partial<AppError>>({ statusCode: 404 }),
    );
    expect(spies.startBot).not.toHaveBeenCalled();
  });
});

describe('playMediaUrl', () => {
  it('rejects a URL blocked by the SSRF guard without downloading it', async () => {
    const { prisma } = createPrisma();
    const { manager } = createManager(createBot());

    await expect(
      playMediaUrl(prisma, manager, BOT_ID, 'http://169.254.169.254/latest/meta-data'),
    ).rejects.toEqual(expect.objectContaining<Partial<AppError>>({ statusCode: 400 }));
    expect(downloadYouTube).not.toHaveBeenCalled();
  });

  it('starts playback immediately for an allowed URL on an idle bot', async () => {
    const { prisma } = createPrisma();
    const bot = createBot('connected');
    const { manager } = createManager(bot);

    const result = await playMediaUrl(prisma, manager, BOT_ID, 'https://www.youtube.com/watch?v=abc');

    expect(result).toEqual({
      source: 'media',
      queued: false,
      item: {
        id: 'yt_newid',
        title: 'New Song',
        artist: 'Someone',
        duration: 210,
        filePath: '/m/new.opus',
        source: 'youtube',
        sourceUrl: 'https://www.youtube.com/watch?v=abc',
      },
    });
    expect(bot.play).toHaveBeenCalledOnce();
  });

  it('queues behind the current track when the bot is already playing', async () => {
    const { prisma } = createPrisma();
    const bot = createBot('playing');
    const { manager } = createManager(bot);

    const result = await playMediaUrl(prisma, manager, BOT_ID, 'https://www.youtube.com/watch?v=abc');

    expect(result).toMatchObject({ source: 'media', queued: true });
    expect(bot.play).not.toHaveBeenCalled();
  });

  it('resolves a Spotify link through the Spotify importer when credentials exist', async () => {
    const { prisma } = createPrisma();
    const bot = createBot();
    const { manager } = createManager(bot);
    loadSpotifyConfig.mockResolvedValue({ clientId: 'id', clientSecret: 'secret', maxAlbumTracks: 50 });
    enqueueSpotify.mockResolvedValue({ type: 'track', name: 'Song', added: 1, total: 1, failed: [], firstStarted: true });

    const result = await playMediaUrl(prisma, manager, BOT_ID, 'https://open.spotify.com/track/abc');

    expect(result).toEqual({
      source: 'spotify',
      spotify: { type: 'track', name: 'Song', added: 1, total: 1, failed: [], firstStarted: true },
    });
    expect(downloadYouTube).not.toHaveBeenCalled();
  });

  it('rejects a Spotify link with a 400 when Spotify is not configured', async () => {
    const { prisma } = createPrisma();
    const { manager } = createManager(createBot());

    await expect(
      playMediaUrl(prisma, manager, BOT_ID, 'https://open.spotify.com/track/abc'),
    ).rejects.toEqual(expect.objectContaining<Partial<AppError>>({ statusCode: 400 }));
    expect(enqueueSpotify).not.toHaveBeenCalled();
  });

  it('refuses to play on a bot that holds no voice connection', async () => {
    const { prisma } = createPrisma();
    const { manager } = createManager(createBot('stopped'));

    await expect(
      playMediaUrl(prisma, manager, BOT_ID, 'https://www.youtube.com/watch?v=abc'),
    ).rejects.toEqual(expect.objectContaining<Partial<AppError>>({ statusCode: 400, message: 'Bot is not connected' }));
    expect(downloadYouTube).not.toHaveBeenCalled();
  });
});

describe('playback controls', () => {
  it('forwards pause, resume and skip to the bot', () => {
    const bot = createBot();
    const { manager } = createManager(bot);

    pauseMusicBot(manager, BOT_ID);
    resumeMusicBot(manager, BOT_ID);
    skipMusicTrack(manager, BOT_ID);

    expect(bot.pause).toHaveBeenCalledOnce();
    expect(bot.resume).toHaveBeenCalledOnce();
    expect(bot.skip).toHaveBeenCalledOnce();
  });
});

describe('setMusicBotVolume', () => {
  it.each([
    [150, 100],
    [-20, 0],
    [70, 70],
  ])('clamps a requested volume of %i to %i', async (requested, expected) => {
    const { prisma, update } = createPrisma();
    const bot = createBot();
    const { manager } = createManager(bot);

    await expect(setMusicBotVolume(prisma, manager, BOT_ID, requested)).resolves.toBe(expected);
    expect(bot.setVolume).toHaveBeenCalledWith(expected);
    expect(update).toHaveBeenCalledWith({ where: { id: BOT_ID }, data: { volume: expected } });
  });

  it('falls back to the default volume when the value is not a number', async () => {
    const { prisma } = createPrisma();
    const { manager } = createManager(createBot());

    await expect(setMusicBotVolume(prisma, manager, BOT_ID, 'loud')).resolves.toBe(50);
  });
});

describe('queue', () => {
  it('lists the queue with its shuffle and repeat state', () => {
    const { manager } = createManager(createBot());

    expect(listMusicQueue(manager, BOT_ID)).toEqual({
      items: [{ id: 'yt_a', title: 'A', filePath: '/m/a.opus', source: 'youtube' }],
      shuffle: false,
      repeat: 'off',
    });
  });

  it('clears the queue', () => {
    const bot = createBot();
    const { manager } = createManager(bot);

    clearMusicQueue(manager, BOT_ID);

    expect(bot.queue.clear).toHaveBeenCalledOnce();
  });
});
