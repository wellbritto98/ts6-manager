# AI Agent Gateway — Security Model

The gateway assumes the model is untrusted and that anything reaching the tool surface may be adversarial. Containment comes from what the tools cannot express, not from asking the model to behave.

## Dual authentication

Every gateway request must satisfy both checks. Failing either returns a structured error, never a stack trace.

1. **Service bearer.** `Authorization: Bearer <AI_GATEWAY_TOKEN>` proves the caller is the deployed Open WebUI. The comparison hashes both sides with SHA-256 and compares with `timingSafeEqual`, so a wrong token leaks no timing signal about how much of it was right.
2. **Identity JWT.** `X-OpenWebUI-User-Jwt` is verified with `AI_IDENTITY_JWT_SECRET`, algorithm pinned to HS256, issuer pinned to `open-webui`. The payload must carry a string `sub`, a numeric `exp` and a string `role`; anything else is `UNAUTHENTICATED`. A `role` other than `admin` is `FORBIDDEN`.

The two secrets are separate on purpose. The bearer identifies the container; the JWT identifies the person. One value cannot do both jobs, and neither may be reused from `JWT_SECRET` or `ENCRYPTION_KEY`.

Unsigned headers are never trusted as identity. `X-OpenWebUI-Chat-Id` and `X-OpenWebUI-Message-Id` are recorded for audit correlation only; no authorization decision reads them.

## Allowlists are conjunctive

`AI_ALLOWED_OPENWEBUI_USER_IDS` and `AI_ALLOWED_OPENWEBUI_EMAILS` are both optional. An empty list means "no restriction on that dimension". When both are set, both must match: an actor whose id is allowed but whose email is not gets `FORBIDDEN`. Emails compare case-insensitively.

## No generic escape hatch

The registry refuses at startup to register `execute_webquery`, `execute_command`, `run_teamspeak_command`, `raw_api_request`, `execute_sql` or `run_bot_flow`. There is no tool that forwards a raw WebQuery command, a shell command or SQL, so prompt injection has no primitive to reach for. `run_bot_flow` is excluded because `BotEngine.executeFlow` is private and has no safe manual entry point.

Every tool has a strict Zod schema. Unknown properties are rejected rather than passed through.

## Destructive tools are dark by default

While `AI_DESTRUCTIVE_TOOLS_ENABLED` is false, the eight destructive tools are absent from the OpenAPI document, absent from the MCP tool list, and unreachable by name: the registry returns the same `TOOL_NOT_FOUND` it returns for a tool that does not exist, so probing cannot confirm that they exist.

Open WebUI's `ENABLE_TOOL_PERMISSIONS` and "Ask for approval" are a useful extra prompt for a human, but they are UI defense inside the chat container. They are not backend authorization and must never be the only control.

## MCP stays on the Docker network

The MCP transport is stateless: one server and one transport per request, both closed with the response.

- A request with an `Origin` header outside the allowlist (the backend's `FRONTEND_URL` plus `http://open-webui:8080`) is rejected with `FORBIDDEN`. A missing `Origin` is allowed because in-network clients do not send one.
- The public frontend nginx returns 403 for `^~ /api/agent/mcp` before the general `/api` proxy, so the path is not reachable from the internet even if the origin check would have passed.

## Sanitization and audit

Arguments and results are sanitized before they are stored. Keys named `apikey`, `password`, `token`, `cookie`, `secret`, `authorization` or `certificate` become `[REDACTED]` at any depth, cycles become `[Cycle]`, and strings are truncated at 8000 characters. Client listings omit IP addresses and flow reads redact credential-named fields.

Every call, success or failure, writes an `AiActionLog` row: request id, actor, tool, risk, sanitized arguments, sanitized result or error code, duration, and the chat/message ids. Mutating tools that receive an `idempotencyKey` are deduplicated against that log, so a model retry replays the stored result instead of performing the action twice.

Error responses carry `{ success: false, error: { code, message, retryable }, requestId }` with no stack and no secret values.

**Known wrinkle:** the `requestId` in an HTTP failure envelope can differ from the `requestId` on the audit row for the same call, because the transport generates its own id when the failure happens before or around execution. Correlate through the audit log rather than assuming the two ids match. Do not "fix" this inside the executor.

## Rate limiting

The gateway router applies its own limiter: 60 requests per minute per client, independent of the SPA's limiters.
