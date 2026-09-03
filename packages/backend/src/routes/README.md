# routes — Contratos HTTP da API

## Objetivo do módulo

Superfície REST do sistema: ~30 arquivos de rotas, um por domínio, montados em `app.ts` e consumidos pelo frontend via `/api`.

## Responsabilidade principal

Traduzir HTTP em chamadas de serviço: validar entrada, aplicar autorização fina e delegar para `app.locals.*` (prisma, connectionPool, serviços de domínio). Não implementar lógica de negócio pesada.

## Funcionalidades existentes (por arquivo)

| Arquivo | Base path | Resumo |
|---|---|---|
| `setup.routes.ts` | `/api/setup` | Wizard inicial (status + criação do 1º admin), sem auth |
| `auth.routes.ts` | `/api/auth` | Login, MFA, troca de senha, refresh/logout, trusted devices, enrollment de MFA |
| `saml-auth.routes.ts` | `/api/auth/saml` | Endpoints SP públicos: status, metadata, login, ACS, exchange |
| `saml.routes.ts` | `/api/saml` | Admin: settings SAML (sanitização + cifragem + hot-reload) |
| `servers.routes.ts` | `/api/servers` | Conexões TS: CRUD (cifra apiKey/sshPassword, sincroniza pool), teste de conexão |
| `virtual-servers.routes.ts` | `.../virtual-servers` | Lista/info; edição admin com **whitelist de parâmetros**; create/start/stop/delete; snapshots |
| `channels.routes.ts` | `.../channels` | Árvore de canais; CRUD/move admin |
| `clients.routes.ts` | `.../clients` | Lista (`-ip` só admin), dbinfo admin, kick/ban/move/poke/message admin |
| `server-groups.routes.ts` / `channel-groups.routes.ts` | `.../server-groups` / `.../channel-groups` | CRUD de grupos, membros, permissões (escrita admin) |
| `permissions.routes.ts` | `.../permissions` | Leitura: permissionlist/permfind/permoverview |
| `bans.routes.ts` | `.../bans` | Admin-only (IPs): lista/add/remove |
| `tokens.routes.ts` | `.../tokens` | Admin-only (tokens completos): lista/add/remove |
| `files.routes.ts` | `.../files` | Navegador de arquivos via **SSH EventBridge** (WebQuery não tem ft*) |
| `complaints.routes.ts` / `messages.routes.ts` | `.../complaints` / `.../messages` | Reclamações e mensagens offline |
| `logs.routes.ts` | `.../logs` | Admin-only (logview tem IPs) |
| `instance.routes.ts` | `.../instance` | instanceinfo/hostinfo/version; edição admin com whitelist |
| `dashboard.routes.ts` | `.../dashboard` | 4 chamadas WebQuery em paralelo com **cache compartilhado de 5 s** |
| `bots.routes.ts` | `/api/bots` | Admin: CRUD de fluxos, enable/disable, execuções/logs; webhook público em `/api/bots/webhook/:path(*)` |
| `users.routes.ts` | `/api/users` | Admin: usuários do app, política de senha, proteções de último admin/auto-demotion |
| `music-bots.routes.ts` | `/api/music-bots` | Admin: superfície completa do VoiceBotManager (CRUD, play/queue/volume, vídeo, WebRTC preview, player-widget token) |
| `music-library.routes.ts` | `.../music-library` | Admin: upload (multer 100MB, ffprobe), busca/download YouTube, importação de playlist (job + polling) |
| `playlists.routes.ts` | `/api/playlists` | Admin: CRUD de playlists, reorder transacional |
| `radio-stations.routes.ts` | `.../radio-stations` | Admin: CRUD com URL validada por SSRF (`validateUrl`) |
| `music-requests.routes.ts` | `.../music-requests` | GET histórico de pedidos (montado com serverAccess) |
| `widget-public.routes.ts` | `/api/widget` (público) | Widget por token (JSON/SVG/PNG, cache 45 s, CORS *), player-widget por token HMAC |
| `widget.routes.ts` | `/api/widgets` | Admin: CRUD de widgets, regenerar token, invalidação de cache |
| `settings.routes.ts` | `/api/settings` | Admin: cookie yt-dlp (upload/delete), trust proxy hops, limites (`max_playlist_import` 0–1000) |
| `discord.routes.ts` | `/api/discord` | Admin: settings da ponte (token cifrado, hot-reload) + pickers guild/channels/roles/ts-channels |
| `spotify.routes.ts` | `/api/spotify` | Admin: settings (clientSecret cifrado) |
| `music-command-settings.routes.ts` | `/api/music-command-settings` | Admin: SGIDs para comandos de música + notifyNowPlaying |
| `journal.routes.ts` | `/api/journal` | Admin: retenção, log paginado, ban de IP (web+TS), web-bans |
| `journal-query.ts` | (helper) | Builder puro de consulta do journal (sort whitelisted) |

## Dependências

- **Internas**: middleware (rbac/error-handler em toda parte), `utils/*` (crypto, mfa, web-ban, geo, url-validator, validate-password, app-settings, trusted-device*, server-group-filter), `auth/session`, `auth/saml/*`, `ts-client` (pool/WebQueryClient), `@ts6/common` (tipos + `parseQueryResponse`/`tsEscape`), serviços via `app.locals` (voiceBotManager, botEngine, discordBridge, playlistImporter, connectionJournal).
- **Externas**: multer, @resvg/resvg-js (PNG do widget), express-rate-limit.

## Módulos relacionados

`middleware/` (cadeia), `voice/` (music-*, playlists, radio), `bot-engine/` (bots), `discord/`, `widget/`, `connection-journal.ts`, `frontend/src/api/*` (consumidor 1:1).

## Pontos de entrada

Montagem em `app.ts:99-147` (ordem importa: `/api/auth`, `/api/setup`, webhook público e `/api/widget` antes do auth global; cadeia por servidor em `app.ts:119`; admin por router em `app.ts:147`).

## Fluxos importantes

Ver `docs/arquitetura-do-sistema.md` §6 (requisição, auth, música, vídeo, widget). Fluxo de import de playlist: POST → 202 + job `PlaylistImporter` → polling de status → tracks emitidos progressivamente (ver `voice/README.md`).

## Arquivos críticos

`servers.routes.ts` (única porta de edição de conexões — mantém o pool sincronizado), `widget-public.routes.ts` (única superfície pública autenticada por token), `settings.routes.ts` (aplica trust proxy em runtime), `journal-query.ts` (whitelist de ordenação).

## Observações técnicas e débitos

- **Acoplamentos entre rotas**: `widget-public.routes.ts` exporta `playerWidgetToken`/`widgetDataCache` consumidos por `widget.routes.ts` e `music-bots.routes.ts`; `settings.routes.ts` importa `voice/audio/youtube` (rota alcançando camada de voz).
- **Efeitos colaterais no import**: `widget-public.routes.ts:17-22` (setInterval de 60 s sem unref) e `music-library.routes.ts:16-18` (mkdirSync).
- **`permissions.routes.ts` expõe listas de permissões a viewers** sem checagem de admin — inconsistente com rotas irmãs.
- **`music-requests.routes.ts`**: GET-only, formatação inconsistente (indentação 4 espaços) — parece resquício de feature parcial.
- Cache do dashboard e de widgets são em memória (instância única).
- Testes existentes: `journal-query.test.ts`, `saml-settings.test.ts`, `auth-login-guard.test.ts`; demais rotas sem cobertura.
