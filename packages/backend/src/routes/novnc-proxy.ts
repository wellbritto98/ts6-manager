import http from 'http';
import type { IncomingMessage, ServerResponse } from 'http';
import type { Duplex } from 'stream';
import type { CookieOptions, Request, Response } from 'express';
import { AppError } from '../middleware/error-handler.js';

export const NOVNC_PREFIX = '/api/settings/yt-browser/vnc';
export const NOVNC_COOKIE_NAME = 'yt_novnc';
export const NOVNC_COOKIE_PATH = NOVNC_PREFIX;
export const NOVNC_WEBSOCKET_PATH = `${NOVNC_PREFIX}/websockify`;

const HELMET_DROP = [
  'content-security-policy',
  'content-security-policy-report-only',
  'x-frame-options',
  'strict-transport-security',
  'cross-origin-opener-policy',
  'cross-origin-embedder-policy',
  'cross-origin-resource-policy',
  'origin-agent-cluster',
];

/** Same-origin iframe CSP without upgrade-insecure-requests (that flag breaks HTTP deploys). */
export const NOVNC_CSP = [
  "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:",
  "connect-src 'self' ws: wss:",
  "img-src 'self' data:",
  "frame-ancestors 'self'",
].join('; ');

export function assertNovncAdmin(role: string | undefined): void {
  if (role !== 'admin') throw new AppError(403, 'Admin access required');
}

export function isNovncPath(pathname: string): boolean {
  const path = pathname.split('?')[0];
  return path.startsWith(NOVNC_PREFIX) || path.startsWith('/settings/yt-browser/vnc');
}

export function parseCookieHeader(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    if (trimmed.slice(0, eq) === name) return trimmed.slice(eq + 1);
  }
  return undefined;
}

export function novncCookieOptions(secure: boolean): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: NOVNC_COOKIE_PATH,
    secure,
    maxAge: 15 * 60 * 1000,
  };
}

export function setNovncAuthCookie(res: Response, token: string, req: Request): void {
  const proto = req.headers['x-forwarded-proto'];
  const secure = req.secure || proto === 'https' || (Array.isArray(proto) && proto[0] === 'https');
  res.cookie(NOVNC_COOKIE_NAME, token, novncCookieOptions(secure));
}

export function tokenFromNovncUpgrade(req: IncomingMessage): string | undefined {
  const url = new URL(req.url || '/', 'http://localhost');
  const fromQuery = url.searchParams.get('token');
  if (fromQuery) return fromQuery;
  return parseCookieHeader(req.headers.cookie, NOVNC_COOKIE_NAME);
}

export function novncTargetUrl(reqUrl: string, base: string): URL {
  const incoming = new URL(reqUrl, 'http://localhost');
  incoming.searchParams.delete('token');
  let pathname = incoming.pathname;
  if (pathname.startsWith(NOVNC_PREFIX)) pathname = pathname.slice(NOVNC_PREFIX.length) || '/';
  if (!pathname.startsWith('/')) pathname = `/${pathname}`;
  const root = `${base.replace(/\/+$/, '')}/`;
  return new URL(pathname.slice(1) + incoming.search, root);
}

const HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'transfer-encoding', 'upgrade']);
const DO_NOT_FORWARD = new Set(['host', 'cookie', 'authorization', ...HOP]);

export function clearHelmetOnNovnc(res: ServerResponse): void {
  for (const name of HELMET_DROP) res.removeHeader(name);
}

export function mergeNovncOutgoingHeaders(
  proxyHeaders: http.IncomingHttpHeaders,
  res: ServerResponse,
): http.OutgoingHttpHeaders {
  const out: http.OutgoingHttpHeaders = {};
  for (const [key, value] of Object.entries(proxyHeaders)) {
    if (HELMET_DROP.includes(key.toLowerCase())) continue;
    out[key] = value;
  }
  out['content-security-policy'] = NOVNC_CSP;
  const setCookie = res.getHeader('Set-Cookie');
  if (setCookie) out['set-cookie'] = setCookie as string | string[];
  return out;
}

export function proxyNovncHttp(req: IncomingMessage, res: ServerResponse, base: string): void {
  const target = novncTargetUrl(req.url || '/', base);
  const headers: http.OutgoingHttpHeaders = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (DO_NOT_FORWARD.has(key.toLowerCase())) continue;
    headers[key] = value;
  }
  const proxy = http.request(target, { method: req.method, headers }, (proxyRes) => {
    clearHelmetOnNovnc(res);
    const out = mergeNovncOutgoingHeaders(proxyRes.headers, res);
    res.writeHead(proxyRes.statusCode || 502, out);
    proxyRes.pipe(res);
  });
  proxy.on('error', () => {
    if (!res.headersSent) res.statusCode = 502;
    res.end();
  });
  req.pipe(proxy);
}

export function proxyNovncUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer, base: string): void {
  const target = novncTargetUrl(req.url || '/', base);
  const port = target.port ? Number(target.port) : (target.protocol === 'https:' ? 443 : 80);
  const headers: http.OutgoingHttpHeaders = { ...req.headers, host: target.host };
  delete headers.cookie;
  delete headers.authorization;
  const proxy = http.request({
    protocol: target.protocol,
    hostname: target.hostname,
    port,
    path: target.pathname + target.search,
    method: 'GET',
    headers,
  });
  proxy.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    const lines = [`HTTP/1.1 ${proxyRes.statusCode} Switching Protocols`];
    for (const [key, value] of Object.entries(proxyRes.headers)) {
      if (value === undefined) continue;
      const serialized = Array.isArray(value) ? value.join(', ') : value;
      lines.push(`${key}: ${serialized}`);
    }
    socket.write(`${lines.join('\r\n')}\r\n\r\n`);
    if (proxyHead.length) proxySocket.unshift(proxyHead);
    if (head.length) socket.unshift(head);
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
  });
  proxy.on('error', () => socket.destroy());
  proxy.end();
}
