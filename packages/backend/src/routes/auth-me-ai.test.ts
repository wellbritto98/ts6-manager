import { describe, expect, it, vi } from 'vitest';

// config.ts reads AI_ASSISTANT_PUBLIC_URL once at import time, so the value has
// to exist before auth.routes.js pulls it in.
const { ASSISTANT_URL } = vi.hoisted(() => {
  const url = 'https://ai.example.com';
  process.env.AI_ASSISTANT_PUBLIC_URL = url;
  return { ASSISTANT_URL: url };
});

import express, { type Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { assistantUrlForRole, authRoutes } from './auth.routes.js';

function appForRole(role: string): Express {
  const app = express();
  app.locals.prisma = {
    user: {
      // authMiddleware asks for `select`, /me asks for the full row.
      findUnique: async ({ select }: { select?: unknown }) =>
        select
          ? { enabled: true, role }
          : {
              id: 1,
              username: 'someone',
              displayName: 'Someone',
              role,
              mfaEnabled: false,
              mfaRequired: false,
              language: 'en',
            },
    },
  };
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  return app;
}

function accessToken(role: string): string {
  return jwt.sign(
    { typ: 'access', id: 1, username: 'someone', role },
    process.env.JWT_SECRET as string,
    { algorithm: 'HS256', expiresIn: '5m' },
  );
}

function getMe(role: string) {
  return request(appForRole(role)).get('/api/auth/me').set('Authorization', `Bearer ${accessToken(role)}`);
}

describe('assistantUrlForRole', () => {
  it('returns the configured URL for an admin', () => {
    expect(assistantUrlForRole('admin', ASSISTANT_URL)).toBe(ASSISTANT_URL);
  });

  it('returns null for a viewer even when the URL is configured', () => {
    expect(assistantUrlForRole('viewer', ASSISTANT_URL)).toBeNull();
  });

  it('returns null for an admin when no URL is configured', () => {
    expect(assistantUrlForRole('admin', undefined)).toBeNull();
    expect(assistantUrlForRole('admin', '')).toBeNull();
  });
});

describe('GET /api/auth/me', () => {
  it('exposes aiAssistantUrl at the JSON root for an admin', async () => {
    const response = await getMe('admin');

    expect(response.status).toBe(200);
    expect(response.body.aiAssistantUrl).toBe(ASSISTANT_URL);
    expect(response.body.user.aiAssistantUrl).toBeUndefined();
  });

  it('does not expose the URL to a viewer', async () => {
    const response = await getMe('viewer');

    expect(response.status).toBe(200);
    expect(response.body.aiAssistantUrl).toBeNull();
    expect(JSON.stringify(response.body)).not.toContain(ASSISTANT_URL);
  });
});
