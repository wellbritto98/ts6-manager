# YouTube Cookie Auto-Refresh Validation

**Date**: 2026-09-03
**Spec**: `.specs/features/youtube-cookie-refresh/spec.md`
**Diff range**: `83a0635..HEAD`
**Verifier**: independent sub-agent (author ≠ verifier)

## Validation: FAIL

Independent re-derivation against spec ACs. Tests do not discriminate fail-closed swap on yt-dlp validation failure. Several precise spec outcomes have no assertion `file:line`. Frontend ACs have no test runner (matrix: Frontend UI | none); flagged as GAP, not inherited as covered.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 | ✅ Done | Helpers + 12 unit tests; `redactError` unused; no test that `cookiesToNetscape` never logs |
| T2 | ✅ Done | CookieKeeper + 11 tests (tasks.md said 10) |
| T3 | ✅ Done | yt-browser `server.test.mjs` 3 passed |
| T4 | ✅ Done | Compose/Dockerfile; no unit tests (matrix: none) |
| T5 | ✅ Done | Route helpers + 6 tests; successful PUT enable persist not asserted |
| T6 | ✅ Done | Bot-check hook + noVNC helper tests |
| T7 | ✅ Done | YouTubeTab + i18n; no frontend tests (matrix: none) |

---

## Spec-Anchored Acceptance Criteria

### P1: Optional toggle and in-app YouTube login

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| ------------------------- | -------------------- | ----------------------- | ------ |
| WHERE refresh is disabled the system SHALL keep using only existing manual `cookies.txt` upload, paste, and delete | Manual upload/paste/delete still work with toggle off | no test evidence (UI in `YouTubeTab.tsx`; no cookie-upload `*.test.ts`; matrix Frontend UI \| none) | ❌ GAP |
| WHEN admin enables and sidecar is reachable THEN persist `youtube.cookieRefresh.enabled` as `true` AND expose the noVNC iframe | Persist key `youtube.cookieRefresh.enabled` value `true`; iframe on YouTube tab | persist key/value: no assertion (`enable()` is called in keeper tests but `ENABLED_KEY` is never read back). iframe: implementation-only `YouTubeTab.tsx` (not a test) | ❌ GAP |
| IF admin enables while sidecar is not reachable THEN HTTP 400 AND leave the toggle disabled | HTTP 400; enabled stays false | `packages/backend/src/routes/yt-cookie-refresh.routes.test.ts:34` - `expect(res.status).toBe(400)`; `packages/backend/src/voice/audio/cookie-keeper.test.ts:60` - `rejects.toBeInstanceOf(SidecarUnreachableError)`. Residual: no assertion that `enabled`/persist stayed false after the 400 | ✅ PASS |
| WHILE enabled SHALL proxy noVNC only for an authenticated admin JWT AND SHALL NOT publish the noVNC port on the host | Non-admin refused; 6080/9090 unpublished on host | Admin: `packages/backend/src/routes/novnc-proxy.test.ts:13` - `expect((err as AppError).statusCode).toBe(403)`; `novnc-proxy.test.ts:18` - `assertNovncAdmin('admin')` does not throw. Host ports unpublished: no test (compose has no `ports:` on `yt-browser`; matrix docker \| none) | ❌ GAP |
| SHALL show a throwaway-Google-account warning whenever the refresh UI is visible | Warning visible on YouTube settings refresh UI | no test evidence (JSX `YouTubeTab.tsx:208` `t('settings.youtube.refresh.warning')` is implementation-only) | ❌ GAP |

