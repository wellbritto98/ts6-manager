import { describe, it, expect } from 'vitest';
import { AppError } from '../middleware/error-handler.js';
import { assertNovncAdmin, novncTargetUrl } from './novnc-proxy.js';

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
