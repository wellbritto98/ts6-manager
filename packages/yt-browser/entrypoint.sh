#!/bin/bash
set -euo pipefail

export DISPLAY="${DISPLAY:-:99}"
PROFILE_DIR="${YT_BROWSER_PROFILE:-/data/yt-profile}"
mkdir -p "$PROFILE_DIR"

# Both Chromium's SingletonLock (in the persisted profile volume, encodes the
# previous container's hostname+pid) and Xvfb's own /tmp lock (surviving a
# `docker restart`, which keeps the writable layer) refuse to start if the
# prior process didn't exit cleanly — which is the common case for a killed
# or recreated container. Neither X server nor Chromium clears these
# themselves, so do it before every start; nothing else can hold them at
# this point since this script owns both processes.
DISPLAY_NUM="${DISPLAY#:}"
rm -f "/tmp/.X${DISPLAY_NUM}-lock" "/tmp/.X11-unix/X${DISPLAY_NUM}"
rm -f "$PROFILE_DIR"/Singleton*

Xvfb "$DISPLAY" -screen 0 1280x800x24 -nolisten tcp &

for _ in $(seq 1 50); do
  [ -S "/tmp/.X11-unix/X${DISPLAY_NUM}" ] && break
  sleep 0.1
done

chromium --no-sandbox --disable-dev-shm-usage --disable-gpu \
  --user-data-dir="$PROFILE_DIR" --password-store=basic \
  --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1 \
  --no-first-run --disable-sync --disable-extensions \
  about:blank &

x11vnc -display "$DISPLAY" -forever -shared -rfbport 5900 -nopw -localhost -quiet &
websockify --web=/usr/share/novnc/ 6080 127.0.0.1:5900 &

exec node /app/server.mjs
