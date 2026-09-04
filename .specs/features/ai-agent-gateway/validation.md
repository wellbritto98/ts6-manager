# AI Agent Gateway Validation

**Date**: 2026-09-04
**Spec**: `.specs/features/ai-agent-gateway/spec.md`
**Diff range**: `6e9d2d8..HEAD` (implementation from `c7ab0ea`; HEAD `327e4c1`)
**Verifier**: independent sub-agent (author ≠ verifier), iteration 2

## Validation: PASS

Independent re-derivation against spec ACs. Iteration-1 gaps (forbidden-name tautology, sidebar ACs, secret logging, constant-time compare) were re-checked at file:line. Discrimination sensor 5/5 killed in scratch worktree `/tmp/aigw-sensor-reverify`. Real-tree porcelain matched the pre-sensor baseline after cleanup.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 | ✅ Done | `config-ai.test.ts` 7 tests |
| T2 | ✅ Done | Prisma `AiActionLog` + SQL; Tests: none |
| T3 | ✅ Done | `agent-error.test.ts` (`it.each` over 13 codes) |
| T4 | ✅ Done | Types only; Tests: none |
| T5 | ✅ Done | `.env.example`; Tests: none |
| T6–T8 | ✅ Done | `agent-auth.test.ts` 13 tests (incl. T41 spy) |
| T9 | ✅ Done | `sanitize.test.ts` 5 tests |
| T10 | ✅ Done | `agent-audit.service.test.ts` 3 tests |
| T11 | ✅ Done | `tool-executor.test.ts` 5 tests |
| T12–T17 | ✅ Done | Service `*.test.ts` plus tool tests |
| T18 | ✅ Done | REST wrappers; Tests: none |
| T19–T25 | ✅ Done | Registry + catalog tools |
| T26–T30 | ✅ Done | OpenAPI, MCP, equivalence |
| T31 | ✅ Done | Nginx deny; Tests: none (documentary) |
| T32 | ✅ Done | Compose overlay; Tests: none (documentary) |
| T33 | ✅ Done | `auth-me-ai.test.ts` |
| T34 | ✅ Done | Sidebar wiring of helper |
| T35–T37 | ✅ Done | Docs/README/skill; Tests: none |
| T38 | ✅ Done | Literal `FORBIDDEN_TOOL_NAMES` freeze |
| T39 | ✅ Done | `ai-assistant-nav.test.ts` 5 tests |
| T40 | ✅ Done | `config-ai.test.ts` console/exit spies |
| T41 | ✅ Done | `timingSafeEqual` 32-byte digest spy |

All T1–T41 checkboxes in `tasks.md` are `[x]`.

---

## Spec-Anchored Acceptance Criteria

### P1: AI stays off until enabled

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| ------------------------- | -------------------- | ----------------------- | ------ |
| WHERE `AI_AGENT_ENABLED` is unset or not `true` the system SHALL leave `/api/agent` unusable (HTTP 404 for `/api/agent/*`) and SHALL start without requiring `AI_GATEWAY_TOKEN` or `AI_IDENTITY_JWT_SECRET` | HTTP 404; secrets optional | `packages/backend/src/agent/openapi/openapi.routes.test.ts:53` - `expect((await request(app).get('/api/agent/openapi.json')).status).toBe(404)`; `:54` POST also `404`; `packages/backend/src/config-ai.test.ts:17` - `expect(config).toMatchObject({ enabled: false, gatewayToken: undefined, identityJwtSecret: undefined })`; `:26` - `AI_AGENT_ENABLED: 'false'` → `enabled).toBe(false)` | ✅ PASS |
| WHEN `AI_AGENT_ENABLED` is `true` AND `AI_GATEWAY_TOKEN` or `AI_IDENTITY_JWT_SECRET` is missing, shorter than 32 characters, or equal to `JWT_SECRET` or `ENCRYPTION_KEY` THEN the system SHALL refuse to start | throw / refuse boot | `packages/backend/src/config-ai.test.ts:30` - short token `toThrow('AI_GATEWAY_TOKEN')`; `:39` - `AI_GATEWAY_TOKEN: BASE_ENV.JWT_SECRET` `toThrow('must differ')`; `:46` token equals identity secret `toThrow('must differ')`. Residual: missing secret and equality to `ENCRYPTION_KEY` share `requireAiSecret` and are not separate cases | ✅ PASS |
| The system SHALL NOT log `AI_GATEWAY_TOKEN` or `AI_IDENTITY_JWT_SECRET` values | secret values absent from logs | `packages/backend/src/config-ai.test.ts:79` spies `console.error`/`log`/`info`/`warn` and `process.exit`; `:99` - `expect(exit).toHaveBeenCalledWith(1)`; `:101` - `expect(captured).not.toContain(reusedSecret)`; `:117` - thrown message `not.toContain(reusedSecret)` | ✅ PASS |

