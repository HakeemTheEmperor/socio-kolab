#!/usr/bin/env bash
# Usage: metrics/start-server.sh [port] [DATABASE_URL override]
# Serves the production build (run `npx next build` first).
PORT=${1:-3100}
[ -n "$2" ] && export DATABASE_URL="$2"
exec npx next start -p "$PORT"
