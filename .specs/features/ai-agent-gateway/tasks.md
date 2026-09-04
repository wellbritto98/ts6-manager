# AI Agent Gateway Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/ai-agent-gateway/design.md`
**Status**: Approved

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `CLAUDE.md` (vitest co-located `*.test.ts` under `packages/backend/src`; frontend has no tests), `packages/backend/package.json` (`vitest run`), `packages/backend/src/test-setup.ts`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Domain / agent helpers / services | unit | All branches; 1:1 to spec ACs; every listed edge case | `packages/backend/src/**/*.test.ts` | `pnpm --filter @ts6/backend exec vitest run <file>` |
| Gateway routes / adapters | unit | Happy + listed error paths (401/403/404, codes) | `packages/backend/src/agent/**/*.test.ts` | `pnpm --filter @ts6/backend exec vitest run <file>` |
| Prisma schema / Docker / compose / nginx / docs | none | build gate only | - | `pnpm --filter @ts6/backend exec tsc --noEmit` |
| Frontend UI | none | no frontend tests in repo; assert nav conditions in a small unit file if added, else typecheck + i18n merge | - | `node packages/frontend/scripts/merge-i18n.mjs` |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | -------- |
| Quick | After tasks with unit tests only | `pnpm --filter @ts6/backend exec vitest run <task-test-file>` |
| Full | After tasks with e2e/integration tests | same as Quick (no e2e in this repo) |
| Build | After phase completion or config/entity-only tasks | `pnpm --filter @ts6/backend exec tsc --noEmit` |

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Foundation

```
T1 -> T2 -> T3 -> T4 -> T5
```

### Phase 2: Auth and audit

```
T6 -> T7 -> T8 -> T9 -> T10 -> T11
```

### Phase 3: Services

```
T12 -> T13 -> T14 -> T15 -> T16 -> T17 -> T18
```

### Phase 4: Tool registry

```
T19 -> T20 -> T21 -> T22 -> T23 -> T24 -> T25
```

### Phase 5: Adapters

```
T26 -> T27 -> T28 -> T29 -> T30 -> T31
```

### Phase 6: Product

```
T32 -> T33 -> T34 -> T35 -> T36 -> T37
```

---

## Task Breakdown

### T1: Fail-closed AI config

**What**: Parse `AI_AGENT_ENABLED`, require 32+ char distinct `AI_GATEWAY_TOKEN` and `AI_IDENTITY_JWT_SECRET` only when enabled, parse allowlists, destructive flag, assistant URL.
**Where**: `packages/backend/src/config.ts`
**Depends on**: None
**Reuses**: `requireSecret` in `config.ts`
**Requirement**: AIGW-01, AIGW-02, AIGW-03

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [x] Flag false/unset does not require AI secrets
- [x] Flag true with short or reused secret exits the process in a testable helper (do not call `process.exit` without a seam)
- [x] Allowlist strings split on comma, trim, emails lowercased
- [x] Gate check passes: quick vitest on `config-ai.test.ts`
- [x] Test count: at least 5 tests pass

**Tests**: unit
**Gate**: quick

---

### T2: AiActionLog schema and SQL

**What**: Add `AiActionLog` to Prisma with idempotency unique and indexes; checked-in additive SQL; regenerate client.
**Where**: `packages/backend/prisma/schema.prisma`
**Depends on**: T1
**Reuses**: existing Prisma model style
**Requirement**: AIGW-29

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [x] Model matches design.md fields including `idempotencyKey` unique with actor+tool
- [x] `packages/backend/prisma/sql/ai-action-log.sql` exists
- [x] `pnpm db:generate` succeeds
- [x] Gate check passes: build (`tsc --noEmit`)
- [x] Test count: unchanged except new files compile

**Tests**: none
**Gate**: build

---

### T3: Public tool error type

