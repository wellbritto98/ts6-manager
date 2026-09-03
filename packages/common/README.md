# @ts6/common — Tipos e constantes compartilhados

## Objetivo do módulo

Pacote base do monorepo: define os **contratos compartilhados** entre backend e frontend (tipos de API, fluxos de bot, música, WebQuery do TeamSpeak) e utilitários/constantes comuns, evitando duplicação e divergência de formatos.

## Responsabilidade principal

Única fonte de verdade para tipos de domínio que cruzam a fronteira HTTP/WS. **Não contém lógica de negócio nem execução** — apenas tipos (compile-time), constantes e funções puras.

## Funcionalidades existentes

- `types/teamspeak.ts` — tipos das respostas brutas do WebQuery (`VirtualServer`, `Channel`, `Client`, `Ban`, `PrivilegeKey`, `LogEntry`, `FileEntry`, enum `Codec` etc.).
- `types/api.ts` — contratos REST: auth (`LoginRequest/Response`, `RefreshRequest`), servidores (`ServerConfig`), dashboard, canais, clientes, bans, tokens, grupos, usuários do app, widgets (`WidgetTheme`, `WidgetConfig`…).
- `types/auth.ts` — `UserRole`, `TokenType` (`access|mfa|pwchange`) e `JwtPayload` (com doc sobre a obrigação de verificar a classe).
- `types/bot.ts` — modelo do **formato do motor** de fluxos: `FlowDefinition/FlowNode/FlowEdge`, 5 gatilhos, 21 ações, nós de condição/delay/variável/log, e registros de API (`BotFlowSummary`, `BotExecutionSummary`…).
- `types/music.ts` — bots de música, músicas, playlists, fila, YouTube, rádio e streaming de vídeo (`VideoStreamPresetKey`, `VideoStreamStatus`…).
- `constants/events.ts` — `TS_EVENTS`, `TSEventName`, `TS_EVENT_LABELS`, `TS_EVENT_TYPES`.
- `utils/ts-escape.ts` — `tsEscape`/`tsUnescape`/`parseQueryResponse` (parsing de respostas ServerQuery).
- `widget-themes.ts` — `WIDGET_THEMES` (6 paletas) + `WIDGET_THEME_LABELS`.
- `index.ts` — barrel com todos os exports.

## Dependências

- **Internas**: nenhuma (folha do grafo de dependências).
- **Externas**: nenhuma em runtime; dev: `typescript` apenas.
- **Consumidores**: backend (10 arquivos: middleware de auth/rbac, bot-engine, ssh-query-client, rotas de files/radio/widget, widget builder) e frontend (6 arquivos: widget end-to-end, MusicBots, hooks de widgets).

## Módulos relacionados

`packages/backend` e `packages/frontend` (via `workspace:*`); `voice/tslib/commands.ts` no backend **reimplementa** `tsEscape`/`parseQueryResponse` localmente (duplicação conhecida).

## Pontos de entrada

`src/index.ts` (barrel) — consumido como `@ts6/common` (backend) e via path mapping `@ts6/common → ../common/src` (frontend, dev).

## Fluxos importantes

Build de `common` precede backend/frontend (`pnpm build` na raiz); o frontend em dev compila o fonte diretamente via path mapping.

## Arquivos críticos

`src/types/bot.ts` (formato de fluxo — mudanças exigem sincronizar com `BotEditor.tsx` e `engine.ts#normalizeFlowData`); `src/types/auth.ts` (`TokenType` — qualquer classe nova de token afeta `authMiddleware` e o `verifyClient` do WS); `src/widget-themes.ts` (consumido por `widget-svg.ts` e `WidgetRenderer.tsx`).

## Observações técnicas e débitos

- **Órfãos**: `TS_EVENTS`/`TSEventName`/`TS_EVENT_LABELS` não são importados em lugar nenhum — os handlers casam eventos por strings cruas e 8 dos 12 nomes não têm handler; os eventos `notifystream*` realmente usados não constam das constantes. Unificar (usar as constantes) ou remover.
- **Inconsistência interna**: `UserRole` (`auth.ts`) é `'admin'|'viewer'`, mas `api.ts` usa `'admin'|'moderator'|'viewer'` para `UserInfo.role`/requests de usuário.
- `types/teamspeak.ts` aparenta não ter importadores (**Hipótese**: o backend duplica seus próprios tipos em `ts-client`).
- `tsUnescape` é ingênuo (unescape sequencial, não ordenado por precedência) — compatível com o uso atual, mas frágil para casos gerais.
- Adicionar tipo de API novo: prefira colocar aqui quando consumido pelos dois lados; tipos usados só pelo backend podem viver nele (é o caso dos tipos de bot).
