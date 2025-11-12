#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

function curl_health() {
  local name="$1"
  local url="$2"
  local query
  if [[ -n "${3:-}" ]]; then
    query="$3"
  else
    query="{ health { status version } }"
  fi
  echo "Checking ${name} (${url}) ..."
  local body status
  body=$(mktemp)
  local payload
  payload=$(node -p "JSON.stringify({ query: process.argv[1] })" "$query")
  if [[ -n "${DEBUG_UAT:-}" ]]; then
    echo "Raw query (${name}): ${query}"
    echo "Payload (${name}): ${payload}"
  fi
  status=$(
    curl -sS -o "${body}" -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -d "${payload}" \
      "${url}" || true
  )
  if [[ "${status}" != "200" ]]; then
    echo "❌ ${name} health failed (status ${status}). Response:"
    cat "${body}"
    rm -f "${body}"
    exit 1
  fi
  if ! grep -q '"status":"ok"' "${body}"; then
    echo "❌ ${name} health payload missing status ok."
    cat "${body}"
    rm -f "${body}"
    exit 1
  fi
  rm -f "${body}"
  echo "✅ ${name} healthy"
}

echo "Running Jira++ UI auth smoke..."
PLAYWRIGHT_BROWSERS_PATH=.playwright dotenv -e .env -- npx playwright test tests/web-auth.spec.ts --project=chromium

echo "Running Metadata UI auth smoke..."
PLAYWRIGHT_BROWSERS_PATH=.playwright dotenv -e .env -- npx playwright test tests/metadata-auth.spec.ts --project=chromium

echo "Running Metadata API lifecycle smoke..."
PLAYWRIGHT_BROWSERS_PATH=.playwright dotenv -e .env -- npx playwright test tests/metadata-lifecycle.spec.ts --project=chromium

curl_health "Core API" "http://localhost:4000/graphql" "{ health { status } }"
curl_health "Reporting API" "http://localhost:4002/graphql"
curl_health "Metadata API" "http://localhost:4010/graphql"

echo "All UAT smoke checks passed."
