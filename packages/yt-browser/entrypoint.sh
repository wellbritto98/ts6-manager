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

# Chromium can crash on its own (observed live: a renderer/GPU-process crash
# took the whole browser down while Xvfb/node/x11vnc kept running, so the
# container looked healthy from the outside but yt-dlp/CDP calls just failed
# forever). Nothing upstream restarts a crashed child of a backgrounded
# process, so supervise it here.
#
# Both launch and wait must happen inside the SAME backgrounded subshell:
#   - `wait $pid` only works on a direct child of the CURRENT shell. Launching
#     chromium in the outer script and waiting on it from a separate
#     backgrounded subshell fails instantly ("not a child of this shell"),
#     which looks like an immediate crash and caused a false-positive restart
#     — leaving two full Chromium process trees sharing one profile dir.
#   - Polling with `kill -0` instead avoids that, but a killed process stays
#     visible (and signalable) as a zombie until its parent reaps it via
#     wait() — nothing does that here, so `kill -0` kept reporting the dead
#     process as alive forever and never restarted it.
# Looping `chromium & wait $!` inside one subshell makes chromium a real
# child of that subshell, so `wait` both blocks correctly and reaps it.
supervise_chromium() {
  while true; do
    chromium --no-sandbox --disable-dev-shm-usage --disable-gpu \
      --user-data-dir="$PROFILE_DIR" --password-store=basic \
      --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1 \
      --no-first-run --disable-sync --disable-extensions \
      about:blank &
    local pid=$!
    wait "$pid" 2>/dev/null || true
    echo "[entrypoint] Chromium (pid $pid) exited, restarting" >&2
    rm -f "$PROFILE_DIR"/Singleton*
    sleep 1
  done
}
supervise_chromium &

x11vnc -display "$DISPLAY" -forever -shared -rfbport 5900 -nopw -localhost -quiet &
websockify --web=/usr/share/novnc/ 6080 127.0.0.1:5900 &

exec node /app/server.mjs
