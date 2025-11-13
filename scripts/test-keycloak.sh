#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${KEYCLOAK_BASE_URL:-http://localhost:8081}"
REALM="${KEYCLOAK_REALM:-nucleus}"
CLIENT_ID="${KEYCLOAK_CLIENT_ID:-jira-plus-plus}"
CLIENT_SECRET="${KEYCLOAK_CLIENT_SECRET:-change-me}"
TEST_USERNAME="${KEYCLOAK_TEST_USERNAME:-dev-writer}"
TEST_PASSWORD="${KEYCLOAK_TEST_PASSWORD:-password}"
SCOPE="${KEYCLOAK_SCOPE:-}"
TOKEN_URL="$BASE_URL/realms/$REALM/protocol/openid-connect/token"
curl_args=(
  -sfS -X POST "$TOKEN_URL"
  -H 'Content-Type: application/x-www-form-urlencoded'
  -d "client_id=$CLIENT_ID"
  -d "grant_type=password"
  -d "username=$TEST_USERNAME"
  -d "password=$TEST_PASSWORD"
)

if [[ -n "${CLIENT_SECRET:-}" ]]; then
  curl_args+=(-d "client_secret=$CLIENT_SECRET")
fi
if [[ -n "$SCOPE" ]]; then
  curl_args+=(-d "scope=$SCOPE")
fi

RESPONSE=$(curl "${curl_args[@]}")
ACCESS_TOKEN=$(echo "$RESPONSE" | grep -o '"access_token":"[^"]*' | cut -d '"' -f4)
if [[ -z "$ACCESS_TOKEN" ]]; then
  echo "Failed to retrieve an access token" >&2
  exit 1
fi
echo "Issued token (truncated): ${ACCESS_TOKEN:0:32}..." >&2
echo "$ACCESS_TOKEN"
