# middleware — Cadeia de proteção da API

## Objetivo do módulo

Política transversal do HTTP: autenticação, autorização (RBAC + acesso por servidor), validação de parâmetros, disponibilidade de conexão e tratamento de erros.

## Responsabilidade principal

Aplicar, em ordem fixa e para todas as rotas `:configId`, a cadeia: `authMiddleware` → `requireIntParams` → `requireServerAccess` → `ensureConnection` → `requireRole('admin')` (por rota) → `errorHandler`.

## Funcionalidades existentes

- `auth.ts` — verifica JWT HS256, **rejeita `typ !== 'access'`** (bloqueia desafios MFA/pwchange como sessão), reconsulta o banco para usuário ativo e **reconstrói `req.user` com o papel atual do banco** (não o claim antigo do JWT).
- `rbac.ts` — `requireRole('admin')` (401 sem usuário, 403 sem papel).
- `server-access.ts` — admins bypass; viewers precisam de `UserServerAccess` para o `:configId` (403).
- `ensure-connection.ts` — `pool.getOrLoad(configId)` (hidratação self-healing do pool); falha vira 404.
- `validate-params.ts` — `requireIntParams('configId','sid')` rejeita não-numéricos com 400 antes de Prisma/WebQuery.
- `error-handler.ts` — define as classes compartilhadas `AppError` (status + details) e `TSApiError` (→ 502 com código TS); handler final para o Express.

## Dependências

- **Internas**: `config` (auth), `ts-client/connection-pool` (ensure-connection), `@ts6/common` (`JwtPayload`, `UserRole`).
- **Externas**: jsonwebtoken (via auth).
- **Consumidores**: `app.ts` (montagem global e por cadeia de rotas); `TSApiError` é importado também por `ts-client` e pelas rotas.

## Módulos relacionados

`routes/` (todas), `ts-client/`, `auth/` (formato dos tokens), `src/index.ts` (WS `verifyClient`, cópia do authMiddleware).

## Pontos de entrada

`auth.ts` (`authMiddleware`), `error-handler.ts` (`AppError`/`TSApiError`/`errorHandler`), `ensure-connection.ts`, `server-access.ts`, `rbac.ts`, `validate-params.ts`.

## Fluxos importantes

Ciclo completo de requisição em `docs/arquitetura-do-sistema.md` §6.1. Atenção à ordem de montagem em `app.ts:114-119` (auth global → cadeia por servidor → rotas).

## Arquivos críticos

`auth.ts` (regra de classe de token — qualquer token novo passa por aqui), `error-handler.ts` (contrato de erro da API).

## Observações técnicas e débitos

- **Inversão de camada**: `TSApiError` vive aqui mas é importado por `ts-client` (que conceitualmente deveria defini-lo) — mover para `ts-client`/`@ts6/common`.
- **`ensureConnection` mascara erros**: qualquer falha (incluindo banco) vira 404 "Server connection not found or disabled".
- **Duplicação com o WS**: o `verifyClient` em `src/index.ts:74-109` reimplementa `authMiddleware` inline — as duas verificações podem divergir silenciosamente.
- Não há camada de validação de schema de corpo (zod declarado, sem uso) — validação manual rota a rota.
- Cobertura de testes: `auth.test.ts` (confusão de classes de token) e `validate-params.test.ts`; `server-access`, `ensure-connection` e `error-handler` não têm teste.
