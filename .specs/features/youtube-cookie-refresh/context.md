# YouTube Cookie Auto-Refresh Context

**Gathered:** 2026-09-03
**Spec:** `.specs/features/youtube-cookie-refresh/spec.md`
**Status:** Ready for design

---

## Feature Boundary

Optional automatic refresh of the existing yt-dlp Netscape cookie file from a persistent Chromium profile on the server, with in-app YouTube login (noVNC) and fail-closed swaps. Manual cookies.txt upload remains. No Google password automation and no desktop `--cookies-from-browser`.

---

## Implementation Decisions

### Mechanism

- Persistent browser profile on the server (not the admin's desktop Chrome).
- Cookies flow: sidecar CDP dump → Netscape candidate → yt-dlp validate → atomic replace of `data/yt-cookies.txt`.

### First login

- Chromium + Xvfb + noVNC inside a yt-browser sidecar.
- Admin sees an iframe on Settings → YouTube when the toggle is on.
- Login is manual in that Chromium. No email/password fields in the manager.

### Refresh triggers

- Interval timer, default 6 hours, integers 1–24.
- yt-dlp bot-check error (`Sign in to confirm you're not a bot`) enqueues a refresh.
- 5 minute cooldown unless Refresh now (`force: true`).
- Overlapping runs join one in-flight promise.

### Failure

- Fail-closed: never replace the live file on export/validation failure.
- Enable without sidecar: HTTP 400, toggle stays off.
- Playback error is not swallowed.

### Agent's Discretion

- Chromium as a sidecar (not in the backend image).
- CDP dump on the sidecar rather than `--cookies-from-browser` against a locked SQLite.
- AppSetting keys `youtube.cookieRefresh.enabled` and `youtube.cookieRefresh.intervalHours`.
- Extract `YouTubeTab` out of `Settings.tsx`.
- Coolify compose stays without yt-browser.

### Declined / Undiscussed Gray Areas → Assumptions

- Interval default 6 hours (logged in spec).
- Validation video `jNQXAC9IVRw` (logged in spec).
- Toggle off does not wipe the profile (logged in spec).

---

## Specific References

- [BotMusicaDiscord](https://github.com/santino-rosso/BotMusicaDiscord): optional cookies.txt mount only.
- [umutxyp/MusicBot](https://github.com/umutxyp/MusicBot): `--cookies-from-browser` on the same machine.
- [gamer191 gist](https://gist.github.com/gamer191/ddf0b23b0a6df8e2ffe81bd1dda9154c): throwaway Google account; exported cookies rotate if the same session stays open in another browser.
- [ytdlp-cookie-keeper](https://www.npmjs.com/package/ytdlp-cookie-keeper): export → validate → atomic swap; no scripted login.

---

## Deferred Ideas

- yt-dlp android / web player client as a separate anti-bot measure.
- Optional Chromium sidecar on Coolify compose.
- Multi-account cookie rotation.