**What**: `AgentError` plus `toToolError` mapping to the spec JSON shape and codes; no stacks.
**Where**: `packages/backend/src/agent/agent-error.ts`
**Depends on**: T2
**Reuses**: none
**Requirement**: AIGW-48, AIGW-49, AIGW-50

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [x] Failure JSON has `success: false`, `error.code`, `error.message`, `error.retryable`, `requestId`
- [x] Timeout and TeamSpeak flood map to `retryable: true`; not-found/forbidden/invalid map to false
- [x] Serialized error has no `stack` key
- [x] Gate check passes: quick vitest on `agent-error.test.ts`
- [x] Test count: at least 6 tests pass

**Tests**: unit
**Gate**: quick

---

### T4: AgentContext type

**What**: `AgentContext` and `AgentActor` types as specified; no runtime identity in tool args.
**Where**: `packages/backend/src/agent/agent-context.ts`
**Depends on**: T3
**Reuses**: Prisma and manager types
**Requirement**: AIGW-10

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [x] Type exports `actor.role` literal `"admin"` plus pool/prisma/voice/engine
- [x] Gate check passes: build (`tsc --noEmit`)
- [x] Test count: compile only

**Tests**: none
**Gate**: build

---

### T5: Document AI env vars

**What**: Add AI and Open WebUI variables to `.env.example` with comments that identity is one secret mapped per container.
**Where**: `.env.example`
**Depends on**: T4
**Reuses**: existing `.env.example` comment style
**Requirement**: AIGW-01, AIGW-44

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [x] `.env.example` lists `AI_AGENT_ENABLED=false`, gateway token, identity secret, allowlists, assistant URL, OpenRouter, Open WebUI keys, `VITE_AI_ASSISTANT_URL`
- [x] Comments state `AI_IDENTITY_JWT_SECRET` is the same value Open WebUI calls `FORWARD_USER_INFO_HEADER_JWT_SECRET`
- [x] Gate check passes: build
- [x] Test count: unchanged

**Tests**: none
**Gate**: build

---

### T6: Gateway bearer comparison

**What**: Constant-time bearer check against `AI_GATEWAY_TOKEN`; 401 `UNAUTHENTICATED` on miss; never log the token.
**Where**: `packages/backend/src/agent/agent-auth.ts`
**Depends on**: T5
**Reuses**: none
**Requirement**: AIGW-04, AIGW-05

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [x] Matching bearer returns the next identity step
- [x] Wrong or missing bearer throws/returns `UNAUTHENTICATED`
- [x] Comparison uses `crypto.timingSafeEqual` on equal-length buffers
- [x] Gate check passes: quick vitest on `agent-auth.test.ts`
- [x] Test count: at least 3 tests pass

**Tests**: unit
**Gate**: quick

---

### T7: Open WebUI identity JWT

**What**: Verify HS256 JWT: `exp`, `iss === "open-webui"`, extract `sub`/`email`/`name`/`role`; require admin; ignore unsigned identity headers.
**Where**: `packages/backend/src/agent/agent-auth.ts`
**Depends on**: T6
**Reuses**: `jsonwebtoken` as in `auth.ts` with `config.ai.identityJwtSecret`
**Requirement**: AIGW-06, AIGW-07, AIGW-09, AIGW-10

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [x] Valid admin JWT yields actor
- [x] Expired token is `UNAUTHENTICATED`
- [x] Wrong issuer is `UNAUTHENTICATED`
- [x] `role !== "admin"` is `FORBIDDEN`
- [x] Unsigned user headers do not grant admin
- [x] Gate check passes: quick vitest on `agent-auth.test.ts`
- [x] Test count: at least 8 tests pass (including T6)

**Tests**: unit
**Gate**: quick

---

### T8: Allowlists

**What**: If either allowlist is non-empty, require membership; if both set, require both.
**Where**: `packages/backend/src/agent/agent-auth.ts`
**Depends on**: T7
**Reuses**: parsed arrays from config
**Requirement**: AIGW-08

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [x] Empty allowlists accept any admin
- [x] Id allowlist miss is `FORBIDDEN`
- [x] Both lists set: id match and email miss is `FORBIDDEN`
- [x] Both lists set: both match is allowed
- [x] Gate check passes: quick vitest on `agent-auth.test.ts`
- [x] Test count: at least 12 tests pass

