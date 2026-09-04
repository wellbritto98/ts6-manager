import fs from 'fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { musicLibraryTools } from './music-library-tools.js';
import { createToolContext, FAKE_SERVER, findTool } from './tool-fakes.js';

vi.mock('../../voice/audio/youtube.js', () => ({
  searchYouTube: vi.fn(async () => [{ id: 'abc', title: 'Song' }]),
  getYouTubeUrlInfo: vi.fn(async () => ({ type: 'video', title: 'Song' })),
  downloadYouTube: vi.fn(async () => ({
    filePath: '/data/music/abc.mp3',
    info: { title: 'Song', artist: 'Someone', duration: 180 },
  })),
}));

beforeEach(() => {
  vi.spyOn(fs, 'statSync').mockReturnValue({ size: 1024 } as fs.Stats);
  vi.spyOn(fs, 'existsSync').mockReturnValue(false);
  vi.spyOn(fs, 'unlinkSync').mockImplementation(() => undefined);
});

const searchYoutube = findTool(musicLibraryTools, 'search_youtube');
const getYoutubeInfo = findTool(musicLibraryTools, 'get_youtube_info');
const listSongs = findTool(musicLibraryTools, 'list_songs');
const deleteSong = findTool(musicLibraryTools, 'delete_song');
const downloadSong = findTool(musicLibraryTools, 'download_song');
const listMusicRequests = findTool(musicLibraryTools, 'list_music_requests');

const TARGET = { serverConfigId: FAKE_SERVER.id };

describe('search_youtube', () => {
  it('returns search results', async () => {
    const result = await searchYoutube.execute(createToolContext(), { query: 'lofi beats' });
    expect(result).toMatchObject({ success: true, action: 'youtube_searched' });
  });
});

describe('get_youtube_info', () => {
  it('returns video metadata', async () => {
    const result = await getYoutubeInfo.execute(createToolContext(), { url: 'https://youtube.com/watch?v=abc' });
    expect(result).toMatchObject({ success: true, action: 'youtube_info_read' });
  });
});

describe('list_songs', () => {
  it('lists songs for one server', async () => {
    const song = { findMany: vi.fn().mockResolvedValue([{ id: 1, title: 'Song' }]) };

    await expect(listSongs.execute(createToolContext({ prisma: { song } }), TARGET))
      .resolves.toEqual({ success: true, action: 'songs_listed', songs: [{ id: 1, title: 'Song' }] });
    expect(song.findMany).toHaveBeenCalledWith({ where: { serverConfigId: FAKE_SERVER.id }, orderBy: { createdAt: 'desc' } });
  });
});

describe('delete_song', () => {
  it('is destructive and deletes an existing song', async () => {
    const song = {
      findUnique: vi.fn().mockResolvedValue({ id: 5, filePath: '/data/music/x.mp3' }),
      delete: vi.fn().mockResolvedValue({}),
    };
    expect(deleteSong.risk).toBe('destructive');

    await expect(deleteSong.execute(createToolContext({ prisma: { song } }), { id: 5 }))
      .resolves.toEqual({ success: true, action: 'song_deleted', id: 5 });
    expect(song.delete).toHaveBeenCalledWith({ where: { id: 5 } });
  });

  it('rejects a song id that does not exist', async () => {
    const song = { findUnique: vi.fn().mockResolvedValue(null), delete: vi.fn() };

    await expect(deleteSong.execute(createToolContext({ prisma: { song } }), { id: 5 }))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(song.delete).not.toHaveBeenCalled();
  });
});

describe('download_song', () => {
  it('reuses an existing song for the same url', async () => {
    const existing = { id: 9, title: 'Existing', artist: 'X', duration: 100 };
    const song = { findFirst: vi.fn().mockResolvedValue(existing), create: vi.fn() };

    const result = await downloadSong.execute(createToolContext({ prisma: { song } }), {
      ...TARGET,
      url: 'https://youtube.com/watch?v=abc',
    });

    expect(result).toEqual({
      success: true,
      action: 'song_already_downloaded',
      id: 9,
      title: 'Existing',
      artist: 'X',
      duration: 100,
    });
    expect(song.create).not.toHaveBeenCalled();
  });

  it('downloads and creates a new song when none exists yet', async () => {
    const song = {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 10, title: 'Song', artist: 'Someone', duration: 180 }),
    };

    const result = await downloadSong.execute(createToolContext({ prisma: { song } }), {
      ...TARGET,
      url: 'https://youtube.com/watch?v=abc',
    });

    expect(result).toEqual({
      success: true,
      action: 'song_downloaded',
      id: 10,
      title: 'Song',
      artist: 'Someone',
      duration: 180,
    });
  });
});

describe('list_music_requests', () => {
  it('lists recent requests', async () => {
    const musicRequest = { findMany: vi.fn().mockResolvedValue([{ id: 1, title: 'Song', url: 'https://x' }]) };

    await expect(listMusicRequests.execute(createToolContext({ prisma: { musicRequest } }), TARGET))
      .resolves.toMatchObject({ success: true, action: 'music_requests_listed' });
  });
});
