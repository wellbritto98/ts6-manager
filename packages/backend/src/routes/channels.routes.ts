import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/rbac.js';
import * as channelService from '../services/channel-management.service.js';
import { serverScope } from './server-scope.js';

export const channelRoutes: Router = Router({ mergeParams: true });

channelRoutes.get('/', async (req: Request, res: Response, next) => {
  try {
    const { prisma, pool, configId, sid } = serverScope(req);
    res.json(await channelService.listChannels(prisma, pool, configId, sid));
  } catch (err) { next(err); }
});

channelRoutes.get('/:cid', async (req: Request, res: Response, next) => {
  try {
    const { prisma, pool, configId, sid } = serverScope(req);
    res.json(await channelService.getChannel(prisma, pool, configId, sid, req.params.cid));
  } catch (err) { next(err); }
});

channelRoutes.post('/', requireRole('admin'), async (req: Request, res: Response, next) => {
  try {
    const { prisma, pool, configId, sid } = serverScope(req);
    res.status(201).json(await channelService.createChannel(prisma, pool, configId, sid, req.body));
  } catch (err) { next(err); }
});

channelRoutes.put('/:cid', requireRole('admin'), async (req: Request, res: Response, next) => {
  try {
    const { prisma, pool, configId, sid } = serverScope(req);
    res.json(await channelService.editChannel(prisma, pool, configId, sid, req.params.cid, req.body));
  } catch (err) { next(err); }
});

channelRoutes.delete('/:cid', requireRole('admin'), async (req: Request, res: Response, next) => {
  try {
    const { prisma, pool, configId, sid } = serverScope(req);
    const force = req.query.force ? String(req.query.force) : 1;
    res.json(await channelService.deleteChannel(prisma, pool, configId, sid, req.params.cid, force));
  } catch (err) { next(err); }
});

channelRoutes.post('/:cid/move', requireRole('admin'), async (req: Request, res: Response, next) => {
  try {
    const { prisma, pool, configId, sid } = serverScope(req);
    res.json(await channelService.moveChannel(prisma, pool, configId, sid, req.params.cid, req.body));
  } catch (err) { next(err); }
});

channelRoutes.get('/:cid/permissions', async (req: Request, res: Response, next) => {
  try {
    const { pool, configId, sid } = serverScope(req);
    res.json(await pool.getClient(configId).execute(sid, 'channelpermlist', {
      cid: String(req.params.cid), '-permsid': '',
    }));
  } catch (err) { next(err); }
});

channelRoutes.put('/:cid/permissions', requireRole('admin'), async (req: Request, res: Response, next) => {
  try {
    const { prisma, pool, configId, sid } = serverScope(req);
    res.json(await channelService.setChannelPermission(prisma, pool, configId, sid, req.params.cid, req.body));
  } catch (err) { next(err); }
});

channelRoutes.delete('/:cid/permissions', requireRole('admin'), async (req: Request, res: Response, next) => {
  try {
    const { prisma, pool, configId, sid } = serverScope(req);
    res.json(await channelService.removeChannelPermission(prisma, pool, configId, sid, req.params.cid, req.body));
  } catch (err) { next(err); }
});