**Tests**: unit
**Gate**: quick

---

### T9: Log sanitization

**What**: Recursive redact of secret-named keys; truncate strings over 8000 chars.
**Where**: `packages/backend/src/agent/sanitize.ts`
**Depends on**: T8
**Reuses**: none
**Requirement**: AIGW-30, AIGW-31

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [x] Keys `apiKey`, `password`, `token`, `cookie`, `secret`, `authorization`, `certificate` (any case) become `[REDACTED]`
- [x] Nested objects are walked
- [x] Strings longer than 8000 are truncated
- [x] Gate check passes: quick vitest on `sanitize.test.ts`
- [x] Test count: at least 4 tests pass

**Tests**: unit
**Gate**: quick

---

### T10: Audit service

**What**: Persist success and failure `AiActionLog` rows with chat/message ids; never throw in a way that re-runs the tool.
**Where**: `packages/backend/src/agent/agent-audit.service.ts`
**Depends on**: T9
**Reuses**: sanitize.ts, Prisma
**Requirement**: AIGW-29, AIGW-32, AIGW-33

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [x] Success and failure rows are written with requestId, actor, toolName, risk, sanitizedArguments, status
- [x] Chat and message ids stored when provided
- [x] `recordAudit` catching Prisma errors does not throw to the executor
- [x] Gate check passes: quick vitest on `agent-audit.service.test.ts`
- [x] Test count: at least 3 tests pass

**Tests**: unit
**Gate**: quick

---

### T11: Idempotent tool executor

**What**: Look up idempotency key before mutate; return stored result; `already_in_desired_state` hook; generate requestId; measure duration.
**Where**: `packages/backend/src/agent/tool-executor.ts`
**Depends on**: T10
**Reuses**: audit service, agent-error
**Requirement**: AIGW-34, AIGW-35

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [x] Same actor+tool+idempotencyKey runs execute once
- [x] Second call returns the first outcome
- [x] `idempotencyKey` longer than 128 characters is `INVALID_INPUT`
- [x] Audit failure after execute does not call execute again
- [x] Gate check passes: quick vitest on `tool-executor.test.ts`
- [x] Test count: at least 4 tests pass

**Tests**: unit
**Gate**: quick

---

### T12: Server management service

**What**: list enabled servers + virtual server ids (no secrets), status, dashboard (keep 5s cache), recent logs with redaction.
**Where**: `packages/backend/src/services/server-management.service.ts`
**Depends on**: T11
**Reuses**: dashboard.routes.ts aggregation, logs.routes.ts `logview`
**Requirement**: AIGW-15, AIGW-16, AIGW-17, AIGW-18

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [x] list omits apiKey/sshPassword
- [x] missing/disabled config throws `SERVER_NOT_FOUND` without WebQuery
- [x] logs redact secret-like values
- [x] Gate check passes: quick vitest on `server-management.service.test.ts`
- [x] Test count: at least 4 tests pass (13 pass)

**Tests**: unit
**Gate**: quick

---

### T13: Channel management service

**What**: list/get/create/edit/move/delete plus set/remove channel permission using allowlisted fields only.
**Where**: `packages/backend/src/services/channel-management.service.ts`
**Depends on**: T12
**Reuses**: channels.routes.ts command names
**Requirement**: AIGW-20

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [x] create sends only allowlisted fields
- [x] delete calls `channeldelete`
- [x] unknown extra fields are not forwarded
- [x] Gate check passes: quick vitest on `channel-management.service.test.ts`
- [x] Test count: at least 4 tests pass (10 pass)

**Tests**: unit
**Gate**: quick

---

### T14: Client management service

**What**: list without IP, get, move, poke, kick, ban.
**Where**: `packages/backend/src/services/client-management.service.ts`
**Depends on**: T13
**Reuses**: clients.routes.ts commands
**Requirement**: AIGW-19, AIGW-21

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [x] list does not request `-ip` and strips ip fields if present
- [x] move calls `clientmove` with cid
- [x] kick/ban call the matching WebQuery commands
- [x] Gate check passes: quick vitest on `client-management.service.test.ts`
- [x] Test count: at least 4 tests pass (13 pass)