### P1: Fail-closed cookie refresh

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| ------------------------- | -------------------- | ----------------------- | ------ |
| WHEN a refresh runs THEN fetch cookies, write a temp candidate, validate with yt-dlp `--dump-json` against `https://www.youtube.com/watch?v=jNQXAC9IVRw`, replace `data/yt-cookies.txt` mode `0600` only if validation succeeds | `--dump-json`; exact URL `jNQXAC9IVRw`; mode `0600`; swap only after success | Swap-on-success: `packages/backend/src/voice/audio/cookie-keeper.test.ts:157` - `expect(fs.readFileSync(cookiePath, 'utf8')).toContain('.youtube.com')`. Mode `0600`: `packages/backend/src/voice/audio/cookie-refresh.test.ts:67` - `expect(fs.statSync(live).mode & 0o777).toBe(0o600)`. `--dump-json` and validation URL: **no assertion** (`validateCandidate` is mocked; `VALIDATE_VIDEO_URL` appears only in factory production code) | ❌ GAP |
| IF export or validation fails THEN keep previous file, record `lastError` without cookie values or signed URLs, `needsLogin` true when missing session else false | Live bytes unchanged; redacted `lastError`; `needsLogin` true/false as specified | Export fail keep file: `cookie-keeper.test.ts:70` - `expect(fs.readFileSync(cookiePath, 'utf8')).toBe('PREVIOUS')`. Missing-session `needsLogin`: `cookie-keeper.test.ts:151` - `expect(status.needsLogin).toBe(true)`. lastError omits cookie value: `cookie-keeper.test.ts:141` - `expect(status.lastError).not.toContain('secret-value')` (weak: `lastError` is the code `export_failed`). **Validation-throw path untested.** Signed CDN URLs: no assertion (`redactError` is unused) | ❌ GAP |
| WHEN two refreshes overlap THEN join onto a single in-flight run | One export | `cookie-keeper.test.ts:95` - `expect(fetchCookies).toHaveBeenCalledTimes(1)` | ✅ PASS |
| IF requested within 5 minutes AND `force` is false THEN skip | Result `skipped`; no second export | `cookie-keeper.test.ts:105` - `expect(await keeper.refreshNow()).toBe('skipped')`; `:106` - `expect(fetchCookies).toHaveBeenCalledTimes(1)` | ✅ PASS |
| WHEN Refresh now is invoked THEN refresh with `force` true, skipping cooldown | `{ force: true }`; second run not skipped | Route: `yt-cookie-refresh.routes.test.ts:85` - `expect(keeper.refreshNow).toHaveBeenCalledWith({ force: true })`. Keeper: `cookie-keeper.test.ts:116` - `expect(await keeper.refreshNow({ force: true })).toBe('ok')`; `:117` - `expect(fetchCookies).toHaveBeenCalledTimes(2)` | ✅ PASS |

### P1: Bot-check triggers a refresh without hiding the error

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| ------------------------- | -------------------- | ----------------------- | ------ |
| WHEN yt-dlp fails with message containing `Sign in to confirm you're not a bot` AND refresh is enabled THEN enqueue a refresh that respects the 5 minute cooldown | Needle match; enqueue; cooldown without force | Needle helper: `cookie-refresh.test.ts:73` - `expect(isBotCheckError("ERROR: [youtube] Sign in to confirm you're not a bot")).toBe(true)`. Hook: `youtube.test.ts:97` - `expect(notify).toHaveBeenCalledOnce()`. Disabled no-op: `cookie-keeper.test.ts:169` - `expect(fetchCookies).not.toHaveBeenCalled()`. Residual: no test that `notifyBotCheck` when **enabled** calls `refreshNow()` without force | ✅ PASS |
| WHEN that bot-check failure happens THEN still reject the current call with the original yt-dlp error | Caller receives original error containing the needle | `youtube.test.ts:98` - `expect(err.message).toContain("Sign in to confirm you're not a bot")` | ✅ PASS |