### P1: Dual authentication on every execution

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| ------------------------- | -------------------- | ----------------------- | ------ |
| WHEN a client calls `POST /api/agent/tools/:toolName` without `Authorization: Bearer` matching `AI_GATEWAY_TOKEN` THEN the system SHALL respond HTTP 401 with `success` false and error code `UNAUTHENTICATED` | HTTP 401; `success` false; `UNAUTHENTICATED` | `packages/backend/src/agent/openapi/openapi.routes.test.ts:62` - `expect(response.status).toBe(401)`; `:63` - `expect(response.body.success).toBe(false)`; `:64` - `expect(response.body.error.code).toBe('UNAUTHENTICATED')`; wrong bearer `:72–73` same code | ✅ PASS |
| WHEN the bearer matches THEN the system SHALL compare it with a constant-time equality check | `timingSafeEqual` on equal-length digests | `packages/backend/src/agent/agent-auth.test.ts:6–13` mocks `node:crypto.timingSafeEqual`; `:39` - `expect(crypto.timingSafeEqual).toHaveBeenCalled()`; `:43–44` - `expect(presented).toHaveLength(32)` and `expect(expected).toHaveLength(32)` | ✅ PASS |
| WHEN the Open WebUI user JWT is missing, has an invalid HS256 signature, is expired, or has `iss` other than `open-webui` THEN the system SHALL respond HTTP 401 with error code `UNAUTHENTICATED` | HTTP 401 `UNAUTHENTICATED` | missing: `openapi.routes.test.ts:107` - `status).toBe(401)`; `:108` - `error.code).toBe('UNAUTHENTICATED')`; expired: `agent-auth.test.ts:78` - `toThrow({ code: 'UNAUTHENTICATED' })`; wrong iss: `:90` same. Residual: tampered/wrong-secret signature shares the `jwt.verify` catch with expired | ✅ PASS |
| IF the JWT `role` is not `admin` THEN the system SHALL respond HTTP 403 with error code `FORBIDDEN` | HTTP 403 `FORBIDDEN` | `agent-auth.test.ts:102` - `role: 'user'` `toThrow({ code: 'FORBIDDEN' })`; HTTP: `openapi.routes.test.ts:118` - `status).toBe(403)`; `:119` - `error.code).toBe('FORBIDDEN')` | ✅ PASS |
| WHERE at least one allowlist is configured AND the caller is not in every configured allowlist THEN the system SHALL respond HTTP 403 with error code `FORBIDDEN` | `FORBIDDEN` (intersection) | `agent-auth.test.ts:151` - id allowlist miss `toThrow({ code: 'FORBIDDEN' })`; both lists, email miss `:160` same | ✅ PASS |
| WHILE identity JWT validation is configured the system SHALL ignore unsigned `X-OpenWebUI-User-Name`, `X-OpenWebUI-User-Email`, and `X-OpenWebUI-User-Id` headers for authorization | unsigned headers do not grant access | `agent-auth.test.ts:108` - forged unsigned headers without JWT `toThrow({ code: 'UNAUTHENTICATED' })` | ✅ PASS |
| WHEN a tool executes THEN the system SHALL take actor identity only from the verified JWT (`sub`, `email`, `name`, `role`) and SHALL reject tool arguments that include `role` or actor identity fields via `.strict()` schemas | actor from JWT; extra `role` → `INVALID_INPUT` | actor: `agent-auth.test.ts:63` - `expect(actor).toEqual({ externalUserId: 'openwebui-admin', email: 'admin@example.com', name: 'Admin User', role: 'admin' })`; extra `role`: `channel-tools.test.ts:78` - `rejects.toMatchObject({ code: 'INVALID_INPUT' })`; HTTP: `openapi.routes.test.ts:141` - `error.code).toBe('INVALID_INPUT')` | ✅ PASS |

### P1: Single tool registry without generic commands

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| ------------------------- | -------------------- | ----------------------- | ------ |
| The system SHALL expose tools only from one in-process registry whose definitions include `name`, `description`, `inputSchema`, `risk`, and `execute` | single registry; those fields | `packages/backend/src/agent/create-registry.test.ts:67` - unique names; `:68` - `expect(names).toEqual(expect.arrayContaining(['list_servers', ...]))`; `tool-registry.test.ts` registers via `defineTool` with those fields | ✅ PASS |
| IF a tool name matching `execute_webquery`, `execute_command`, `run_teamspeak_command`, `raw_api_request`, or `execute_sql` is requested THEN the system SHALL NOT execute it and SHALL return error code `TOOL_NOT_FOUND` | `TOOL_NOT_FOUND`; no execute; frozen spec list | literal freeze: `tool-registry.test.ts:27` - `expect([...FORBIDDEN_TOOL_NAMES]).toEqual(['execute_webquery', 'execute_command', 'run_teamspeak_command', 'raw_api_request', 'execute_sql', 'run_bot_flow'])`; register refusal uses the same literal strings `:38–46`; HTTP: `openapi.routes.test.ts:129` - POST `execute_sql` `status).toBe(404)`; `:130` - `error.code).toBe('TOOL_NOT_FOUND')`; MCP listing: `mcp-server.test.ts:30` - `expect(names).not.toContain('execute_sql')` | ✅ PASS |
| WHEN tool input contains unknown fields THEN the system SHALL reject the call with error code `INVALID_INPUT` | `INVALID_INPUT` | `server-tools.test.ts:36` - `{ role: 'admin' }` `rejects.toMatchObject({ code: 'INVALID_INPUT' })`; `openapi.routes.test.ts:141` - `error.code).toBe('INVALID_INPUT')` | ✅ PASS |
| WHEN OpenAPI and MCP invoke the same tool name with the same valid input THEN the system SHALL produce the same success/error code and the same action identifier | identical `success` / `action` / error code | `adapter-equivalence.test.ts:88` - `expect(openApi).toEqual({ success: true, action: 'servers_listed', errorCode: undefined })`; `:89` - `expect(mcp).toEqual(openApi)`; invalid extra field `:96–97` both `INVALID_INPUT` | ✅ PASS |

