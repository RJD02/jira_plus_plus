#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="/tmp/jpp-dev.pid"
LOG_FILE="/tmp/jpp-dev.log"
HOST="127.0.0.1"
PORT="${VITE_DEV_SERVER_PORT:-5175}"

if [[ -s "$PID_FILE" ]]; then
  EXISTING_PID="$(cat "$PID_FILE")"
  if ps -p "$EXISTING_PID" >/dev/null 2>&1; then
    echo "Jira++ web dev server already running (PID ${EXISTING_PID}). Logs: ${LOG_FILE}"
    exit 0
  fi
fi

cd "$PROJECT_ROOT"
export VITE_DEV_SERVER_HOST="${HOST}"
export VITE_DEV_SERVER_PORT="${PORT}"
corepack pnpm --filter @apps/jira-plus-plus dev >"$LOG_FILE" 2>&1 &
NEW_PID=$!
echo "$NEW_PID" >"$PID_FILE"
echo "Started Jira++ web dev server (PID ${NEW_PID}) on http://${HOST}:${PORT}"
echo "Logs: ${LOG_FILE}"
