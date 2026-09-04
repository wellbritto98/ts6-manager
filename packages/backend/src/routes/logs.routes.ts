import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/rbac.js';
import { getRecentServerLogs } from '../services/server-management.service.js';
import { serverScope } from './server-scope.js';

export const logRoutes: Router = Router({ mergeParams: true });

// Server logs carry connection IPs, so they are admin-only — matching the UI,
// which already places Server Logs in the admin section.
logRoutes.use(requireRole('admin'));

logRoutes.get('/', async (req: Request, res: Response, next) => {
  try {
    const { prisma, pool, configId, sid } = serverScope(req);
    // Admins read the raw log text; only the agent gets redacted values.
    res.json(await getRecentServerLogs(prisma, pool, configId, sid, {
      lines: Number(req.query.lines) || undefined,
      redact: false,
    }));
  } catch (err) { next(err); }
});
