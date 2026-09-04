import type { PrismaClient } from '../../generated/prisma/index.js';
import { AgentError } from '../agent/agent-error.js';
import { requirePositiveInt } from './server-resolver.js';

/**
 * Playlists are not scoped to a TeamSpeak server (see `Playlist.serverConfigId`
 * in schema.prisma: optional, and `playlists.routes.ts` mounts at
 * `/api/playlists`, not under `/api/servers/:configId/...`) — every tool here
 * takes only a `playlistId`/`songId`, matching that existing behavior exactly
 * rather than inventing a scope the product doesn't have.
 */

export async function listPlaylists(prisma: PrismaClient, musicBotId?: unknown) {
  const where = musicBotId === undefined ? undefined : { musicBotId: requirePositiveInt(musicBotId, 'musicBotId') };
  const playlists = await prisma.playlist.findMany({
    where,
    include: { _count: { select: { songs: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return playlists.map((playlist) => ({
    id: playlist.id,
    name: playlist.name,
    musicBotId: playlist.musicBotId,
    songCount: playlist._count.songs,
    createdAt: playlist.createdAt,
  }));
}

export async function getPlaylist(prisma: PrismaClient, id: unknown) {
  const playlistId = requirePositiveInt(id, 'playlistId');
  const playlist = await prisma.playlist.findUnique({
    where: { id: playlistId },
    include: { songs: { include: { song: true }, orderBy: { position: 'asc' } } },
  });
  if (!playlist) {
    throw new AgentError('INVALID_INPUT', `Playlist ${playlistId} does not exist`);
  }
  return {
    id: playlist.id,
    name: playlist.name,
    musicBotId: playlist.musicBotId,
    songCount: playlist.songs.length,
    createdAt: playlist.createdAt,
    songs: playlist.songs.map((entry) => ({
      id: entry.song.id,
      title: entry.song.title,
      artist: entry.song.artist,
      duration: entry.song.duration,
      source: entry.song.source,
      sourceUrl: entry.song.sourceUrl,
      fileSize: entry.song.fileSize,
      createdAt: entry.song.createdAt,
      position: entry.position,
    })),
  };
}

export async function createPlaylist(prisma: PrismaClient, name: string, musicBotId?: unknown) {
  return prisma.playlist.create({
    data: { name, musicBotId: musicBotId === undefined ? null : requirePositiveInt(musicBotId, 'musicBotId') },
  });
}

export async function editPlaylist(
  prisma: PrismaClient,
  id: unknown,
  fields: { name?: string; musicBotId?: number | null },
) {
  const playlistId = requirePositiveInt(id, 'playlistId');
  await requireExistingPlaylist(prisma, playlistId);
  await prisma.playlist.update({
    where: { id: playlistId },
    data: {
      ...(fields.name !== undefined && { name: fields.name }),
      ...(fields.musicBotId !== undefined && { musicBotId: fields.musicBotId }),
    },
  });
}

export async function deletePlaylist(prisma: PrismaClient, id: unknown) {
  const playlistId = requirePositiveInt(id, 'playlistId');
  await requireExistingPlaylist(prisma, playlistId);
  await prisma.playlist.delete({ where: { id: playlistId } });
}

export async function addSongToPlaylist(prisma: PrismaClient, playlistId: unknown, songId: unknown) {
  const listId = requirePositiveInt(playlistId, 'playlistId');
  const trackId = requirePositiveInt(songId, 'songId');
  await requireExistingPlaylist(prisma, listId);
  const maxPos = await prisma.playlistSong.aggregate({ where: { playlistId: listId }, _max: { position: true } });
  await prisma.playlistSong.create({
    data: { playlistId: listId, songId: trackId, position: (maxPos._max.position ?? -1) + 1 },
  });
}

export async function removeSongFromPlaylist(prisma: PrismaClient, playlistId: unknown, songId: unknown) {
  const listId = requirePositiveInt(playlistId, 'playlistId');
  const trackId = requirePositiveInt(songId, 'songId');
  await prisma.playlistSong.deleteMany({ where: { playlistId: listId, songId: trackId } });
}

export async function reorderPlaylist(prisma: PrismaClient, playlistId: unknown, songIds: number[]) {
  const listId = requirePositiveInt(playlistId, 'playlistId');
  await requireExistingPlaylist(prisma, listId);
  await prisma.$transaction(
    songIds.map((songId, index) =>
      prisma.playlistSong.updateMany({ where: { playlistId: listId, songId }, data: { position: index } }),
    ),
  );
}

async function requireExistingPlaylist(prisma: PrismaClient, playlistId: number): Promise<void> {
  const exists = await prisma.playlist.findUnique({ where: { id: playlistId }, select: { id: true } });
  if (!exists) {
    throw new AgentError('INVALID_INPUT', `Playlist ${playlistId} does not exist`);
  }
}