### P1: Explicit server targeting

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| ------------------------- | -------------------- | ----------------------- | ------ |
| WHEN a server-scoped tool runs THEN the system SHALL require `serverConfigId` as a positive integer and SHALL reject a missing or non-integer id with `INVALID_INPUT` | `INVALID_INPUT` | missing: `server-tools.test.ts:59` - `rejects.toMatchObject({ code: 'INVALID_INPUT' })`; non-integer `:67` same | ✅ PASS |
| IF `serverConfigId` does not exist or `enabled` is false THEN the system SHALL return error code `SERVER_NOT_FOUND` and SHALL NOT call WebQuery | `SERVER_NOT_FOUND`; zero WebQuery | disabled: `server-tools.test.ts:77` - `code: 'SERVER_NOT_FOUND'`; `:78` - `expect(execute).not.toHaveBeenCalled()`; missing config: `server-management.service.test.ts:117` - `code: 'SERVER_NOT_FOUND'`; `:120` - `execute` not called | ✅ PASS |
| WHEN the operation needs a virtual server THEN the system SHALL require `virtualServerId` as a positive integer and SHALL NOT default it to 1 or to the first listed server | `INVALID_INPUT`; no WebQuery | `server-management.service.test.ts:138` - `virtualServerId` `undefined` `toEqual({ code: 'INVALID_INPUT' })`; `:141` - `expect(execute).not.toHaveBeenCalled()` | ✅ PASS |

### P1: Catalog operations for servers, channels, clients, groups, music, flows

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| ------------------------- | -------------------- | ----------------------- | ------ |
| WHEN `list_servers` succeeds THEN the system SHALL return enabled server configs and their virtual server ids and SHALL omit `apiKey` and `sshPassword` | enabled configs + vs ids; no credentials | `server-tools.test.ts:16` - `toEqual({ success: true, action: 'servers_listed', servers: [{ ...FAKE_SERVER, virtualServers: [1, 2] }] })`; `:21` - `JSON.stringify(result)).not.toContain('apiKey')`; `:22` - `not.toContain('sshPassword')` | ✅ PASS |
| WHEN `list_clients` succeeds THEN the system SHALL omit client IP addresses | no IP in payload | `client-tools.test.ts:22` - clients `[{ clid: '3', client_nickname: 'Ana' }]`; `:27` - `not.toContain('203.0.113.7')`; `:36` - `Object.keys(flags)).not.toContain('-ip')` | ✅ PASS |
| WHEN `create_channel` succeeds THEN the system SHALL create a channel using only the allowlisted fields `channel_name`, `channel_flag_permanent`, `channel_flag_semi_permanent`, `channel_topic`, `channel_password`, `cpid` and SHALL return `{ success: true, action: "channel_created" }` plus channel id and name | allowlisted fields only; `channel_created` + id/name | `channel-tools.test.ts:49` - `toEqual({ success: true, action: 'channel_created', channelId: 12, channelName: 'Support' })`; `:55` - `channelcreate` args only `channel_name`, `channel_flag_permanent`, `cpid`; extra field `:69` - `INVALID_INPUT` and `:70` execute not called | ✅ PASS |
| WHEN `move_client` succeeds THEN the system SHALL move the named client id to the named channel id on the given virtual server and SHALL return `{ success: true, action: "client_moved" }` | `client_moved`; `clientmove` | `client-tools.test.ts:70` - `toEqual({ success: true, action: 'client_moved', clid: 3, cid: 9 })`; `:71` - `toHaveBeenCalledWith(1, 'clientmove', { clid: '3', cid: '9', cpw: undefined })` | ✅ PASS |
| WHEN `set_channel_permission` succeeds THEN the system SHALL set only the named permission on the named channel and SHALL return `{ success: true, action: "channel_permission_set" }` | `channel_permission_set`; one perm | `permission-tools.test.ts:117` - `toMatchObject({ success: true, action: 'channel_permission_set', cid: 4 })`; `:118` - `channeladdperm` with `permsid` + `permvalue`; extra `permnegated` `:134` - `INVALID_INPUT` | ✅ PASS |
| WHEN `play_media_url` is given an http(s) URL THEN the system SHALL validate it with `validateUrl` before download and SHALL return `{ success: true, action: "media_queued" }` or `{ success: true, action: "media_playing" }` | `media_queued` or `media_playing`; invalid URL not downloaded | queued: `music-tools.test.ts:134` - `toMatchObject({ success: true, action: 'media_queued', botId: 1 })`; playing `:145` - `action: 'media_playing'`; blocked URL `:154` - `INVALID_INPUT`; `:155` - `downloadAndEnqueue` not called. Residual: `validateUrl` is not spied by name (SSRF block is the validator outcome) | ✅ PASS |
| WHEN `list_bot_flows` succeeds THEN the system SHALL return id, name, enabled, serverConfigId, and virtualServerId without flow graph payloads large enough to include secrets | metadata fields; no graph secrets | `flow-tools.test.ts:45` - payload includes `id`, `name`, `enabled`, `serverConfigId`, `virtualServerId`; `:60` - `JSON.stringify(result)).not.toContain('super-secret-value')` | ✅ PASS |
| The system SHALL NOT expose `run_bot_flow` in OpenAPI or MCP | absent from listings | `tool-registry.test.ts:27` literal list includes `'run_bot_flow'`; `:54` - `getTool('run_bot_flow')).toBeUndefined()`; `create-registry.test.ts:28` - `expect(names).not.toContain('run_bot_flow')`; `mcp-server.test.ts:31` - MCP names `not.toContain('run_bot_flow')` | ✅ PASS |

