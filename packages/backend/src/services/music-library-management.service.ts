import fs from 'fs';
import type { PrismaClient } from '../../generated/prisma/index.js';
import { AgentError } from '../agent/agent-error.js';
import { downloadYouTube, getYouTubeUrlInfo, searchYouTube } from '../voice/audio/youtube.js';
import { requirePositiveInt } from './server-resolver.js';

const MUSIC_DIR = process.env.MUSIC_DIR || '/data/music';

export async function searchYoutubeTracks(query: string, maxResults?: number) {
  return searchYouTube(query, maxResults);
}

export async function getYoutubeInfo(url: string) {
  return getYouTubeUrlInfo(url);
}

export async function listSongs(prisma: PrismaClient, serverConfigId: unknown) {
  const id = requirePositiveInt(serverConfigId, 'serverConfigId');
  return prisma.song.findMany({ where: { serverConfigId: id }, orderBy: { createdAt: 'desc' } });
}

export async function deleteSong(prisma: PrismaClient, id: unknown) {
  const songId = requirePositiveInt(id, 'id');
  const song = await prisma.song.findUnique({ where: { id: songId } });
  if (!song) {
    throw new AgentError('INVALID_INPUT', `Song ${songId} does not exist`);
  }
  try {
    if (fs.existsSync(song.filePath)) fs.unlinkSync(song.filePath);
  } catch {
    // A stale filesystem path never blocks removing the database row.
  }
  await prisma.song.delete({ where: { id: songId } });
}

/**
 * Mirrors `music-library.routes.ts`'s synchronous `/youtube/download` — there
 * is no job/polling subsystem for a single song (that only exists for whole
 * playlist imports). A very large download can take a while; that's a known
 * tradeoff, not a bug, and outside this tool's control since the caller's own
 * HTTP client sets the outer timeout.
 */
export async function downloadSong(prisma: PrismaClient, serverConfigId: unknown, url: string) {
  const id = requirePositiveInt(serverConfigId, 'serverConfigId');
  const existing = await prisma.song.findFirst({ where: { sourceUrl: url, serverConfigId: id } });
  if (existing) {
    return { song: existing, alreadyDownloaded: true };
  }
  const { filePath, info } = await downloadYouTube(url, MUSIC_DIR);
  const fileStats = fs.statSync(filePath);
  const song = await prisma.song.create({
    data: {
      title: info.title,
      artist: info.artist,
      duration: info.duration,
      filePath,
      source: 'youtube',
      sourceUrl: url,
      fileSize: fileStats.size,
      serverConfigId: id,
    },
  });
  return { song, alreadyDownloaded: false };
}

export async function listMusicRequests(prisma: PrismaClient, serverConfigId: unknown) {
  const id = requirePositiveInt(serverConfigId, 'serverConfigId');
  return prisma.musicRequest.findMany({ where: { serverConfigId: id }, orderBy: { requestedAt: 'desc' }, take: 100 });
}