**Tests**: unit
**Gate**: quick

---

### T15: Permission and group service

**What**: find permission, overview, list server/channel groups, add/remove server group member, set/remove channel permission.
**Where**: `packages/backend/src/services/permission-management.service.ts`
**Depends on**: T14
**Reuses**: permissions.routes.ts, server-groups.routes.ts
**Requirement**: AIGW-22

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [x] find uses `permfind`
- [x] add member uses `servergroupaddclient`
- [x] already member can be detected for idempotent `already_in_desired_state`
- [x] Gate check passes: quick vitest on `permission-management.service.test.ts`
- [x] Test count: at least 4 tests pass (11 pass)

**Tests**: unit
**Gate**: quick

---

### T16: Music bot management service

**What**: list/state/start/stop/play URL (via music-ops + validateUrl)/pause/resume/skip/volume/queue/clear.
**Where**: `packages/backend/src/services/music-bot-management.service.ts`
**Depends on**: T15
**Reuses**: VoiceBotManager, `downloadAndEnqueue`, `enqueueSpotify`
**Requirement**: AIGW-23

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [x] play_media_url path calls `validateUrl` (via music-ops) and does not call download when invalid
- [x] missing bot throws `BOT_NOT_FOUND` (as `AppError` 404, mapped by the tool layer)
- [x] volume is clamped 0–100
- [x] Gate check passes: quick vitest on `music-bot-management.service.test.ts`
- [x] Test count: at least 5 tests pass (19 pass)

**Tests**: unit
**Gate**: quick

---

### T17: Bot flow management service

**What**: list/get/enable/disable via Prisma + BotEngine; no executeFlow.
**Where**: `packages/backend/src/services/bot-flow-management.service.ts`
**Depends on**: T16
**Reuses**: bots.routes.ts enable/disable
**Requirement**: AIGW-24, AIGW-25

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [x] list/get omit raw secrets; get may return metadata not identity blobs
- [x] enable/disable call engine methods
- [x] no public execute method is added
- [x] Gate check passes: quick vitest on `bot-flow-management.service.test.ts`
- [x] Test count: at least 3 tests pass (8 pass)

**Tests**: unit
**Gate**: quick

---

### T18: Thin REST wrappers for extracted ops

**What**: Point existing REST handlers for the extracted operations at the new services without changing response JSON the SPA already consumes. Include `play-url` using music-ops.
**Where**: `packages/backend/src/routes/channels.routes.ts`
**Depends on**: T17
**Reuses**: services from T12–T17
**Requirement**: AIGW-20, AIGW-23

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [x] Channel create/edit/move/delete/list/get handlers call the channel service
- [x] Client list/get/move/poke/kick/ban handlers call the client service
- [x] Dashboard and logs handlers call the server service
- [x] Music play-url uses the music service (validateUrl path)
- [x] Bots enable/disable/list/get call the flow service
- [x] Gate check passes: build (`tsc --noEmit`)
- [x] Test count: existing suite still loads (50 files, 422 tests pass)

**Tests**: none
**Gate**: build

---

### T19: Tool definition and registry shell

**What**: `AgentToolDefinition`, registry register/get/listExposed (destructive filter), reject unknown names.
**Where**: `packages/backend/src/agent/tool-registry.ts`
**Depends on**: T18
**Reuses**: AgentContext, Zod
**Requirement**: AIGW-11, AIGW-12, AIGW-26

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [x] `getTool('execute_sql')` is undefined
- [x] Destructive tools omitted from `listExposed` when flag false
- [x] Gate check passes: quick vitest on `tool-registry.test.ts`
- [x] Test count: at least 3 tests pass (6 registry + 8 error-mapping tests pass)

**Tests**: unit
**Gate**: quick

---

### T20: Server diagnostic tools

