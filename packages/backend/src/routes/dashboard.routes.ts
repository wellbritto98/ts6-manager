import { Router, Request, Response } from 'express';
import { getServerDashboard } from '../services/server-management.service.js';
import { serverScope } from './server-scope.js';

export const dashboardRoutes: Router = Router({ mergeParams: true });

dashboardRoutes.get('/', async (req: Request, res: Response, next) => {
  try {
    const { prisma, pool, configId, sid } = serverScope(req);
    res.json(await getServerDashboard(prisma, pool, configId, sid));
  } catch (err) { next(err); }
});