### P1: Destructive tools stay dark until explicitly enabled

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| ------------------------- | -------------------- | ----------------------- | ------ |
| WHERE `AI_DESTRUCTIVE_TOOLS_ENABLED` is not `true` the system SHALL omit `delete_channel`, `kick_client`, `ban_client`, `remove_client_from_server_group`, `remove_channel_permission`, `stop_music_bot`, `clear_music_queue`, and `disable_bot_flow` from OpenAPI and MCP listings | eight names absent | `create-registry.test.ts:34` - `for (const destructive of DESTRUCTIVE_TOOL_NAMES) expect(names).not.toContain(destructive)` with flag false; `tool-registry.test.ts:61` - `listExposed()` equals `['list_channels']` when `delete_channel` registered but flag false | ✅ PASS |
| WHEN those names are called while the flag is false THEN the system SHALL return `TOOL_NOT_FOUND` and SHALL NOT mutate TeamSpeak or bot state | `TOOL_NOT_FOUND`; no mutate | `create-registry.test.ts:54` - `getTool('delete_channel')).toBeUndefined()`; `:55` - `executeTool` `rejects.toMatchObject({ code: 'TOOL_NOT_FOUND' })`; `:61` - `expect(execute).not.toHaveBeenCalled()` | ✅ PASS |
| WHEN `AI_DESTRUCTIVE_TOOLS_ENABLED` is `true` THEN the system SHALL expose those eight tools with `risk` equal to `destructive` | eight tools; `risk === 'destructive'` | `create-registry.test.ts:45` - `expect(registry.getTool(destructive)?.risk).toBe('destructive')` for each of `DESTRUCTIVE_TOOL_NAMES` | ✅ PASS |

### P1: Audit without secrets

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| ------------------------- | -------------------- | ----------------------- | ------ |
| WHEN a tool finishes (success or failure) THEN the system SHALL write an `AiActionLog` row containing `requestId`, `externalUserId`, `toolName`, `risk`, `sanitizedArguments`, `status`, and `createdAt` | those fields persisted | success: `agent-audit.service.test.ts:38` - `toHaveBeenCalledWith({ data: expect.objectContaining({ requestId, externalUserId, toolName, risk, sanitizedArguments, status: 'success' }) })`; failure `:63` - `status: 'failure'`. Residual: `createdAt` is Prisma `@default(now())` and is not asserted on the `create` call | ✅ PASS |
| IF arguments or results contain keys named `apiKey`, `password`, `token`, `cookie`, `secret`, `authorization`, or `certificate` (case-insensitive) THEN the system SHALL replace those values with `[REDACTED]` before persistence | `[REDACTED]`; original absent | `sanitize.test.ts:16` - every listed key `[REDACTED]`; audit: `agent-audit.service.test.ts:46` - `sanitizedArguments: JSON.stringify({ token: '[REDACTED]', serverConfigId: 1 })` | ✅ PASS |
| WHEN a sanitized argument or result string exceeds 8000 characters THEN the system SHALL truncate it before persistence | length 8000 | `sanitize.test.ts:41` - `expect(sanitizeForLog('x'.repeat(8001))).toHaveLength(8000)` | ✅ PASS |
| IF the audit write fails after a mutation has already run THEN the system SHALL NOT retry the mutation | execute count stays 1 | `tool-executor.test.ts:99` - `expect(execute).toHaveBeenCalledTimes(1)` after `create` rejects | ✅ PASS |
| The system SHALL store `X-OpenWebUI-Chat-Id` and `X-OpenWebUI-Message-Id` on the log when those headers are present | `chatId` / `messageId` stored | `agent-audit.service.test.ts:67` - `chatId: 'chat-1'`; `:68` - `messageId: 'message-1'` | ✅ PASS |