**What**: Register `list_servers`, `get_server_status`, `get_server_dashboard`, `get_recent_server_logs` with strict Zod.
**Where**: `packages/backend/src/agent/tools/server-tools.ts`
**Depends on**: T19
**Reuses**: server-management.service
**Requirement**: AIGW-18

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [x] Unknown fields rejected
- [x] list_servers success action is `servers_listed`
- [x] Empty enabled list returns `servers: []`
- [x] Gate check passes: quick vitest on `server-tools.test.ts`
- [x] Test count: at least 3 tests pass (9 pass)

**Tests**: unit
**Gate**: quick

---

### T21: Channel tools

**What**: Register list/get/create/edit/move/delete channel tools; delete marked destructive.
**Where**: `packages/backend/src/agent/tools/channel-tools.ts`
**Depends on**: T20
**Reuses**: channel-management.service
**Requirement**: AIGW-13, AIGW-20, AIGW-27

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [x] create_channel returns `action: "channel_created"`
- [x] extra fields on create are `INVALID_INPUT`
- [x] delete_channel risk is `destructive`
- [x] Gate check passes: quick vitest on `channel-tools.test.ts`
- [x] Test count: at least 3 tests pass (10 pass)

**Tests**: unit
**Gate**: quick

---

### T22: Client tools

**What**: Register list/get/move/poke/kick/ban; kick/ban destructive; list omits IP.
**Where**: `packages/backend/src/agent/tools/client-tools.ts`
**Depends on**: T21
**Reuses**: client-management.service
**Requirement**: AIGW-19, AIGW-21

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [x] list_clients output has no ip fields
- [x] move_client returns `action: "client_moved"`
- [x] kick/ban risk is `destructive`
- [x] Gate check passes: quick vitest on `client-tools.test.ts`
- [x] Test count: at least 3 tests pass (9 pass)

**Tests**: unit
**Gate**: quick

---

### T23: Permission and group tools

**What**: Register find/overview/list groups/add/remove member/set/remove channel perm.
**Where**: `packages/backend/src/agent/tools/permission-tools.ts`
**Depends on**: T22
**Reuses**: permission-management.service
**Requirement**: AIGW-22

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [x] set_channel_permission returns `action: "channel_permission_set"`
- [x] remove_* tools are destructive
- [x] Gate check passes: quick vitest on `permission-tools.test.ts`
- [x] Test count: at least 3 tests pass (12 pass)

**Tests**: unit
**Gate**: quick

---

### T24: Music bot tools

**What**: Register list/state/start/stop/play/pause/resume/skip/volume/queue/clear; stop and clear destructive.
**Where**: `packages/backend/src/agent/tools/music-tools.ts`
**Depends on**: T23
**Reuses**: music-bot-management.service
**Requirement**: AIGW-23

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [x] play_media_url returns `media_queued` or `media_playing`
- [x] invalid URL is `INVALID_INPUT` without download
- [x] stop/clear are destructive
- [x] Gate check passes: quick vitest on `music-tools.test.ts`
- [x] Test count: at least 4 tests pass (13 pass)

**Tests**: unit
**Gate**: quick

---

### T25: Flow tools, destructive gate, no generic names

**What**: Register list/get/enable/disable; never register `run_bot_flow` or generic command tools; wire all tools into the registry module used by adapters.
**Where**: `packages/backend/src/agent/tools/flow-tools.ts`
**Depends on**: T24
**Reuses**: bot-flow-management.service, tool-registry
**Requirement**: AIGW-12, AIGW-25, AIGW-26, AIGW-27, AIGW-28

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [x] Exposed names do not include `run_bot_flow` or the five forbidden generic names
- [x] Flag off: eight destructive names not in `listExposed`; calling them yields `TOOL_NOT_FOUND` without service calls
- [x] disable_bot_flow is destructive
- [x] Gate check passes: quick vitest on `flow-tools.test.ts` plus registry listing test
- [x] Test count: at least 4 tests pass (5 flow + 5 registry tests pass; full suite 499)

**Tests**: unit
**Gate**: quick

---

### T26: OpenAPI document builder

