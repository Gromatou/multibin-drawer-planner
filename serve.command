#!/bin/bash
cd "$(dirname "$0")" || exit 1
PORT="${PORT:-8765}"
if /usr/bin/curl -s -o /dev/null "http://127.0.0.1:$PORT/"; then
  open "http://127.0.0.1:$PORT/"
  exit 0
fi
(sleep 0.8; open "http://127.0.0.1:$PORT/") &
exec python3 -m http.server "$PORT" --bind 127.0.0.1
