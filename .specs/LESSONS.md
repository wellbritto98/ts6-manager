# LESSONS - auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

### L-004 - A user-visible UI requirement is not covered until a test asserts the rendered copy or element; JSX is not test evidence.
- signal: `ac_gap` · recurrence: 2 feature(s) · scope: `frontend` · harmful: 0
- features: youtube-cookie-refresh, ai-agent-gateway
- evidence: YTCR-01 (frontend) (+1 more)
- last seen: 2026-09-04T20:04:02Z

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

### L-005 - Assert a spec-named denylist as a literal expected array in the test, not by iterating the production constant.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `tool-registry` · harmful: 0
- features: ai-agent-gateway
- evidence: mutant-4 tool-registry.ts:13 (tool-registry)
- last seen: 2026-09-04T20:04:02Z

### L-006 - Assert that secret env values never appear in log output, not only that boot throws on a bad secret.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `config` · harmful: 0
- features: ai-agent-gateway
- evidence: AIGW-03 (config)
- last seen: 2026-09-04T20:04:02Z

### L-007 - Assert constant-time credential comparison by spying on timingSafeEqual, not only match versus mismatch outcomes.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `agent-auth` · harmful: 0
- features: ai-agent-gateway
- evidence: AIGW-05 (agent-auth)
- last seen: 2026-09-04T20:04:03Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