**What**: Build OpenAPI 3.x from exposed tools only; operationId equals tool name; bearer security scheme.
**Where**: `packages/backend/src/agent/openapi/openapi-document.ts`
**Depends on**: T25
**Reuses**: Zod JSON Schema conversion
**Requirement**: AIGW-36, AIGW-38

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [x] Document paths are only agent tools
- [x] No `/api/auth` or settings paths
- [x] Each operationId equals the tool name
- [x] Gate check passes: quick vitest on `openapi-document.test.ts`
- [x] Test count: at least 3 tests pass (6 pass)

**Tests**: unit
**Gate**: quick

---

### T27: OpenAPI HTTP routes

**What**: Mount GET openapi.json (bearer) and POST tools/:toolName (bearer + user JWT) before session auth; 404 when AI disabled; rate limit 60/min.
**Where**: `packages/backend/src/agent/openapi/openapi.routes.ts`
**Depends on**: T26
**Reuses**: agent-auth, tool-executor, app.ts mount point
**Requirement**: AIGW-01, AIGW-04, AIGW-36, AIGW-37, AIGW-38

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [x] Disabled flag: GET `/api/agent/openapi.json` is 404
- [x] Enabled without bearer: 401
- [x] Enabled with bearer+JWT executes a read tool
- [x] Gate check passes: quick vitest on `openapi.routes.test.ts`
- [x] Test count: at least 4 tests pass (9 pass)

**Tests**: unit
**Gate**: quick

---

### T28: MCP server factory

**What**: Stateless MCP server registering the same exposed tools via official SDK v2 pinned 2.0.0.
**Where**: `packages/backend/src/agent/mcp/mcp-server.ts`
**Depends on**: T27
**Reuses**: tool-registry, tool-executor
**Requirement**: AIGW-14, AIGW-39

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [x] Package.json pins `@modelcontextprotocol/server`, `express`, and `node` at 2.0.0
- [x] Factory registers the same names as `listExposed`
- [x] Gate check passes: quick vitest on `mcp-server.test.ts`
- [x] Test count: at least 2 tests pass (5 pass)

**Tests**: unit
**Gate**: quick

---

### T29: MCP HTTP routes and Origin

**What**: GET/POST `/api/agent/mcp`; auth first; Origin allowlist when header present; absent Origin allowed.
**Where**: `packages/backend/src/agent/mcp/mcp.routes.ts`
**Depends on**: T28
**Reuses**: agent-auth
**Requirement**: AIGW-40

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [x] Present disallowed Origin is HTTP 403
- [x] Absent Origin proceeds to auth
- [x] Gate check passes: quick vitest on `mcp.routes.test.ts`
- [x] Test count: at least 3 tests pass (5 pass)

**Tests**: unit
**Gate**: quick

---

### T30: OpenAPI and MCP equivalence

**What**: One test file that runs the same tool through both adapters and asserts identical `success`/`action`/`error.code`.
**Where**: `packages/backend/src/agent/adapter-equivalence.test.ts`
**Depends on**: T29
**Reuses**: registry execute
**Requirement**: AIGW-14

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [x] `list_servers` through both adapters matches action `servers_listed`
- [x] Invalid extra field through both adapters matches `INVALID_INPUT`
- [x] Gate check passes: quick vitest on `adapter-equivalence.test.ts`
- [x] Test count: at least 2 tests pass (3 pass)

**Tests**: unit
**Gate**: quick

---

### T31: Nginx blocks public MCP

**What**: Frontend nginx denies `/api/agent/mcp` with 403 before the general `/api` proxy.
**Where**: `Dockerfile.frontend`
**Depends on**: T30
**Reuses**: existing nginx printf block
**Requirement**: AIGW-41

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [x] `location ^~ /api/agent/mcp` returns 403
- [x] It appears before `location /api`
- [x] Gate check passes: build (`tsc --noEmit`, lint, 64 files / 527 tests pass)
- [x] Test count: unchanged

**Tests**: none
**Gate**: build

---

### T32: Open WebUI Compose overlay

