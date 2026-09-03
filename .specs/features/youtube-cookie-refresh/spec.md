# YouTube Cookie Auto-Refresh Specification

## Problem Statement

Static `cookies.txt` files for yt-dlp go stale when YouTube rotates the session, often within hours. Admins must re-export cookies by hand. The manager already stores a Netscape cookie file at `data/yt-cookies.txt` but has no way to keep that session alive from a logged-in browser on the server.

## Goals

- [ ] An admin can optionally enable automatic YouTube cookie refresh from Settings → YouTube
- [ ] When enabled, the admin logs into YouTube in an in-app Chromium (noVNC) and the manager keeps `data/yt-cookies.txt` fresh without clobbering a working file
- [ ] Playback still uses the existing `--cookies` path; a bot-check error from yt-dlp triggers a refresh but does not hide the current failure

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
| ------- | ------ |
| Automated Google email/password or 2FA login | Google blocks scripted sign-in; ban risk |
| `--cookies-from-browser` on the admin desktop | Does not work in Docker/VPS |
| Multi-account cookie rotation / proxies | Separate ops feature |
| PO Token / bgutil | Separate extractor work |
| yt-browser service in `docker-compose.coolify.yml` | That file already omits the media sidecar; UI degrades like local dev |
| yt-dlp `android` player client | Separate playback hardening |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here - nothing is left silently unclear.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Refresh mechanism | Persistent Chromium profile on the server | Discussed; only option that works in Docker | y |
| First login | In-app noVNC iframe on the YouTube settings tab | Discussed | y |
| Refresh triggers | Interval (default 6 hours, bounds 1–24) and yt-dlp bot-check errors, 5 minute cooldown | Discussed | y |
| Invalid candidate | Fail-closed: keep the previous `yt-cookies.txt` | ytdlp-cookie-keeper pattern; a stale working file beats a fresh logged-out file | y |
| Sidecar missing (dev / Coolify) | Enable is rejected with HTTP 400; manual cookies.txt stays available | Compose without yt-browser must not crash the backend | y |
| Toggle off | Stops using the sidecar for refresh; does not delete the Chromium profile or `yt-cookies.txt` | Re-enable should not force a new Google login | y |
| Google account | UI warns to use a throwaway account | gist gamer191 ban risk | y |
| HTTP status when sidecar is unreachable | 400 | Plan requires 4xx, not 5xx | y |
| Validation video | `https://www.youtube.com/watch?v=jNQXAC9IVRw` | Short public video; injected in unit tests | y |
| Cooldown bypass | The "Refresh now" button passes `force: true` and skips the 5 minute cooldown | Admin intent | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Optional toggle and in-app YouTube login ⭐ MVP

**User Story**: As an admin, I want to turn on automatic cookie refresh and log into YouTube inside Settings so that yt-dlp can keep using a live session without me re-uploading cookies.txt.

**Why P1**: Without enable + login there is nothing to refresh.

**Acceptance Criteria** (each line is one EARS pattern):

1. WHERE automatic cookie refresh is disabled the system SHALL keep using only the existing manual `cookies.txt` upload, paste, and delete behaviour.
2. WHEN an admin enables the toggle and the YouTube browser sidecar is reachable THEN the system SHALL persist `youtube.cookieRefresh.enabled` as `true` and SHALL expose the noVNC iframe on the YouTube settings tab.
3. IF an admin enables the toggle while the sidecar is not reachable THEN the system SHALL respond with HTTP 400 and SHALL leave the toggle disabled.
4. WHILE automatic cookie refresh is enabled the system SHALL proxy noVNC only for an authenticated admin JWT and SHALL NOT publish the noVNC port on the host.
5. The system SHALL show a throwaway-Google-account warning on the YouTube settings tab whenever the refresh UI is visible.

**Independent Test**: Disable the toggle and confirm upload/paste still works. Enable without sidecar and receive HTTP 400. Enable with sidecar and see the iframe plus the warning.

---

### P1: Fail-closed cookie refresh ⭐ MVP

**User Story**: As an admin, I want refreshes to replace `data/yt-cookies.txt` only after a successful yt-dlp validation so that a dead browser session cannot wipe working cookies.

**Why P1**: Clobbering a good file is worse than not refreshing.

**Acceptance Criteria**:

1. WHEN a refresh runs (interval timer, bot-check hook, or Refresh now) THEN the system SHALL fetch cookies from the sidecar, write a temporary candidate, validate it with yt-dlp `--dump-json` using only that candidate against `https://www.youtube.com/watch?v=jNQXAC9IVRw`, and replace `data/yt-cookies.txt` with mode `0600` only if validation succeeds.
2. IF export or validation fails THEN the system SHALL keep the previous cookie file, SHALL record `lastError` without cookie values or signed URLs, and SHALL set status `needsLogin` to true when the failure indicates a missing YouTube session, otherwise `needsLogin` false with a refresh failure.
3. WHEN two refreshes overlap THEN the system SHALL join them onto a single in-flight run.
4. IF a refresh is requested within 5 minutes of the previous completed refresh AND `force` is false THEN the system SHALL skip the new run.
5. WHEN Refresh now is invoked THEN the system SHALL run a refresh with `force` true, skipping the cooldown.

