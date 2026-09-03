# ts-client — Cliente WebQuery e pool de conexões

## Objetivo do módulo

Transporte de comunicação com os servidores TeamSpeak via **WebQuery HTTP** (o substituto do ServerQuery nas builds modernas do TS; telnet não é suportado) e o gerenciamento do ciclo de vida dessas conexões.

## Responsabilidade principal

Ser o **ponto único de acesso ao TS por comando**: um `WebQueryClient` por conexão (config), mantido pelo `ConnectionPool`, com auto-recuperação (retry de socket obsoleto, circuit breaker, hidratação preguiçosa) para que edições de conexão no painel funcionem sem reiniciar o backend.

## Funcionalidades existentes

- **`WebQueryClient`** (`webquery-client.ts`): axios com keep-alive (1 socket por conexão — evita multiplicar logins de query no TS), header `x-api-key`, timeout 15 s, URLs `/{sid}/{command}` (ou `/{command}` para sid 0); `status.code !== 0` → `TSApiError`; `cleanParams` remove nulos; `testConnection()` (versão da instância); `destroy()`.
- **Self-healing de socket obsoleto** (`withStaleSocketRetry`): em `ECONNRESET`/`EPIPE`/“socket hang up” sem resposta, reconstrói o transporte (agent+axios) e tenta **uma** vez.
- **Circuit breaker**: no máximo 1 reset de transporte a cada 5 s (`RESET_COOLDOWN_MS`) — não alimenta o contador de flood do TS.
- **`ConnectionPool`** (`connection-pool.ts`): `Map<configId, WebQueryClient>`; `initialize()` carrega conexões habilitadas (decifra apiKey por linha, **pula linhas indecifráveis** em vez de derrubar o start); `getClient` (síncrono, lança), `getOrLoad` (async, hidrata do banco — caminho self-healing usado por `ensureConnection` e journal), `refreshClient`/`removeClient` (sincronizados pelas rotas de servidores), `destroy()`.

## Dependências

- **Internas**: `config` (timeout/TLS), `utils/crypto` (decifrar credenciais no pool), `middleware/error-handler` (`TSApiError` — **inversão de camada**: o erro de API do TS é definido no middleware).
- **Externas**: axios.
- **Consumidores**: `middleware/ensure-connection.ts`, `routes/*` (via pool), `voice/` (music-command-handler, discord via pool), `bot-engine/` (flow-runner, engine), `connection-journal.ts`, `discord/`.

## Módulos relacionados

`middleware/`, `routes/servers.routes.ts` (única porta que adiciona/remove/refresca clients), `bot-engine/ssh-query-client.ts` (o transporte SSH paralelo, para eventos/arquivos), `@ts6/common` (`TSResponse` — **Hipótese**: o backend usa seus próprios tipos; `types/teamspeak.ts` do common aparenta não ter importadores).

## Pontos de entrada

`connection-pool.ts` (`ConnectionPool`), `webquery-client.ts` (`WebQueryClient`, `TSApiError`).

## Fluxos importantes

Requisição roteada → `ensureConnection` → `pool.getOrLoad` → `client.executeGet/executePost` → retry de socket → resposta ou `TSApiError`. Edição de conexão → `refreshClient` (substitui ou remove do pool) sem reinício do processo.

## Arquivos críticos

`webquery-client.ts` (contrato de erro + retry — mudanças afetam todas as rotas), `connection-pool.ts` (hidratação e ciclo de vida).

## Observações técnicas e débitos

- `TSApiError` deveria nascer aqui (ou em `@ts6/common`) — hoje o ts-client importa de middleware, acoplando as camadas na direção errada.
- `getOrLoad` lê o banco em cache-miss — sob concorrência pode criar clientes duplicados (**Hipótese**: sem single-flight no pool; risco baixo na prática).
- Testes cobrem pool (enabled-only, skip-indecifrável, hidratação preguiçosa) e client (retry único, cooldown, POST) — bons regressores; mudanças aqui têm testes próximos.
- TLS auto-assinado controlado por `TS_ALLOW_SELF_SIGNED` (`config.ts`).
