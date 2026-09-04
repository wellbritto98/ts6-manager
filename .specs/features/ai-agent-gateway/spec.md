# AI Agent Gateway Specification

## Problem Statement

Administrators need to operate TeamSpeak servers in natural language (list clients, create channels, control music bots) without exposing WebQuery keys, SSH, Prisma, or in-process managers to an LLM frontend. The TS6 Manager already owns those operations in Express routes. There is no isolated, authenticated, audited tool surface that Open WebUI and OpenRouter can call.

## Goals

- [ ] An administrator can run Open WebUI beside TS6 Manager and execute a fixed catalog of administrative tools through the Agent Tool Gateway
- [ ] OpenAPI and MCP produce the same tool behaviour from one registry
- [ ] The existing SPA and REST API keep working when AI is disabled
- [ ] Every tool call is authenticated as a service plus an Open WebUI admin identity and is written to `AiActionLog` without secrets

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
| ------- | ------ |
| In-app React chat or iframe embed | Open WebUI is the UI |
| Dify, Mastra, LangChain, LangGraph, CrewAI | Open WebUI owns the tool loop |
| Generic WebQuery / SQL / raw HTTP tools | The model must not pick TeamSpeak commands |
| Invented `run_bot_flow` execution | `BotEngine.executeFlow` is private; no safe manual API |
| Video streaming, playlists, server CRUD, Discord tools | Extração mínima: só operações do catálogo MVP |
| Backend-enforced per-tool human approval | Open WebUI 0.11.3 cannot force approval by risk |
| Audit log TTL / archival | Documented SQLite growth; follow-up |
| `git push`, deploy, production DB changes | Local implementation only |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here - nothing is left silently unclear.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Service extraction breadth | Only operations used by the MVP tools; matching REST handlers become thin wrappers; video/playlists/server CRUD/Discord stay in routes | User confirmed; limits REST regression | y |
| Assistant URL in Docker | Backend `AI_ASSISTANT_PUBLIC_URL` exposed to admins on `GET /api/auth/me`; `VITE_AI_ASSISTANT_URL` is an optional Vite override | Frontend Docker build does not inject `VITE_*` | y |
| Dual allowlists | If both `AI_ALLOWED_OPENWEBUI_USER_IDS` and `AI_ALLOWED_OPENWEBUI_EMAILS` are set, the caller must match both | Fail-closed intersection | y |
| Destructive tools | Registered but not exposed while `AI_DESTRUCTIVE_TOOLS_ENABLED=false` | Open WebUI 0.11.3 cannot force per-risk approval | y |
| `run_bot_flow` | Documented and never exposed | No safe public execute path | y |
| Identity secret | One `.env` value `AI_IDENTITY_JWT_SECRET`; Compose maps it to Open WebUI `FORWARD_USER_INFO_HEADER_JWT_SECRET` | Avoid duplicated secrets | y |
| Gateway rate limit | 60 requests per minute per service token, in addition to the existing `/api` limiter of 300/min | Tool loops retry; keep flood bounded | y |
| Audit retention | No TTL in MVP | SQLite growth documented | y |
| Primary integration | OpenAPI; MCP is additional and Docker-internal only | Open WebUI documents OpenAPI as preferred | y |
| `list_servers` payload | Enabled `TsServerConfig` rows plus their virtual server ids, never apiKey/sshPassword | Agent must discover both ids without guessing | y |
| Allowlist empty | Empty or unset allowlists mean no extra restriction beyond admin role | Optional hardening | y |
| Zod | Backend uses Zod 4.x pinned if MCP peers require it; otherwise `zod/v4` from the installed package. Frontend Zod unchanged | MCP SDK v2 registers tools with Zod v4 | y |
| Both allowlists AND | Intersection, not union | Confirmed in plan | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: AI stays off until enabled ⭐ MVP

**User Story**: As an operator, I want the manager to boot and serve the existing UI without AI secrets or agent routes when the flag is off so that deployments that do not want AI are unchanged.

**Why P1**: Acceptance criterion 1: the project keeps working without enabling AI.

**Acceptance Criteria**:

