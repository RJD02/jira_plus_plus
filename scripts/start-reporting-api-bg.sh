#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="/tmp/reporting-api.pid"
LOG_FILE="/tmp/reporting-api.log"

if [[ -s "$PID_FILE" ]]; then
  EXISTING_PID="$(cat "$PID_FILE")"
  if ps -p "$EXISTING_PID" >/dev/null 2>&1; then
    echo "Reporting API already running (PID ${EXISTING_PID}). Logs: ${LOG_FILE}"
    exit 0
  fi
fi

cd "$PROJECT_ROOT"
: >"$LOG_FILE"
corepack pnpm --filter @apps/reporting-api dev >"$LOG_FILE" 2>&1 &
NEW_PID=$!
echo "$NEW_PID" >"$PID_FILE"
echo "Started Reporting API (PID ${NEW_PID}) on http://localhost:${PORT:-4002}"
echo "Logs: ${LOG_FILE}"
