# @ts6/frontend — SPA React do TS6 Manager

## Objetivo do módulo

Interface web do sistema: painel de administração do TeamSpeak (dashboard, canais, clientes, permissões, bans…), gestão de bots de música, editor visual de fluxos, integrações (Discord/SAML/Spotify/YouTube), journal e widgets.

## Responsabilidade principal

UI e UX sobre a API do backend (`/api`, base `VITE_API_URL`): páginas por domínio, dados via TanStack Query (hooks `use-*`), estado global mínimo (Zustand persistido) e sessão com refresh de token transparente. **Nunca** fala com o TeamSpeak diretamente nem conhece credenciais.

## Funcionalidades existentes

- **Bootstrap** (`main.tsx`/`App.tsx`): i18n inicializado antes do primeiro render; rotas declarativas (react-router-dom v6) com 24 páginas `lazy` + Suspense; `AdminRoute` (gate client-side); `QueryClient` global (retry 1, staleTime 30 s); aplica idioma do usuário logado.
- **Rotas**: `/login`, `/login/sso`, `/setup`, `/widget/:token` (públicas) + área logada (`AppLayout`): dashboard, servidores virtuais, canais, clientes, grupos (servidor/canal), permissões, bans, tokens, arquivos, reclamações, mensagens, logs, instância, journal, pedidos de música, bots (lista + editor), bots de música, settings.
- **Estado (Zustand + persist)**: `auth.store` (tokens + usuário; localStorage aceito por trade-off documentado), `server.store` (configId/sid selecionados — base de quase todos os hooks), `ui.store` (sidebar/theme, com script inline no index.html contra flash de tema).
- **Dados**: `api/client.ts` (axios `/api`, 15 s, header bearer por request); `api/token-refresh.ts` — refresh **single-flight** + **Web Locks** entre abas, lê localStorage para detectar rotação de outra aba, logout só em 401/403; hooks `use-*` por domínio com invalidação por prefixo de query key e polling (`refetchInterval` 2 s–15 s conforme o domínio).
- **Páginas principais**: Dashboard (recharts, histórico de banda manual, cache de 5 s no backend); MusicBots (6 abas: players, fila, vídeo, biblioteca com import de playlist, playlists, rádio); Settings (9 abas admin: conexões, usuários, YouTube, Discord, SAML, Spotify, comandos de música + aba da conta: idioma/senha/MFA/dispositivos); Login (máquina de estados em 5 passos: senha→enroll MFA→código→troca de senha→trusted); Journal (paginação/filtros/ban de IP); BotEditor (canvas feito à mão — ver débitos).
- **i18n**: i18next + react-i18next; 5 idiomas (en/fr/de/es/it); detecção `ts6_lang` → navigator; locales **gerados** por `scripts/merge-i18n.mjs` a partir de `scripts/i18n-fragments/*.json` com checagem de paridade (falha o script em divergência).
- **Widgets**: `WidgetPage` (público, axios cru, polling 30 s) + `WidgetRenderer` (estilos inline, temas de `@ts6/common`); `WidgetManagerModal` (CRUD/embed/regenerar token).
- **Vídeo**: `VideoStreamTab`/`VideoPlayer` — WebRTC com sinalização **via REST do backend** (offer/answer/ICE por botId), STUN público, estados de conexão e kick de viewer.

## Dependências

- **Internas**: `@ts6/common` (tipos de widget/música; path mapping para `../common/src` em dev).
- **Externas (principais)**: react 18, react-router-dom 6, @tanstack/react-query + react-table, zustand, axios, react-i18next + i18next, recharts, date-fns, sonner, lucide-react, radix primitives + tailwind (shadcn/ui), flag-icons.
- **Build/serve**: Vite 6 (dev :5173, proxy `/api`→:3001 e `/ws`→ws:3001); produção: build estático servido por nginx-unprivileged (Dockerfile.frontend) com proxy `/api` (600 s) e `/ws` (1 h).

## Módulos relacionados