1. WHERE `AI_AGENT_ENABLED` is unset or not `true` the system SHALL leave `/api/agent` unusable (HTTP 404 for `/api/agent/*`) and SHALL start without requiring `AI_GATEWAY_TOKEN` or `AI_IDENTITY_JWT_SECRET`.
2. WHEN `AI_AGENT_ENABLED` is `true` AND `AI_GATEWAY_TOKEN` or `AI_IDENTITY_JWT_SECRET` is missing, shorter than 32 characters, or equal to `JWT_SECRET` or `ENCRYPTION_KEY` THEN the system SHALL refuse to start.
3. The system SHALL NOT log `AI_GATEWAY_TOKEN` or `AI_IDENTITY_JWT_SECRET` values.

**Independent Test**: Boot with the flag false and GET `/api/agent/openapi.json` → 404. Enable with a 8-char token and process exits.

---

### P1: Dual authentication on every execution ⭐ MVP

**User Story**: As a security owner, I want every tool execution to prove a shared service credential and a signed Open WebUI admin identity so that the model cannot choose a role and a random caller cannot hit tools.

**Why P1**: The gateway must not trust the model for identity.

**Acceptance Criteria**:

1. WHEN a client calls `POST /api/agent/tools/:toolName` without `Authorization: Bearer` matching `AI_GATEWAY_TOKEN` THEN the system SHALL respond HTTP 401 with `success` false and error code `UNAUTHENTICATED`.
2. WHEN the bearer matches THEN the system SHALL compare it with a constant-time equality check.
3. WHEN the Open WebUI user JWT is missing, has an invalid HS256 signature, is expired, or has `iss` other than `open-webui` THEN the system SHALL respond HTTP 401 with error code `UNAUTHENTICATED`.
4. IF the JWT `role` is not `admin` THEN the system SHALL respond HTTP 403 with error code `FORBIDDEN`.
5. WHERE at least one allowlist is configured AND the caller is not in every configured allowlist THEN the system SHALL respond HTTP 403 with error code `FORBIDDEN`.
6. WHILE identity JWT validation is configured the system SHALL ignore unsigned `X-OpenWebUI-User-Name`, `X-OpenWebUI-User-Email`, and `X-OpenWebUI-User-Id` headers for authorization.
7. WHEN a tool executes THEN the system SHALL take actor identity only from the verified JWT (`sub`, `email`, `name`, `role`) and SHALL reject tool arguments that include `role` or actor identity fields via `.strict()` schemas.

**Independent Test**: Call with wrong bearer, expired JWT, `iss=other`, `role=user`, and an allowlist miss; each is 401 or 403. Extra `role` in the JSON body is rejected as invalid input.

---

### P1: Single tool registry without generic commands ⭐ MVP

**User Story**: As an administrator, I want a fixed catalog of named tools with strict Zod input so that the model cannot run arbitrary WebQuery or SQL.

**Why P1**: Core of the product; forbids the generic-tool class.

**Acceptance Criteria**:

1. The system SHALL expose tools only from one in-process registry whose definitions include `name`, `description`, `inputSchema`, `risk`, and `execute`.
2. IF a tool name matching `execute_webquery`, `execute_command`, `run_teamspeak_command`, `raw_api_request`, or `execute_sql` is requested THEN the system SHALL NOT execute it and SHALL return error code `TOOL_NOT_FOUND`.
3. WHEN tool input contains unknown fields THEN the system SHALL reject the call with error code `INVALID_INPUT`.
4. WHEN OpenAPI and MCP invoke the same tool name with the same valid input THEN the system SHALL produce the same success/error code and the same action identifier.

**Independent Test**: Registry listing contains none of the forbidden names. Extra JSON key → `INVALID_INPUT`. OpenAPI and MCP adapters call the same `execute`.

---

### P1: Explicit server targeting ⭐ MVP

**User Story**: As an administrator, I want tools that touch a TeamSpeak server to require `serverConfigId` (and `virtualServerId` when the operation is per virtual server) so that the agent cannot silently pick the first server.

**Why P1**: Prevents cross-server accidents.

