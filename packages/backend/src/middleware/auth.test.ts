import { describe, it, expect, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';
import { authMiddleware } from './auth.js';
import { config } from '../config.js';
import { NOVNC_COOKIE_NAME } from '../routes/novnc-proxy.js';

/**
 * Regression cover for the token-class confusion: access, MFA-challenge and
 * password-change tokens are all HS256 over the same secret, so verifying the
 * signature alone let a caller who knew only a password present the challenge
 * token as a session and skip the second factor entirely.
 */

const ADMIN = { enabled: true, role: 'admin' };

function run(
  token: string,
  dbUser: unknown = ADMIN,
  extras: { path?: string; cookies?: Record<string, string>; query?: Record<string, string>; headers?: Record<string, string> } = {},
) {
  const status = vi.fn().mockReturnThis();
  const json = vi.fn();
  const next = vi.fn();
  const cookie = vi.fn();
  const findUnique = vi.fn().mockResolvedValue(dbUser);

  const req = {
    headers: extras.headers ?? (token ? { authorization: `Bearer ${token}` } : {}),
    path: extras.path ?? '/settings/users',
    originalUrl: extras.path ?? '/api/settings/users',
    query: extras.query ?? {},
    cookies: extras.cookies ?? {},
    secure: false,
    app: { locals: { prisma: { user: { findUnique } } } },
  } as unknown as Request;
  const res = { status, json, cookie } as unknown as Response;

  authMiddleware(req, res, next);
  return new Promise<{ status: typeof status; json: typeof json; next: typeof next; req: Request; cookie: typeof cookie }>(
    (resolve) => setImmediate(() => resolve({ status, json, next, req, cookie })),
  );
}

const sign = (payload: object) => jwt.sign(payload, config.jwtSecret, { expiresIn: '5m' });

describe('authMiddleware token class', () => {
  it('accepts a real access token', async () => {
    const { next, status, req } = await run(sign({ typ: 'access', id: 42, username: 'root', role: 'admin' }));
    expect(next).toHaveBeenCalledOnce();
    expect(status).not.toHaveBeenCalled();
    expect(req.user?.id).toBe(42);
  });

  it('rejects an MFA challenge token presented as a session', async () => {
    const { next, status } = await run(sign({ typ: 'mfa', mfa: true, id: 42 }));
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
  });

  it('rejects a forced-password-change token presented as a session', async () => {
    const { next, status } = await run(sign({ typ: 'pwchange', pwchange: true, id: 42 }));
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
  });

  it('rejects a token with no class claim at all', async () => {
    const { next, status } = await run(sign({ id: 42, username: 'root', role: 'admin' }));
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
  });

  it('takes the role from the database, not the token', async () => {
    const { req } = await run(
      sign({ typ: 'access', id: 7, username: 'viewer', role: 'admin' }),
      { enabled: true, role: 'viewer' },
    );
    expect(req.user?.role).toBe('viewer');
  });

  it('rejects a disabled account', async () => {
    const { next, status } = await run(
      sign({ typ: 'access', id: 7, username: 'gone', role: 'admin' }),
      { enabled: false, role: 'admin' },
    );
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
  });

  it('accepts a noVNC query token and sets the path-scoped cookie', async () => {
    const token = sign({ typ: 'access', id: 42, username: 'root', role: 'admin' });
    const { next, cookie, status } = await run(token, ADMIN, {
      headers: {},
      path: '/settings/yt-browser/vnc/vnc.html',
      query: { token },
    });
    expect(status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
    expect(cookie).toHaveBeenCalledWith(NOVNC_COOKIE_NAME, token, expect.objectContaining({
      httpOnly: true,
      path: '/api/settings/yt-browser/vnc',
    }));
  });

  it('accepts the noVNC cookie on a static asset without a query token', async () => {
    const token = sign({ typ: 'access', id: 42, username: 'root', role: 'admin' });
    const { next, status } = await run(token, ADMIN, {
      headers: {},
      path: '/settings/yt-browser/vnc/app/styles/base.css',
      cookies: { [NOVNC_COOKIE_NAME]: token },
    });
    expect(status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it('does not treat the noVNC cookie as a session on other API paths', async () => {
    const token = sign({ typ: 'access', id: 42, username: 'root', role: 'admin' });
    const { next, status } = await run(token, ADMIN, {
      headers: {},
      path: '/settings/yt-cookies',
      cookies: { [NOVNC_COOKIE_NAME]: token },
    });
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
  });
});
