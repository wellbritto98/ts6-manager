import type { Request } from 'express';
import type { PrismaClient } from '../../generated/prisma/index.js';
import type { ConnectionPool } from '../ts-client/connection-pool.js';

export interface ServerScope {
  prisma: PrismaClient;
  pool: ConnectionPool;
  configId: number;
  sid: number;
}

/**
 * Everything a `:configId/vs/:sid` handler needs to call a shared service.
 * `requireIntParams` has already rejected non-numeric params upstream.
 */
export function serverScope(req: Request): ServerScope {
  return {
    prisma: req.app.locals.prisma,
    pool: req.app.locals.connectionPool,
    configId: parseInt(String(req.params.configId)),
    sid: parseInt(String(req.params.sid)),
  };
}
