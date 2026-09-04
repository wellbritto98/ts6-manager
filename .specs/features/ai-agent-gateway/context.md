# AI Agent Gateway Context

**Gathered:** 2026-09-04
**Spec:** `.specs/features/ai-agent-gateway/spec.md`
**Status:** Ready for design

---

## Feature Boundary

Add an Agent Tool Gateway to the existing Express backend. Open WebUI 0.11.3 is the chat UI. OpenRouter is the model provider. Tools are a fixed registry. OpenAPI is the primary adapter. MCP Streamable HTTP is an additional adapter. No new React chat. Existing REST keeps working when AI is off.

---

## Implementation Decisions

### Service extraction

- Extract only operations used by the MVP tools.
- Matching REST handlers become thin wrappers over those services.
- Video, playlists, server CRUD, and Discord routes stay as they are.

### Assistant URL

- Backend env `AI_ASSISTANT_PUBLIC_URL` is the Docker source of truth.
- Admins receive it on `GET /api/auth/me` as `aiAssistantUrl`.
- `VITE_AI_ASSISTANT_URL` is an optional Vite override for `pnpm dev`.

### Auth

- Service bearer `AI_GATEWAY_TOKEN` compared with `timingSafeEqual`.
- Open WebUI JWT HS256, `iss === "open-webui"`, `exp`, `role === "admin"`.
- If both allowlists are set, the caller must match both.
- Unsigned identity headers are not used for authorization.

### Risk

- 31 read/write tools exposed when `AI_AGENT_ENABLED=true`.
- Eight destructive tools hidden unless `AI_DESTRUCTIVE_TOOLS_ENABLED=true`.
- `run_bot_flow` never exposed.
- Open WebUI `ENABLE_TOOL_PERMISSIONS` is documented as extra UI defense, not backend authorization.

### Identity secret

- One value: `AI_IDENTITY_JWT_SECRET`.
- Compose maps it to Open WebUI `FORWARD_USER_INFO_HEADER_JWT_SECRET`.

### Execution

- Sequential phase-batch workers (~7 tasks), then an independent Verifier.
- Local commits only. No push.

### Agent's Discretion

- Exact Zod 4 patch version if a bump is required for MCP peers.
- Internal file split under `packages/backend/src/agent/` as long as the registry remains the single execute path.
- Rate limiter keying (token hash vs ip) as long as the cap is 60/min per token.

### Declined / Undiscussed Gray Areas → Assumptions

Recorded in spec Assumptions: audit TTL none; OpenAPI primary; `list_servers` returns enabled configs plus virtual server ids; empty allowlist means no extra restriction.

---

## Specific References

User examples: list connected users, create temporary channel "Reunião", move Wellington, effective permissions, start music bot and play URL, volume 40%, add user to Moderador.

Architecture flow: Admin → Open WebUI → OpenRouter → Agent Tool Gateway → existing services → TeamSpeak / bots / Prisma / BotEngine.

---

## Deferred Ideas

- Per-tool backend approval tickets if Open WebUI later supports risk-based confirmation
- Audit log TTL / export
- Viewer-scoped tools
- `run_bot_flow` if BotEngine gains a safe public execute
- Extracting video/playlist/server CRUD into services
