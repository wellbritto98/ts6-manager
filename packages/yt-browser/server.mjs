import http from 'node:http';

export const DEFAULT_PORT = Number(process.env.YT_BROWSER_API_PORT || 9090);
export const DEFAULT_TOKEN = process.env.YT_BROWSER_TOKEN || '';
export const CDP_URL = process.env.YT_BROWSER_CDP_URL || 'http://127.0.0.1:9222';

/**
 * @param {{
 *   token: string,
 *   isHealthy: () => Promise<boolean>,
 *   getCookies: () => Promise<unknown[]>,
 * }} opts
 */
export function createApp({ token, isHealthy, getCookies }) {
  return http.createServer((req, res) => {
    void handle(req, res, { token, isHealthy, getCookies });
  });
}

async function handle(req, res, { token, isHealthy, getCookies }) {
  const url = req.url?.split('?')[0] ?? '';
  try {
    if (req.method === 'GET' && url === '/health') {
      const ok = await isHealthy();
      json(res, ok ? 200 : 503, { status: ok ? 'ok' : 'down' });
      return;
    }
    if (req.method === 'GET' && url === '/cookies') {
      const header = req.headers.authorization || '';
      if (!token || header !== `Bearer ${token}`) {
        json(res, 401, { error: 'unauthorized' });
        return;
      }
      const cookies = await getCookies();
      json(res, 200, { cookies });
      return;
    }
    json(res, 404, { error: 'not found' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'error';
    json(res, 502, { error: message.slice(0, 200) });
  }
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

export async function cdpHealthy(cdpBase = CDP_URL) {
  try {
    const res = await fetch(`${cdpBase.replace(/\/+$/, '')}/json/version`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function cdpCookies(cdpBase = CDP_URL) {
  // Network.getAllCookies only exists on a page-level CDP session — the
  // browser-level session (/json/version's webSocketDebuggerUrl) rejects it
  // with "wasn't found". Attach to the actual tab instead.
  const listRes = await fetch(`${cdpBase.replace(/\/+$/, '')}/json/list`, { signal: AbortSignal.timeout(3000) });
  if (!listRes.ok) throw new Error('cdp unavailable');
  const targets = await listRes.json();
  const page = Array.isArray(targets) ? targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl) : undefined;
  if (!page) throw new Error('no page target');
  const cookies = await cdpCall(page.webSocketDebuggerUrl, 'Network.getAllCookies');
  return cookies.cookies ?? [];
}

function cdpCall(wsUrl, method) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const id = 1;
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('cdp timeout'));
    }, 5000);
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ id, method }));
    });
    ws.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(String(ev.data));
        if (msg.id !== id) return;
        clearTimeout(timer);
        ws.close();
        if (msg.error) reject(new Error(msg.error.message || 'cdp error'));
        else resolve(msg.result || {});
      } catch (err) {
        clearTimeout(timer);
        ws.close();
        reject(err);
      }
    });
    ws.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('cdp websocket error'));
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const token = DEFAULT_TOKEN;
  if (!token) {
    console.error('[yt-browser] YT_BROWSER_TOKEN is required');
    process.exit(1);
  }
  const app = createApp({
    token,
    isHealthy: () => cdpHealthy(),
    getCookies: () => cdpCookies(),
  });
  app.listen(DEFAULT_PORT, '0.0.0.0', () => {
    console.log(`[yt-browser] API on :${DEFAULT_PORT}`);
  });
}