### P1: Idempotent retries

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| ------------------------- | -------------------- | ----------------------- | ------ |
| WHEN a mutating tool is called twice with the same actor, tool name, and `idempotencyKey` THEN the system SHALL run the mutation at most once and SHALL return the original outcome on the second call | execute once; same outcome | `tool-executor.test.ts:40` - `expect(execute).toHaveBeenCalledTimes(1)`; `:41` - `expect(second).toEqual(first)` | ✅ PASS |
| WHEN a mutating tool finds the target already in the requested state THEN the system SHALL return `{ success: true, action: "already_in_desired_state" }` without repeating the TeamSpeak command | `already_in_desired_state`; no add-client command | `permission-tools.test.ts:101` - `toMatchObject({ success: true, action: 'already_in_desired_state' })`; `:102` - `expect(execute).not.toHaveBeenCalledWith(1, 'servergroupaddclient', expect.anything())` | ✅ PASS |

### P1: OpenAPI adapter

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| ------------------------- | -------------------- | ----------------------- | ------ |
| WHEN `GET /api/agent/openapi.json` is called with a valid bearer THEN the system SHALL return OpenAPI 3.x whose paths are only agent tools, each with a stable `operationId` equal to the tool name | OpenAPI 3.x; agent paths only; `operationId === name` | `openapi.routes.test.ts:81` - `status).toBe(200)`; `:82` - every path starts with `/api/agent/tools/`; `openapi-document.test.ts:15` - path keys equal exposed tools; `:32` - `expect(operation?.operationId).toBe(tool.name)`. Residual: document `openapi` version string is not asserted | ✅ PASS |
| IF that GET is called without a valid bearer THEN the system SHALL respond HTTP 401 | HTTP 401 | `openapi.routes.test.ts:62` - `expect(response.status).toBe(401)` | ✅ PASS |
| WHEN `POST /api/agent/tools/:toolName` runs THEN the system SHALL require bearer plus user JWT and SHALL NOT include `/api/auth` or settings paths in the OpenAPI document | dual auth; no `/api/auth` or settings | dual auth success: `openapi.routes.test.ts:95` - `status).toBe(200)`; missing JWT `:107` - `401`; document: `openapi-document.test.ts:23` - `paths).not.toContain('/api/auth')`; `:25` - settings filter `toEqual([])` | ✅ PASS |

### P1: MCP Streamable HTTP adapter

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| ------------------------- | -------------------- | ----------------------- | ------ |
| WHEN MCP is enabled the system SHALL serve Streamable HTTP on `/api/agent/mcp` using `@modelcontextprotocol/server` 2.0.0 with a per-request stateless transport | SDK 2.0.0; stateless; endpoint served | pin (documentary): `packages/backend/package.json:21` - `"@modelcontextprotocol/server": "2.0.0"`; transport: `mcp.routes.test.ts:105` - `status).toBe(200)`; `:106` - `toContain('ts6-manager')`; `:107` - `headers['mcp-session-id']).toBeUndefined()`. Residual: `GET /mcp` is registered but tests only exercise POST | ✅ PASS |
| IF an `Origin` header is present and is not in the allowlist (backend origin plus `http://open-webui:8080`) THEN the system SHALL reject the MCP request with HTTP 403 | HTTP 403 | `mcp.routes.test.ts:53` - `status).toBe(403)`; `:54` - `error.code).toBe('FORBIDDEN')` | ✅ PASS |
| WHEN the public frontend nginx receives `/api/agent/mcp` THEN it SHALL respond HTTP 403 without proxying to the backend | 403 deny before `/api` proxy | documentary: `Dockerfile.frontend:30` - `location ^~ /api/agent/mcp`; `:31` - `return 403;`; `:34` - `location /api` follows | ✅ PASS |

