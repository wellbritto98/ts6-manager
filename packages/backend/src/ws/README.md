# ws — Broadcast de eventos em tempo real

## Objetivo do módulo

Canal WebSocket do backend para empurrar atualizações de estado (música, execuções de fluxos) ao frontend, com autenticação e escopo por servidor.

## Responsabilidade principal

Distribuir eventos com controle de acesso: admins recebem tudo; viewers só recebem eventos de servidores aos quais têm concessão; eventos sem escopo vão apenas para admins (fail-closed).

## Funcionalidades existentes

- `ws-broadcast.ts` — `broadcastScoped(wss, serverConfigId, event)` (escopo por servidor; viewers filtrados pelo conjunto de grants resolvido na conexão), `bindIdentity(socket, identity)`.
- Servidor montado em `src/index.ts:71-122` sobre o mesmo HTTP server, path `/ws`; `verifyClient` autentica via `?token=` (HS256, `typ === 'access'`, usuário ativo no banco, grants carregados para não-admins).

## Dependências

- **Internas**: `config` (jwtSecret), Prisma (usuário + grants), `@ts6/common` (tipos) — via `index.ts`; o próprio `ws-broadcast.ts` não importa nada além de tipos.
- **Externas**: `ws`.
- **Produtores**: `voice/voice-bot-manager.ts` (`music:bot:*`, `music:bot:videoStream*`, progress de 1 s), `bot-engine/flow-runner.ts` + `engine.ts` (`bot:engine:started/stopped`, `bot:execution:*`).
- **Consumidores**: frontend (ainda sem cliente WS implementado — o proxy `/ws` do Vite existe mas não é usado).

## Módulos relacionados

`voice/`, `bot-engine/`, `src/index.ts` (auth do handshake), `@ts6/common` (nomes de eventos — hoje definidos como strings nos produtores).

## Pontos de entrada

`ws-broadcast.ts` (`broadcastScoped`, `bindIdentity`); handshake em `src/index.ts`.

## Fluxos importantes

Conexão: `verifyClient` (JWT na query string) → `bindIdentity` → eventos filtrados por `serverConfigId`. Desconexão limpa por `wss.close()` no shutdown.

## Arquivos críticos

`ws-broadcast.ts` (contrato de escopo), `src/index.ts:71-122` (autenticação).

## Observações técnicas e débitos

- **Duplicação de lógica de auth**: o `verifyClient` reimplementa o `authMiddleware` inline — as duas verificações devem permanecer equivalentes (ver `middleware/README.md`).
- **Token na query string** pode vazar em logs de proxy reverso (mitigado pelo TTL de 15 min do access token).
- Grants são resolvidos **uma vez na conexão** — concessões revogadas após o connect só valem na próxima conexão (trade-off documentado no código).
- Nomes de eventos (`music:bot:*`, `bot:execution:*`) não têm catálogo central — candidatos a constantes em `@ts6/common` junto com o cliente WS do frontend.
