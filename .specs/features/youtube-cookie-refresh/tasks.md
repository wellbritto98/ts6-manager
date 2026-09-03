# YouTube Cookie Auto-Refresh Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/youtube-cookie-refresh/design.md`
**Status**: Approved

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `CLAUDE.md` (vitest co-located `*.test.ts` under `packages/backend/src`; frontend has no tests), `packages/backend/package.json` (`vitest run`), `packages/backend/src/test-setup.ts`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Domain / helpers / CookieKeeper | unit | All branches; 1:1 to spec ACs; every listed edge case | `packages/backend/src/**/*.test.ts` | `pnpm --filter @ts6/backend exec vitest run <file>` |
| Route validation helpers | unit | Happy + listed error paths (400, field list) | `packages/backend/src/routes/*.test.ts` | `pnpm --filter @ts6/backend exec vitest run <file>` |
| yt-browser sidecar / Docker / compose | none | build gate only | - | `pnpm --filter @ts6/backend exec tsc --noEmit` |
| Frontend UI | none | no frontend tests in repo; verify in browser | - | i18n merge + typecheck |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After tasks with unit tests only | `pnpm --filter @ts6/backend exec vitest run src/voice/audio/cookie-refresh.test.ts src/voice/audio/cookie-keeper.test.ts src/routes/yt-cookie-refresh.routes.test.ts src/voice/audio/youtube.test.ts ; node --test packages/yt-browser/server.test.mjs` |
| Full | After tasks with e2e/integration tests | same as Quick (no e2e in this repo) |
| Build | After phase completion or config/entity-only tasks | `pnpm --filter @ts6/backend exec tsc --noEmit && pnpm --filter @ts6/backend exec vitest run` |

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Foundation

```
T1 -> T2
```

### Phase 2: Sidecar and config

```
T3 -> T4
```

### Phase 3: API and playback hook

```
T5 -> T6
```

### Phase 4: UI

```
T7
```

---

## Task Breakdown

### T1: Cookie refresh helpers

**What**: Pure helpers for interval parse, Netscape conversion, YouTube-domain check, atomic swap, bot-check detection, plus unit tests mapped to YTCR-06/07/09/11/13/14 edge cases.
**Where**: `packages/backend/src/voice/audio/cookie-refresh.ts`
**Depends on**: None
**Reuses**: `packages/backend/src/utils/app-settings.ts` parse style
**Requirement**: YTCR-06, YTCR-07, YTCR-09, YTCR-11, YTCR-13, YTCR-14

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [ ] `parseIntervalHours` returns null outside 1–24 and the integer inside
- [ ] omitted/invalid raw values used by callers can default to 6 at the keeper layer (helper returns null)
- [ ] `hasYoutubeCookies` is false when no domain contains `youtube.com`
- [ ] `atomicSwapCookieFile` writes mode `0600` and leaves the previous file when the caller skips the swap
- [ ] `isBotCheckError` is true only for messages containing `Sign in to confirm you're not a bot`
- [ ] `cookiesToNetscape` never logs cookie values
- [ ] Gate check passes: quick vitest on `cookie-refresh.test.ts`
- [ ] Test count: 12 tests pass

**Tests**: unit
**Gate**: quick

---

### T2: CookieKeeper service

**What**: CookieKeeper enable/disable, fail-closed refresh, in-flight join, 5 minute cooldown, force bypass, status DTO, SidecarUnreachableError.
**Where**: `packages/backend/src/voice/audio/cookie-keeper.ts`
**Depends on**: T1
**Reuses**: `cookie-refresh.ts`, sidecar-client bearer pattern
**Requirement**: YTCR-02, YTCR-03, YTCR-06, YTCR-07, YTCR-08, YTCR-09, YTCR-10, YTCR-16

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [ ] `enable` throws SidecarUnreachableError when sidecar ping fails
- [ ] failed export/validation leaves the live cookie file bytes unchanged
- [ ] overlapping `refreshNow` shares one in-flight run
- [ ] second refresh within 5 minutes without force returns `skipped`
- [ ] `refreshNow({ force: true })` runs despite cooldown
- [ ] `getStatus` returns exactly enabled, sidecarReachable, lastSuccessAt, lastError, cookieFileActive, needsLogin
- [ ] lastError contains no cookie values
- [ ] Gate check passes: quick vitest on `cookie-keeper.test.ts`
- [ ] Test count: 10 tests pass

**Tests**: unit
**Gate**: quick

---

### T3: yt-browser sidecar HTTP server

**What**: Sidecar process that serves `/health` and `/cookies` (CDP JSON) behind a bearer token and starts Chromium+noVNC via the entrypoint.
**Where**: `packages/yt-browser/server.mjs`
**Depends on**: T2
**Reuses**: media sidecar token header
**Requirement**: YTCR-02, YTCR-04

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [ ] Missing or wrong bearer on `/cookies` returns 401
- [ ] `/health` returns 200 when the debug port flag is mocked healthy
- [ ] `/cookies` JSON uses the `cookies` array field
- [ ] Gate check passes: node test file `packages/yt-browser/server.test.mjs`
- [ ] Test count: 3 tests pass

**Tests**: unit
**Gate**: quick

---

