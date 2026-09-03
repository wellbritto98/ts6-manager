# Arquitetura do Sistema — TS6 Manager

> Documento-base para desenvolvimento futuro (Spec Driven Development).
> Toda afirmação deriva do código real; inferências estão marcadas como **Hipótese**.
> Documentos complementares: [`objetivo-do-sistema.md`](objetivo-do-sistema.md) (visão de produto) e os `README.md` de cada módulo (`packages/*/README.md` e subpastas de `packages/backend/src`), que detalham o nível local. Mantenha os dois níveis sincronizados: mudanças de responsabilidade ou dependência entre módulos devem ser refletidas aqui e no README do módulo.

---

## 1. Visão arquitetural

O TS6 Manager é um **monorepo pnpm** (`pnpm-workspace.yaml`) com quatro pacotes e **um único processo de backend orquestrando tudo**:

```
┌────────────────┐      ┌─────────────────────┐      ┌──────────────────┐
│  Frontend SPA  │─────▶│  Backend (Express)  │─────▶│  TS Server       │
│  React + Vite  │      │  Node :3001         │      │  WebQuery HTTP   │
│  nginx :8080   │      │  ┌───────────────┐  │      │  SSH (eventos/   │
│  (prod)        │      │  │ Serviços em   │  │      │  arquivos)       │
│                │      │  │ app.locals    │  │      └──────────────────┘
│                │      │  └───────────────┘  │
└────────────────┘      └───────┬──────┬──────┘
                                │      │
                        ┌───────┴──┐ ┌─┴──────────┐
                        │ SQLite   │ │ Sidecar Go │
                        │ (Prisma) │ │ Pion/WebRTC│
                        │          │ │ :9800      │
                        └──────────┘ └────────────┘

Público:  /api/widget/:token ─▶ JSON/SVG/PNG (sem autenticação)
```

| Pacote | Papel |
|---|---|
| `@ts6/common` | Tipos, constantes e utilitários compartilhados (contratos de API, fluxos de bot, música, temas de widget) |
| `@ts6/backend` | API Express, cliente WebQuery, bot engine (fluxos), bots de música (protocolo de voz TS3 próprio), ponte Discord, widgets, journal |
| `@ts6/frontend` | SPA React 18 + Vite (Tailwind, shadcn/ui, TanStack Query, Zustand) |
| `sidecar` | Relay de mídia Go (Pion WebRTC v4) para streaming de vídeo: ffmpeg → RTP → WebRTC |

Princípios estruturais que emergem do código:

- **O backend é o único ponto de contato com o TeamSpeak.** Todo acesso é via **WebQuery HTTP** (`src/ts-client/`); telnet não é suportado. SSH (ServerQuery sobre SSH) é usado apenas onde o WebQuery não tem equivalente: navegação de arquivos (`routes/files.routes.ts`), gatilhos de eventos dos fluxos (`bot-engine/event-bridge.ts`) e o journal de conexões (`connection-journal.ts`).
- **O frontend nunca vê credenciais do TS.** Chaves de API, senhas SSH e demais segredos ficam cifrados no SQLite do backend (ver §7).
- **Serviços de longa vida são registrados em `app.locals`** (`src/index.ts:129-131`): `prisma`, `connectionPool`, `wss`, `botEngine`, `voiceBotManager`, `musicCommandHandler`, `discordBridge`, `playlistImporter`, `connectionJournal`. Não há container de injeção de dependência; as rotas acessam `req.app.locals.*` (não tipado).
- **Dois transportes para o TeamSpeak coexistem de propósito**: WebQuery HTTP (chamadas de comando, com keep-alive e circuit breaker) e SSH (fluxo de eventos `notify*`, inviável via WebQuery).
- **Módulos de domínio (voz, Discord, fluxos) são criados e conectados no bootstrap** (`src/index.ts`) e expostos às rotas via `app.locals`; a comunicação entre eles é por injeção de referências (ex.: `botEngine.setVoiceBotManager(...)` em `index.ts:150`) e por eventos (`VoiceBot` é um `EventEmitter`).