### P2: Status and interval

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| ------------------------- | -------------------- | ----------------------- | ------ |
| WHEN admin sets the interval THEN accept only integers 1–24 inclusive AND persist `youtube.cookieRefresh.intervalHours` | 1 and 24 stored; persist that key | Bounds: `cookie-refresh.test.ts:15` - `expect(parseIntervalHours(1)).toBe(1)`; `:19` - `expect(parseIntervalHours(24)).toBe(24)`. Persist `youtube.cookieRefresh.intervalHours`: no assertion | ❌ GAP |
| IF interval omitted on enable THEN store 6 | Default 6 | `yt-cookie-refresh.routes.test.ts:24` - `expect(parsePutBody({ enabled: true })).toEqual({ enabled: true, intervalHours: 6 })` | ✅ PASS |
| IF interval outside 1–24 THEN HTTP 400 AND leave stored interval unchanged | 400 for 0 and 25; persist not called | `yt-cookie-refresh.routes.test.ts:40` - `(await applyRefreshPut(..., { intervalHours: 0 })).status).toBe(400)`; `:41` - interval 25 → `400`; `:42` - `expect(keeper.enable).not.toHaveBeenCalled()` | ✅ PASS |
| WHEN admin requests refresh status THEN return `enabled`, `sidecarReachable`, `lastSuccessAt`, `lastError`, `cookieFileActive`, `needsLogin` and SHALL NOT include cookie names or values | Exact six fields; no cookie payload | Keeper: `cookie-keeper.test.ts:123` - `expect(Object.keys(status).sort()).toEqual(['cookieFileActive','enabled','lastError','lastSuccessAt','needsLogin','sidecarReachable'])`. DTO strip: `yt-cookie-refresh.routes.test.ts:68` - same key list; `:76` - `expect(JSON.stringify(dto)).not.toContain('SID')`; `:77` - `not.toContain('leak')` | ✅ PASS |

**Status**: ❌ Gaps present

**Counts**: 9/16 ACs matched a spec-defined outcome with a test assertion. 7 ACs lack required evidence. 0 spec-precision gaps (spec outcomes were precise; tests were missing).

Frontend matrix note: YTCR-01, YTCR-02 (iframe), YTCR-05 are UI. Matrix says no frontend tests. Still GAP, not covered-by-backend-test.

---

## Discrimination Sensor

Isolated worktree `/tmp/ytcr-sensor-*` at HEAD. Real-tree `git status --porcelain` baseline captured (clean) and matched after `git worktree remove --force`. No `git stash`. No real-tree mutation.

| Mutation | File:line | Description | Killed? |
| -------- | --------- | ----------- | ------- |
| 1 | `packages/backend/src/voice/audio/cookie-keeper.ts:81` | `if (!reachable) throw` → `if (false && !reachable) throw` (enable without sidecar succeeds) | ✅ Killed (`cookie-keeper.test.ts` SidecarUnreachableError) |
| 2 | `packages/backend/src/voice/audio/cookie-keeper.ts:121` | Cooldown predicate prefixed with `false &&` (skip without force becomes a run) | ✅ Killed (`cookie-keeper.test.ts` cooldown `skipped`) |
| 3 | `packages/backend/src/voice/audio/cookie-keeper.ts:133` | `atomicSwapCookieFile` moved **before** `validateCandidate` (live file replaced even if yt-dlp validation throws) | ❌ Survived — 43/43 tests still passed |

**Sensor depth**: lightweight (3 behavior-level mutations)
**Result**: 2/3 killed - FAIL

Surviving mutant is the spec's highest-risk fail-closed path: a dead candidate can clobber `yt-cookies.txt` after a yt-dlp `--dump-json` failure. Existing fail-closed tests only cover export throw and missing `youtube.com` domain, not `validateCandidate` rejection.

---

## Interactive UAT Results (if performed)

Not performed. This Verifier run is automated (author ≠ verifier). STATE.md notes no in-IDE browser tools and the live Settings UI was not exercised. User-facing ACs (iframe, warning, manual upload with toggle off) remain unverified by a human.

