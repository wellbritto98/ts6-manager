import { z } from 'zod';
import {
  addRadioStation,
  deleteRadioStation,
  listRadioPresets,
  listRadioStations,
} from '../../services/radio-station-management.service.js';
import { defineTool, type AgentToolDefinition } from '../tool-definition.js';
import { idempotencyKey, positiveId, serverScope } from './schemas.js';

export const radioTools: AgentToolDefinition[] = [
  defineTool({
    name: 'list_radio_presets',
    description: 'List the built-in radio station presets available to add to any server.',
    inputSchema: z.object({}).strict(),
    risk: 'read',
    run: async () => ({ success: true, action: 'radio_presets_listed', presets: listRadioPresets() }),
  }),

  defineTool({
    name: 'list_radio_stations',
    description: "List one server's saved radio stations.",
    inputSchema: z.object(serverScope).strict(),
    risk: 'read',
    run: async (context, input) => ({
      success: true,
      action: 'radio_stations_listed',
      stations: await listRadioStations(context.prisma, input.serverConfigId),
    }),
  }),

  defineTool({
    name: 'add_radio_station',
    description: 'Add a radio station (by stream URL) to one server. The URL is validated before it is saved.',
    inputSchema: z
      .object({
        ...serverScope,
        name: z.string().min(1).max(100),
        url: z.string().url(),
        genre: z.string().max(50).optional(),
        imageUrl: z.string().url().optional(),
        idempotencyKey,
      })
      .strict(),
    risk: 'write',
    run: async (context, input) => {
      const station = await addRadioStation(context.prisma, input.serverConfigId, input);
      return { success: true, action: 'radio_station_added', id: station.id, name: station.name };
    },
  }),

  defineTool({
    name: 'delete_radio_station',
    description: 'Delete one saved radio station.',
    inputSchema: z.object({ id: positiveId, idempotencyKey }).strict(),
    risk: 'destructive',
    run: async (context, input) => {
      await deleteRadioStation(context.prisma, input.id);
      return { success: true, action: 'radio_station_deleted', id: input.id };
    },
  }),
];