## 2. Padrões utilizados

- **Monorepo com workspace pnpm** (`packages/*`), dependências internas via `workspace:*` (`@ts6/common`). Ordem de build: `common` antes de `backend`/`frontend` (scripts raiz rodam todos os pacotes).
- **API em camadas no Express**: `app.ts` monta rotas; cada domínio tem um arquivo em `routes/`; a cadeia de middleware é global e uniforme (ver §6).
- **REST + WebSocket de eventos**: mutações e consultas por REST; estado em tempo real (música, fluxos) via WS em `/ws`, com broadcast escopado por servidor (`ws/ws-broadcast.ts`, `broadcastScoped`).
- **Contrato compartilhado via `@ts6/common`**: tipos de requisição/resposta e eventos são definidos uma vez e usados nos dois lados (widget e música são os domínios consumidos ponta a ponta).
- **Padrão `Service + Manager`**: `VoiceBotManager`/`ConnectionPool`/`PlaylistImporter` gerenciam ciclo de vida; `VoiceBot`/`WebQueryClient`/`Ts3Client` são as unidades operacionais.
- **Auto-recuperação como padrão transversal**: retry de socket obsoleto + circuit breaker no WebQuery (`ts-client/webquery-client.ts:67-80`), reconexão com backoff exponencial no SSH (`ssh-query-client.ts:470-492`) e nos bots de voz (`voice-bot-manager.ts:331-357`), pool que se hidrata sozinho (`connection-pool.ts:63-77`), refresh de token single-flight no frontend (`api/token-refresh.ts`).
- **Fail-closed em segurança**: segredos obrigatórios sem default (`config.ts:15-26`), whitelists de comandos/parâmetros (`command-whitelist.ts`, `virtual-servers.routes.ts:28-42`), verificação de classe de token JWT (`middleware/auth.ts:28-31`), comparações `timingSafeEqual` para segredos.
- **Expressões seguras**: avaliador próprio (substituto do `expr-eval`) sem `eval`, com blacklist de segmentos e lookup restrito a propriedades próprias (`bot-engine/safe-expr.ts`).
- **Frontend**: páginas preguiçosas (`lazy`) + suspense, dados via hooks TanStack Query (um `use-*.ts` por domínio), estado global mínimo em stores Zustand persistidas (`auth`, `server`, `ui`), formulários manuais com `useState` (react-hook-form/zod declarados, mas sem uso).

## 3. Regras arquiteturais

Regras derivadas do código existente — devem ser preservadas em novas implementações:

1. **Nenhum código fala com o TS fora do `ts-client`.** Rotas e domínios usam `ConnectionPool`/`WebQueryClient` (ou `EventBridge` para eventos). Não crie novos clientes HTTP/SSH ad hoc.
2. **Credenciais persistidas são sempre cifradas** (AES-256-GCM via `utils/crypto.ts`). Exceção existente (débito): `MusicBot.serverPassword`/`channelPassword` em texto plano.
3. **Rotas sensíveis exigem `requireRole('admin')`**; dados sensíveis (IPs, tokens completos, logs) são admin-only. Rotas que expõem dados a viewers usam a cadeia `serverAccess` (permissão por servidor). Justificativas documentadas no próprio código (ex.: `bans.routes.ts:15`).
4. **Toda URL fornecida por usuário passa por `validateUrl`** (`utils/url-validator.ts`) e os chamadores mantêm `maxRedirects: 0` (anti-SSRF, anti-DNS-rebinding).
5. **Tokens JWT carregam `typ`** (`access` | `mfa` | `pwchange`) e todo verificador deve conferir a classe. Novas classes exigem atualizar `authMiddleware`, o `verifyClient` do WS (`src/index.ts`) e `TokenType` em `@ts6/common`.
6. **O formato de fluxo do editor (frontend) ≠ formato do motor (backend).** A conversão é centralizada em `normalizeFlowData` (`bot-engine/engine.ts:43-217`). Nunca grave o formato do editor direto no motor.
7. **Arquivos i18n são gerados** a partir de `scripts/i18n-fragments/*.json`; nunca edite `src/i18n/locales/*.json` diretamente.
8. **Broadcasts WS são escopados por `serverConfigId`** e o fail-closed envia eventos sem escopo apenas para admins (`ws-broadcast.ts:33-51`).
9. **Serviços de longa vida são registrados em `app.locals` e encerrados no shutdown gracioso** (`index.ts:183-197`). Novos serviços devem seguir o mesmo ciclo (init + stop).
10. **O banco é aplicado via `prisma db push`** na inicialização do container; `prisma/migrations/` está no `.gitignore` — mudanças de schema devem ser testadas contra `db push` e `prisma generate`.

