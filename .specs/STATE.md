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
- **Phase / Task**: Specify + Design + Tasks (writing artifacts)
- **Completed**: none
- **In-progress** (file:line): spec artifacts
- **Next step**: validate spec and tasks, then execute T1
- **Blockers**: none
- **Uncommitted files**: `.specs/`
- **Branch**: current