**What**: `docker-compose.ai.yml` overlay with pinned v0.11.3, volume, healthcheck, restart, internal network, env mapping, backend AI env passthrough.
**Where**: `docker-compose.ai.yml`
**Depends on**: T31
**Reuses**: AD-001 sidecar overlay style
**Requirement**: AIGW-42, AIGW-43, AIGW-44

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [x] Image is `ghcr.io/open-webui/open-webui:v0.11.3`
- [x] No `latest`/`main`/`dev` tags
- [x] Secrets are `${VAR}` interpolations
- [x] Gate check passes: build (`tsc --noEmit`, `docker compose config -q` on the merged overlay)
- [x] Test count: unchanged

**Tests**: none
**Gate**: build

---

### T33: Assistant URL on /auth/me

**What**: Admins receive `aiAssistantUrl` from `AI_ASSISTANT_PUBLIC_URL` on GET `/api/auth/me`; viewers omit or null.
**Where**: `packages/backend/src/routes/auth.routes.ts`
**Depends on**: T32
**Reuses**: existing `/me` handler
**Requirement**: AIGW-45, AIGW-46

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [x] Admin response includes `aiAssistantUrl` string or null
- [x] Viewer response does not expose the URL (null or omitted)
- [x] Gate check passes: quick vitest on `auth-me-ai.test.ts` (5 tests pass)
- [x] Test count: at least 2 tests pass

**Tests**: unit
**Gate**: quick

---

### T34: Sidebar AI Assistant item

**What**: Admin-only nav link; hide when URL empty; new tab noopener; i18n fragment for five languages.
**Where**: `packages/frontend/src/components/layout/Sidebar.tsx`
**Depends on**: T33
**Reuses**: `adminOnly` filter, merge-i18n
**Requirement**: AIGW-45, AIGW-46, AIGW-47

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [x] Item is `adminOnly` and uses `target="_blank"` `rel="noopener noreferrer"`
- [x] No iframe
- [x] `node packages/frontend/scripts/merge-i18n.mjs` exits 0
- [x] Gate check passes: build (frontend `tsc --noEmit`, backend `tsc --noEmit`, `pnpm lint`)
- [x] Test count: i18n merge 0

**Tests**: none
**Gate**: build

---

### T35: Architecture and setup docs

**What**: Write `docs/ai/architecture.md`, `openwebui-setup.md`, `security.md`, `tool-catalog.md`.
**Where**: `docs/ai/architecture.md`
**Depends on**: T34
**Reuses**: design.md decisions
**Requirement**: AIGW-42

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [ ] Architecture diagram and env vars documented
- [ ] Setup lists the 10 Open WebUI steps including preset `TS6 Server Manager`
- [ ] Security documents dual auth, destructive flag, nginx MCP deny, no generic tools
- [ ] Catalog lists all tools with risk and notes `run_bot_flow` disabled
- [ ] Gate check passes: build
- [ ] Test count: unchanged

**Tests**: none
**Gate**: build

---

### T36: Open WebUI skill file

**What**: Importable skill teaching search-before-act, no id guessing, no secret leakage, destructive approval.
**Where**: `docs/ai/skills/ts6-server-manager.md`
**Depends on**: T35
**Reuses**: tool catalog names
**Requirement**: AIGW-18

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [ ] File exists with examples for channels, clients, groups, permissions, music
- [ ] Instructs not to invent WebQuery commands
- [ ] Gate check passes: build
- [ ] Test count: unchanged

**Tests**: none
**Gate**: build

---

### T37: README short AI section

**What**: Add a short AI Assistant section to the main README pointing at `docs/ai/` and the overlay compose command.
**Where**: `README.md`
**Depends on**: T36
**Reuses**: README Features / Docker sections
**Requirement**: AIGW-42

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [ ] README mentions optional Open WebUI overlay and that the SPA is unchanged without the flag
- [ ] Links to `docs/ai/openwebui-setup.md`
- [ ] Gate check passes: build
- [ ] Test count: unchanged

**Tests**: none
**Gate**: build

---

## Phase Execution Map