## 4. Convenções técnicas

- **TypeScript estrito** (`tsconfig.base.json`): ES2022, ESM, `moduleResolution: bundler`, `declaration`, `sourceMap`.
- **Backend ESM com extensão `.js` nos imports** (`import { createApp } from './app.js'`); frontend sem extensão, alias `@/` → `src/`.
- **Prisma client gerado em `packages/backend/generated/prisma`** (output customizado fora de `node_modules`), importado como `../generated/prisma/index.js`.
- **Logs**: `console.*` no backend (pino declarado, sem uso). Frontend usa sonner para toasts.
- **Testes**: vitest, co-localizados (`*.test.ts`), cobrem helpers puros e regressões de borda; `src/test-setup.ts` injeta segredos porque `config.ts` falha fechado.
- **Ambiente**: `JWT_SECRET` e `ENCRYPTION_KEY` obrigatórios em todo ambiente, ≥32 caracteres e distintos (aborta a inicialização); `FRONTEND_URL` é a origem CORS exata; `SIDECAR_TOKEN` obrigatório quando o sidecar roda como container.
- **Comandos**: ver `CLAUDE.md` (raiz) — `pnpm dev`, `build`, `lint`, `typecheck`, `test`, `db:generate/migrate/seed`.
- **Dependências de binários**: `yt-dlp` e `ffmpeg` são exigidos em runtime para música (presentes na imagem Docker).

## 5. Separação de responsabilidades

| Camada/Módulo | Responsabilidade | Não deve fazer |
|---|---|---|
| `frontend/src/pages` + `hooks` | UI, cache de leitura (TanStack Query), formulários | Acessar WebQuery/TS diretamente; conhecer segredos |
| `frontend/src/api` | Cliente HTTP (`/api`), refresh de token | Regras de negócio |
| `backend/src/routes` | Contratos HTTP, validação de entrada, autorização fina | Implementar lógica de domínio pesada (delega a serviços) |
| `backend/src/middleware` | Auth, RBAC, acesso por servidor, conexão, erros | Lógica de negócio |
| `backend/src/ts-client` | Transporte WebQuery (keep-alive, retry, pool) | Interpretar regras de negócio |
| `backend/src/voice` | Bots de música: protocolo de voz, áudio, fila, comandos, streaming de vídeo | Persistência de usuários/configs (usa Prisma direto) |
| `backend/src/discord` | Ponte Discord: slash commands, notificações, relay de voz | Ser o único dono de eventos TS (tem EventBridge próprio, débito) |
| `backend/src/bot-engine` | Execução de fluxos, gatilhos, variáveis, expressões | Conhecer a UI do editor (recebe formato normalizado) |
| `backend/src/widget` + `routes/widget*.ts` | Renderização de widgets públicos (SVG/PNG/JSON) | Autenticação (acesso por token) |
| `backend/src/ws` | Broadcast de eventos escopado | Regras de negócio (só distribui) |
| `@ts6/common` | Tipos/constantes compartilhados | Qualquer execução |
| `sidecar` | Media relay ffmpeg→RTP→WebRTC | Política/autenticação além do bearer token |