### P1: Optional Open WebUI overlay

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| ------------------------- | -------------------- | ----------------------- | ------ |
| The system SHALL provide `docker-compose.ai.yml` that does not replace `docker-compose.yml` | overlay file; does not replace base | documentary: `docker-compose.ai.yml:1–5` - overlay merges with `docker-compose.yml`; usage `-f docker-compose.yml -f docker-compose.ai.yml` | ✅ PASS |
| WHEN that overlay is used THEN Open WebUI SHALL use image `ghcr.io/open-webui/open-webui:v0.11.3` (not `main`, `dev`, or `latest`), a persistent volume, a healthcheck, and `restart: unless-stopped` | pinned tag; volume; healthcheck; restart | documentary: `docker-compose.ai.yml:26` - `image: ghcr.io/open-webui/open-webui:v0.11.3`; `:28` - `restart: unless-stopped`; `:46` - `open-webui:/app/backend/data`; `:51` - `healthcheck:` | ✅ PASS |
| The overlay SHALL NOT put real secrets in the repository; it SHALL read `OPENWEBUI_SECRET_KEY`, `OPENROUTER_API_KEY`, and `AI_IDENTITY_JWT_SECRET` from env | `${VAR}` interpolations | documentary: `docker-compose.ai.yml:33` - `${OPENWEBUI_SECRET_KEY}`; `:38` - `${AI_IDENTITY_JWT_SECRET}`; `:41` - `${OPENROUTER_API_KEY}` | ✅ PASS |

### P1: Admin link in the existing SPA

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| ------------------------- | -------------------- | ----------------------- | ------ |
| WHEN the signed-in user role is not `admin` THEN the system SHALL NOT render the AI Assistant nav item | nav item hidden for non-admin | `packages/backend/src/agent/ai-assistant-nav.test.ts:17` - `resolveAiAssistantNavItem({ isAdmin: false, meAssistantUrl: 'https://ai.example.com' })).toBeNull()`. Helper is the extracted decision; JSX in `Sidebar.tsx` is not used as evidence | ✅ PASS |
| WHEN `aiAssistantUrl` from `GET /api/auth/me` (or `VITE_AI_ASSISTANT_URL` if set) is empty THEN the system SHALL hide the nav item | nav hidden when URL empty | `ai-assistant-nav.test.ts:25` - admin + empty/`null` `.toBeNull()`; `:29` whitespace URL `.toBeNull()`; Vite override preference `:49` - `href).toBe('https://vite.example.com')` | ✅ PASS |
| WHEN the item is shown THEN the system SHALL open the URL in a new browsing context with `rel="noopener noreferrer"` and SHALL NOT embed it in an iframe | `target="_blank"` `rel="noopener noreferrer"`; no iframe | `ai-assistant-nav.test.ts:36` - `.toEqual({ href: 'https://ai.example.com', target: '_blank', rel: 'noopener noreferrer', embed: 'none' })`; wiring `:58` - sidebar source `not.toMatch(/<iframe/i)` | ✅ PASS |

### P1: Structured tool errors

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| ------------------------- | -------------------- | ----------------------- | ------ |
| WHEN a tool fails THEN the system SHALL return `{ success: false, error: { code, message, retryable }, requestId }` and SHALL NOT include stack traces or `ENCRYPTION_KEY` / `JWT_SECRET` / `AI_GATEWAY_TOKEN` values | public shape; no stack; no secrets | `agent-error.test.ts:22` - `toEqual({ success: false, error: { code, message, retryable }, requestId: 'request-123' })`; `:47` - `not.toHaveProperty('stack')`; `:48` - `error` has no `stack`; `map-service-error.test.ts:56` - `ENCRYPTION_KEY=super-secret` maps to `message: 'An internal error occurred'`. Residual: `JWT_SECRET` / `AI_GATEWAY_TOKEN` values not separately planted | ✅ PASS |
| The system SHALL use distinct codes `INVALID_INPUT`, `UNAUTHENTICATED`, `FORBIDDEN`, `SERVER_NOT_FOUND`, `SERVER_DISCONNECTED`, `CHANNEL_NOT_FOUND`, `CLIENT_NOT_FOUND`, `BOT_NOT_FOUND`, `CONFLICT`, `TIMEOUT`, `TEAMSPEAK_ERROR`, `INTERNAL_ERROR`, `TOOL_NOT_FOUND` | each code serializes | `agent-error.test.ts:21` - `it.each(ALL_CODES)` covering the 13 spec codes; `:22` - serialized `error.code` equals each | ✅ PASS |
| WHEN the failure is a timeout or TeamSpeak flood THEN `retryable` SHALL be true; otherwise it SHALL be false for not-found, forbidden, and invalid input | retryable true/false as specified | timeout/TS: `agent-error.test.ts:34` - `TIMEOUT` `retryable).toBe(true)`; `:35` - `TEAMSPEAK_ERROR` true; flood: `map-service-error.test.ts:40` - TSApiError 524 `retryable).toBe(true)`; not-found/forbidden/invalid: `agent-error.test.ts:39–41` all `toBe(false)` | ✅ PASS |

**Status**: ✅ All ACs covered

**Counts**: 50/50 story ACs matched a spec-defined outcome with a test or allowed documentary citation. 0 ACs lack required test evidence. 0 spec-precision gaps.

---

## Discrimination Sensor

Isolated worktree `/tmp/aigw-sensor-reverify` at HEAD `327e4c1`. Real-tree porcelain baseline before sensor:

```
 M .specs/LESSONS.md
 M .specs/lessons.json
?? .specs/features/ai-agent-gateway/validation.md
```

