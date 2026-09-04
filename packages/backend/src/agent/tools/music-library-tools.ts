import { z } from 'zod';
import {
  deleteSong,
  downloadSong,
  getYoutubeInfo,
  listMusicRequests,
  listSongs,
  searchYoutubeTracks,
} from '../../services/music-library-management.service.js';
import { defineTool, type AgentToolDefinition } from '../tool-definition.js';
import { idempotencyKey, positiveId, serverScope } from './schemas.js';

export const musicLibraryTools: AgentToolDefinition[] = [
  defineTool({
    name: 'search_youtube',
    description: 'Search YouTube for videos, returning title, channel, duration and video id for each result.',
    inputSchema: z.object({ query: z.string().min(1).max(200), maxResults: z.number().int().min(1).max(25).optional() }).strict(),
    risk: 'read',
    run: async (context, input) => ({
      success: true,
      action: 'youtube_searched',
      results: await searchYoutubeTracks(input.query, input.maxResults),
    }),
  }),

  defineTool({
    name: 'get_youtube_info',
    description: 'Read metadata about a YouTube URL (single video or playlist) without downloading it.',
    inputSchema: z.object({ url: z.string().url() }).strict(),
    risk: 'read',
    run: async (context, input) => ({
      success: true,
      action: 'youtube_info_read',
      info: await getYoutubeInfo(input.url),
    }),
  }),

  defineTool({
    name: 'list_songs',
    description: 'List the songs in one server\'s music library.',
    inputSchema: z.object(serverScope).strict(),
    risk: 'read',
    run: async (context, input) => ({
      success: true,
      action: 'songs_listed',
      songs: await listSongs(context.prisma, input.serverConfigId),
    }),
  }),

  defineTool({
    name: 'delete_song',
    description: "Delete one song from the library and remove its file from disk.",
    inputSchema: z.object({ id: positiveId, idempotencyKey }).strict(),
    risk: 'destructive',
    run: async (context, input) => {
      await deleteSong(context.prisma, input.id);
      return { success: true, action: 'song_deleted', id: input.id };
    },
  }),

  defineTool({
    name: 'download_song',
    description:
      "Download a YouTube video into one server's music library. Reuses the existing song if that URL was already downloaded for this server. Large videos can take a while.",
    inputSchema: z.object({ ...serverScope, url: z.string().url(), idempotencyKey }).strict(),
    risk: 'write',
    run: async (context, input) => {
      const { song, alreadyDownloaded } = await downloadSong(context.prisma, input.serverConfigId, input.url);
      return {
        success: true,
        action: alreadyDownloaded ? 'song_already_downloaded' : 'song_downloaded',
        id: song.id,
        title: song.title,
        artist: song.artist,
        duration: song.duration,
      };
    },
  }),

  defineTool({
    name: 'list_music_requests',
    description: "List the most recent music requests submitted for one server (e.g. via Discord).",
    inputSchema: z.object(serverScope).strict(),
    risk: 'read',
    run: async (context, input) => ({
      success: true,
      action: 'music_requests_listed',
      requests: await listMusicRequests(context.prisma, input.serverConfigId),
    }),
  }),
];
