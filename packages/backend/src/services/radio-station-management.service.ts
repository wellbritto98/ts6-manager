import type { PrismaClient } from '../../generated/prisma/index.js';
import type { RadioPreset } from '@ts6/common';
import { AgentError } from '../agent/agent-error.js';
import { validateUrl } from '../utils/url-validator.js';
import { requirePositiveInt } from './server-resolver.js';

/**
 * Single source of truth for the built-in presets, imported by
 * `radio-stations.routes.ts` too — previously duplicated verbatim there.
 */
export const RADIO_PRESETS: RadioPreset[] = [
  { name: '1LIVE', url: 'https://wdr-1live-live.icecast.wdr.de/wdr/1live/live/mp3/128/stream.mp3', genre: 'Pop/Rock' },
  { name: 'WDR 2', url: 'https://wdr-wdr2-rheinland.icecast.wdr.de/wdr/wdr2/rheinland/mp3/128/stream.mp3', genre: 'Pop' },
  { name: 'SWR3', url: 'https://liveradio.swr.de/sw282p3/swr3/play.mp3', genre: 'Pop' },
  { name: 'BigFM', url: 'https://streams.bigfm.de/bigfm-deutschland-128-mp3', genre: 'Pop/Dance' },
  { name: 'Technobase.FM', url: 'https://listen.technobase.fm/tunein-mp3-pls', genre: 'Techno/Dance' },
  { name: 'HardBase.FM', url: 'https://listen.hardbase.fm/tunein-mp3-pls', genre: 'Hardstyle' },
  { name: 'HouseTime.FM', url: 'https://listen.housetime.fm/tunein-mp3-pls', genre: 'House' },
  { name: 'TranceBase.FM', url: 'https://listen.trancebase.fm/tunein-mp3-pls', genre: 'Trance' },
  { name: 'Lofi Hip Hop', url: 'https://play.streamafrica.net/lofiradio', genre: 'Lofi/Chill' },
  { name: 'BBC Radio 1', url: 'http://stream.live.vc.bbcmedia.co.uk/bbc_radio_one', genre: 'Pop/Chart' },
  { name: 'Classic FM', url: 'https://media-ice.musicradio.com/ClassicFMMP3', genre: 'Classical' },
  { name: 'Absolute Radio', url: 'https://ais-sa5.cdnstream1.com/b75154_128mp3', genre: 'Rock' },
  { name: 'Jazz Radio', url: 'http://jazz-wr04.ice.infomaniak.ch/jazz-wr04-128.mp3', genre: 'Jazz' },
  { name: 'Sunshine Live', url: 'https://stream.sunshine-live.de/live/mp3-192/stream.sunshine-live.de/', genre: 'Electronic' },
  { name: 'Radio BOB!', url: 'https://streams.radiobob.de/bob-live/mp3-192/mediaplayer', genre: 'Rock' },
  { name: 'Deutschlandfunk', url: 'https://st01.dlf.de/dlf/01/128/mp3/stream.mp3', genre: 'News/Culture' },
];

export function listRadioPresets(): RadioPreset[] {
  return RADIO_PRESETS;
}

export async function listRadioStations(prisma: PrismaClient, serverConfigId: unknown) {
  const id = requirePositiveInt(serverConfigId, 'serverConfigId');
  return prisma.radioStation.findMany({ where: { serverConfigId: id }, orderBy: { name: 'asc' } });
}

export async function addRadioStation(
  prisma: PrismaClient,
  serverConfigId: unknown,
  fields: { name: string; url: string; genre?: string; imageUrl?: string },
) {
  const id = requirePositiveInt(serverConfigId, 'serverConfigId');
  const check = await validateUrl(fields.url, { allowedProtocols: ['http:', 'https:'] });
  if (!check.valid) {
    throw new AgentError('INVALID_INPUT', `Invalid URL: ${check.error}`);
  }
  return prisma.radioStation.create({
    data: {
      name: fields.name,
      url: fields.url,
      genre: fields.genre ?? null,
      imageUrl: fields.imageUrl ?? null,
      serverConfigId: id,
    },
  });
}

export async function deleteRadioStation(prisma: PrismaClient, id: unknown) {
  const stationId = requirePositiveInt(id, 'id');
  await prisma.radioStation.delete({ where: { id: stationId } });
}