Mutations applied only in the scratch. No `git stash`. After each mutation the scratch file was restored (`git checkout --`). Scratch removed with `git worktree remove --force`. After cleanup, real-tree porcelain equalled the baseline.

| Mutation | File:line | Description | Killed? |
| -------- | --------- | ----------- | ------- |
| 1 | `packages/backend/src/agent/tool-registry.ts:13` | Deleted `'execute_sql'` from `FORBIDDEN_TOOL_NAMES` | ✅ Killed (`tool-registry.test.ts:27` literal `toEqual`; `:46` register `'execute_sql'` `toThrow`; `create-registry.test.ts:13` literal `toEqual`. `mcp-server.test.ts` stayed green because `execute_sql` is never catalog-registered) |
| 2 | `packages/frontend/src/components/layout/ai-assistant-nav.ts:18` | Dropped `!input.isAdmin` so a viewer with a URL gets a link | ✅ Killed (`ai-assistant-nav.test.ts:17` expected `null`, received `{ href, target, rel, embed }`) |
| 3 | `packages/backend/src/config.ts:110` | `console.error` of the fail-closed path also printed `env.AI_GATEWAY_TOKEN` | ✅ Killed (`config-ai.test.ts:101` `not.toContain(reusedSecret)`) |
| 4 | `packages/backend/src/agent/agent-auth.ts:46` | Replaced digest `timingSafeEqual` with `presentedToken !== gatewayToken` | ✅ Killed (`agent-auth.test.ts:39` `expect(crypto.timingSafeEqual).toHaveBeenCalled()`) |
| 5 | `packages/backend/src/agent/agent-auth.ts:101` | Allowlist conjunction `\|\|` flipped to `&&` (union instead of intersection) | ✅ Killed (`agent-auth.test.ts:151` id miss and `:160` email miss no longer threw `FORBIDDEN`) |

**Sensor depth**: P0-full (5 behavior-level mutations on auth / denylist / secrets)
**Result**: 5/5 killed - PASS

---

## Interactive UAT Results (if performed)

Not performed. Nav ACs are covered by the extracted helper unit tests (T39). No human UAT session.

| # | Test | Result | Details |
| --- | ---- | ------ | ------- |
| 1 | Admin sidebar AI Assistant link | ⏭️ Skip | Automated helper tests stand in; no interactive session |

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ |
| Surgical changes | ✅ |
| No scope creep | ✅ (catalog matches MVP; `run_bot_flow` never registered) |
| Matches patterns | ✅ (Express routes, Prisma, `AppError` mapping, compose overlay style) |
| Spec-anchored outcome check (asserted values match spec) | ✅ |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ✅ (frontend helper extracted for vitest per T39/matrix) |
| Every test maps to a spec requirement - no unclaimed tests | ✅ new tests map to ACs, edges, or Done-when; pre-existing suite is out of feature scope |
| Documented guidelines followed: `CLAUDE.md` (vitest backend only; frontend helper imported from backend test) | ✅ |

Residual (not a gap): `create-registry.test.ts` still iterates production `DESTRUCTIVE_TOOL_NAMES` for listing/risk. Hiding is enforced by `tool.risk !== 'destructive'`, and `delete_channel` is asserted by literal string. Shrinking that array alone would not expose catalog tools.

---

## Edge Cases

- [x] IF `AI_AGENT_ENABLED` is `true` but the gateway token equals `JWT_SECRET` THEN refuse to start — `config-ai.test.ts:44` `toThrow('must differ')`
- [x] IF both allowlists are set and the user id matches but the email does not THEN `FORBIDDEN` — `agent-auth.test.ts:160` `toThrow({ code: 'FORBIDDEN' })`
- [x] IF `list_servers` finds no enabled configs THEN `{ success: true, action: "servers_listed", servers: [] }` — `server-tools.test.ts:28`
- [x] IF WebQuery is missing from the pool THEN `SERVER_DISCONNECTED` with `retryable` true — `server-management.service.test.ts:148` `code: 'SERVER_DISCONNECTED'`; `agent-error.test.ts:27` includes `SERVER_DISCONNECTED` in retryable set
- [x] IF `play_media_url` fails `validateUrl` THEN `INVALID_INPUT` and SHALL NOT call yt-dlp — `music-tools.test.ts:154–155`
- [x] IF `get_recent_server_logs` output contains an API key-shaped value THEN redact before returning — `server-tools.test.ts:115` `not.toContain('abcdef1234567890abcdef1234567890')`
- [x] IF MCP `Origin` is absent THEN allow after bearer and user JWT succeed — `mcp.routes.test.ts:62` absent Origin reaches auth (`401` without creds); `:105` initialize without Origin + both creds `status).toBe(200)`
- [x] IF a tool argument includes `idempotencyKey` longer than 128 characters THEN `INVALID_INPUT` — `tool-executor.test.ts:55`

---

## Gate Check