| # | Test | Result | Details |
| --- | ---- | ------ | ------- |
| 1 | Settings → YouTube enable/login/warning | ⏭️ Skip | No interactive UAT session |

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ |
| Surgical changes | ✅ |
| No scope creep | ✅ |
| Matches patterns | ✅ (sidecar bearer, `AppError` 400, Netscape file `0600`) |
| Spec-anchored outcome check (asserted values match spec) | ❌ (see AC table) |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ❌ factory `validateCandidate` untested; persist keys unasserted; PUT enable happy path untested |
| Every test maps to a spec requirement - no unclaimed tests | ✅ new tests map to ACs/edges/Done-when; pre-existing `pickDownloadedFile`/`parseUrlInfo` tests are out of feature scope |
| Documented guidelines followed: `CLAUDE.md` (vitest backend only; frontend has no tests) | ✅ |

Notes: `redactError` in `cookie-refresh.ts` is dead. `YouTubeTab.tsx` is 295 lines (at the repo split heuristic). Compose does not publish 6080/9090 on `yt-browser` (implementation matches spec; no test).

---

## Edge Cases

- [x] Candidate Netscape text with no `youtube.com` domain: validation treated as failed, live file unchanged — `cookie-keeper.test.ts:78` `toBe('failed')`; `:79` `toBe('PREVIOUS')`; `:80` `validateCandidate` not called
- [ ] `YT_BROWSER_URL` unset → sidecar not reachable: factory `pingSidecar` returns `false` when `base` is empty; **no test**
- [ ] Sidecar HTTP 401/403/5xx or network error → export failed, keep live file, `sidecarReachable` false on next status: generic export throw keeps file (`cookie-keeper.test.ts:70`); **401/403/5xx and `sidecarReachable: false` after failed export not asserted**
- [x] Toggle off ignores bot-check enqueue — `cookie-keeper.test.ts:169` `fetchCookies` not called. Residual: interval timer stop is not asserted
- [ ] Logs/`lastError` omit cookie values and signed CDN URLs: cookie value omitted (`cookie-keeper.test.ts:141`) via generic `export_failed` code; signed URL redaction **not asserted**; `redactError` unused

---

## Gate Check

- **Gate command**: `pnpm --filter @ts6/backend exec tsc --noEmit && pnpm --filter @ts6/backend exec vitest run` (plus `node --test packages/yt-browser/server.test.mjs` from tasks Quick gate)
- **Result**: tsc exit 0; vitest 291 passed, 0 failed, 0 skipped; node:test 3 passed, 0 failed, 0 skipped
- **Test count before feature**: 257 vitest tests (291 at HEAD minus 34 new `it()` in this feature: cookie-refresh 12, cookie-keeper 11, routes 6, novnc-proxy 3, youtube +2)
- **Test count after feature**: 291 vitest + 3 node:test
- **Delta**: +34 vitest, +3 node:test
- **Skipped tests**: none
- **Failures**: none
- **Integrity**: test count increased; no skipped/disabled tests; no evidence of weakened pre-existing assertions (`youtube.test.ts` kept 12 prior cases and added 2)

---

## Fix Plans (if issues found)

### Fix 1: Fail-closed on `validateCandidate` throw (surviving mutant)

- **Root cause**: Keeper tests never make `validateCandidate` reject. Swap-before-validate (or swap-in-catch) is invisible.
- **Fix task**: In `cookie-keeper.test.ts`, stub `validateCandidate` to throw, call `refreshNow({ force: true })`, assert result `'failed'`, live file bytes still `'PREVIOUS'`, and `needsLogin === false`.
- **Verify**: Re-run sensor mutation 3; it must be killed.
- **Priority**: Blocker

### Fix 2: Assert yt-dlp validation argv (YTCR-06)

- **Root cause**: `validateCandidate` is injected and mocked; `cookie-keeper-factory.ts` `--dump-json` and `https://www.youtube.com/watch?v=jNQXAC9IVRw` are never asserted. Spec assumptions say the validation video is injected in unit tests.
- **Fix task**: Unit-test the factory validator (mock `runYtDlp`) and assert argv contains `'--dump-json'` and `VALIDATE_VIDEO_URL`.
- **Priority**: Blocker

