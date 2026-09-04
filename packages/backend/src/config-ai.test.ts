import { describe, expect, it } from 'vitest';
import { loadAiConfig } from './config.js';

const BASE_ENV = {
  JWT_SECRET: 'j'.repeat(32),
  ENCRYPTION_KEY: 'e'.repeat(32),
};

describe('loadAiConfig', () => {
  it('leaves AI disabled and secrets optional when the flag is unset', () => {
    const config = loadAiConfig(BASE_ENV);

    expect(config).toMatchObject({
      enabled: false,
      gatewayToken: undefined,
      identityJwtSecret: undefined,
      destructiveToolsEnabled: false,
    });
  });

  it('leaves AI disabled when the flag is false', () => {
    expect(loadAiConfig({ ...BASE_ENV, AI_AGENT_ENABLED: 'false' }).enabled).toBe(false);
  });

  it('rejects an enabled gateway token shorter than 32 characters', () => {
    expect(() => loadAiConfig({
      ...BASE_ENV,
      AI_AGENT_ENABLED: 'true',
      AI_GATEWAY_TOKEN: 'short-token',
      AI_IDENTITY_JWT_SECRET: 'i'.repeat(32),
    })).toThrow('AI_GATEWAY_TOKEN');
  });

  it('rejects AI secrets reused from application secrets or each other', () => {
    expect(() => loadAiConfig({
      ...BASE_ENV,
      AI_AGENT_ENABLED: 'true',
      AI_GATEWAY_TOKEN: BASE_ENV.JWT_SECRET,
      AI_IDENTITY_JWT_SECRET: 'i'.repeat(32),
    })).toThrow('must differ');

    expect(() => loadAiConfig({
      ...BASE_ENV,
      AI_AGENT_ENABLED: 'true',
      AI_GATEWAY_TOKEN: 'g'.repeat(32),
      AI_IDENTITY_JWT_SECRET: 'g'.repeat(32),
    })).toThrow('must differ');
  });

  it('parses trimmed allowlists and lowercases email addresses', () => {
    const config = loadAiConfig({
      ...BASE_ENV,
      AI_AGENT_ENABLED: 'true',
      AI_GATEWAY_TOKEN: 'g'.repeat(32),
      AI_IDENTITY_JWT_SECRET: 'i'.repeat(32),
      AI_ALLOWED_OPENWEBUI_USER_IDS: ' first, second , , third ',
      AI_ALLOWED_OPENWEBUI_EMAILS: ' Admin@Example.com, USER@example.com ',
    });

    expect(config.allowedUserIds).toEqual(['first', 'second', 'third']);
    expect(config.allowedEmails).toEqual(['admin@example.com', 'user@example.com']);
  });

  it('reads the destructive flag and optional assistant URL', () => {
    const config = loadAiConfig({
      ...BASE_ENV,
      AI_DESTRUCTIVE_TOOLS_ENABLED: 'true',
      AI_ASSISTANT_PUBLIC_URL: 'https://ai.example.com',
    });

    expect(config.destructiveToolsEnabled).toBe(true);
    expect(config.assistantPublicUrl).toBe('https://ai.example.com');
  });
});