**Acceptance Criteria**:

1. WHEN a server-scoped tool runs THEN the system SHALL require `serverConfigId` as a positive integer and SHALL reject a missing or non-integer id with `INVALID_INPUT`.
2. IF `serverConfigId` does not exist or `enabled` is false THEN the system SHALL return error code `SERVER_NOT_FOUND` and SHALL NOT call WebQuery.
3. WHEN the operation needs a virtual server THEN the system SHALL require `virtualServerId` as a positive integer and SHALL NOT default it to 1 or to the first listed server.

**Independent Test**: Omit ids → `INVALID_INPUT`. Disabled config → `SERVER_NOT_FOUND` with zero WebQuery calls.

---

### P1: Catalog operations for servers, channels, clients, groups, music, flows ⭐ MVP

**User Story**: As an administrator, I want the agent to list servers, channels, and clients, create and edit a channel, move a client, inspect and set a channel permission, and control a music bot so that the MVP examples work.

**Why P1**: Acceptance criteria 5–9 of the product brief.

**Acceptance Criteria**:

1. WHEN `list_servers` succeeds THEN the system SHALL return enabled server configs and their virtual server ids and SHALL omit `apiKey` and `sshPassword`.
2. WHEN `list_clients` succeeds THEN the system SHALL omit client IP addresses.
3. WHEN `create_channel` succeeds THEN the system SHALL create a channel using only the allowlisted fields `channel_name`, `channel_flag_permanent`, `channel_flag_semi_permanent`, `channel_topic`, `channel_password`, `cpid` and SHALL return `{ success: true, action: "channel_created" }` plus channel id and name.
4. WHEN `move_client` succeeds THEN the system SHALL move the named client id to the named channel id on the given virtual server and SHALL return `{ success: true, action: "client_moved" }`.
5. WHEN `set_channel_permission` succeeds THEN the system SHALL set only the named permission on the named channel and SHALL return `{ success: true, action: "channel_permission_set" }`.
6. WHEN `play_media_url` is given an http(s) URL THEN the system SHALL validate it with `validateUrl` before download and SHALL return `{ success: true, action: "media_queued" }` or `{ success: true, action: "media_playing" }`.
7. WHEN `list_bot_flows` succeeds THEN the system SHALL return id, name, enabled, serverConfigId, and virtualServerId without flow graph payloads large enough to include secrets.
8. The system SHALL NOT expose `run_bot_flow` in OpenAPI or MCP.

**Independent Test**: Fake pool/prisma/voice manager; assert payload shapes and that `validateUrl` is invoked for play.

---

### P1: Destructive tools stay dark until explicitly enabled ⭐ MVP

**User Story**: As an operator, I want delete/kick/ban/stop/clear/disable-flow tools hidden unless I set a dedicated flag so that Open WebUI cannot run them silently.

**Why P1**: Open WebUI 0.11.3 cannot force approval per risk.

**Acceptance Criteria**:

1. WHERE `AI_DESTRUCTIVE_TOOLS_ENABLED` is not `true` the system SHALL omit `delete_channel`, `kick_client`, `ban_client`, `remove_client_from_server_group`, `remove_channel_permission`, `stop_music_bot`, `clear_music_queue`, and `disable_bot_flow` from OpenAPI and MCP listings.
2. WHEN those names are called while the flag is false THEN the system SHALL return `TOOL_NOT_FOUND` and SHALL NOT mutate TeamSpeak or bot state.
3. WHEN `AI_DESTRUCTIVE_TOOLS_ENABLED` is `true` THEN the system SHALL expose those eight tools with `risk` equal to `destructive`.

**Independent Test**: Flag off: listing excludes the eight names; POST delete_channel → `TOOL_NOT_FOUND` and delete not called.

---

### P1: Audit without secrets ⭐ MVP

**User Story**: As an auditor, I want every tool success and failure stored with requestId, actor, tool, risk, and redacted arguments so that I can reconstruct what the agent did without leaking credentials.

**Why P1**: Required for the MVP.

**Acceptance Criteria**:

