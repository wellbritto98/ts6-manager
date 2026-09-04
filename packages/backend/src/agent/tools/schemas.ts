import { z } from 'zod';

/**
 * Shared input fragments. Every server-scoped tool names its target
 * explicitly: neither id is ever defaulted to the first configured server.
 */
export const serverConfigId = z.number().int().positive();
export const virtualServerId = z.number().int().positive();

/** Read by the executor to collapse a retried mutation into one side effect. */
export const idempotencyKey = z.string().max(128).optional();

export const serverScope = { serverConfigId };
export const virtualServerScope = { serverConfigId, virtualServerId };
export const mutationScope = { ...virtualServerScope, idempotencyKey };

export const positiveId = z.number().int().positive();