### Fix 3: Persist `youtube.cookieRefresh.enabled` / `intervalHours` (YTCR-02, YTCR-13)

- **Root cause**: Conjunction rule: `enable()` resolving is not an assertion of the persisted key/value.
- **Fix task**: After `enable(6)`, assert prisma/upsert or settings map `youtube.cookieRefresh.enabled === 'true'` and `youtube.cookieRefresh.intervalHours === '6'`. After unreachable enable, assert those keys were not written.
- **Priority**: Major

### Fix 4: Sidecar-down and factory edges

- **Root cause**: `createCookieKeeper` ping/export branches are untested (`YT_BROWSER_URL` unset; `!res.ok`; `sidecarReachable` on next `getStatus`).
- **Fix task**: Cover unset URL → ping false; export `!res.ok` → failed keep-file; next `getStatus` with ping false → `sidecarReachable: false`.
- **Priority**: Major

### Fix 5: Frontend ACs (YTCR-01, YTCR-02 iframe, YTCR-05)

- **Root cause**: Repo has no frontend test runner. JSX is not evidence-or-zero.
- **Fix task**: Either add a minimal frontend test for manual-cookies card + warning key + iframe when `enabled && sidecarReachable`, or run interactive UAT and record results. Until then these ACs stay GAP.
- **Priority**: Major (user-facing MVP)

### Fix 6: Unpublished noVNC host ports (YTCR-04 conjunct)

- **Root cause**: Compose inspection is not a test.
- **Fix task**: A small fixture test or gate script that `yt-browser` services in `docker-compose.yml` / `.dev.yml` / `.hub.yml` have no `6080`/`9090` host port mapping.
- **Priority**: Minor (implementation already matches; evidence missing)

---

## Requirement Traceability Update

spec.md was not edited (Verifier may only write `validation.md`). Recommended statuses:

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| YTCR-01 | Verified | ❌ Needs Fix |
| YTCR-02 | Verified | ❌ Needs Fix |
| YTCR-03 | Implementing | ✅ Verified |
| YTCR-04 | Implementing | ❌ Needs Fix |
| YTCR-05 | Verified | ❌ Needs Fix |
| YTCR-06 | Implementing | ❌ Needs Fix |
| YTCR-07 | Implementing | ❌ Needs Fix |
| YTCR-08 | Implementing | ✅ Verified |
| YTCR-09 | Implementing | ✅ Verified |
| YTCR-10 | Verified | ✅ Verified |
| YTCR-11 | Implementing | ✅ Verified |
| YTCR-12 | Implementing | ✅ Verified |
| YTCR-13 | Implementing | ❌ Needs Fix |
| YTCR-14 | Implementing | ✅ Verified |
| YTCR-15 | Implementing | ✅ Verified |
| YTCR-16 | Implementing | ✅ Verified |

---

## Summary

**Overall**: ❌ Not Ready

**Spec-anchored check**: 9/16 ACs matched spec outcome; 7 gaps; 0 spec-precision gaps
**Sensor**: 2/3 mutations killed (1 survived)
**Gate**: 291 vitest passed, 3 node:test passed, tsc passed

**What works**: Cooldown skip and force bypass, in-flight join, HTTP 400 on unreachable sidecar and bad interval, status DTO field list without cookie payload, bot-check needle still rejects the caller, `0600` swap helper, missing-`youtube.com` candidate does not replace the live file.

**Issues found**: Sensor mutant 3 survived (swap before validate). No test asserts `--dump-json` or `jNQXAC9IVRw`. Persist keys unasserted. Frontend warning/iframe/manual-path ACs have no test citation. Factory URL-unset and sidecar 401/403/5xx status flag untested.

**Next steps**: Route Fix 1–3 as implementer tasks; re-run Verifier (sensor must kill swap-before-validate). Do not mark the feature done until this report is FAIL-free.
