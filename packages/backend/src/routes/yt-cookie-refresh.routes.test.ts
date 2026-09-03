import { describe, it, expect, vi } from 'vitest';
import { SidecarUnreachableError } from '../voice/audio/cookie-keeper.js';
import { applyRefreshPut, parsePutBody, applyForceRefresh, toStatusDto } from './yt-cookie-refresh.routes.js';

function mockKeeper(overrides: Record<string, unknown> = {}) {
  return {
    enable: vi.fn(async () => undefined),
    disable: vi.fn(async () => undefined),
    refreshNow: vi.fn(async () => 'ok'),
    getStatus: vi.fn(async () => ({
      enabled: true,
      sidecarReachable: true,
      lastSuccessAt: null,
      lastError: null,
      cookieFileActive: false,
      needsLogin: false,
    })),
    ...overrides,
  };
}

describe('parsePutBody', () => {
  it('uses 6 when enabled is true and intervalHours is omitted', () => {
    expect(parsePutBody({ enabled: true })).toEqual({ enabled: true, intervalHours: 6 });
  });
});

describe('applyRefreshPut', () => {
  it('returns 400 when enable hits an unreachable sidecar', async () => {
    const keeper = mockKeeper({
      enable: vi.fn(async () => { throw new SidecarUnreachableError(); }),
    });
    const res = await applyRefreshPut(keeper as never, { enabled: true, intervalHours: 6 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'YouTube browser sidecar is not reachable' });
  });

  it('returns 400 for interval 0 or 25 without calling enable', async () => {
    const keeper = mockKeeper();
    expect((await applyRefreshPut(keeper as never, { enabled: true, intervalHours: 0 })).status).toBe(400);
    expect((await applyRefreshPut(keeper as never, { enabled: true, intervalHours: 25 })).status).toBe(400);
    expect(keeper.enable).not.toHaveBeenCalled();
  });

  it('disables the keeper when enabled is false', async () => {
    const keeper = mockKeeper();
    const res = await applyRefreshPut(keeper as never, { enabled: false });
    expect(res.status).toBe(200);
    expect(keeper.disable).toHaveBeenCalledOnce();
    expect(keeper.enable).not.toHaveBeenCalled();
  });
});

describe('GET status DTO', () => {
  it('lists the six spec fields and no cookie payload', async () => {
    const keeper = mockKeeper({
      getStatus: vi.fn(async () => ({
        enabled: false,
        sidecarReachable: false,
        lastSuccessAt: null,
        lastError: null,
        cookieFileActive: true,
        needsLogin: false,
        cookies: [{ name: 'SID', value: 'leak' }],
      })),
    });
    const dto = toStatusDto(await keeper.getStatus() as never);
    expect(Object.keys(dto).sort()).toEqual([
      'cookieFileActive',
      'enabled',
      'lastError',
      'lastSuccessAt',
      'needsLogin',
      'sidecarReachable',
    ]);
    expect(JSON.stringify(dto)).not.toContain('SID');
    expect(JSON.stringify(dto)).not.toContain('leak');
  });
});

describe('applyForceRefresh', () => {
  it('calls refreshNow with force true', async () => {
    const keeper = mockKeeper();
    await applyForceRefresh(keeper as never);
    expect(keeper.refreshNow).toHaveBeenCalledWith({ force: true });
  });
});
