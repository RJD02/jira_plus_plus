#!/usr/bin/env bash
set -euo pipefail

PID_FILE="/tmp/reporting-api.pid"

if [[ ! -s "$PID_FILE" ]]; then
  echo "No Reporting API PID file at ${PID_FILE}; nothing to stop."
  exit 0
fi

PID="$(cat "$PID_FILE")"
if ps -p "$PID" >/dev/null 2>&1; then
  echo "Stopping Reporting API (PID ${PID}) ..."
  kill "$PID"
  wait "$PID" 2>/dev/null || true
else
  echo "Process ${PID} not running."
fi

rm -f "$PID_FILE"
echo "Stopped."