**Violações identificadas** (débitos de camada, detalhados no §8): `settings.routes.ts` importa `voice/audio/youtube` (rota alcançando camada de voz); `widget-public.routes.ts` exporta utilitários consumidos por outras rotas; `TSApiError` (middleware) é importado por `ts-client` (inversão); `discord-bridge` importa internals de `bot-engine`; `flow-runner` alcança `VoiceBotManager` por injeção via setter.

## 6. Fluxo de comunicação entre módulos

### 6.1 Requisição HTTP protegida (rota `:configId`)

```
nginx (:8080, prod) ──▶ Express
  1. authMiddleware      (JWT, typ==='access', usuário ativo no banco)
  2. requireIntParams    (configId/sid numéricos — 400 cedo)
  3. requireServerAccess (admin bypass; viewer exige UserServerAccess)
  4. ensureConnection    (pool.getOrLoad → hidrata WebQueryClient do banco)
  5. requireRole('admin')(opcional, por rota)
  6. handler             (req.app.locals.prisma / connectionPool / serviços)
  7. errorHandler        (AppError → status; TSApiError → 502)
```
Resposta do TS: `WebQueryClient` (axios keep-alive, 1 socket por conexão) com retry de socket obsoleto e cooldown de 5 s para reset de transporte (`webquery-client.ts:67-80`).

### 6.2 Autenticação local

```
POST /api/auth/login (rate limit 15/15min)
  senha ─▶ bcrypt ─▶ gateAfterPassword
    ├─ mustChangePassword → token typ 'pwchange' → /login/change-password
    ├─ mfaEnabled/mfaRequired → token typ 'mfa' → /login/mfa (TOTP ou recovery code)
    └─ ok → issueSession: access JWT (15m) + refresh token (rotação com family e reuse detection)
  pós-login: /refresh (single-flight no frontend + Web Locks entre abas)
  cookie ts6_trusted (httpOnly, path /api/auth) → /auth/trusted/session (pula senha+MFA)
  SAML: /api/auth/saml/login → IdP → /acs (assertion assinada, audience, replay) →
        SSO code (Map em memória, 120 s, uso único) → /exchange → mesma gateAfterPassword
```

### 6.3 Eventos em tempo real (WS)

```
Produtores: VoiceBotManager (music:bot:*), BotEngine (bot:engine:*, bot:execution:*)
   │ broadcastScoped(wss, serverConfigId, event)
   ▼
/ws — verifyClient (JWT via ?token=, mesmo rigor do authMiddleware),
      grants de viewer resolvidos na conexão; admins recebem tudo
   ▼
Consumidores: frontend SPA (cliente WS ainda não implementado — Hipótese: infra pronta para uso futuro)
```

### 6.4 Bot de música (voz)

```
rotas /api/music-bots ─▶ VoiceBotManager
   ├─ cria bot: gera identidade ECDSA (security level 23, ~5 s, em Worker thread),
   │            cifra identityData, persiste MusicBot
   ├─ inicia: Ts3Client (UDP) — handshake Init0 → puzzle RSA → initivexpand/2
   │          (licença Ed25519) → clientinit com senha hash
   ├─ áudio: yt-dlp (opcional nice -n 19) ─▶ ffmpeg PCM s16le ─▶ encodeFrame
   │         (@discordjs/opus nativo, fallback opusscript WASM) ─▶ 20 ms por frame UDP
   ├─ comandos de texto: !play/!radio/... chegam na própria conexão TS do bot
   │         (music-command-handler) — sem SSH
   ├─ Discord: /play etc. reusam voice/music-ops (operações agnósticas de transporte)
   └─ relay Discord: setFrameSink entrega frames Opus já codificados ao @discordjs/voice
```

### 6.5 Streaming de vídeo

```
VoiceBot.startVideoStream
  ├─ SIDECAR_URL definido → container; senão spawna binário local com token aleatório
  ├─ setupstream (tipo 3) na conexão TS → aguarda streamStarted (10 s)
  ├─ resolve fonte (yt-dlp p/ YouTube/Twitch; demais: validateUrl)
  └─ sidecar: /source ─▶ ffmpeg ─▶ RTP (VP8+Opus) ─▶ Pion WebRTC
Viewer TS: notifystreamsignaling/joinstreamrequest ─▶ /peer/create ─▶ offer ─▶ TS
Preview web (MusicBots UI): oferta/resposta/ICE via rotas do backend ─▶ RTCPeerConnection
```

