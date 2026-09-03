import { describe, it, expect } from 'vitest';
import http from 'http';
import { AppError } from '../middleware/error-handler.js';
import {
  assertNovncAdmin,
  isNovncPath,
  mergeNovncOutgoingHeaders,
  NOVNC_COOKIE_NAME,
  NOVNC_CSP,
  novncTargetUrl,
  parseCookieHeader,
  tokenFromNovncUpgrade,
} from './novnc-proxy.js';

describe('assertNovncAdmin', () => {
  it('rejects a missing or non-admin role', () => {
    expect(() => assertNovncAdmin(undefined)).toThrow(AppError);
    expect(() => assertNovncAdmin('viewer')).toThrow(AppError);
    try {
      assertNovncAdmin('viewer');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(403);
    }
  });

  it('allows admin', () => {
    expect(() => assertNovncAdmin('admin')).not.toThrow();
  });
});

describe('novncTargetUrl', () => {
  it('strips the token query and the API prefix', () => {
    const url = novncTargetUrl(
      '/api/settings/yt-browser/vnc/vnc.html?token=secret.jwt&autoconnect=true',
      'http://ts6-yt-browser:6080',
    );
    expect(url.toString()).toBe('http://ts6-yt-browser:6080/vnc.html?autoconnect=true');
    expect(url.searchParams.get('token')).toBeNull();
  });
});

describe('noVNC session helpers', () => {
  it('recognizes API and stripped settings paths as noVNC', () => {
    expect(isNovncPath('/api/settings/yt-browser/vnc/app/styles/base.css')).toBe(true);
    expect(isNovncPath('/settings/yt-browser/vnc/app/ui.js')).toBe(true);
    expect(isNovncPath('/settings/yt-cookies')).toBe(false);
  });

  it('reads the session cookie from a Cookie header', () => {
    expect(parseCookieHeader(`${NOVNC_COOKIE_NAME}=abc.def; other=1`, NOVNC_COOKIE_NAME)).toBe('abc.def');
  });

  it('prefers the query token on websocket upgrade then falls back to the cookie', () => {
    expect(tokenFromNovncUpgrade({
      url: '/api/settings/yt-browser/vnc/websockify?token=from-query',
      headers: { cookie: `${NOVNC_COOKIE_NAME}=from-cookie` },
    } as http.IncomingMessage)).toBe('from-query');
    expect(tokenFromNovncUpgrade({
      url: '/api/settings/yt-browser/vnc/websockify',
      headers: { cookie: `${NOVNC_COOKIE_NAME}=from-cookie` },
    } as http.IncomingMessage)).toBe('from-cookie');
  });

  it('replaces helmet CSP so upgrade-insecure-requests is not forwarded', () => {
    const res = { getHeader: () => undefined } as unknown as http.ServerResponse;
    const out = mergeNovncOutgoingHeaders(
      { 'content-security-policy': "default-src 'self'; upgrade-insecure-requests" },
      res,
    );
    const csp = String(out['content-security-policy']);
    expect(csp).toBe(NOVNC_CSP);
    expect(csp).not.toContain('upgrade-insecure-requests');
  });

  it('keeps the auth Set-Cookie when merging proxied headers', () => {
    const res = { getHeader: () => `${NOVNC_COOKIE_NAME}=jwt` } as unknown as http.ServerResponse;
    const out = mergeNovncOutgoingHeaders({ 'content-type': 'text/html' }, res);
    expect(out['set-cookie']).toBe(`${NOVNC_COOKIE_NAME}=jwt`);
  });
});
