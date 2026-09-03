# LESSONS - auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

_none_

## Candidates (under observation - do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-001 - Assert live file bytes stay unchanged when candidate validation throws, not only when export fails or youtube.com cookies are missing.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `cookie-keeper` · harmful: 0
- features: youtube-cookie-refresh
- evidence: mutant-3 cookie-keeper.ts:133 (cookie-keeper)
- last seen: 2026-09-03T18:56:20Z

### L-002 - Assert the exact yt-dlp argv the spec names, including --dump-json and the validation video URL, not only that a validateCandidate mock exists.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `yt-dlp-validation` · harmful: 0
- features: youtube-cookie-refresh
- evidence: YTCR-06 (yt-dlp-validation)
- last seen: 2026-09-03T18:56:20Z

### L-003 - Assert the exact persisted setting key and value, not only that enable() resolved.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `app-settings` · harmful: 0
- features: youtube-cookie-refresh
- evidence: YTCR-02 (app-settings)
- last seen: 2026-09-03T18:56:20Z

### L-004 - A user-visible UI requirement is not covered until a test asserts the rendered copy or element; JSX is not test evidence.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `frontend` · harmful: 0
- features: youtube-cookie-refresh
- evidence: YTCR-01 (frontend)
- last seen: 2026-09-03T18:56:20Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
