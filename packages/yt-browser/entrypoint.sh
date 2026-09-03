#!/bin/bash
set -euo pipefail

export DISPLAY="${DISPLAY:-:99}"
PROFILE_DIR="${YT_BROWSER_PROFILE:-/data/yt-profile}"
mkdir -p "$PROFILE_DIR"

Xvfb "$DISPLAY" -screen 0 1280x800x24 -nolisten tcp &
sleep 0.5

chromium --no-sandbox --disable-dev-shm-usage --disable-gpu \
  --user-data-dir="$PROFILE_DIR" --password-store=basic \
  --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1 \
  --no-first-run --disable-sync --disable-extensions \
  about:blank &

x11vnc -display "$DISPLAY" -forever -shared -rfbport 5900 -nopw -localhost -quiet &
websockify --web=/usr/share/novnc/ 6080 127.0.0.1:5900 &

exec node /app/server.mjs