- **Gate command**: Build from tasks.md: `/tmp/pnpm-shim/pnpm --filter @ts6/backend exec tsc --noEmit`. Also ran `/tmp/pnpm-shim/pnpm --filter @ts6/backend exec vitest run`.
- **Result**: 540 passed, 0 failed, 0 skipped (66 files). `tsc --noEmit` exit 0.
- **Test count before feature**: 287 `it`/`it.each` declarations at `c7ab0ea^`
- **Test count after feature**: 540 vitest tests (509 `it`/`it.each` declarations at HEAD; `it.each` expands codes)
- **Delta**: +222 declarations; no deleted tests observed
- **Skipped tests**: none
- **Failures**: none in the real tree
- **Integrity**: test count increased; iteration-1 forbidden-name tautology closed by literal expected arrays

---

## Fix Plans (if issues found)

None. Iteration-1 ranked gaps are closed:

1. Frozen spec list including `'execute_sql'` — sensor mutant 1 killed.
2. AIGW-45/46/47 helper assertions — sensor mutant 2 killed.
3. AIGW-03 console spy — sensor mutant 3 killed.
4. AIGW-05 `timingSafeEqual` spy — sensor mutant 4 killed.

---

## Requirement Traceability Update

spec.md was not edited (Verifier may only write `validation.md`). Recommended statuses:

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| AIGW-01 | Implementing | ✅ Verified |
| AIGW-02 | Implementing | ✅ Verified |
| AIGW-03 | Implementing | ✅ Verified |
| AIGW-04 | Implementing | ✅ Verified |
| AIGW-05 | Implementing | ✅ Verified |
| AIGW-06 | Implementing | ✅ Verified |
| AIGW-07 | Implementing | ✅ Verified |
| AIGW-08 | Implementing | ✅ Verified |
| AIGW-09 | Implementing | ✅ Verified |
| AIGW-10 | Implementing | ✅ Verified |
| AIGW-11 | Implementing | ✅ Verified |
| AIGW-12 | Implementing | ✅ Verified |
| AIGW-13 | Implementing | ✅ Verified |
| AIGW-14 | Implementing | ✅ Verified |
| AIGW-15 | Implementing | ✅ Verified |
| AIGW-16 | Implementing | ✅ Verified |
| AIGW-17 | Implementing | ✅ Verified |
| AIGW-18 | Implementing | ✅ Verified |
| AIGW-19 | Implementing | ✅ Verified |
| AIGW-20 | Implementing | ✅ Verified |
| AIGW-21 | Implementing | ✅ Verified |
| AIGW-22 | Implementing | ✅ Verified |
| AIGW-23 | Implementing | ✅ Verified |
| AIGW-24 | Implementing | ✅ Verified |
| AIGW-25 | Implementing | ✅ Verified |
| AIGW-26 | Implementing | ✅ Verified |
| AIGW-27 | Implementing | ✅ Verified |
| AIGW-28 | Implementing | ✅ Verified |
| AIGW-29 | Implementing | ✅ Verified |
| AIGW-30 | Implementing | ✅ Verified |
| AIGW-31 | Implementing | ✅ Verified |
| AIGW-32 | Implementing | ✅ Verified |
| AIGW-33 | Implementing | ✅ Verified |
| AIGW-34 | Implementing | ✅ Verified |
| AIGW-35 | Implementing | ✅ Verified |
| AIGW-36 | Implementing | ✅ Verified |
| AIGW-37 | Implementing | ✅ Verified |
| AIGW-38 | Implementing | ✅ Verified |
| AIGW-39 | Implementing | ✅ Verified |
| AIGW-40 | Implementing | ✅ Verified |
| AIGW-41 | Implementing | ✅ Verified |
| AIGW-42 | Implementing | ✅ Verified |
| AIGW-43 | Implementing | ✅ Verified |
| AIGW-44 | Implementing | ✅ Verified |
| AIGW-45 | Implementing | ✅ Verified |
| AIGW-46 | Implementing | ✅ Verified |
| AIGW-47 | Implementing | ✅ Verified |
| AIGW-48 | Implementing | ✅ Verified |
| AIGW-49 | Implementing | ✅ Verified |
| AIGW-50 | Implementing | ✅ Verified |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 50/50 ACs matched spec outcome; 0 spec-precision gaps; 8/8 edges covered
**Sensor**: 5/5 mutations killed
**Gate**: 540 passed, 0 failed (66 files); `tsc --noEmit` exit 0

**What works**: Fail-closed config and 404 when AI is off; dual auth 401/403 paths including constant-time compare; allowlist intersection; `.strict()` extra `role`; catalog payloads (no credentials/IPs/flow secrets); destructive tools dark until the flag; audit redaction and idempotent retry; OpenAPI/MCP equivalence; nginx MCP deny; pinned Open WebUI overlay; admin-only AI Assistant nav helper.

**Issues found**: none

**Next steps**: Update spec.md requirement statuses to Verified. Feature is ready to mark done. No new lessons (clean pass).
