import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

/**
 * Required secret. Fails closed rather than falling back to a published
 * default: JWT_SECRET signs every session, and ENCRYPTION_KEY protects the
 * stored ServerQuery keys, SSH passwords and TOTP secrets. A default that only
 * aborts when NODE_ENV is exactly "production" still ships a known signing key
 * to any deployment that runs the backend directly, under pm2 or under systemd.
 */
function requireSecret(name: 'JWT_SECRET' | 'ENCRYPTION_KEY'): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    console.error(`[FATAL] ${name} is not set. Generate one with: openssl rand -hex 32`);
    process.exit(1);
  }
  if (value.length < 32) {
    console.error(`[FATAL] ${name} is too short (${value.length} chars). Use at least 32; generate one with: openssl rand -hex 32`);
    process.exit(1);
  }
  return value;
}

export interface AiConfig {
  enabled: boolean;
  gatewayToken: string | undefined;
  identityJwtSecret: string | undefined;
  destructiveToolsEnabled: boolean;
  allowedUserIds: string[];
  allowedEmails: string[];
  assistantPublicUrl: string | undefined;
}

type AiEnvironment = Partial<Pick<
  NodeJS.ProcessEnv,
  | 'AI_AGENT_ENABLED'
  | 'AI_GATEWAY_TOKEN'
  | 'AI_IDENTITY_JWT_SECRET'
  | 'AI_DESTRUCTIVE_TOOLS_ENABLED'
  | 'AI_ALLOWED_OPENWEBUI_USER_IDS'
  | 'AI_ALLOWED_OPENWEBUI_EMAILS'
  | 'AI_ASSISTANT_PUBLIC_URL'
  | 'JWT_SECRET'
  | 'ENCRYPTION_KEY'
>>;

function parseAllowlist(value: string | undefined, lowercase = false): string[] {
  if (!value) return [];

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => lowercase ? entry.toLowerCase() : entry);
}

function requireAiSecret(name: 'AI_GATEWAY_TOKEN' | 'AI_IDENTITY_JWT_SECRET', env: AiEnvironment): string {
  const value = env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} is not set`);
  }
  if (value.length < 32) {
    throw new Error(`${name} must be at least 32 characters`);
  }
  if (value === env.JWT_SECRET || value === env.ENCRYPTION_KEY) {
    throw new Error(`${name} must differ from JWT_SECRET and ENCRYPTION_KEY`);
  }
  return value;
}

export function loadAiConfig(env: AiEnvironment): AiConfig {
  const enabled = env.AI_AGENT_ENABLED === 'true';
  if (!enabled) {
    return {
      enabled,
      gatewayToken: undefined,
      identityJwtSecret: undefined,
      destructiveToolsEnabled: env.AI_DESTRUCTIVE_TOOLS_ENABLED === 'true',
      allowedUserIds: parseAllowlist(env.AI_ALLOWED_OPENWEBUI_USER_IDS),
      allowedEmails: parseAllowlist(env.AI_ALLOWED_OPENWEBUI_EMAILS, true),
      assistantPublicUrl: env.AI_ASSISTANT_PUBLIC_URL,
    };
  }

  const gatewayToken = requireAiSecret('AI_GATEWAY_TOKEN', env);
  const identityJwtSecret = requireAiSecret('AI_IDENTITY_JWT_SECRET', env);
  if (gatewayToken === identityJwtSecret) {
    throw new Error('AI_GATEWAY_TOKEN and AI_IDENTITY_JWT_SECRET must differ');
  }

  return {
    enabled,
    gatewayToken,
    identityJwtSecret,
    destructiveToolsEnabled: env.AI_DESTRUCTIVE_TOOLS_ENABLED === 'true',
    allowedUserIds: parseAllowlist(env.AI_ALLOWED_OPENWEBUI_USER_IDS),
    allowedEmails: parseAllowlist(env.AI_ALLOWED_OPENWEBUI_EMAILS, true),
    assistantPublicUrl: env.AI_ASSISTANT_PUBLIC_URL,
  };
}

function loadRequiredAiConfig(env: AiEnvironment): AiConfig {
  try {
    return loadAiConfig(env);
  } catch (error) {
    console.error(`[FATAL] ${(error as Error).message}`);
    process.exit(1);
  }
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'file:./data/ts6webui.db',
  jwtSecret: requireSecret('JWT_SECRET'),
  encryptionKey: requireSecret('ENCRYPTION_KEY'),
  jwtAccessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
  jwtRefreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  tsAllowSelfSigned: process.env.TS_ALLOW_SELF_SIGNED === 'true' || process.env.TS_ALLOW_SELF_SIGNED === '1',
  ai: loadRequiredAiConfig(process.env),
};
