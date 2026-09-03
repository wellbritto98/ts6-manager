import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { CookieKeeper, SidecarUnreachableError } from './cookie-keeper.js';
import { COOLDOWN_MS } from './cookie-refresh.js';

function tmpCookiePath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ytcr-k-'));
  const live = path.join(dir, 'yt-cookies.txt');
  fs.writeFileSync(live, 'PREVIOUS', 'utf8');
  return live;
}

function ytCookie(name = 'SID', value = 'secret-value'): { name: string; value: string; domain: string; path: string } {
  return { name, value, domain: '.youtube.com', path: '/' };
}

function makeKeeper(overrides: Partial<ConstructorParameters<typeof CookieKeeper>[0]> = {}) {
  const cookiePath = overrides.cookiePath ?? tmpCookiePath();
  const fetchCookies = overrides.fetchCookies ?? vi.fn(async () => [ytCookie()]);
  const pingSidecar = overrides.pingSidecar ?? vi.fn(async () => true);
  const validateCandidate = overrides.validateCandidate ?? vi.fn(async () => undefined);
  const now = overrides.now ?? (() => 1_000_000);
  const settings = new Map<string, string>();
  const prisma = overrides.prisma ?? {
    appSetting: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => {
        const value = settings.get(where.key);
        return value === undefined ? null : { key: where.key, value };
      }),
      upsert: vi.fn(async ({ where, create, update }: { where: { key: string }; create: { value: string }; update: { value: string } }) => {
        const value = update?.value ?? create.value;
        settings.set(where.key, value);
        return { key: where.key, value };
      }),
    },
  };
  const keeper = new CookieKeeper({
    cookiePath,
    fetchCookies,
    pingSidecar,
    validateCandidate,
    prisma,
    now,
  });
  keepers.push(keeper);
  return { keeper, cookiePath, fetchCookies, pingSidecar, validateCandidate, settings, prisma };
}

const keepers: CookieKeeper[] = [];
afterEach(() => {
  for (const k of keepers) k.stop();
  keepers.length = 0;
});

describe('CookieKeeper', () => {
  it('throws SidecarUnreachableError when enable pings a down sidecar', async () => {
    const { keeper } = makeKeeper({ pingSidecar: vi.fn(async () => false) });
    await expect(keeper.enable(6)).rejects.toBeInstanceOf(SidecarUnreachableError);
  });

  it('leaves the live cookie file unchanged when export fails', async () => {
    const { keeper, cookiePath } = makeKeeper({
      fetchCookies: vi.fn(async () => { throw new Error('cdp down'); }),
    });
    await keeper.enable(6);
    const result = await keeper.refreshNow({ force: true });
    expect(result).toBe('failed');
    expect(fs.readFileSync(cookiePath, 'utf8')).toBe('PREVIOUS');
  });

  it('leaves the live cookie file unchanged when the candidate has no youtube.com cookies', async () => {
    const { keeper, cookiePath, validateCandidate } = makeKeeper({
      fetchCookies: vi.fn(async () => [{ name: 'SID', value: 'x', domain: '.google.com', path: '/' }]),
    });
    await keeper.enable(6);
    expect(await keeper.refreshNow({ force: true })).toBe('failed');
    expect(fs.readFileSync(cookiePath, 'utf8')).toBe('PREVIOUS');
    expect(validateCandidate).not.toHaveBeenCalled();
  });

  it('joins overlapping refreshNow calls onto one in-flight export', async () => {
    let release: (cookies: ReturnType<typeof ytCookie>[]) => void = () => undefined;
    const fetchCookies = vi.fn(() => new Promise<ReturnType<typeof ytCookie>[]>((resolve) => {
      release = resolve;
    }));
    const { keeper } = makeKeeper({ fetchCookies });
    await keeper.enable(6);
    const a = keeper.refreshNow({ force: true });
    const b = keeper.refreshNow({ force: true });
    release([ytCookie()]);
    expect(await a).toBe('ok');
    expect(await b).toBe('ok');
    expect(fetchCookies).toHaveBeenCalledTimes(1);
  });

  it('skips a refresh inside the 5 minute cooldown when force is false', async () => {
    let t = 5_000_000;
    const fetchCookies = vi.fn(async () => [ytCookie()]);
    const { keeper } = makeKeeper({ fetchCookies, now: () => t });
    await keeper.enable(6);
    expect(await keeper.refreshNow({ force: true })).toBe('ok');
    t += COOLDOWN_MS - 1;
    expect(await keeper.refreshNow()).toBe('skipped');
    expect(fetchCookies).toHaveBeenCalledTimes(1);
  });

  it('runs refreshNow with force true despite the cooldown', async () => {
    let t = 5_000_000;
    const fetchCookies = vi.fn(async () => [ytCookie()]);
    const { keeper } = makeKeeper({ fetchCookies, now: () => t });
    await keeper.enable(6);
    expect(await keeper.refreshNow({ force: true })).toBe('ok');
    t += 1;
    expect(await keeper.refreshNow({ force: true })).toBe('ok');
    expect(fetchCookies).toHaveBeenCalledTimes(2);
  });

  it('getStatus returns exactly the six spec fields', async () => {
    const { keeper } = makeKeeper();
    const status = await keeper.getStatus();
    expect(Object.keys(status).sort()).toEqual([
      'cookieFileActive',
      'enabled',
      'lastError',
      'lastSuccessAt',
      'needsLogin',
      'sidecarReachable',
    ]);
  });

  it('records lastError without cookie values', async () => {
    const { keeper } = makeKeeper({
      fetchCookies: vi.fn(async () => { throw new Error('SID=secret-value failed'); }),
    });
    await keeper.enable(6);
    await keeper.refreshNow({ force: true });
    const status = await keeper.getStatus();
    expect(status.lastError).toBeTruthy();
    expect(status.lastError).not.toContain('secret-value');
  });

  it('sets needsLogin when the candidate has no youtube.com cookies', async () => {
    const { keeper } = makeKeeper({
      fetchCookies: vi.fn(async () => [{ name: 'A', value: 'b', domain: '.google.com', path: '/' }]),
    });
    await keeper.enable(6);
    await keeper.refreshNow({ force: true });
    const status = await keeper.getStatus();
    expect(status.needsLogin).toBe(true);
  });

  it('replaces the live file after a successful validate', async () => {
    const { keeper, cookiePath } = makeKeeper();
    await keeper.enable(6);
    expect(await keeper.refreshNow({ force: true })).toBe('ok');
    expect(fs.readFileSync(cookiePath, 'utf8')).toContain('.youtube.com');
    const status = await keeper.getStatus();
    expect(status.needsLogin).toBe(false);
    expect(status.lastSuccessAt).toMatch(/^\d{4}-/);
  });

  it('notifyBotCheck is a no-op when refresh is disabled', async () => {
    const fetchCookies = vi.fn(async () => [ytCookie()]);
    const { keeper } = makeKeeper({ fetchCookies });
    keeper.notifyBotCheck();
    await new Promise((r) => setImmediate(r));
    expect(fetchCookies).not.toHaveBeenCalled();
  });
});
