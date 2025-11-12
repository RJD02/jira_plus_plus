#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="/tmp/designer-dev.pid"
LOG_FILE="/tmp/designer-dev.log"
HOST="${VITE_DESIGNER_HOST:-127.0.0.1}"
PORT_VALUE="${VITE_DESIGNER_DEV_PORT:-5176}"

if [[ -s "$PID_FILE" ]]; then
  EXISTING_PID="$(cat "$PID_FILE")"
  if ps -p "$EXISTING_PID" >/dev/null 2>&1; then
    echo "Metadata designer dev server already running (PID ${EXISTING_PID}). Logs: ${LOG_FILE}"
    exit 0
  fi
fi

cd "$PROJECT_ROOT"
: >"$LOG_FILE"
export VITE_DEV_SERVER_HOST="${HOST}"
export VITE_DESIGNER_DEV_PORT="${PORT_VALUE}"
export PORT="${PORT_VALUE}"
corepack pnpm --filter @apps/reporting-designer dev -- --host "${HOST}" --port "${PORT_VALUE}" >"$LOG_FILE" 2>&1 &
NEW_PID=$!
echo "$NEW_PID" >"$PID_FILE"
echo "Started metadata designer dev server (PID ${NEW_PID}) on http://${HOST}:${PORT_VALUE}"
echo "Logs: ${LOG_FILE}"