`packages/backend` (API), `packages/common` (contratos), `packages/sidecar` (indiretamente, via backend).

## Pontos de entrada

`src/main.tsx` → `src/App.tsx` (rotas), `src/api/client.ts` (HTTP), `src/api/token-refresh.ts` (sessão), `src/stores/*` (estado), `src/hooks/*` (dados).

## Fluxos importantes

1. **Sessão**: login (máquina de estados com MFA/SAML/trusted) → tokens no store → interceptor injeta bearer → 401 dispara refresh single-flight (Web Locks) → sucesso rotaciona; 401/403 pós-refresh = logout.
2. **Servidor selecionado** (`server.store`) → query keys dos hooks (`['bans', configId, sid]`) → invalidação automática ao trocar servidor.
3. **Tempo real**: polling por `refetchInterval` (clientes 10 s, canais 15 s, música/vídeo 2 s); o canal WS do backend existe mas ainda não tem cliente aqui.
4. **Fluxos**: editor grava `{nodes, edges}` no formato do editor; o backend normaliza (ver `bot-engine/README.md`). Templates (`data/bot-templates.ts`) geram grafos via `flowDataFactory`.

## Arquivos críticos

`src/App.tsx` (rotas/gates), `src/api/token-refresh.ts` (contrato de sessão — mudanças afetam todos os 401), `src/stores/server.store.ts` (seleção global), `src/pages/BotEditor.tsx` + `src/data/bot-templates.ts` (formato de fluxo), `scripts/merge-i18n.mjs` (geração de locales).

## Observações técnicas e débitos

- **Sem testes** no frontend (nenhum arquivo de teste nem runner) — risco real para o editor de fluxos e o refresh de token.
- **Monólitos**: `Settings.tsx` (~1650 linhas/9 abas), `MusicBots.tsx` (~1770/6 abas), `BotEditor.tsx` (~1570, ~40 formulários inline de nós — candidato a renderização dirigida por schema).
- **Canvas de fluxos feito à mão** (drag/connect/bezier manuais) — `@xyflow/react` declarado e não usado; não assuma React Flow.
- **Dependências mortas**: `@xyflow/react`, `react-hook-form` + `@hookform/resolvers`, `zod`, vários `@radix-ui/*` (accordion/alert-dialog/avatar/context-menu/popover/progress); `date-fns` e `recharts` usados em 1 arquivo cada.
- **Hooks/APIs mortos**: `useLogin`, `useClientDatabase`, `useMoveClient`, `useRestartMusicBot`, `useMusicBot`, `useVirtualServerInfo`, `useTestConnection`, `useUpdatePlaylist`, `useReorderPlaylistSongs`; `authApi.refresh`, `botsApi.executions/executionLogs`, `serversApi.createVirtual/editVirtual/deleteVirtual/createSnapshot`, `musicBotsApi.restart`, `clientsApi.database/move`, `authStore.canWrite`.
- **Duplicação de APIs**: `bans.api.ts` concentra tokens/complaints/messages/logs/files/permissions que também existem em módulos dedicados; `usersApi` vive em `bots.api.ts`; páginas importam de ambos.
- **Inconsistência de padrão**: páginas via hooks convivem com páginas usando `useQuery`/API direto (Complaints, Tokens, Messages, ServerLogs, Instance, Files, VirtualServers, Journal).
- **i18n furada**: `index.html lang="de"`; locales hardcoded em Journal (`fr`/`fr-FR`), Files e Dashboard (`de-DE`); DataTable, VideoStreamTab, WidgetManagerModal, TemplateGallery, PlaceholderReference e WidgetRenderer sem tradução.
- **Sem error boundary** — erro de render numa página lazy branqueia o app inteiro.
- Padrão frágil "setState durante render" repetido em ~10 pontos (Dashboard, BotEditor, Journal, Settings, Login) — preferir keyed remount/efeito.
- Proxy `/ws` do Vite existe mas não há cliente WS.
- Bug: após regenerar token de widget, `embedTarget` pode ficar com o token antigo (closure stale em `WidgetManagerModal`).
