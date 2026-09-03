# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

TS6 Manager — a web-based management interface for TeamSpeak servers (hardened fork of clusterzx/ts6-manager). Administer virtual servers, channels, clients, permissions and bans; run music bots (YouTube/Spotify/radio over a custom TS3 voice protocol); build node-based bot automations; bridge to Discord; embed server widgets. See `README.md` (product doc, English) and `docs/` (architecture docs, Portuguese).

## Commands

pnpm monorepo (workspace: `packages/*`). Requires Node 20+ and pnpm 9+.

```bash
pnpm dev              # backend (:3001, tsx watch) + frontend (:5173, Vite) in parallel
pnpm dev:backend      # backend only
pnpm dev:frontend     # frontend only
pnpm build            # all packages (common must build before backend/frontend)
pnpm lint             # eslint flat config at repo root
pnpm typecheck        # tsc --noEmit in all packages
pnpm test             # vitest (backend only — the frontend has no tests)
pnpm db:generate      # Prisma client → packages/backend/generated/prisma (custom output)
pnpm db:migrate       # prisma migrate dev
pnpm db:seed          # seeds AppSettings defaults
```

Run one test: `pnpm --filter @ts6/backend exec vitest run src/utils/crypto.test.ts` (any path under `packages/backend/src`).

**Prisma client**: generated to `packages/backend/generated/prisma` (NOT `node_modules`) and imported as `../generated/prisma/index.js`. Always run `pnpm db:generate` after changing `packages/backend/prisma/schema.prisma`. The schema is applied to the DB with `prisma db push` (Docker startup runs it); `prisma/migrations/` is gitignored and has no real history — do not rely on `prisma migrate` history.

**Music features at runtime require `yt-dlp` and `ffmpeg` on PATH** (installed in the Docker image; install locally for dev).

## Architecture (big picture)

Four packages, one backend process orchestrating everything:

- **`@ts6/common`** — shared types (teamspeak WebQuery responses, bot flows, music, auth), `WIDGET_THEMES`, event constants. Frontend tsconfig path-maps it to `../common/src` in dev; both depend on it via `workspace:*`.
- **`@ts6/backend`** — Express 4 API on `:3001`. Entry `src/index.ts`; `src/app.ts` builds the Express app (helmet → cors → json/urlencoded → cookieParser → health → rate limiters → routes → error handler). Bootstrap wires long-lived services onto `app.locals`: `prisma`, `connectionPool`, `wss`, `botEngine`, `voiceBotManager`, `musicCommandHandler`, `discordBridge`, `playlistImporter`, `connectionJournal`.
- **`@ts6/frontend`** — React 18 SPA (Vite 6). Dev server proxies `/api` and `/ws` to `:3001`. Production is served by nginx-unprivileged (Dockerfile.frontend) which proxies `/api` (600 s timeouts) and `/ws` to the backend.
- **`sidecar`** — Go 1.25 media relay (Pion WebRTC v4, stdlib HTTP) on `:9800`, bearer-token auth, ffmpeg → RTP → WebRTC for video streaming. Either spawned as a subprocess by the backend (local mode, random token per spawn) or run as a Docker container (`SIDECAR_URL` set, `SIDECAR_TOKEN` required).

**TeamSpeak access is exclusively via the WebQuery HTTP API** (axios client in `src/ts-client/`; telnet is not supported). SSH (ServerQuery over SSH, `src/bot-engine/ssh-query-client.ts`) is used only where WebQuery has no equivalent: file browsing, bot-flow event triggers, and the connection journal.

**Database**: Prisma + SQLite (`DATABASE_URL`, default `file:./data/ts6webui.db`), ~25 models. Sensitive fields are AES-256-GCM encrypted via `src/utils/crypto.ts` (`encrypt`/`decrypt`, format `enc:iv:tag:ciphertext`): `TsServerConfig.apiKey/sshPassword`, User MFA secrets/recovery codes, SAML certs, Discord bot token, Spotify client secret, `MusicBot.identityData`. `MusicBot.serverPassword`/`channelPassword` are stored plaintext (known debt).

**Auth**: local login + TOTP MFA + recovery codes + trusted-device cookie + optional SAML SSO. JWTs are HS256 and carry a `typ` claim with three classes: `access` | `mfa` | `pwchange`. `authMiddleware` rejects any token whose `typ !== 'access'` — when adding a new token class, update `authMiddleware` (src/middleware/auth.ts), the WS `verifyClient` (src/index.ts, which duplicates the check), and `TokenType` in `@ts6/common`.