### 6.6 Bot flows

```
Gatilhos: EventBridge (SSH, eventos notify*) | cron (node-cron) | webhook
          (/api/bots/webhook/:path, segredo obrigatório) | comando de chat | mensagem Discord
   ─▶ BotEngine.onTsEvent/handleWebhookRequest/handleDiscordMessage
   ─▶ executeFlow (máx. 20 concorrentes por fluxo)
   ─▶ FlowRunner.execute: persiste execução → caminha grafo (máx. 100 visitas/nó)
       condition → safe-expr · delay (≤5 min) · variable (DB) · log (DB) · action
   ─▶ ações: WebQuery (whitelist), SSH, Discord, HTTP (validateUrl, maxRedirects:0),
       voz (VoiceBotManager injetado), animação de canal (AnimationManager)
```

### 6.7 Widget público

```
GET /api/widget/:token/{data|svg|png} (sem auth, rate limit 60/min)
  → WebQuery channellist/clientlist → buildWidgetTree → WIDGET_THEMES (@ts6/common)
  → renderWidgetSvg (400 px) → SVG ou PNG (@resvg/resvg-js)
  cache em memória 45 s, CORS *, campos sensíveis removidos
```

### 6.8 Bootstrap e shutdown (`src/index.ts`)

```
1. handlers globais de exceção (não derrubam o processo)
2. checagem ENCRYPTION_KEY ≠ JWT_SECRET (aborta)
3. cookie file yt-dlp → 4. Prisma + app → 5. trust proxy (banco) → 6. WS /ws
7. ConnectionPool.initialize (ignora linhas indecifráveis) → 8. app.locals
9. SAML runtime → 10. BotEngine + VoiceBotManager + MusicCommandHandler
11. DiscordBridge (não bloqueante) → 12. ConnectionJournal (não bloqueante)
13. listen :3001 → 14. SIGTERM/SIGINT: para serviços na ordem inversa
```

## 7. Dependências críticas

**Externas (não negociáveis em runtime):**
- **TeamSpeak com WebQuery HTTP habilitado** (porta 10080, `x-api-key`; telnet não suportado) e, opcionalmente, **SSH** (porta 10022) para eventos de fluxo/arquivos/journal.
- **yt-dlp** (download YouTube; auto-update no start do container; opcional `YT_COOKIE_FILE` para conteúdo restrito) e **ffmpeg** (decode/encode de áudio; também no sidecar para vídeo).
- **Serviços de terceiros**: Spotify Web API (resolução de links, metadados apenas), LRCLIB/lyrics.ovh (letras), Discord API (discord.js), geoip-lite (offline). O lado STUN do WebRTC usa servidores públicos com default fixo.
- **SQLite** via Prisma (`DATABASE_URL`, default `file:./data/ts6webui.db`) — persistência de usuários, configurações, servidores, músicas, fluxos, widgets, journal.

**Internas (acoplamentos que sustentam o sistema):**
- `@ts6/common` ←→ `backend`/`frontend` (`workspace:*`): contratos de API e tipos de widget/música consumidos ponta a ponta; tipos de fluxo consumidos só pelo backend.
- `app.locals` (registro de serviços não tipado) — todas as rotas dependem dele; refatorações de serviço exigem auditoria de consumidores.
- `utils/crypto.ts` — cifragem de credenciais; chave derivada de `ENCRYPTION_KEY` (scrypt). Trocar a chave torna linhas existentes ilegíveis; há fallback legado de leitura.
- `ts-client/ConnectionPool` — usado por middleware, rotas, journal, Discord, voz e flows; é o ponto único de entrada no WebQuery.
- `bot-engine/EventBridge` — além do engine, é instanciado pelo Discord e pelo journal (3 sessões SSH possíveis por par servidor+sid).
- `ws/ws-broadcast` — consumido por VoiceBotManager e BotEngine; contrato de eventos (`music:bot:*`, `bot:execution:*`) é a API de tempo real.
- Binário do **sidecar Go** (container ou spawn local) — sem ele não há streaming de vídeo.

