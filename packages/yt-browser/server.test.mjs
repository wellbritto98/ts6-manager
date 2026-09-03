import assert from 'node:assert/strict';
import { createApp } from './server.mjs';
import { test } from 'node:test';

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

test('missing or wrong bearer on /cookies returns 401', async () => {
  const app = createApp({
    token: 'secret-token',
    isHealthy: async () => true,
    getCookies: async () => [{ name: 'SID', value: 'x', domain: '.youtube.com' }],
  });
  const { server, port } = await listen(app);
  try {
    const missing = await fetch(`http://127.0.0.1:${port}/cookies`);
    assert.equal(missing.status, 401);
    const wrong = await fetch(`http://127.0.0.1:${port}/cookies`, {
      headers: { Authorization: 'Bearer other' },
    });
    assert.equal(wrong.status, 401);
  } finally {
    server.close();
  }
});

test('/health returns 200 when the debug port flag is mocked healthy', async () => {
  const app = createApp({
    token: 'secret-token',
    isHealthy: async () => true,
    getCookies: async () => [],
  });
  const { server, port } = await listen(app);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
  } finally {
    server.close();
  }
});

test('/cookies JSON uses the cookies array field', async () => {
  const cookies = [{ name: 'SID', value: 'x', domain: '.youtube.com', path: '/' }];
  const app = createApp({
    token: 'secret-token',
    isHealthy: async () => true,
    getCookies: async () => cookies,
  });
  const { server, port } = await listen(app);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/cookies`, {
      headers: { Authorization: 'Bearer secret-token' },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.cookies));
    assert.deepEqual(body.cookies, cookies);
  } finally {
    server.close();
  }
});
