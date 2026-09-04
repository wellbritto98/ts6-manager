import { describe, expect, it, vi } from 'vitest';
import { playlistTools } from './playlist-tools.js';
import { createToolContext, findTool } from './tool-fakes.js';

const listPlaylists = findTool(playlistTools, 'list_playlists');
const getPlaylist = findTool(playlistTools, 'get_playlist');
const createPlaylist = findTool(playlistTools, 'create_playlist');
const editPlaylist = findTool(playlistTools, 'edit_playlist');
const deletePlaylist = findTool(playlistTools, 'delete_playlist');
const addSongToPlaylist = findTool(playlistTools, 'add_song_to_playlist');
const removeSongFromPlaylist = findTool(playlistTools, 'remove_song_from_playlist');
const reorderPlaylist = findTool(playlistTools, 'reorder_playlist');

describe('list_playlists', () => {
  it('lists every playlist with a song count, no server scope', async () => {
    const playlist = {
      findMany: vi.fn().mockResolvedValue([{ id: 1, name: 'Chill', musicBotId: null, _count: { songs: 3 }, createdAt: new Date('2026-01-01') }]),
    };

    const result = await listPlaylists.execute(createToolContext({ prisma: { playlist } }), {});

    expect(result).toMatchObject({
      success: true,
      action: 'playlists_listed',
      playlists: [{ id: 1, name: 'Chill', songCount: 3 }],
    });
    expect(playlist.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: undefined }));
  });
});

describe('get_playlist', () => {
  it('reads one playlist with its ordered songs', async () => {
    const playlist = {
      findUnique: vi.fn().mockResolvedValue({
        id: 1,
        name: 'Chill',
        musicBotId: null,
        createdAt: new Date('2026-01-01'),
        songs: [{ position: 0, song: { id: 5, title: 'Song', artist: null, duration: 100, source: 'local', sourceUrl: null, fileSize: 1, createdAt: new Date() } }],
      }),
    };

    await expect(getPlaylist.execute(createToolContext({ prisma: { playlist } }), { playlistId: 1 }))
      .resolves.toMatchObject({ success: true, action: 'playlist_read', playlist: { id: 1, songCount: 1 } });
  });

  it('rejects a playlist that does not exist', async () => {
    const playlist = { findUnique: vi.fn().mockResolvedValue(null) };

    await expect(getPlaylist.execute(createToolContext({ prisma: { playlist } }), { playlistId: 99 }))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});

describe('create_playlist', () => {
  it('creates a playlist', async () => {
    const playlist = { create: vi.fn().mockResolvedValue({ id: 2, name: 'Party' }) };

    await expect(createPlaylist.execute(createToolContext({ prisma: { playlist } }), { name: 'Party' }))
      .resolves.toEqual({ success: true, action: 'playlist_created', playlistId: 2, name: 'Party' });
    expect(playlist.create).toHaveBeenCalledWith({ data: { name: 'Party', musicBotId: null } });
  });
});

describe('delete_playlist', () => {
  it('is destructive and deletes an existing playlist', async () => {
    const playlist = {
      findUnique: vi.fn().mockResolvedValue({ id: 1 }),
      delete: vi.fn().mockResolvedValue({}),
    };
    expect(deletePlaylist.risk).toBe('destructive');

    await expect(deletePlaylist.execute(createToolContext({ prisma: { playlist } }), { playlistId: 1 }))
      .resolves.toEqual({ success: true, action: 'playlist_deleted', playlistId: 1 });
  });
});

describe('add_song_to_playlist / remove_song_from_playlist', () => {
  it('appends a song at the next position', async () => {
    const playlist = { findUnique: vi.fn().mockResolvedValue({ id: 1 }) };
    const playlistSong = {
      aggregate: vi.fn().mockResolvedValue({ _max: { position: 2 } }),
      create: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({}),
    };

    await expect(
      addSongToPlaylist.execute(createToolContext({ prisma: { playlist, playlistSong } }), { playlistId: 1, songId: 5 }),
    ).resolves.toEqual({ success: true, action: 'song_added_to_playlist', playlistId: 1, songId: 5 });
    expect(playlistSong.create).toHaveBeenCalledWith({ data: { playlistId: 1, songId: 5, position: 3 } });

    expect(removeSongFromPlaylist.risk).toBe('destructive');
    await expect(
      removeSongFromPlaylist.execute(createToolContext({ prisma: { playlistSong } }), { playlistId: 1, songId: 5 }),
    ).resolves.toEqual({ success: true, action: 'song_removed_from_playlist', playlistId: 1, songId: 5 });
  });
});

describe('reorder_playlist', () => {
  it('updates every song position in a transaction', async () => {
    const playlist = { findUnique: vi.fn().mockResolvedValue({ id: 1 }) };
    const playlistSong = { updateMany: vi.fn().mockResolvedValue({}) };
    const $transaction = vi.fn(async (ops: unknown[]) => ops);

    await expect(
      reorderPlaylist.execute(createToolContext({ prisma: { playlist, playlistSong, $transaction } }), {
        playlistId: 1,
        songIds: [5, 3, 8],
      }),
    ).resolves.toEqual({ success: true, action: 'playlist_reordered', playlistId: 1 });
    expect($transaction).toHaveBeenCalled();
  });
});

describe('edit_playlist', () => {
  it('renames a playlist', async () => {
    const playlist = { findUnique: vi.fn().mockResolvedValue({ id: 1 }), update: vi.fn().mockResolvedValue({}) };

    await expect(
      editPlaylist.execute(createToolContext({ prisma: { playlist } }), { playlistId: 1, name: 'New name' }),
    ).resolves.toEqual({ success: true, action: 'playlist_edited', playlistId: 1 });
    expect(playlist.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { name: 'New name' } });
  });
});