**Request lifecycle** for a protected `:configId` route: `authMiddleware` (global, `/api`) → `requireIntParams('configId','sid')` → `requireServerAccess` (admins bypass; viewers need a `UserServerAccess` row) → `ensureConnection` (hydrates the WebQuery client from the pool) → `requireRole('admin')` → handler → `errorHandler` (`AppError` → status, `TSApiError` → 502).

**WebSocket**: `/ws`, JWT-authenticated via `?token=` query param in `verifyClient`. Broadcasts (`broadcastScoped(wss, serverConfigId, event)`) are scoped to a server; viewer grants are resolved once at connect. Producers: BotEngine, VoiceBotManager. The frontend currently has no WS client (the `/ws` Vite proxy is unused).

**Music/voice**: `voice/tslib/` is a hand-ported TS3 client protocol over UDP (ECDSA identity with security-level brute-force, RSA puzzle, AES-128-EAX, QuickLZ). Audio: yt-dlp download → ffmpeg decode to PCM → Opus encode (`@discordjs/opus` native, `opusscript` WASM fallback) → 20 ms frames over UDP. Text commands (`!play`, `!radio`, …) arrive on the bot's own TS connection — no SSH needed.

**Video streaming**: `VoiceBot` sends TS6 `setupstream` signaling, spawns/contacts the sidecar, relays SDP/ICE via the sidecar HTTP API. TS6 native `notifystream*` events carry viewer signaling.

**Bot flows**: the frontend editor saves its own format (`trigger_event`/`action_kick`/`config`); `normalizeFlowData` in `bot-engine/engine.ts` converts it to the engine format (`trigger`/`action`/… with `data.*Type`). When adding node types, edit BOTH: the frontend `BotEditor.tsx`/`data/bot-templates.ts` and the backend normalization + `flow-runner.ts` + the shared types in `@ts6/common/src/types/bot.ts`.

**i18n**: source of truth is `packages/frontend/scripts/i18n-fragments/*.json`; `scripts/merge-i18n.mjs` regenerates `src/i18n/locales/*.json` (5 languages: en/fr/de/es/it) and fails on key parity mismatch. Never edit the locale files directly.

## Conventions

- TypeScript strict everywhere; backend is ESM with explicit `.js` import extensions (`import { x } from './app.js'`); frontend uses extensionless imports and `@/` → `src/`.
- Backend logging is plain `console.*` (pino is declared but unused).
- Tests are co-located `*.test.ts` run by vitest; `src/test-setup.ts` injects throwaway `JWT_SECRET`/`ENCRYPTION_KEY` because `config.ts` fails closed without them.
- All user-supplied URLs must pass `validateUrl` (`src/utils/url-validator.ts`, SSRF guard incl. DNS re-check); callers must keep `maxRedirects: 0` on axios.
- No `any` in new code (`@typescript-eslint/no-explicit-any` is disabled only for ~80 legacy sites).

## Environment (`.env.example`)

- `JWT_SECRET` and `ENCRYPTION_KEY`: required in every environment, ≥32 chars, must differ (startup aborts otherwise; a fallback would ship a known signing key).
- `FRONTEND_URL`: the exact CORS origin the browser uses (scheme+host+port).
- `SIDECAR_TOKEN`: required when the sidecar is a separate container; unset in local-spawn mode.
- Frontend dev env: `VITE_API_URL` (default `http://localhost:3001`), `VITE_WS_URL`.

## Docker

- `docker compose up -d --build` builds all three images from source (`docker-compose.hub.yml` uses upstream Hub images; `docker-compose.coolify.yml` has no sidecar service). Four compose variants drift — new backend env vars must be added to all of them (and `.env.example`).
- Backend container CMD: yt-dlp self-update → `prisma db push --skip-generate` → `prisma db seed` → `node dist/index.js`.

## Known debt / traps

- No frontend tests; backend tests cover pure helpers and edge-case regressions, not route flows, the voice bot, the bridge, or the engine.
- Hand-rolled flow-editor canvas in `BotEditor.tsx` (~1570 lines) — `@xyflow/react` is declared but unused; do not assume React Flow.
- Monolith components: `Settings.tsx` (~1650), `MusicBots.tsx` (~1770), `BotEditor.tsx`, plus backend `voice-bot.ts` (~1190), `discord-bridge.ts` (~975).
- Dead dependencies: backend `zod`, `pino`, `pino-pretty`, `@snazzah/davey`; frontend `react-hook-form`, `@hookform/resolvers`, several `@radix-ui/*` packages.
- `config.jwtRefreshExpiry` is ignored — refresh expiry is hardcoded to 7 days in `auth/session.ts`.
- Three independent `EventBridge` (SSH) instances can run per server pair (engine, discord bridge, connection journal).
- In-memory state assumes a single backend instance: SAML SSO code store, widget cache, dashboard cache.
- `@types/express@5` against `express@4` in the backend devDependencies.
