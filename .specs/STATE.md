# STATE

## Decisions

### AD-001
- **Decision**: Optional browser-backed services (YouTube cookie refresh, and any future in-app browser) run as a separate Docker sidecar with bearer-token auth and unpublished host ports, following the existing media sidecar pattern (`SIDECAR_URL` / `SIDECAR_TOKEN`).
- **Reason**: Chromium must not live in the backend image; cookie SQLite is locked while Chrome runs, so the sidecar dumps cookies over HTTP (CDP) instead of the backend calling `--cookies-from-browser`.
- **Trade-off**: Extra compose service and RAM (~300–500 MB) while the feature is enabled; local `pnpm dev` without `YT_BROWSER_URL` cannot turn the toggle on.
- **Scope**: packages/backend, packages/yt-browser, docker-compose.yml / docker-compose.dev.yml / docker-compose.hub.yml
- **Date**: 2026-09-03
- **Status**: active

### AD-002
- **Decision**: Administrative LLM tools run only through an in-process Agent Tool Gateway (single Zod registry; OpenAPI and MCP are adapters). Open WebUI is an optional Compose overlay and never talks to WebQuery, SSH, Prisma, or in-process managers.
- **Reason**: The model must not pick TeamSpeak commands or hold TS6 secrets; REST and tools must share one service layer.
- **Trade-off**: Extra gateway surface and an optional Open WebUI container; Open WebUI 0.11.3 cannot force per-risk tool approval, so destructive tools stay off by default.
- **Scope**: packages/backend `agent/` + `services/`, packages/frontend nav link, docker-compose.ai.yml, docs/ai
- **Date**: 2026-09-04
- **Status**: active

## Handoff

- **Feature**: ai-agent-gateway / `.specs/features/ai-agent-gateway`
- **Phase / Task**: Execute complete (T1–T41); Verifier PASS (iteration 2)
- **Completed**: T1–T41; `validation.md` PASS; `validate_state.py` exit 0
- **In-progress** (file:line): none
- **Next step**: none locally. Do not push unless asked. Optional follow-up: audit TTL, `run_bot_flow` safe entry, drop unused `@modelcontextprotocol/express`, align HTTP `requestId` with audit rows
- **Blockers**: none
- **Uncommitted files**: none after closeout commit (never commit `AGENTS.md` or `.env`)
- **Branch**: feat/ai-agent-gateway
