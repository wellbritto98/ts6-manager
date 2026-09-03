# STATE

## Decisions

### AD-001
- **Decision**: Optional browser-backed services (YouTube cookie refresh, and any future in-app browser) run as a separate Docker sidecar with bearer-token auth and unpublished host ports, following the existing media sidecar pattern (`SIDECAR_URL` / `SIDECAR_TOKEN`).
- **Reason**: Chromium must not live in the backend image; cookie SQLite is locked while Chrome runs, so the sidecar dumps cookies over HTTP (CDP) instead of the backend calling `--cookies-from-browser`.
- **Trade-off**: Extra compose service and RAM (~300–500 MB) while the feature is enabled; local `pnpm dev` without `YT_BROWSER_URL` cannot turn the toggle on.
- **Scope**: packages/backend, packages/yt-browser, docker-compose.yml / docker-compose.dev.yml / docker-compose.hub.yml
- **Date**: 2026-09-03
- **Status**: active

## Handoff

- **Feature**: youtube-cookie-refresh / `.specs/features/youtube-cookie-refresh`
- **Phase / Task**: Execute T7 complete, awaiting Verifier
- **Completed**: T1–T7
- **In-progress** (file:line): none
- **Next step**: Verifier writes validation.md; then validate_state.py
- **Blockers**: no in-IDE browser tools; live Settings UI not exercised
- **Uncommitted files**: T7 UI (commit pending)
- **Branch**: main
