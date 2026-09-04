import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadAndEnqueue } from '../../voice/music-ops.js';
import type { QueueItem } from '../../voice/playlist/queue.js';
import { musicTools } from './music-tools.js';
import { createToolContext, findTool } from './tool-fakes.js';

vi.mock('../../voice/music-ops.js', () => ({
  downloadAndEnqueue: vi.fn(),
  enqueueSpotify: vi.fn(),
  isSpotifyUrl: (url: string) => url.startsWith('https://open.spotify.com'),
  loadSpotifyConfig: vi.fn(async () => null),
}));

const listMusicBots = findTool(musicTools, 'list_music_bots');
const getMusicBotState = findTool(musicTools, 'get_music_bot_state');
const startMusicBot = findTool(musicTools, 'start_music_bot');
const stopMusicBot = findTool(musicTools, 'stop_music_bot');
const playMediaUrl = findTool(musicTools, 'play_media_url');
const pauseMusicBot = findTool(musicTools, 'pause_music_bot');
const skipMusicTrack = findTool(musicTools, 'skip_music_track');
const setMusicVolume = findTool(musicTools, 'set_music_volume');
const listMusicQueue = findTool(musicTools, 'list_music_queue');
const clearMusicQueue = findTool(musicTools, 'clear_music_queue');

const TRACK: QueueItem = {
  id: 'track-1',
  title: 'Song',
  duration: 200,
  filePath: '/var/lib/ts6/music/track-1.opus',
  source: 'youtube',
};

function createFakes(status = 'connected') {
  const bot = {
    id: 1,
    status,
    nowPlaying: TRACK,
    playbackProgress: { position: 10, duration: 200 },
    currentConfig: { volume: 40 },
    isStreaming: false,
    videoStreamStatus: null,
    queue: { getAll: () => [TRACK], index: 0, shuffle: false, repeat: 'off', clear: vi.fn() },
    pause: vi.fn(),
    resume: vi.fn(),
    skip: vi.fn(),
    setVolume: vi.fn(),
  };
  const manager = {
    getBot: (id: number) => (id === bot.id ? bot : undefined),
    listBots: () => [bot],
    startBot: vi.fn(),
    stopBot: vi.fn(),
  };
  const update = vi.fn();
  const context = createToolContext({
    voiceBotManager: manager,
    prisma: {
      musicBot: {
        findMany: async () => [{
          id: 1,
          name: 'Radio',
          serverConfigId: 7,
          serverConfig: { id: 7, name: 'Main', host: 'ts.example.com' },
          nickname: 'DJ',
          defaultChannel: 'Lounge',
          voicePort: 9987,
          volume: 40,
          autoStart: false,
          createdAt: new Date(0),
        }],
        update,
      },
    },
  });
  return { bot, manager, update, context };
}

beforeEach(() => {
  vi.mocked(downloadAndEnqueue).mockReset();
});

describe('list_music_bots and get_music_bot_state', () => {
  it('lists the bots with their status and current track, without local file paths', async () => {
    const { context } = createFakes();

    const result = await listMusicBots.execute(context, {});

    expect(result).toMatchObject({
      success: true,
      action: 'music_bots_listed',
      bots: [{ id: 1, nickname: 'DJ', status: 'connected', nowPlaying: { title: 'Song' } }],
    });
    expect(JSON.stringify(result)).not.toContain('/var/lib/ts6/music');
  });

  it('reads the playback state of one bot', async () => {
    const { context } = createFakes();

    await expect(getMusicBotState.execute(context, { botId: 1 })).resolves.toEqual({
      success: true,
      action: 'music_bot_state_read',
      state: {
        status: 'connected',
        nowPlaying: { id: 'track-1', title: 'Song', artist: undefined, duration: 200, source: 'youtube' },
        position: 10,
        duration: 200,
        volume: 40,
        queueLength: 1,
        currentIndex: 0,
        shuffle: false,
        repeat: 'off',
      },
    });
  });

  it('reports an unknown bot as BOT_NOT_FOUND', async () => {
    const { context } = createFakes();

    await expect(getMusicBotState.execute(context, { botId: 99 }))
      .rejects.toMatchObject({ code: 'BOT_NOT_FOUND' });
  });
});

