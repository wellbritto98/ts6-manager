import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect } from 'vitest';
import {
  parseIntervalHours,
  cookiesToNetscape,
  hasYoutubeCookies,
  atomicSwapCookieFile,
  isBotCheckError,
} from './cookie-refresh.js';

describe('parseIntervalHours', () => {
  it('accepts the inclusive lower bound 1', () => {
    expect(parseIntervalHours(1)).toBe(1);
  });

  it('accepts the inclusive upper bound 24', () => {
    expect(parseIntervalHours(24)).toBe(24);
  });

  it('returns null for 0', () => {
    expect(parseIntervalHours(0)).toBeNull();
  });

  it('returns null for 25', () => {
    expect(parseIntervalHours(25)).toBeNull();
  });

  it('returns null for a non-integer', () => {
    expect(parseIntervalHours(12.9)).toBeNull();
  });

  it('returns null when the value is omitted', () => {
    expect(parseIntervalHours(undefined)).toBeNull();
    expect(parseIntervalHours(null)).toBeNull();
  });

  it('accepts a numeric string inside the bounds', () => {
    expect(parseIntervalHours('6')).toBe(6);
  });
});

describe('hasYoutubeCookies', () => {
  it('is false when no domain contains youtube.com', () => {
    const text = cookiesToNetscape([
      { name: 'SID', value: 'secret', domain: '.google.com', path: '/' },
    ]);
    expect(hasYoutubeCookies(text)).toBe(false);
  });

  it('is true when a domain contains youtube.com', () => {
    const text = cookiesToNetscape([
      { name: 'SID', value: 'secret', domain: '.youtube.com', path: '/', secure: true },
    ]);
    expect(hasYoutubeCookies(text)).toBe(true);
  });
});

describe('atomicSwapCookieFile', () => {
  it('replaces the live file with mode 0600', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ytcr-'));
    const live = path.join(dir, 'yt-cookies.txt');
    fs.writeFileSync(live, 'OLD', 'utf8');
    atomicSwapCookieFile(live, '# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t0\tA\tB\n');
    expect(fs.readFileSync(live, 'utf8')).toContain('.youtube.com');
    expect(fs.statSync(live).mode & 0o777).toBe(0o600);
  });
});

describe('isBotCheckError', () => {
  it('is true when the message contains Sign in to confirm you\'re not a bot', () => {
    expect(isBotCheckError("ERROR: [youtube] Sign in to confirm you're not a bot")).toBe(true);
  });

  it('is false for other yt-dlp errors', () => {
    expect(isBotCheckError('ERROR: [youtube] Video unavailable')).toBe(false);
  });
});
