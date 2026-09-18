#!/usr/bin/env bash
# ==============================================================================
# ChatAura VPS Docker Deployment Script
# Targets: https://chataura.in/api/v2 and https://chataura.in/nextadmin/login
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$ROOT_DIR"

echo "========================================================"
echo " Starting ChatAura v2 & NextAdmin Deployment on VPS... "
echo " Working directory: $(pwd)"
echo "========================================================"

# 1. Ensure root .env exists
if [ ! -f .env ]; then
  echo "--> Creating default .env file..."
  cat << 'EOF' > .env
COMPOSE_PROFILES=full
DB_PASSWORD=chataura_dev
API_PREFIX=api/v2
PUBLIC_BASE_URL=https://chataura.in
NEXT_PUBLIC_BASE_PATH=/nextadmin
NEXT_PUBLIC_API_URL=/api/v2
EOF
fi

# 2. Build and restart containers in detached mode
echo "--> Building and starting Docker containers..."
docker compose up -d --build

# 3. Wait for PostgreSQL container to become healthy
echo "--> Waiting for PostgreSQL container to be healthy..."
for i in {1..30}; do
  if docker exec chataura_postgres pg_isready -U chataura_user -d chataura_db >/dev/null 2>&1; then
    echo "    PostgreSQL is ready!"
    break
  fi
  echo "    Waiting for postgres... ($i/30)"
  sleep 2
done

# 4. Wait for NestJS API to boot and respond on port 3005
echo "--> Verifying NestJS API health check on http://127.0.0.1:3005/api/v2/health..."
for i in {1..20}; do
  HEALTH=$(curl -s http://127.0.0.1:3005/api/v2/health || true)
  if echo "$HEALTH" | grep -q '"status":"ok"'; then
    echo "    NestJS API v2 is healthy: $HEALTH"
    break
  fi
  echo "    Waiting for API v2... ($i/20)"
  sleep 2
done

# 5. Check Next.js Admin Panel response on port 3100
echo "--> Verifying Admin Panel on http://127.0.0.1:3100/nextadmin/login..."
ADMIN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3100/nextadmin/login || true)
echo "    Admin Panel HTTP Status: $ADMIN_STATUS"

echo "========================================================"
echo " Docker Stack Successfully Deployed!                   "
echo "--------------------------------------------------------"
echo " NestJS v2 (Container chataura_api):     Port 3005"
echo " NextAdmin (Container chataura_admin):   Port 3100"
echo " PostgreSQL (Container chataura_postgres): Port 5433"
echo " Redis (Container chataura_redis):       Port 6380"
echo ""
echo " Next Steps for Host Nginx on VPS:"
echo " 1. Copy snippet from docker/nginx-vps-chataura.conf"
echo "    into /etc/nginx/sites-available/chataura.in"
echo " 2. Run: sudo nginx -t && sudo systemctl reload nginx"
echo " 3. Access https://chataura.in/nextadmin/login"
echo " 4. Access https://chataura.in/api/v2/health"
echo "========================================================"
