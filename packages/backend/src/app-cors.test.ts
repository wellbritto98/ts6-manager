import './test-setup.js';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

describe('CORS origin allowlist', () => {
  const originalFrontendUrl = process.env.FRONTEND_URL;
  const originalAssistantUrl = process.env.AI_ASSISTANT_PUBLIC_URL;

  beforeAll(() => {
    process.env.FRONTEND_URL = 'http://spa.example:3000';
    process.env.AI_ASSISTANT_PUBLIC_URL = 'http://ai.example:3002';
  });

  afterAll(() => {
    process.env.FRONTEND_URL = originalFrontendUrl;
    process.env.AI_ASSISTANT_PUBLIC_URL = originalAssistantUrl;
  });

  it('reflects the SPA origin', async () => {
    const { createApp } = await import('./app.js');
    const app = createApp();
    const res = await request(app).get('/api/health').set('Origin', 'http://spa.example:3000');
    expect(res.headers['access-control-allow-origin']).toBe('http://spa.example:3000');
  });

  it('reflects the AI assistant public origin (Open WebUI verifies tool servers client-side)', async () => {
    const { createApp } = await import('./app.js');
    const app = createApp();
    const res = await request(app).get('/api/health').set('Origin', 'http://ai.example:3002');
    expect(res.headers['access-control-allow-origin']).toBe('http://ai.example:3002');
  });

  it('omits the header for an unrecognized origin', async () => {
    const { createApp } = await import('./app.js');
    const app = createApp();
    const res = await request(app).get('/api/health').set('Origin', 'http://stranger.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