## 8. Riscos técnicos e acoplamentos importantes

### 8.1 Riscos de segurança (prioritários)

1. **Credenciais do MusicBot em texto plano**: `serverPassword`/`channelPassword` (schema.prisma:177-182; escritas cruas em music-bots.routes.ts:107-124). Única exceção à política de cifragem do projeto.
2. **Rate limiting insuficiente em superfícies de brute force**: `/api/auth/login/mfa`, `/change-password`, `/trusted/session`, `/saml/exchange` ficam só no limitador global de 300/min (app.ts).
3. **`command-whitelist.ts` contradiz o próprio cabeçalho**: inclui `channeldelete`, `clientkick`, `banclient`, `tokenadd`/`tokendelete`, `messagedel`, `complainadd` apesar de declarar "destructive commands excluded".
4. **Token JWT na query string do WS** (`?token=`) pode vazar em logs de proxy reverso (mitigado pelo TTL de 15 min).
5. **Handshake TS3**: verificação da prova do servidor é pulada em `tslib/client.ts:843` ("Skipping proof verification") — enfraquece a autenticação do servidor no protocolo de voz (documentado no código).
6. **Cache compartilhado de widgets** com evicção por inserção — um endpoint público movimentado pode evictar entradas de outros widgets (hipótese de DoS cruzado).

### 8.2 Riscos de operação

