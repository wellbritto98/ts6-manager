import fs from 'fs';
import { CookieKeeper, type CookieKeeperDeps } from './cookie-keeper.js';
import { VALIDATE_VIDEO_URL, type CdpCookie } from './cookie-refresh.js';
import { runYtDlp, setYtCookieFile } from './youtube.js';

export function createCookieKeeper(prisma: CookieKeeperDeps['prisma'], cookiePath: string): CookieKeeper {
  const base = (process.env.YT_BROWSER_URL || '').replace(/\/+$/, '');
  const token = process.env.YT_BROWSER_TOKEN || '';
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  return new CookieKeeper({
    cookiePath,
    prisma,
    setLiveCookieFile: setYtCookieFile,
    pingSidecar: async () => {
      if (!base) return false;
      try {
        const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(2000) });
        return res.ok;
      } catch {
        return false;
      }
    },
    fetchCookies: async () => {
      if (!base) throw new Error('sidecar missing');
      const res = await fetch(`${base}/cookies`, { headers, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error('export_failed');
      const data = await res.json() as { cookies?: CdpCookie[] };
      return data.cookies ?? [];
    },
    validateCandidate: async (netscape) => {
      const tmp = `${cookiePath}.validate`;
      fs.writeFileSync(tmp, netscape, { encoding: 'utf8', mode: 0o600 });
      try {
        await runYtDlp(
          ['--cookies', tmp, '--dump-json', '--no-playlist', '--', VALIDATE_VIDEO_URL],
          60_000,
        );
      } finally {
        fs.rmSync(tmp, { force: true });
      }
    },
  });
}