describe('play_media_url', () => {
  it('returns media_queued when the track was added behind another one', async () => {
    const { context } = createFakes();
    vi.mocked(downloadAndEnqueue).mockResolvedValue({ item: TRACK, queued: true });

    const result = await playMediaUrl.execute(context, {
      botId: 1,
      url: 'https://www.youtube.com/watch?v=abc',
    });

    expect(result).toMatchObject({ success: true, action: 'media_queued', botId: 1 });
    expect(JSON.stringify(result)).not.toContain('/var/lib/ts6/music');
  });

  it('returns media_playing when the track started immediately', async () => {
    const { context } = createFakes();
    vi.mocked(downloadAndEnqueue).mockResolvedValue({ item: TRACK, queued: false });

    await expect(playMediaUrl.execute(context, {
      botId: 1,
      url: 'https://www.youtube.com/watch?v=abc',
    })).resolves.toMatchObject({ success: true, action: 'media_playing' });
  });

  it('rejects a blocked URL as INVALID_INPUT without downloading it', async () => {
    const { context } = createFakes();

    await expect(playMediaUrl.execute(context, {
      botId: 1,
      url: 'http://169.254.169.254/latest/meta-data',
    })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(vi.mocked(downloadAndEnqueue)).not.toHaveBeenCalled();
  });

  it('rejects a value that is not a URL without downloading it', async () => {
    const { context } = createFakes();

    await expect(playMediaUrl.execute(context, { botId: 1, url: 'not a url' }))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(vi.mocked(downloadAndEnqueue)).not.toHaveBeenCalled();
  });
});

describe('playback control', () => {
  it('starts and pauses and skips through the bot', async () => {
    const { bot, manager, context } = createFakes();

    await expect(startMusicBot.execute(context, { botId: 1 }))
      .resolves.toEqual({ success: true, action: 'music_bot_started', botId: 1 });
    await expect(pauseMusicBot.execute(context, { botId: 1 }))
      .resolves.toEqual({ success: true, action: 'music_paused', botId: 1 });
    await expect(skipMusicTrack.execute(context, { botId: 1 }))
      .resolves.toEqual({ success: true, action: 'music_skipped', botId: 1 });

    expect(manager.startBot).toHaveBeenCalledWith(1);
    expect(bot.pause).toHaveBeenCalled();
    expect(bot.skip).toHaveBeenCalled();
  });

  it('sets and persists the volume', async () => {
    const { bot, update, context } = createFakes();

    await expect(setMusicVolume.execute(context, { botId: 1, volume: 80 }))
      .resolves.toEqual({ success: true, action: 'music_volume_set', botId: 1, volume: 80 });
    expect(bot.setVolume).toHaveBeenCalledWith(80);
    expect(update).toHaveBeenCalledWith({ where: { id: 1 }, data: { volume: 80 } });
  });

  it('rejects a volume outside 0-100 as INVALID_INPUT', async () => {
    const { update, context } = createFakes();

    await expect(setMusicVolume.execute(context, { botId: 1, volume: 150 }))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(update).not.toHaveBeenCalled();
  });

  it('lists the queue without local file paths', async () => {
    const { context } = createFakes();

    const result = await listMusicQueue.execute(context, { botId: 1 });

    expect(result).toEqual({
      success: true,
      action: 'music_queue_listed',
      botId: 1,
      tracks: [{ id: 'track-1', title: 'Song', artist: undefined, duration: 200, source: 'youtube' }],
      shuffle: false,
      repeat: 'off',
    });
  });
});

describe('destructive music tools', () => {
  it('marks stop_music_bot and clear_music_queue destructive', () => {
    expect(stopMusicBot.risk).toBe('destructive');
    expect(clearMusicQueue.risk).toBe('destructive');
  });

  it('stops the bot and clears the queue', async () => {
    const { bot, manager, context } = createFakes();

    await expect(stopMusicBot.execute(context, { botId: 1 }))
      .resolves.toEqual({ success: true, action: 'music_bot_stopped', botId: 1 });
    await expect(clearMusicQueue.execute(context, { botId: 1 }))
      .resolves.toEqual({ success: true, action: 'music_queue_cleared', botId: 1 });

    expect(manager.stopBot).toHaveBeenCalledWith(1);
    expect(bot.queue.clear).toHaveBeenCalled();
  });
});