```
T1 -> T2 -> T3 -> T4 -> T5 -> T6 -> T7 -> T8 -> T9 -> T10 -> T11 -> T12 -> T13 -> T14 -> T15 -> T16 -> T17 -> T18 -> T19 -> T20 -> T21 -> T22 -> T23 -> T24 -> T25 -> T26 -> T27 -> T28 -> T29 -> T30 -> T31 -> T32 -> T33 -> T34 -> T35 -> T36 -> T37
```

Execution is strictly sequential - there is no intra-phase parallelism.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 config | 1 module | Granular |
| T2 prisma | schema | Granular |
| T3 errors | 1 module | Granular |
| T4 context type | 1 file | Granular |
| T5 env example | 1 file | Granular |
| T6–T8 auth | 1 module iterative | Cohesive |
| T9 sanitize | 1 module | Granular |
| T10 audit | 1 module | Granular |
| T11 executor | 1 module | Granular |
| T12–T17 services | 1 file each | Granular |
| T18 REST wrappers | several route files | Cohesive (one extraction closeout) |
| T19–T25 tools | 1 file each | Granular |
| T26–T31 adapters | 1 file each | Granular |
| T32–T37 product | 1 file each | Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | (root) | Match |
| T2 | T1 | T1 -> T2 | Match |
| T3 | T2 | T2 -> T3 | Match |
| T4 | T3 | T3 -> T4 | Match |
| T5 | T4 | T4 -> T5 | Match |
| T6 | T5 | T5 -> T6 | Match |
| T7 | T6 | T6 -> T7 | Match |
| T8 | T7 | T7 -> T8 | Match |
| T9 | T8 | T8 -> T9 | Match |
| T10 | T9 | T9 -> T10 | Match |
| T11 | T10 | T10 -> T11 | Match |
| T12 | T11 | T11 -> T12 | Match |
| T13 | T12 | T12 -> T13 | Match |
| T14 | T13 | T13 -> T14 | Match |
| T15 | T14 | T14 -> T15 | Match |
| T16 | T15 | T15 -> T16 | Match |
| T17 | T16 | T16 -> T17 | Match |
| T18 | T17 | T17 -> T18 | Match |
| T19 | T18 | T18 -> T19 | Match |
| T20 | T19 | T19 -> T20 | Match |
| T21 | T20 | T20 -> T21 | Match |
| T22 | T21 | T21 -> T22 | Match |
| T23 | T22 | T22 -> T23 | Match |
| T24 | T23 | T23 -> T24 | Match |
| T25 | T24 | T24 -> T25 | Match |
| T26 | T25 | T25 -> T26 | Match |
| T27 | T26 | T26 -> T27 | Match |
| T28 | T27 | T27 -> T28 | Match |
| T29 | T28 | T28 -> T29 | Match |
| T30 | T29 | T29 -> T30 | Match |
| T31 | T30 | T30 -> T31 | Match |
| T32 | T31 | T31 -> T32 | Match |
| T33 | T32 | T32 -> T33 | Match |
| T34 | T33 | T33 -> T34 | Match |
| T35 | T34 | T34 -> T35 | Match |
| T36 | T35 | T35 -> T36 | Match |
| T37 | T36 | T36 -> T37 | Match |

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Domain config | unit | unit | OK |
| T2 | Prisma schema | none | none | OK |
| T3 | Domain errors | unit | unit | OK |
| T4 | Types | none | none | OK |
| T5 | env example | none | none | OK |
| T6–T8 | Domain auth | unit | unit | OK |
| T9 | Domain sanitize | unit | unit | OK |
| T10 | Domain audit | unit | unit | OK |
| T11 | Domain executor | unit | unit | OK |
| T12–T17 | Domain services | unit | unit | OK |
| T18 | REST wrappers | none (existing SPA contract; covered by service tests) | none | OK |
| T19–T25 | Domain tools | unit | unit | OK |
| T26–T30 | Gateway adapters | unit | unit | OK |
| T31–T32 | Docker/nginx | none | none | OK |
| T33 | Route /me | unit | unit | OK |
| T34 | Frontend UI | none | none | OK |
| T35–T37 | Docs | none | none | OK |
