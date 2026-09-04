import { z } from 'zod';
import {
  addSongToPlaylist,
  createPlaylist,
  deletePlaylist,
  editPlaylist,
  getPlaylist,
  listPlaylists,
  removeSongFromPlaylist,
  reorderPlaylist,
} from '../../services/playlist-management.service.js';
import { defineTool, type AgentToolDefinition } from '../tool-definition.js';
import { idempotencyKey, positiveId } from './schemas.js';

/** Playlists are not scoped to a TeamSpeak server — see the service file's note. */
export const playlistTools: AgentToolDefinition[] = [
  defineTool({
    name: 'list_playlists',
    description: 'List playlists, optionally narrowed to those attached to one music bot.',
    inputSchema: z.object({ musicBotId: positiveId.optional() }).strict(),
    risk: 'read',
    run: async (context, input) => ({
      success: true,
      action: 'playlists_listed',
      playlists: await listPlaylists(context.prisma, input.musicBotId),
    }),
  }),

  defineTool({
    name: 'get_playlist',
    description: 'Read one playlist with its ordered list of songs.',
    inputSchema: z.object({ playlistId: positiveId }).strict(),
    risk: 'read',
    run: async (context, input) => ({
      success: true,
      action: 'playlist_read',
      playlist: await getPlaylist(context.prisma, input.playlistId),
    }),
  }),

  defineTool({
    name: 'create_playlist',
    description: 'Create a new empty playlist, optionally attached to one music bot.',
    inputSchema: z.object({ name: z.string().min(1).max(100), musicBotId: positiveId.optional(), idempotencyKey }).strict(),
    risk: 'write',
    run: async (context, input) => {
      const playlist = await createPlaylist(context.prisma, input.name, input.musicBotId);
      return { success: true, action: 'playlist_created', playlistId: playlist.id, name: playlist.name };
    },
  }),

  defineTool({
    name: 'edit_playlist',
    description: "Rename a playlist or change which music bot it's attached to.",
    inputSchema: z
      .object({ playlistId: positiveId, name: z.string().min(1).max(100).optional(), musicBotId: positiveId.nullable().optional(), idempotencyKey })
      .strict(),
    risk: 'write',
    run: async (context, input) => {
      await editPlaylist(context.prisma, input.playlistId, { name: input.name, musicBotId: input.musicBotId });
      return { success: true, action: 'playlist_edited', playlistId: input.playlistId };
    },
  }),

  defineTool({
    name: 'delete_playlist',
    description: 'Delete a playlist and its song ordering. The songs themselves stay in the library.',
    inputSchema: z.object({ playlistId: positiveId, idempotencyKey }).strict(),
    risk: 'destructive',
    run: async (context, input) => {
      await deletePlaylist(context.prisma, input.playlistId);
      return { success: true, action: 'playlist_deleted', playlistId: input.playlistId };
    },
  }),

  defineTool({
    name: 'add_song_to_playlist',
    description: 'Append one song to the end of a playlist.',
    inputSchema: z.object({ playlistId: positiveId, songId: positiveId, idempotencyKey }).strict(),
    risk: 'write',
    run: async (context, input) => {
      await addSongToPlaylist(context.prisma, input.playlistId, input.songId);
      return { success: true, action: 'song_added_to_playlist', playlistId: input.playlistId, songId: input.songId };
    },
  }),

  defineTool({
    name: 'remove_song_from_playlist',
    description: 'Remove one song from a playlist.',
    inputSchema: z.object({ playlistId: positiveId, songId: positiveId, idempotencyKey }).strict(),
    risk: 'destructive',
    run: async (context, input) => {
      await removeSongFromPlaylist(context.prisma, input.playlistId, input.songId);
      return { success: true, action: 'song_removed_from_playlist', playlistId: input.playlistId, songId: input.songId };
    },
  }),

  defineTool({
    name: 'reorder_playlist',
    description: "Set a playlist's song order. songIds must list every song id in the playlist, in the desired order.",
    inputSchema: z.object({ playlistId: positiveId, songIds: z.array(positiveId).min(1), idempotencyKey }).strict(),
    risk: 'write',
    run: async (context, input) => {
      await reorderPlaylist(context.prisma, input.playlistId, input.songIds);
      return { success: true, action: 'playlist_reordered', playlistId: input.playlistId };
    },
  }),
];
