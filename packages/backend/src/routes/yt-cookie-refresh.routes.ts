import { Router, type Request, type Response, type NextFunction } from 'express';
import { AppError } from '../middleware/error-handler.js';
import {
  CookieKeeper,
  SidecarUnreachableError,
  type CookieRefreshStatus,
} from '../voice/audio/cookie-keeper.js';
import { DEFAULT_INTERVAL_HOURS, parseIntervalHours } from '../voice/audio/cookie-refresh.js';

const ytCookieRefreshRoutes: Router = Router();

function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if ((req as { user?: { role?: string } }).user?.role !== 'admin') {
    return next(new AppError(403, 'Admin access required'));
  }
  next();
}

function keeperOf(req: Request): CookieKeeper {
  const keeper = req.app.locals.cookieKeeper as CookieKeeper | undefined;
  if (!keeper) throw new AppError(503, 'Cookie refresh is not initialized');
  return keeper;
}

export function parsePutBody(body: unknown): { enabled: boolean; intervalHours: number } {
  if (!body || typeof body !== 'object') {
    throw new AppError(400, 'Invalid body');
  }
  const enabled = (body as { enabled?: unknown }).enabled === true;
  if (!enabled) {
    return { enabled: false, intervalHours: DEFAULT_INTERVAL_HOURS };
  }
  const raw = (body as { intervalHours?: unknown }).intervalHours;
  if (raw === undefined || raw === null || raw === '') {
    return { enabled: true, intervalHours: DEFAULT_INTERVAL_HOURS };
  }
  const hours = parseIntervalHours(raw);
  if (hours == null) {
    throw new AppError(400, 'intervalHours must be an integer between 1 and 24');
  }
  return { enabled: true, intervalHours: hours };
}

export function toStatusDto(status: CookieRefreshStatus): CookieRefreshStatus {
  return {
    enabled: status.enabled,
    sidecarReachable: status.sidecarReachable,
    lastSuccessAt: status.lastSuccessAt,
    lastError: status.lastError,
    cookieFileActive: status.cookieFileActive,
    needsLogin: status.needsLogin,
  };
}

export async function applyRefreshPut(
  keeper: CookieKeeper,
  body: unknown,
): Promise<{ status: number; body: object }> {
  try {
    const parsed = parsePutBody(body);
    if (!parsed.enabled) {
      await keeper.disable();
      return { status: 200, body: toStatusDto(await keeper.getStatus()) };
    }
    await keeper.enable(parsed.intervalHours);
    return { status: 200, body: toStatusDto(await keeper.getStatus()) };
  } catch (err) {
    if (err instanceof SidecarUnreachableError) {
      return { status: 400, body: { error: err.message } };
    }
    if (err instanceof AppError) {
      return { status: err.statusCode, body: { error: err.message } };
    }
    throw err;
  }
}

export async function applyForceRefresh(keeper: CookieKeeper): Promise<{ result: string }> {
  const result = await keeper.refreshNow({ force: true });
  return { result };
}

ytCookieRefreshRoutes.get('/yt-cookie-refresh', requireAdmin, async (req, res, next) => {
  try {
    res.json(toStatusDto(await keeperOf(req).getStatus()));
  } catch (err) { next(err); }
});

ytCookieRefreshRoutes.put('/yt-cookie-refresh', requireAdmin, async (req, res, next) => {
  try {
    const out = await applyRefreshPut(keeperOf(req), req.body);
    res.status(out.status).json(out.body);
  } catch (err) { next(err); }
});

ytCookieRefreshRoutes.post('/yt-cookie-refresh/refresh', requireAdmin, async (req, res, next) => {
  try {
    res.json(await applyForceRefresh(keeperOf(req)));
  } catch (err) { next(err); }
});

export { ytCookieRefreshRoutes };
