import fs from 'fs';
import {
  DEFAULT_INTERVAL_HOURS,
  COOLDOWN_MS,
  cookiesToNetscape,
  hasYoutubeCookies,
  atomicSwapCookieFile,
  parseIntervalHours,
  type CdpCookie,
} from './cookie-refresh.js';

export const ENABLED_KEY = 'youtube.cookieRefresh.enabled';
export const INTERVAL_KEY = 'youtube.cookieRefresh.intervalHours';

export class SidecarUnreachableError extends Error {
  constructor() {
    super('YouTube browser sidecar is not reachable');
    this.name = 'SidecarUnreachableError';
  }
}

export type RefreshResult = 'ok' | 'skipped' | 'failed';

export interface CookieRefreshStatus {
  enabled: boolean;
  sidecarReachable: boolean;
  lastSuccessAt: string | null;
  lastError: string | null;
  cookieFileActive: boolean;
  needsLogin: boolean;
}

interface PrismaSettings {
  appSetting: {
    findUnique: (args: { where: { key: string } }) => Promise<{ value: string } | null>;
    upsert: (args: {
      where: { key: string };
      update: { value: string };
      create: { key: string; value: string };
    }) => Promise<unknown>;
  };
}

export interface CookieKeeperDeps {
  cookiePath: string;
  fetchCookies: () => Promise<CdpCookie[]>;
  pingSidecar: () => Promise<boolean>;
  validateCandidate: (netscape: string) => Promise<void>;
  prisma: PrismaSettings;
  now?: () => number;
  setLiveCookieFile?: (filePath: string | null) => void;
}

export class CookieKeeper {
  private enabled = false;
  private intervalHours = DEFAULT_INTERVAL_HOURS;
  private lastSuccessAt: string | null = null;
  private lastError: string | null = null;
  private needsLogin = false;
  private lastRefreshAt = 0;
  private inFlight: Promise<RefreshResult> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly deps: CookieKeeperDeps) {}

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }

  async loadFromDb(): Promise<void> {
    const enabledRow = await this.deps.prisma.appSetting.findUnique({ where: { key: ENABLED_KEY } });
    const intervalRow = await this.deps.prisma.appSetting.findUnique({ where: { key: INTERVAL_KEY } });
    this.enabled = enabledRow?.value === 'true';
    this.intervalHours = parseIntervalHours(intervalRow?.value) ?? DEFAULT_INTERVAL_HOURS;
    if (this.enabled) this.startTimer();
  }

  async enable(intervalHours: number): Promise<void> {
    const hours = parseIntervalHours(intervalHours) ?? DEFAULT_INTERVAL_HOURS;
    const reachable = await this.deps.pingSidecar().catch(() => false);
    if (!reachable) throw new SidecarUnreachableError();
    this.intervalHours = hours;
    this.enabled = true;
    await this.persist();
    this.startTimer();
  }

  async disable(): Promise<void> {
    this.enabled = false;
    this.stopTimer();
    await this.persist();
  }

  notifyBotCheck(): void {
    if (!this.enabled) return;
    void this.refreshNow();
  }

  async refreshNow(opts: { force?: boolean } = {}): Promise<RefreshResult> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.runRefresh(opts.force === true).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  async getStatus(): Promise<CookieRefreshStatus> {
    const sidecarReachable = await this.deps.pingSidecar().catch(() => false);
    const cookieFileActive = fs.existsSync(this.deps.cookiePath);
    return {
      enabled: this.enabled,
      sidecarReachable,
      lastSuccessAt: this.lastSuccessAt,
      lastError: this.lastError,
      cookieFileActive,
      needsLogin: this.needsLogin,
    };
  }

  private async runRefresh(force: boolean): Promise<RefreshResult> {
    if (!force && this.lastRefreshAt > 0 && this.now() - this.lastRefreshAt < COOLDOWN_MS) {
      return 'skipped';
    }
    try {
      const cookies = await this.deps.fetchCookies();
      const netscape = cookiesToNetscape(cookies);
      if (!hasYoutubeCookies(netscape)) {
        this.lastError = 'missing_youtube_cookies';
        this.needsLogin = true;
        this.lastRefreshAt = this.now();
        return 'failed';
      }
      await this.deps.validateCandidate(netscape);
      atomicSwapCookieFile(this.deps.cookiePath, netscape);
      this.deps.setLiveCookieFile?.(this.deps.cookiePath);
      this.lastSuccessAt = new Date(this.now()).toISOString();
      this.lastError = null;
      this.needsLogin = false;
      this.lastRefreshAt = this.now();
      return 'ok';
    } catch (err) {
      const message = err instanceof Error ? err.message : 'failed';
      this.lastError = message.includes('validat') ? 'validation_failed' : 'export_failed';
      this.lastRefreshAt = this.now();
      return 'failed';
    }
  }

  private async persist(): Promise<void> {
    await this.deps.prisma.appSetting.upsert({
      where: { key: ENABLED_KEY },
      update: { value: this.enabled ? 'true' : 'false' },
      create: { key: ENABLED_KEY, value: this.enabled ? 'true' : 'false' },
    });
    await this.deps.prisma.appSetting.upsert({
      where: { key: INTERVAL_KEY },
      update: { value: String(this.intervalHours) },
      create: { key: INTERVAL_KEY, value: String(this.intervalHours) },
    });
  }

  private startTimer(): void {
    this.stopTimer();
    const ms = this.intervalHours * 60 * 60 * 1000;
    this.timer = setInterval(() => {
      void this.refreshNow();
    }, ms);
    if (typeof this.timer === 'object' && this.timer && 'unref' in this.timer) {
      this.timer.unref();
    }
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  stop(): void {
    this.stopTimer();
  }
}

export type { CdpCookie };