1. WHEN a tool finishes (success or failure) THEN the system SHALL write an `AiActionLog` row containing `requestId`, `externalUserId`, `toolName`, `risk`, `sanitizedArguments`, `status`, and `createdAt`.
2. IF arguments or results contain keys named `apiKey`, `password`, `token`, `cookie`, `secret`, `authorization`, or `certificate` (case-insensitive) THEN the system SHALL replace those values with `[REDACTED]` before persistence.
3. WHEN a sanitized argument or result string exceeds 8000 characters THEN the system SHALL truncate it before persistence.
4. IF the audit write fails after a mutation has already run THEN the system SHALL NOT retry the mutation.
5. The system SHALL store `X-OpenWebUI-Chat-Id` and `X-OpenWebUI-Message-Id` on the log when those headers are present.

**Independent Test**: Execute a fake tool with `{ token: "abc" }`; stored JSON contains `[REDACTED]` and not `abc`. Force audit throw after execute; execute call count stays 1.

---

### P1: Idempotent retries ⭐ MVP

**User Story**: As an administrator, I want create/ban/group-add tools to accept `idempotencyKey` so that a model retry does not duplicate the side effect.

**Why P1**: Tool loops retry.

**Acceptance Criteria**:

1. WHEN a mutating tool is called twice with the same actor, tool name, and `idempotencyKey` THEN the system SHALL run the mutation at most once and SHALL return the original outcome on the second call.
2. WHEN a mutating tool finds the target already in the requested state THEN the system SHALL return `{ success: true, action: "already_in_desired_state" }` without repeating the TeamSpeak command.

**Independent Test**: Two creates with the same key; WebQuery `channelcreate` called once. Add-to-group when already member → `already_in_desired_state`.

---

### P1: OpenAPI adapter ⭐ MVP

**User Story**: As an operator, I want a bearer-protected OpenAPI document that lists only agent tools so that Open WebUI can import them without seeing login or settings routes.

**Why P1**: Primary integration.

**Acceptance Criteria**:

1. WHEN `GET /api/agent/openapi.json` is called with a valid bearer THEN the system SHALL return OpenAPI 3.x whose paths are only agent tools, each with a stable `operationId` equal to the tool name.
2. IF that GET is called without a valid bearer THEN the system SHALL respond HTTP 401.
3. WHEN `POST /api/agent/tools/:toolName` runs THEN the system SHALL require bearer plus user JWT and SHALL NOT include `/api/auth` or settings paths in the OpenAPI document.

**Independent Test**: Parse the document; path list equals exposed tools; no `/api/auth`.

---

### P1: MCP Streamable HTTP adapter ⭐ MVP

**User Story**: As an operator, I want the same registry on `GET` and `POST /api/agent/mcp` over Streamable HTTP so that Open WebUI can use MCP on the Docker network.

**Why P1**: Required additional adapter.

**Acceptance Criteria**:

1. WHEN MCP is enabled the system SHALL serve Streamable HTTP on `/api/agent/mcp` using `@modelcontextprotocol/server` 2.0.0 with a per-request stateless transport.
2. IF an `Origin` header is present and is not in the allowlist (backend origin plus `http://open-webui:8080`) THEN the system SHALL reject the MCP request with HTTP 403.
3. WHEN the public frontend nginx receives `/api/agent/mcp` THEN it SHALL respond HTTP 403 without proxying to the backend.

**Independent Test**: Unit: origin mismatch → 403. Dockerfile.frontend contains the deny location before `location /api`.

---

### P1: Optional Open WebUI overlay ⭐ MVP

**User Story**: As an operator, I want a separate Compose file that starts Open WebUI 0.11.3 on the existing Docker network so that people who do not want AI never pull that image.

**Why P1**: Deployment path.

**Acceptance Criteria**:

1. The system SHALL provide `docker-compose.ai.yml` that does not replace `docker-compose.yml`.
2. WHEN that overlay is used THEN Open WebUI SHALL use image `ghcr.io/open-webui/open-webui:v0.11.3` (not `main`, `dev`, or `latest`), a persistent volume, a healthcheck, and `restart: unless-stopped`.
3. The overlay SHALL NOT put real secrets in the repository; it SHALL read `OPENWEBUI_SECRET_KEY`, `OPENROUTER_API_KEY`, and `AI_IDENTITY_JWT_SECRET` from env.

