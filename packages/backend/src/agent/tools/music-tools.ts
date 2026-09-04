import { z } from 'zod';
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
} from '../../services/music-bot-management.service.js';
import type { QueueItem } from '../../voice/playlist/queue.js';
import { defineTool, type AgentToolDefinition } from '../tool-definition.js';
import { idempotencyKey, positiveId } from './schemas.js';

/** Music bots are addressed by their own id, not by a virtual server. */
const botSchema = z.object({ botId: positiveId }).strict();
const botMutationSchema = z.object({ botId: positiveId, idempotencyKey }).strict();

export const musicTools: AgentToolDefinition[] = [
  defineTool({
    name: 'list_music_bots',
    description:
      'List the configured music bots with their id, nickname, status and current track. Call this first to learn the botId the other music tools need.',
    inputSchema: z.object({}).strict(),
    risk: 'read',
    run: async (context) => ({
      success: true,
      action: 'music_bots_listed',
      bots: (await listMusicBots(context.prisma, context.voiceBotManager)).map((bot) => ({
        id: bot.id,
        name: bot.name,
        serverConfigId: bot.serverConfigId,
        nickname: bot.nickname,
        defaultChannel: bot.defaultChannel,
        volume: bot.volume,
        autoStart: bot.autoStart,
        status: bot.status,
        nowPlaying: toTrackSummary(bot.nowPlaying),
      })),
    }),
  }),

  defineTool({
    name: 'get_music_bot_state',
    description:
      'Read one music bot: status, current track, playback position, volume, queue length and repeat or shuffle mode.',
    inputSchema: botSchema,
    risk: 'read',
    run: async (context, input) => {
      const state = getMusicBotState(context.voiceBotManager, input.botId);
      return {
        success: true,
        action: 'music_bot_state_read',
        state: {
          status: state.status,
          nowPlaying: toTrackSummary(state.nowPlaying),
          position: state.position,
          duration: state.duration,
          volume: state.volume,
          queueLength: state.queue.length,
          currentIndex: state.currentIndex,
          shuffle: state.shuffle,
          repeat: state.repeat,
        },
      };
    },
  }),

  defineTool({
    name: 'start_music_bot',
    description: 'Connect a music bot to its TeamSpeak server so it can play audio.',
    inputSchema: botMutationSchema,
    risk: 'write',
    run: async (context, input) => {
      await startMusicBot(context.voiceBotManager, input.botId);
      return { success: true, action: 'music_bot_started', botId: input.botId };
    },
  }),

  defineTool({
    name: 'stop_music_bot',
    description: 'Disconnect a music bot from its TeamSpeak server, ending playback.',
    inputSchema: botMutationSchema,
    risk: 'destructive',
    run: async (context, input) => {
      await stopMusicBot(context.voiceBotManager, input.botId);
      return { success: true, action: 'music_bot_stopped', botId: input.botId };
    },
  }),

  defineTool({
    name: 'play_media_url',
    description:
      'Queue an http or https media URL (YouTube, a direct stream, a Spotify link) on a connected music bot.',
    inputSchema: z.object({ botId: positiveId, url: z.string().url(), idempotencyKey }).strict(),
    risk: 'write',
    run: async (context, input) => {
      const result = await playMediaUrl(
        context.prisma,
        context.voiceBotManager,
        input.botId,
        input.url,
      );
      if (result.source === 'spotify') {
        return {
          success: true,
          action: 'media_queued',
          botId: input.botId,
          spotify: result.spotify,
        };
      }
      return {
        success: true,
        action: result.queued ? 'media_queued' : 'media_playing',
        botId: input.botId,
        track: toTrackSummary(result.item),
      };
    },
  }),

  defineTool({
    name: 'pause_music_bot',
    description: 'Pause playback on a music bot, keeping the queue and position.',
    inputSchema: botMutationSchema,
    risk: 'write',
    run: async (context, input) => {
      pauseMusicBot(context.voiceBotManager, input.botId);
      return { success: true, action: 'music_paused', botId: input.botId };
    },
  }),

  defineTool({
    name: 'resume_music_bot',
    description: 'Resume paused playback on a music bot.',
    inputSchema: botMutationSchema,
    risk: 'write',
    run: async (context, input) => {
      resumeMusicBot(context.voiceBotManager, input.botId);
      return { success: true, action: 'music_resumed', botId: input.botId };
    },
  }),

  defineTool({
    name: 'skip_music_track',
    description: 'Skip the current track and start the next one in the queue.',
    inputSchema: botMutationSchema,
    risk: 'write',
    run: async (context, input) => {
      skipMusicTrack(context.voiceBotManager, input.botId);
      return { success: true, action: 'music_skipped', botId: input.botId };
    },
  }),

  defineTool({
    name: 'set_music_volume',
    description: 'Set the playback volume of a music bot, from 0 to 100.',
    inputSchema: z
      .object({ botId: positiveId, volume: z.number().int().min(0).max(100), idempotencyKey })
      .strict(),
    risk: 'write',
    run: async (context, input) => ({
      success: true,
      action: 'music_volume_set',
      botId: input.botId,
      volume: await setMusicBotVolume(
        context.prisma,
        context.voiceBotManager,
        input.botId,
        input.volume,
      ),
    }),
  }),

  defineTool({
    name: 'list_music_queue',
    description: 'List the queued tracks of a music bot with its shuffle and repeat mode.',
    inputSchema: botSchema,
    risk: 'read',
    run: async (context, input) => {
      const queue = listMusicQueue(context.voiceBotManager, input.botId);
      return {
        success: true,
        action: 'music_queue_listed',
        botId: input.botId,
        tracks: queue.items.map(toTrackSummary),
        shuffle: queue.shuffle,
        repeat: queue.repeat,
      };
    },
  }),

  defineTool({
    name: 'clear_music_queue',
    description: 'Remove every queued track from a music bot. This cannot be undone.',
    inputSchema: botMutationSchema,
    risk: 'destructive',
    run: async (context, input) => {
      clearMusicQueue(context.voiceBotManager, input.botId);
      return { success: true, action: 'music_queue_cleared', botId: input.botId };
    },
  }),
];

interface TrackSummary {
  id: string;
  title: string;
  artist?: string;
  duration?: number;
  source: string;
}

/** Queue items carry the bot's local `filePath`; the model only needs the metadata. */
function toTrackSummary(item: QueueItem | null): TrackSummary | null {
  if (!item) return null;
  return {
    id: item.id,
    title: item.title,
    artist: item.artist,
    duration: item.duration,
    source: item.source,
  };
}