7. **Premissas de instância única**: SSO code store, widget cache e dashboard cache são em memória — uma implantação multi-instância quebraria a troca SAML e serviria dados obsoletos. Não documentado.
8. **Sem histórico versionado de migrações**: schema aplicado por `db push`; `prisma/migrations/` no `.gitignore`. Upgrade de banco antigo depende de `db push` conservador.
9. **`ensureConnection` mascara falhas**: qualquer erro vira 404 "Server connection not found" (ensure-connection.ts:17-19) — falha de banco é indistinguível de conexão ausente.
10. **Três instâncias de EventBridge** (engine, Discord, journal) podem abrir 3 sessões SSH por servidor; `connection-journal.stop()` remove listeners sem fechar as sessões (hipótese: fechadas só no destroy do engine).
11. **Drift entre os 4 docker-composes**: variáveis presentes em uns e ausentes em outros (ex.: `TS_ALLOW_SELF_SIGNED` sem o dev; coolify sem sidecar); `.env.example` não documenta todas. Toda variável nova precisa ser replicada manualmente.
12. **Efeitos colaterais no load de módulos de rotas**: `widget-public.routes.ts:17-22` inicia um `setInterval` de 60 s no import (não-unref'd) e `music-library.routes.ts:16-18` executa `mkdirSync` — frágeis em testes e tooling.
13. **`config.jwtRefreshExpiry` é morto**: refresh expira em 7 dias hardcoded (`auth/session.ts:19`).

### 8.3 Acoplamentos e débitos estruturais

14. **`app.locals` não tipado** + `any` pervasivo para Prisma — sem camada de serviços tipada; quebras só aparecem em runtime.
15. **`TSApiError` definido em middleware e importado por ts-client** (inversão de camada); `settings.routes → voice/audio/youtube`; `widget-public.routes` exporta utilitários consumidos por outras rotas — acoplamentos pontuais que minam a regra de camadas.
16. **Monólitos**: `voice-bot.ts` (~1190 linhas: protocolo + pacing + ICY + vídeo), `discord-bridge.ts` (~975), `Settings.tsx` (~1650), `MusicBots.tsx` (~1770), `BotEditor.tsx` (~1570, ~40 formulários inline de nós).
17. **Duplicações**: skip/prev do bot reimplementado 3× (handler, discord, flow-runner); formatadores de duração 3×; `tsEscape`/`parseCommand` duplicados entre `@ts6/common` e `voice/tslib/commands.ts`; middleware de auth do WS duplica o HTTP (podem divergir).
18. **Dependências declaradas sem uso**: backend `zod`, `pino`, `pino-pretty`, `@snazzah/davey`; frontend `@xyflow/react` (o editor de fluxo é canvas feito à mão), `react-hook-form`+`@hookform/resolvers`, vários `@radix-ui/*`. `@types/express@5` com `express@4`.
19. **Órfãos**: `voice/index.ts` (barrel sem consumidores); `TS_EVENTS`/`TS_EVENT_LABELS` em `@ts6/common` (eventos são casados por strings cruas; 8 dos 12 nomes declarados não têm handler; os `notifystream*` usados não constam); `sendSenderReports` no sidecar (código morto — o mecanismo de lip-sync por RTCP SR descrito nos comentários nunca roda); tipos `teamspeak.ts` do common aparentemente sem importadores (hipótese).
20. **Sem testes de integração**: backend testa helpers puros; frontend não tem nenhum teste. Fluxos de auth, rotas, voz, Discord e engine sem cobertura.
21. **Voz como ação de fluxo é pesada**: `voiceStop` derruba o bot inteiro e `voiceJoinChannel` faz stop → update → restart (flow-runner.ts:716-744); `voiceTts` é placeholder silencioso.
22. **i18n com furos**: locales hardcoded em Journal (`fr`), Files e Dashboard (`de-DE`); componentes inteiros sem tradução (DataTable, VideoStreamTab, WidgetManagerModal, TemplateGallery).

## 9. Diretrizes para futuras implementações

1. **Nova rota** → arquivo em `routes/` seguindo o padrão existente (cadeia de middleware, admin-only quando sensível, `AppError`/`TSApiError`), tipos de contrato em `@ts6/common` quando consumidos pelo frontend, hook `use-*` + página correspondentes.
2. **Nova variável de ambiente** → atualizar `.env.example` E os 4 docker-composes (ou consolidar os composes primeiro — ver §8.11).
3. **Nova ação/gatilho de fluxo** → atualizar os 4 pontos em sincronia: `frontend/src/pages/BotEditor.tsx` + `data/bot-templates.ts` (formato editor), `backend/src/bot-engine/engine.ts#normalizeFlowData`, `flow-runner.ts` (execução), `@ts6/common/src/types/bot.ts`.
4. **Nova credencial persistida** → cifrar com `utils/crypto.ts`; nunca adicionar colunas de segredo em texto plano (migrar `MusicBot.serverPassword`/`channelPassword` é débito reconhecido).
5. **Novo evento WS** → emitir via `broadcastScoped` com `serverConfigId`; documentar o nome do evento no contrato (`@ts6/common`) e no consumidor frontend.
6. **Mudança de schema Prisma** → `pnpm db:generate` obrigatório (client fora de node_modules); validar com `prisma db push`; não criar migrações esperando histórico versionado.
7. **Antes de mexer em auth**: ler `middleware/auth.ts`, `auth/session.ts` e o `verifyClient` do WS juntos — as duas verificações são cópias que devem permanecer equivalentes; qualquer nova classe de token afeta ambos.
8. **Antes de mexer no bot de voz**: separar preocupações dentro do `voice-bot.ts` (extração do vídeo e dos dois loops de pacing é candidata natural); reusar `bot.skip()/previous()` em vez de reimplementar.
9. **Refatorações grandes sugeridas** (em ordem de retorno): tipar `app.locals` (camada de serviços), extrair formato de nó do `BotEditor` para renderização dirigida por schema, consolidar composes, encaminhar i18n restante, remover dependências mortas, adicionar testes de integração para os fluxos de auth/refresh.
10. **Consistência documental**: toda mudança de responsabilidade, dependência ou fluxo deve atualizar este documento e o README do módulo afetado — esta documentação é a base oficial para o desenvolvimento Spec Driven.
