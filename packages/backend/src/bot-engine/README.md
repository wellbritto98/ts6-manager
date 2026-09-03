# bot-engine — Motor de fluxos de automação

## Objetivo do módulo

Executar os **bot flows** criados no editor visual do frontend: automações com gatilhos (eventos TS, cron, webhooks, comandos de chat, mensagens Discord), condições, variáveis, delays e ações sobre o TeamSpeak, Discord e HTTP.

## Responsabilidade principal

Normalizar o formato do editor para o formato do motor, assinar as fontes de gatilho (SSH/EventBridge, cron, webhook HTTP, Discord), e caminhar o grafo de nós com limites de segurança (expressões sandboxed, whitelist de comandos, tetos de concorrência/visitas).

## Funcionalidades existentes

- `engine.ts` — `BotEngine`: carrega fluxos habilitados, cria conexões SSH + listeners de comando por canal para cada par (configId, sid), registry de webhooks, crons e animações; `handleWebhookRequest` (404 anti-enumeração, segredo `timingSafeEqual`); `handleDiscordMessage` (canal + prefixo opcional); `onTsEvent` (filtros por campo + gatilhos de comando via listener por canal); `enableFlow/disableFlow/reloadFlow`; poda de conexões SSH não usadas; teto de 20 execuções concorrentes por fluxo.
- **`normalizeFlowData`** (`engine.ts:43-217`) — converte o formato do editor (`trigger_event`/`action_kick` + `config`) no formato do motor (`trigger`/`action`/… + `data.*Type`): 5 gatilhos e 25+ ações.
- `flow-runner.ts` — `FlowRunner.execute`: persiste `botExecution`, constrói `ExecutionContext`, caminha o grafo recursivamente (trigger → condição → ação/delay/variável/log); **teto de 100 visitas por nó** (proteção de loop); delay ≤ 5 min; broadcasts `bot:execution:*`.
  - Ações: kick/ban/move/message/poke (WebQuery), discordSend, channelCreate/Edit/Delete, groupAdd/RemoveClient, webquery (**whitelist**), webhook/httpRequest (axios + `validateUrl` + `maxRedirects: 0`), afkMover, idleKicker, pokeGroup, rankCheck, tempChannelCleanup, voz (via `VoiceBotManager` injetado: play/stop/joinChannel/volume/pause/skip/seek/tts-placeholder), generateCode, animatedChannel (no-op — motor de animação).
- `context.ts` — `ExecutionContext`: templates `{{event.*}} {{var.*}} {{temp.*}} {{time.*}} {{exec.*}}` com filtros (`uptime|round|floor`), variáveis persistidas por fluxo (DB), funções registradas (`contains`, `startsWith`, …) para o avaliador.
- `safe-expr.ts` — avaliador próprio (substituto do `expr-eval`): parser recursivo sem `eval`, sem acesso a JS, segmentos proibidos (`__proto__/constructor/prototype`), lookup só de propriedades próprias, funções via `Object.create(null)`.
- `event-bridge.ts` — `EventBridge`: conexões SSH ServerQuery por `configId:sid`, **host-key pinning TOFU** (recusa mudança), re-emissão de eventos como `tsEvent`, `executeCommand` sob demanda (usado pelas rotas de arquivos) e pool de **listeners de comando por canal** (cliente SSH extra que se move ao canal e registra `textchannel`).
- `ssh-query-client.ts` — cliente ServerQuery-over-SSH em `ssh2`: shell, fila de comandos, parse até `error id=N`, extração de `notify*`, keepalive de aplicação (`whoami` a cada 30 s, desconecta após 3 falhas), backoff exponencial, `fatalError` em falha de auth.
- `command-whitelist.ts` — `ALLOWED_WEBQUERY_COMMANDS` para a ação webquery.
- `animation-manager.ts` — animação de nomes de canais (scroll/typewriter/bounce/blink/wave/alternateCase) por `channeledit` em intervalo (mín. 250 ms).

## Dependências

- **Internas**: `@ts6/common` (tipos de fluxo + `TS_EVENT_TYPES`/`parseQueryResponse`), `ts-client/connection-pool` (WebQuery das ações), `utils/crypto` (credenciais SSH), `utils/url-validator` (SSRF), `ws/ws-broadcast`, `voice/voice-bot-manager` (**via injeção por setter** — `flow-runner.ts:43-45`), Prisma.
- **Externas**: ssh2, node-cron, axios.
- **Consumidores**: `src/index.ts` (app.locals.botEngine), `routes/bots.routes.ts`, `app.ts` (rota de webhook pública), `routes/files.routes.ts` (`getEventBridge`), `discord/discord-bridge.ts` (**usa `EventBridge` do bot-engine** — violação de camada), `connection-journal.ts` (EventBridge próprio).

## Módulos relacionados

`discord/` (trigger de mensagem + EventBridge compartilhado), `voice/` (ações de voz), `routes/` (bots/files), `packages/frontend/src/pages/BotEditor.tsx` + `data/bot-templates.ts` (formato do editor — manter em sincronia).

## Pontos de entrada

`engine.ts` (`BotEngine`), `event-bridge.ts` (`EventBridge`), `flow-runner.ts` (`FlowRunner`), `context.ts` (`ExecutionContext`), `safe-expr.ts`.

## Fluxos importantes

Evento SSH → `EventBridge.tsEvent` → `engine.onTsEvent` (match de trigger) → `executeFlow` (concorrência) → `FlowRunner.execute` (grafo) → `ExecutionContext` (templates/variáveis/expressões) → ações. Cron/webhook/Discord entram direto em `executeFlow`. Ver `docs/arquitetura-do-sistema.md` §6.6.

## Arquivos críticos

`engine.ts` (normalização + gatilhos — qualquer nó novo passa por aqui), `flow-runner.ts` (execução), `safe-expr.ts` (sandbox — não enfraquecer), `event-bridge.ts`/`ssh-query-client.ts` (transporte SSH).

## Observações técnicas e débitos

- **Contradição documentada**: cabeçalho do `command-whitelist.ts` diz "destructive commands excluded", mas inclui `channeldelete`, `clientkick`, `banclient`, `tokenadd`/`tokendelete`, `messagedel`, `complainadd`.
- **`discord-trigger.test.ts` testa uma réplica local** da lógica de `handleDiscordMessage` — não existe `discord-trigger.ts`; a réplica pode divergir do código real.
- **`voiceStop` derruba o bot inteiro**; `voiceJoinChannel` faz stop → update no banco → restart (em vez de `clientmove`); `voiceTts` é placeholder silencioso.
- **Contador de visitas é compartilhado entre ramos** do grafo — grafos largos (branching) podem atingir o teto de 100 antes de qualquer loop real.
- **3 EventBridges** no processo (engine, discord, journal) = até 3 sessões SSH por par.
- **`engine.start()` abre SSH para todo par de fluxo habilitado**, mesmo sem gatilho de evento (só `enableFlow` checa `hasEventTrigger`).
- Testes: safe-expr (hardening), discord-trigger (réplica). Sem testes para engine/flow-runner/event-bridge/ssh-query-client/animation-manager.