**Independent Test**: File review: pinned tag, volume, healthcheck, `${VAR}` for secrets.

---

### P1: Admin link in the existing SPA ⭐ MVP

**User Story**: As an admin, I want an "AI Assistant" nav item that opens Open WebUI in a new tab when a public URL is configured so that I do not need a second bookmark.

**Why P1**: Only frontend change allowed.

**Acceptance Criteria**:

1. WHEN the signed-in user role is not `admin` THEN the system SHALL NOT render the AI Assistant nav item.
2. WHEN `aiAssistantUrl` from `GET /api/auth/me` (or `VITE_AI_ASSISTANT_URL` if set) is empty THEN the system SHALL hide the nav item.
3. WHEN the item is shown THEN the system SHALL open the URL in a new browsing context with `rel="noopener noreferrer"` and SHALL NOT embed it in an iframe.

**Independent Test**: Sidebar logic: viewer → hidden; admin + empty url → hidden; admin + url → `<a target="_blank" rel="noopener noreferrer">`.

---

### P1: Structured tool errors ⭐ MVP

**User Story**: As an administrator talking to the agent, I want failed tools to return a small JSON error with a code and `retryable` so that the model can explain the failure without seeing stacks.

**Why P1**: Error contract.

**Acceptance Criteria**:

1. WHEN a tool fails THEN the system SHALL return `{ success: false, error: { code, message, retryable }, requestId }` and SHALL NOT include stack traces or `ENCRYPTION_KEY` / `JWT_SECRET` / `AI_GATEWAY_TOKEN` values.
2. The system SHALL use distinct codes `INVALID_INPUT`, `UNAUTHENTICATED`, `FORBIDDEN`, `SERVER_NOT_FOUND`, `SERVER_DISCONNECTED`, `CHANNEL_NOT_FOUND`, `CLIENT_NOT_FOUND`, `BOT_NOT_FOUND`, `CONFLICT`, `TIMEOUT`, `TEAMSPEAK_ERROR`, `INTERNAL_ERROR`, `TOOL_NOT_FOUND`.
3. WHEN the failure is a timeout or TeamSpeak flood THEN `retryable` SHALL be true; otherwise it SHALL be false for not-found, forbidden, and invalid input.

**Independent Test**: Map each code in unit tests; assert no `stack` key.

---

## Edge Cases

- IF `AI_AGENT_ENABLED` is `true` but the gateway token equals `JWT_SECRET` THEN the system SHALL refuse to start.
- IF both allowlists are set and the user id matches but the email does not THEN the system SHALL return `FORBIDDEN`.
- IF `list_servers` finds no enabled configs THEN the system SHALL return `{ success: true, action: "servers_listed", servers: [] }`.
- IF WebQuery is missing from the pool THEN the system SHALL return `SERVER_DISCONNECTED` with `retryable` true.
- IF `play_media_url` fails `validateUrl` THEN the system SHALL return `INVALID_INPUT` and SHALL NOT call yt-dlp.
- IF `get_recent_server_logs` output contains an API key-shaped value THEN the system SHALL redact it before returning to the model.
- IF MCP `Origin` is absent THEN the system SHALL allow the request after bearer and user JWT succeed (Docker internal calls may omit Origin).
- IF a tool argument includes `idempotencyKey` longer than 128 characters THEN the system SHALL return `INVALID_INPUT`.

---

## Requirement Traceability

