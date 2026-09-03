import http from 'http';
import type { IncomingMessage, ServerResponse } from 'http';
import type { Duplex } from 'stream';
import { AppError } from '../middleware/error-handler.js';

const NOVNC_PREFIX = '/api/settings/yt-browser/vnc';

export function assertNovncAdmin(role: string | undefined): void {
  if (role !== 'admin') throw new AppError(403, 'Admin access required');
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

export function proxyNovncHttp(req: IncomingMessage, res: ServerResponse, base: string): void {
  const target = novncTargetUrl(req.url || '/', base);
  const headers: http.OutgoingHttpHeaders = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (HOP.has(key.toLowerCase())) continue;
    if (key.toLowerCase() === 'host') continue;
    headers[key] = value;
  }
  const proxy = http.request(target, { method: req.method, headers }, (proxyRes) => {
    const out: http.OutgoingHttpHeaders = { ...proxyRes.headers };
    delete out['x-frame-options'];
    delete out['content-security-policy'];
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
