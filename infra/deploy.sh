#!/usr/bin/env bash
set -euo pipefail

# Deploy a Jira++ environment (UAT or Prod).
#
# Usage: ./infra/deploy.sh [env-file] [environment]
#   env-file:    path to environment file (default: infra/.env.uat)
#   environment: "uat" or "prod" (default: uat)
#
# This script:
#   1. Validates environment and env-file
#   2. Symlinks the env file to .env for Docker Compose
#   3. Sets the correct build context (UAT builds from /opt/jira-plus-plus/uat)
#   4. Pulls base images, builds app images, and applies the stack
#
# Both environments share a standalone Traefik instance (managed separately).

ENV_FILE=${1:-infra/.env.uat}
ENVIRONMENT=${2:-uat}

if [ ! -f "$ENV_FILE" ]; then
  echo "[deploy] Environment file '$ENV_FILE' not found" >&2
  exit 1
fi

if [[ "$ENVIRONMENT" != "uat" && "$ENVIRONMENT" != "prod" ]]; then
  echo "[deploy] Invalid environment '$ENVIRONMENT'. Must be 'uat' or 'prod'." >&2
  exit 1
fi

export COMPOSE_PROJECT_NAME="$ENVIRONMENT"

# Resolve working directory based on environment
if [ "$ENVIRONMENT" = "uat" ]; then
  WORK_DIR="/opt/jira-plus-plus/uat"
else
  WORK_DIR="/opt/jira-plus-plus/project"
fi

# Symlink env file
ENV_DIR=$(dirname "$ENV_FILE")
ENV_BASENAME=$(basename "$ENV_FILE")
if [ "$ENV_BASENAME" != ".env" ]; then
  ln -sf "$ENV_BASENAME" "$ENV_DIR/.env"
fi

# Use compose files from the working directory
COMPOSE_FILES=(
  "-f" "$WORK_DIR/infra/docker-compose.yml"
  "-f" "$WORK_DIR/infra/docker-compose.override.${ENVIRONMENT}.yml"
)

echo "[deploy] ================================================"
echo "[deploy] Environment : $ENVIRONMENT"
echo "[deploy] Project name: $COMPOSE_PROJECT_NAME"
echo "[deploy] Work dir    : $WORK_DIR"
echo "[deploy] Env file    : $ENV_FILE"
echo "[deploy] Compose     : ${COMPOSE_FILES[*]}"
echo "[deploy] ================================================"

echo "[deploy] Pulling latest base images..."
docker compose "${COMPOSE_FILES[@]}" --env-file "$ENV_FILE" pull || true

echo "[deploy] Building application images..."
docker compose "${COMPOSE_FILES[@]}" --env-file "$ENV_FILE" build

echo "[deploy] Applying stack..."
docker compose "${COMPOSE_FILES[@]}" --env-file "$ENV_FILE" up -d --remove-orphans

echo "[deploy] Waiting for services to stabilize..."
sleep 10

echo "[deploy] Service status:"
docker ps --filter "label=com.docker.compose.project=$ENVIRONMENT" --format "table {{.Names}}\t{{.Status}}"

echo ""
echo "[deploy] Pruning old images..."
docker image prune -f > /dev/null 2>&1

echo "[deploy] Done. $ENVIRONMENT deployed successfully."
