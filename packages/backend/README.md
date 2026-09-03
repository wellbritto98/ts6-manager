# @ts6/backend — API Express e orquestrador do TS6 Manager

## Objetivo do módulo

Processo central do sistema: expõe a API REST + WebSocket para o frontend, mantém as conexões com os servidores TeamSpeak (WebQuery HTTP e SSH), persiste tudo no SQLite e hospeda os serviços de domínio (voz/música, Discord, bot flows, widgets, journal).

## Responsabilidade principal

Ser o **único ponto de contato com o TeamSpeak** e o **orquestrador dos serviços de longa vida** registrados em `app.locals`. O frontend nunca toca o TS diretamente nem vê credenciais.

## Funcionalidades existentes

- **Bootstrap** (`src/index.ts`): handlers globais de exceção (não derrubam o processo), checagem `ENCRYPTION_KEY ≠ JWT_SECRET`, cookie file do yt-dlp, Prisma + app Express, trust proxy configurável via banco, WS `/ws` (JWT), `ConnectionPool.initialize`, SAML runtime, BotEngine, VoiceBotManager, MusicCommandHandler, DiscordBridge e ConnectionJournal (não bloqueantes), listen `:3001`, shutdown gracioso na ordem inversa.
- **HTTP** (`src/app.ts`): helmet → cors (origem `FRONTEND_URL` exata) → json (10mb)/urlencoded → cookieParser → `/api/health` → rate limiters (auth 15/15min, global 300/min, widget 60/min) → ~30 arquivos de rotas → error handler. `server.requestTimeout = 0` (imports longos de playlist).
- **Banco** (`prisma/`): ~25 modelos SQLite (usuários, refresh tokens com rotação, trusted devices, acesso por servidor, conexões TS, fluxos/execuções/variáveis de bot, bots de música, músicas/playlists/playlistsongs, rádios, widgets, pedidos, settings de Discord/Spotify/música, bans web, journal, SAML). Segredos cifrados em AES-256-GCM (`utils/crypto.ts`). Seed apenas com defaults de AppSettings.
- **Domínios** (detalhados nos READMEs das subpastas): `auth/`, `middleware/`, `routes/`, `ts-client/`, `utils/`, `ws/`, `voice/`, `discord/`, `bot-engine/`, `widget/`.

## Dependências

- **Internas**: `@ts6/common` (tipos/constantes compartilhados); `../generated/prisma` (client gerado — rodar `pnpm db:generate` após mudar o schema).
- **Externas (principais)**: express 4, prisma 6, jsonwebtoken, bcryptjs, otplib, @node-saml/node-saml, axios, ws, ssh2, discord.js + @discordjs/voice (+ opus nativo opcional), libsodium-wrappers-sumo, geoip-lite, node-cron, @resvg/resvg-js, express-rate-limit, helmet, multer, nanoid.
- **Binários de runtime**: `yt-dlp` e `ffmpeg` (música); binário `sidecar` Go (vídeo — container via `SIDECAR_URL` ou spawn local).

## Módulos relacionados

Todos os demais pacotes e subpastas deste pacote; `packages/sidecar` (streaming); `packages/frontend` (consumidor HTTP/WS).

## Pontos de entrada

- `src/index.ts` — processo (bootstrap/shutdown).
- `src/app.ts` — montagem do Express (`createApp`).
- `src/config.ts` — env com fail-closed (`JWT_SECRET`/`ENCRYPTION_KEY` obrigatórios, ≥32 chars).
- `app.locals.*` — registro de serviços consumido por todas as rotas.

## Fluxos importantes

Ver `docs/arquitetura-do-sistema.md` §6: ciclo de requisição, autenticação completa (senha→MFA→refresh→trusted→SAML), WS, música, vídeo, flows e widget.

## Arquivos críticos

`src/index.ts` (ordem de bootstrap — qualquer serviço novo entra aqui), `src/app.ts` (middleware e montagem de rotas), `prisma/schema.prisma` (modelo de dados; campos cifrados documentados), `src/utils/crypto.ts` (cifragem), `src/ts-client/connection-pool.ts` (ponto único de entrada no WebQuery).

## Observações técnicas e débitos

- **Schema sem histórico de migrações**: aplicado por `prisma db push` no start do container; `prisma/migrations/` está no `.gitignore`. Client gerado fora de `node_modules` (`generated/prisma`).
- **`MusicBot.serverPassword`/`channelPassword` em texto plano** — única exceção à política de cifragem (`identityData` é cifrado na criação pelo VoiceBotManager).
- **Dependências declaradas sem uso**: `zod`, `pino`, `pino-pretty`, `@snazzah/davey`; `@types/express@5` contra `express@4`.
- **`app.locals` não tipado** com `any` pervasivo — camada de serviços tipada é a refatoração de maior retorno.
- **Cópias que podem divergir**: `verifyClient` do WS reimplementa a checagem do `authMiddleware` (`src/index.ts:74-109`); ao alterar uma, altere a outra.
- **Premissas de instância única**: SSO code store, widget cache e dashboard cache em memória.
- **Efeitos colaterais no load de módulos**: `widget-public.routes.ts:17-22` (`setInterval` sem unref) e `music-library.routes.ts:16-18` (`mkdirSync`).
- **`config.jwtRefreshExpiry` é ignorado** — 7 dias hardcoded em `auth/session.ts`.
