#!/bin/bash
cd "$(dirname "$0")" || exit 1
PORT="${PORT:-8765}"
exec python3 -m http.server "$PORT" --bind 127.0.0.1
