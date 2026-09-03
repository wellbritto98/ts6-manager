import fs from 'fs';
import path from 'path';

export const DEFAULT_INTERVAL_HOURS = 6;
export const VALIDATE_VIDEO_URL = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
export const BOT_CHECK_NEEDLE = "Sign in to confirm you're not a bot";
export const COOLDOWN_MS = 5 * 60 * 1000;

export interface CdpCookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
  expires?: number;
  secure?: boolean;
  httpOnly?: boolean;
}

export function parseIntervalHours(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 24) return null;
  return n;
}

export function cookiesToNetscape(cookies: CdpCookie[]): string {
  const lines = ['# Netscape HTTP Cookie File'];
  for (const cookie of cookies) {
    const domain = cookie.domain || '';
    const flag = domain.startsWith('.') ? 'TRUE' : 'FALSE';
    const cookiePath = cookie.path || '/';
    const secure = cookie.secure ? 'TRUE' : 'FALSE';
    const expires = cookie.expires && cookie.expires > 0 ? Math.floor(cookie.expires) : 0;
    lines.push(
      [domain, flag, cookiePath, secure, String(expires), cookie.name, cookie.value].join('\t'),
    );
  }
  return `${lines.join('\n')}\n`;
}

export function hasYoutubeCookies(netscape: string): boolean {
  for (const line of netscape.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const domain = trimmed.split('\t')[0] ?? '';
    if (domain.toLowerCase().includes('youtube.com')) return true;
  }
  return false;
}

export function atomicSwapCookieFile(livePath: string, candidate: string): void {
  const dir = path.dirname(livePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${livePath}.tmp`;
  fs.writeFileSync(tmp, candidate, { encoding: 'utf8', mode: 0o600 });
  fs.chmodSync(tmp, 0o600);
  fs.renameSync(tmp, livePath);
  fs.chmodSync(livePath, 0o600);
}

export function isBotCheckError(message: string): boolean {
  return message.includes(BOT_CHECK_NEEDLE);
}

export function redactError(message: string): string {
  return message
    .replace(/[?&](?:sig|signature|expire|ip)=[^&\s]+/gi, '[redacted]')
    .replace(/\t[^\t\n]+$/gm, '\t[redacted]');
}