**Independent Test**: Feed a candidate with no `.youtube.com` cookies and assert the previous file is unchanged. Overlap two refreshes and assert one export. Request again inside 5 minutes without force and assert skip.

---

### P1: Bot-check triggers a refresh without hiding the error ⭐ MVP

**User Story**: As a listener, I want a failed YouTube fetch that looks like bot-check to start a cookie refresh in the background so the next play has a better chance, without this play being reported as success.

**Why P1**: Interval-only refresh leaves playback broken until the next timer.

**Acceptance Criteria**:

1. WHEN yt-dlp fails with a bot-check message containing `Sign in to confirm you're not a bot` AND automatic refresh is enabled THEN the system SHALL enqueue a refresh that respects the 5 minute cooldown.
2. WHEN that bot-check failure happens THEN the system SHALL still reject the current playback or metadata call with the original yt-dlp error.

**Independent Test**: Stub yt-dlp to fail with the bot-check string while enabled; assert a refresh was requested and the caller still received the error.

---

### P2: Status and interval

**User Story**: As an admin, I want to see whether cookies are healthy and to set how often they refresh so that I can tell a dead session from a working one.

**Why P2**: Ops visibility; interval is required for the timer trigger.

**Acceptance Criteria**:

1. WHEN an admin sets the refresh interval THEN the system SHALL accept only integers from 1 through 24 inclusive and SHALL persist `youtube.cookieRefresh.intervalHours`.
2. IF the interval is omitted on enable THEN the system SHALL store 6.
3. IF the interval is outside 1–24 THEN the system SHALL respond with HTTP 400 and SHALL leave the stored interval unchanged.
4. WHEN an admin requests refresh status THEN the system SHALL return `enabled`, `sidecarReachable`, `lastSuccessAt`, `lastError`, `cookieFileActive`, and `needsLogin` and SHALL NOT include cookie names or values.

**Independent Test**: PUT interval 0 and 25 → 400. PUT 6 → stored 6. GET status matches the field list with no cookie payload.

---

## Edge Cases

- IF the candidate Netscape text has no cookie row whose domain contains `youtube.com` THEN the system SHALL treat validation as failed and SHALL NOT replace the live file.
- IF `YT_BROWSER_URL` is unset THEN the system SHALL treat the sidecar as not reachable.
- IF the sidecar returns HTTP 401/403/5xx or a network error THEN the system SHALL treat export as failed, keep the live file, and set `sidecarReachable` to false on the next status read.
- WHEN the toggle is turned off THEN the system SHALL stop the interval timer and SHALL ignore bot-check enqueue.
- IF logs or `lastError` are written THEN the system SHALL omit cookie values and signed CDN URLs.

---

## Requirement Traceability

Each requirement gets a unique ID for tracking across design, tasks, and validation.

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| YTCR-01 | P1: Optional toggle and in-app YouTube login | Tasks | Implementing |
| YTCR-02 | P1: Optional toggle and in-app YouTube login | Tasks | Implementing |
| YTCR-03 | P1: Optional toggle and in-app YouTube login | Tasks | Implementing |
| YTCR-04 | P1: Optional toggle and in-app YouTube login | Tasks | Implementing |
| YTCR-05 | P1: Optional toggle and in-app YouTube login | Tasks | In Tasks |
| YTCR-06 | P1: Fail-closed cookie refresh | Tasks | Implementing |
| YTCR-07 | P1: Fail-closed cookie refresh | Tasks | Implementing |
| YTCR-08 | P1: Fail-closed cookie refresh | Tasks | Implementing |
| YTCR-09 | P1: Fail-closed cookie refresh | Tasks | Implementing |
| YTCR-10 | P1: Fail-closed cookie refresh | Tasks | Implementing |
| YTCR-11 | P1: Bot-check triggers a refresh without hiding the error | Tasks | Implementing |
| YTCR-12 | P1: Bot-check triggers a refresh without hiding the error | Tasks | Implementing |
| YTCR-13 | P2: Status and interval | Tasks | Implementing |
| YTCR-14 | P2: Status and interval | Tasks | Implementing |
| YTCR-15 | P2: Status and interval | Tasks | Implementing |
| YTCR-16 | P2: Status and interval | Tasks | Implementing |

**ID format:** `YTCR-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 16 total, 16 mapped to tasks, 0 unmapped

---

## Success Criteria

- [ ] Admin can leave the feature off and keep using manual cookies.txt
- [ ] Admin can enable it only when the yt-browser sidecar answers, log in via noVNC, and see status after a refresh
- [ ] A failed validation never deletes or overwrites a previously working cookie file
- [ ] A bot-check yt-dlp error still fails the current request and schedules a refresh