### T4: Docker image and compose wiring

**What**: Dockerfile.yt-browser plus yt-browser service and `YT_BROWSER_*` env on the three compose files that already ship the media sidecar, and `.env.example`.
**Where**: `Dockerfile.yt-browser`
**Depends on**: T3
**Reuses**: `Dockerfile.sidecar`, compose sidecar service block
**Requirement**: YTCR-04

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [ ] `Dockerfile.yt-browser` exists and CMD starts the sidecar
- [ ] `docker-compose.yml`, `docker-compose.dev.yml`, and `docker-compose.hub.yml` define `yt-browser` without publishing 6080/9090
- [ ] `.env.example` documents `YT_BROWSER_URL`, `YT_BROWSER_NOVNC_URL`, `YT_BROWSER_TOKEN`
- [ ] `docker-compose.coolify.yml` is unchanged
- [ ] Gate check passes: build (`tsc --noEmit`)
- [ ] Test count: unchanged backend suite

**Tests**: none
**Gate**: build

---

### T5: Admin refresh HTTP API

**What**: Admin routes for GET/PUT status+enable and POST force refresh, mapping SidecarUnreachableError and bad interval to HTTP 400.
**Where**: `packages/backend/src/routes/yt-cookie-refresh.routes.ts`
**Depends on**: T4
**Reuses**: `requireAdmin` in `settings.routes.ts`
**Requirement**: YTCR-01, YTCR-02, YTCR-03, YTCR-13, YTCR-14, YTCR-15, YTCR-16

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [ ] PUT with `enabled: true` and unreachable sidecar maps to status 400
- [ ] PUT interval 0 or 25 maps to status 400 without calling persist
- [ ] PUT with enabled true and omitted interval uses 6
- [ ] GET status DTO lists the six spec fields and no cookie payload
- [ ] POST refresh calls `refreshNow({ force: true })`
- [ ] Gate check passes: quick vitest on `yt-cookie-refresh.routes.test.ts`
- [ ] Test count: 6 tests pass

**Tests**: unit
**Gate**: quick

---

### T6: noVNC proxy and yt-dlp bot-check hook

**What**: Authenticated noVNC reverse-proxy and yt-dlp bot-check enqueue that still rejects the caller.
**Where**: `packages/backend/src/voice/audio/youtube.ts`
**Depends on**: T5
**Reuses**: `runYtDlp`, CookieKeeper.notifyBotCheck
**Requirement**: YTCR-04, YTCR-11, YTCR-12

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [ ] `isBotCheckError` on a failed `runYtDlp` calls `notifyBotCheck` when a keeper is registered
- [ ] the same failure still rejects with a message containing `Sign in to confirm you're not a bot`
- [ ] notify is not called when refresh is disabled (keeper.notifyBotCheck no-ops)
- [ ] noVNC proxy handler refuses when `req.user.role` is not `admin` (unit-tested helper)
- [ ] Gate check passes: quick vitest on `youtube.test.ts` plus proxy helper tests
- [ ] Test count: at least 3 new tests plus existing youtube tests

**Tests**: unit
**Gate**: quick

---

### T7: YouTube settings UI

**What**: Extract YouTubeTab, add optional refresh toggle, interval, status, throwaway-account warning, noVNC iframe, Refresh now; i18n fragments for en/fr/de/es/it.
**Where**: `packages/frontend/src/pages/settings/YouTubeTab.tsx`
**Depends on**: T6
**Reuses**: existing YouTubeTab in Settings.tsx, `settings.api.ts`, i18n fragments
**Requirement**: YTCR-01, YTCR-02, YTCR-05, YTCR-10

**Tools**:

- MCP: NONE
- Skill: tlc-spec-driven Execute

**Done when**:

- [ ] Manual cookies.txt card still renders when refresh is off
- [ ] Toggle on shows interval, status fields, warning, iframe, Refresh now
- [ ] i18n fragment keys exist in all five languages and merge-i18n exits 0
- [ ] Gate check passes: `node packages/frontend/scripts/merge-i18n.mjs` and frontend typecheck
- [ ] Browser: toggle-off upload path still works if a dev server is up

**Tests**: none
**Gate**: build

---

## Phase Execution Map

```
T1 -> T2 -> T3 -> T4 -> T5 -> T6 -> T7
```

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: Cookie refresh helpers | 1 module | Granular |
| T2: CookieKeeper service | 1 class | Granular |
| T3: yt-browser sidecar HTTP server | 1 server file | Granular |
| T4: Docker image and compose wiring | config | Granular (compose extras listed in Done when) |
| T5: Admin refresh HTTP API | 1 route module | Granular |
| T6: noVNC proxy and yt-dlp bot-check hook | youtube.ts + proxy helper | Cohesive |
| T7: YouTube settings UI | 1 component | Granular |

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

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Domain / helpers | unit | unit | OK |
| T2 | CookieKeeper | unit | unit | OK |
| T3 | sidecar HTTP | unit (server.test.mjs) | unit | OK |
| T4 | Docker / compose | none | none | OK |
| T5 | Route validation helpers | unit | unit | OK |
| T6 | Domain youtube hook | unit | unit | OK |
| T7 | Frontend UI | none | none | OK |
