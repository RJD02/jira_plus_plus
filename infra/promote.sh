#!/usr/bin/env bash
set -euo pipefail

# Promote UAT code to Production.
#
# This script:
#   1. Reads the commit currently deployed in UAT
#   2. Verifies UAT services are healthy
#   3. Backs up the production database
#   4. Checks out the exact UAT commit in the prod directory
#   5. Syncs infra config from prod to UAT (keeps infra in sync)
#   6. Deploys the prod stack with the new code
#
# Usage: ./infra/promote.sh [--force]
#   --force: skip confirmation prompt

UAT_DIR="/opt/jira-plus-plus/uat"
PROD_DIR="/opt/jira-plus-plus/project"
BACKUP_DIR="/opt/jira-plus-plus/backups"
FORCE=${1:-}

# ── 1. Read UAT commit ──────────────────────────────────────
echo "[promote] Reading UAT commit..."
UAT_COMMIT=$(git -C "$UAT_DIR" rev-parse HEAD)
UAT_BRANCH=$(git -C "$UAT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "detached")
echo "[promote] UAT is at commit : $UAT_COMMIT"
echo "[promote] UAT branch       : $UAT_BRANCH"

PROD_COMMIT=$(git -C "$PROD_DIR" rev-parse HEAD)
echo "[promote] PROD is at commit: $PROD_COMMIT"

if [ "$UAT_COMMIT" = "$PROD_COMMIT" ]; then
  echo "[promote] UAT and PROD are already at the same commit. Nothing to promote."
  exit 0
fi

# ── 2. Verify UAT is healthy ────────────────────────────────
echo "[promote] Checking UAT health..."
UAT_API_HEALTH=$(docker exec uat-api-1 curl -sf http://localhost:4000/health 2>/dev/null || echo "UNHEALTHY")
if echo "$UAT_API_HEALTH" | grep -q status:ok; then
  echo "[promote] UAT API is healthy."
else
  echo "[promote] ERROR: UAT API is not healthy. Aborting promotion." >&2
  echo "[promote] Health response: $UAT_API_HEALTH" >&2
  exit 1
fi

# ── 3. Confirm ───────────────────────────────────────────────
if [ "$FORCE" != "--force" ]; then
  echo ""
  echo "  ╔══════════════════════════════════════════════════╗"
  echo "  ║  PROMOTE UAT → PROD                             ║"
  echo "  ║                                                  ║"
  echo "  ║  UAT commit : ${UAT_COMMIT:0:12}                          ║"
  echo "  ║  PROD commit: ${PROD_COMMIT:0:12}                          ║"
  echo "  ║                                                  ║"
  echo "  ║  This will:                                      ║"
  echo "  ║    1. Backup prod database                       ║"
  echo "  ║    2. Checkout UAT commit in prod dir            ║"
  echo "  ║    3. Rebuild and restart prod services          ║"
  echo "  ║    (brief downtime ~15-30 seconds)               ║"
  echo "  ╚══════════════════════════════════════════════════╝"
  echo ""
  read -rp "  Proceed? [y/N]: " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "[promote] Aborted."
    exit 0
  fi
fi

# ── 4. Backup prod database ─────────────────────────────────
echo "[promote] Backing up production database..."
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
docker exec prod-postgres-1 pg_dump -U jira jira_plus_plus 2>/dev/null | gzip > "$BACKUP_DIR/jira_prod_pre_promote_${TIMESTAMP}.sql.gz"
echo "[promote] Backup saved to $BACKUP_DIR/jira_prod_pre_promote_${TIMESTAMP}.sql.gz"

# ── 5. Checkout UAT commit in prod ──────────────────────────
echo "[promote] Fetching latest in prod repo..."
git -C "$PROD_DIR" fetch origin

echo "[promote] Checking out commit $UAT_COMMIT in prod..."
git -C "$PROD_DIR" checkout "$UAT_COMMIT"

# ── 6. Deploy prod ──────────────────────────────────────────
echo "[promote] Deploying prod..."
cd "$PROD_DIR"
./infra/deploy.sh infra/.env.prod prod

# ── 7. Verify ────────────────────────────────────────────────
echo ""
echo "[promote] Verifying prod health..."
sleep 15
PROD_API_HEALTH=$(docker exec prod-api-1 curl -sf http://localhost:4000/health 2>/dev/null || echo "UNHEALTHY")
if echo "$PROD_API_HEALTH" | grep -q status:ok; then
  echo "[promote] ✓ Prod API is healthy."
else
  echo "[promote] ⚠ WARNING: Prod API health check failed after promotion!" >&2
  echo "[promote] Response: $PROD_API_HEALTH" >&2
  echo "[promote] You may need to rollback. Previous commit: $PROD_COMMIT" >&2
  exit 1
fi

echo ""
echo "[promote] ════════════════════════════════════════════════"
echo "[promote] Promotion complete!"
echo "[promote] PROD is now at: $(git -C "$PROD_DIR" rev-parse HEAD)"
echo "[promote] Previous commit: $PROD_COMMIT"
echo "[promote] ════════════════════════════════════════════════"
