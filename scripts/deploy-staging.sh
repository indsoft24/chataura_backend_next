#!/usr/bin/env bash
# ==============================================================================
# ChatAura test server (staging): https://chataura.in/test/api/v2 and /test/nextadmin
# Runs from its own checkout (/var/www/chataura_staging) with its own containers,
# database and uploads. Production (/var/www/chataura_backend_next) is never touched.
#
#   bash scripts/deploy-staging.sh [branch]      # default: current branch
#
# One-time setup (already done on the VPS):
#   - .env with STG_DB_PASSWORD=...
#   - chataura_backend_nest/.env.staging (prod .env with its own JWT_SECRET)
#   - secrets/ (firebase + gcs keys, copied from production)
#   - nginx: docker/nginx-staging.conf -> /etc/nginx/snippets/chataura-staging.conf,
#     included from the chataura.in server block
#   - database: production copy prepared with scripts/staging-prepare-db.sql
# ==============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ "$ROOT_DIR" = "/var/www/chataura_backend_next" ]; then
  echo "Refusing to run in the production checkout." >&2
  exit 1
fi

BRANCH="${1:-$(git branch --show-current)}"
echo "--> Updating code to origin/$BRANCH"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

set -a; . ./.env; set +a
COMPOSE="docker compose -f docker-compose.staging.yml"

echo "--> Building and starting staging containers"
$COMPOSE up -d --build

echo "--> Applying migrations to the staging database"
for i in {1..30}; do
  docker exec chataura_stg_postgres pg_isready -U chataura_user -d chataura_staging >/dev/null 2>&1 && break
  sleep 2
done
docker exec -u node -e DATABASE_URL="postgresql://chataura_user:${STG_DB_PASSWORD}@postgres:5432/chataura_staging?schema=public" \
  chataura_stg_api npx prisma migrate deploy

echo "--> Health check"
for i in {1..30}; do
  if curl -fs http://127.0.0.1:3015/api/v2/health | grep -q '"status":"ok"'; then
    echo "    Staging API is up: https://chataura.in/test/api/v2/health"
    exit 0
  fi
  sleep 2
done
echo "Staging API did not become healthy; check: docker logs chataura_stg_api" >&2
exit 1