Each requirement gets a unique ID for tracking across design, tasks, and validation.

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| AIGW-01 | P1: AI stays off until enabled | Tasks | Implementing |
| AIGW-02 | P1: AI stays off until enabled | Tasks | Implementing |
| AIGW-03 | P1: AI stays off until enabled | Tasks | Implementing |
| AIGW-04 | P1: Dual authentication | Tasks | Pending |
| AIGW-05 | P1: Dual authentication | Tasks | Pending |
| AIGW-06 | P1: Dual authentication | Tasks | Pending |
| AIGW-07 | P1: Dual authentication | Tasks | Pending |
| AIGW-08 | P1: Dual authentication | Tasks | Pending |
| AIGW-09 | P1: Dual authentication | Tasks | Pending |
| AIGW-10 | P1: Dual authentication | Tasks | Pending |
| AIGW-11 | P1: Single tool registry | Tasks | Pending |
| AIGW-12 | P1: Single tool registry | Tasks | Pending |
| AIGW-13 | P1: Single tool registry | Tasks | Pending |
| AIGW-14 | P1: Single tool registry | Tasks | Pending |
| AIGW-15 | P1: Explicit server targeting | Tasks | Pending |
| AIGW-16 | P1: Explicit server targeting | Tasks | Pending |
| AIGW-17 | P1: Explicit server targeting | Tasks | Pending |
| AIGW-18 | P1: Catalog operations | Tasks | Pending |
| AIGW-19 | P1: Catalog operations | Tasks | Pending |
| AIGW-20 | P1: Catalog operations | Tasks | Pending |
| AIGW-21 | P1: Catalog operations | Tasks | Pending |
| AIGW-22 | P1: Catalog operations | Tasks | Pending |
| AIGW-23 | P1: Catalog operations | Tasks | Pending |
| AIGW-24 | P1: Catalog operations | Tasks | Pending |
| AIGW-25 | P1: Catalog operations | Tasks | Pending |
| AIGW-26 | P1: Destructive tools stay dark | Tasks | Pending |
| AIGW-27 | P1: Destructive tools stay dark | Tasks | Pending |
| AIGW-28 | P1: Destructive tools stay dark | Tasks | Pending |
| AIGW-29 | P1: Audit without secrets | Tasks | Pending |
| AIGW-30 | P1: Audit without secrets | Tasks | Pending |
| AIGW-31 | P1: Audit without secrets | Tasks | Pending |
| AIGW-32 | P1: Audit without secrets | Tasks | Pending |
| AIGW-33 | P1: Audit without secrets | Tasks | Pending |
| AIGW-34 | P1: Idempotent retries | Tasks | Pending |
| AIGW-35 | P1: Idempotent retries | Tasks | Pending |
| AIGW-36 | P1: OpenAPI adapter | Tasks | Pending |
| AIGW-37 | P1: OpenAPI adapter | Tasks | Pending |
| AIGW-38 | P1: OpenAPI adapter | Tasks | Pending |
| AIGW-39 | P1: MCP adapter | Tasks | Pending |
| AIGW-40 | P1: MCP adapter | Tasks | Pending |
| AIGW-41 | P1: MCP adapter | Tasks | Pending |
| AIGW-42 | P1: Open WebUI overlay | Tasks | Pending |
| AIGW-43 | P1: Open WebUI overlay | Tasks | Pending |
| AIGW-44 | P1: Open WebUI overlay | Tasks | Pending |
| AIGW-45 | P1: Admin link in the existing SPA | Tasks | Pending |
| AIGW-46 | P1: Admin link in the existing SPA | Tasks | Pending |
| AIGW-47 | P1: Admin link in the existing SPA | Tasks | Pending |
| AIGW-48 | P1: Structured tool errors | Tasks | Pending |
| AIGW-49 | P1: Structured tool errors | Tasks | Pending |
| AIGW-50 | P1: Structured tool errors | Tasks | Pending |

**ID format:** `AIGW-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 50 total, 50 mapped to tasks, 0 unmapped

---

## Success Criteria

How we know the feature is successful:

- [ ] `AI_AGENT_ENABLED=false` leaves the existing app behaviour unchanged
- [ ] Open WebUI starts from `docker-compose.ai.yml` with a pinned 0.11.3 image
- [ ] OpenAPI and MCP share one registry and identical execute results
- [ ] No generic WebQuery/SQL tool is listed or executable
- [ ] Destructive tools are absent unless `AI_DESTRUCTIVE_TOOLS_ENABLED=true`
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` pass
