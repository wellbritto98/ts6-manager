import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/rbac.js';
import { AppError } from '../middleware/error-handler.js';
import { validateUrl } from '../utils/url-validator.js';
import { RADIO_PRESETS } from '../services/radio-station-management.service.js';

export const radioStationRoutes: Router = Router({ mergeParams: true });

radioStationRoutes.use(requireRole('admin'));

// GET /presets — Built-in radio station presets
radioStationRoutes.get('/presets', (_req: Request, res: Response) => {
  res.json(RADIO_PRESETS);
});

// GET / — List radio stations for this server
radioStationRoutes.get('/', async (req: Request, res: Response, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const configId = parseInt(req.params.configId as string);
    const stations = await prisma.radioStation.findMany({
      where: { serverConfigId: configId },
      orderBy: { name: 'asc' },
    });
    res.json(stations);
  } catch (err) { next(err); }
});

// POST / — Add radio station
radioStationRoutes.post('/', async (req: Request, res: Response, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const configId = parseInt(req.params.configId as string);
    const { name, url, genre, imageUrl } = req.body;
    if (!name || !url) throw new AppError(400, 'name and url are required');

    // C4: Validate radio station URL
    const urlCheck = await validateUrl(url, { allowedProtocols: ['http:', 'https:'] });
    if (!urlCheck.valid) throw new AppError(400, `Invalid URL: ${urlCheck.error}`);

    const station = await prisma.radioStation.create({
      data: {
        name,
        url,
        genre: genre || null,
        imageUrl: imageUrl || null,
        serverConfigId: configId,
      },
    });
    res.status(201).json(station);
  } catch (err) { next(err); }
});

// DELETE /:id — Remove radio station
radioStationRoutes.delete('/:id', async (req: Request, res: Response, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const id = parseInt(req.params.id as string);
    await prisma.radioStation.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});
