import { describe, expect, it, vi } from 'vitest';
import { radioTools } from './radio-tools.js';
import { createToolContext, FAKE_SERVER, findTool } from './tool-fakes.js';

const listRadioPresets = findTool(radioTools, 'list_radio_presets');
const listRadioStations = findTool(radioTools, 'list_radio_stations');
const addRadioStation = findTool(radioTools, 'add_radio_station');
const deleteRadioStation = findTool(radioTools, 'delete_radio_station');

const TARGET = { serverConfigId: FAKE_SERVER.id };

describe('list_radio_presets', () => {
  it('returns the built-in preset list', async () => {
    const result = await listRadioPresets.execute(createToolContext(), {});
    expect(result).toMatchObject({ success: true, action: 'radio_presets_listed' });
    expect((result as { presets: unknown[] }).presets.length).toBeGreaterThan(0);
  });
});

describe('list_radio_stations', () => {
  it('lists saved stations for one server', async () => {
    const radioStation = { findMany: vi.fn().mockResolvedValue([{ id: 1, name: 'My Station' }]) };

    await expect(listRadioStations.execute(createToolContext({ prisma: { radioStation } }), TARGET))
      .resolves.toEqual({ success: true, action: 'radio_stations_listed', stations: [{ id: 1, name: 'My Station' }] });
  });
});

describe('add_radio_station', () => {
  it('validates the URL and saves the station', async () => {
    const radioStation = { create: vi.fn().mockResolvedValue({ id: 2, name: 'My Station' }) };

    const result = await addRadioStation.execute(createToolContext({ prisma: { radioStation } }), {
      ...TARGET,
      name: 'My Station',
      url: 'https://example.com/stream.mp3',
    });

    expect(result).toEqual({ success: true, action: 'radio_station_added', id: 2, name: 'My Station' });
  });

  it('rejects a non-http(s) URL', async () => {
    const radioStation = { create: vi.fn() };

    await expect(
      addRadioStation.execute(createToolContext({ prisma: { radioStation } }), {
        ...TARGET,
        name: 'Bad',
        url: 'ftp://example.com/stream.mp3',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(radioStation.create).not.toHaveBeenCalled();
  });
});

describe('delete_radio_station', () => {
  it('is destructive and deletes a station', async () => {
    const radioStation = { delete: vi.fn().mockResolvedValue({}) };
    expect(deleteRadioStation.risk).toBe('destructive');

    await expect(deleteRadioStation.execute(createToolContext({ prisma: { radioStation } }), { id: 3 }))
      .resolves.toEqual({ success: true, action: 'radio_station_deleted', id: 3 });
    expect(radioStation.delete).toHaveBeenCalledWith({ where: { id: 3 } });
  });
});
