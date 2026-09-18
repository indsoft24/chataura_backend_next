#!/usr/bin/env bash
# ChatAura PostgreSQL Automated Backup Script
# Retention: 7 days rolling backups
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/chataura}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/chataura_db_${TIMESTAMP}.sql.gz"
CONTAINER_NAME="${PG_CONTAINER:-chataura_postgres}"
DB_USER="${PG_USER:-chataura_user}"
DB_NAME="${PG_DATABASE:-chataura_db}"

mkdir -p "${BACKUP_DIR}"

echo "[$(date)] Starting ChatAura database backup..."
docker exec -t "${CONTAINER_NAME}" pg_dump -U "${DB_USER}" -d "${DB_NAME}" | gzip > "${BACKUP_FILE}"

echo "[$(date)] Backup completed: ${BACKUP_FILE} ($(du -sh "${BACKUP_FILE}" | cut -f1))"

# Prune backups older than 7 days
echo "[$(date)] Pruning backups older than 7 days..."
find "${BACKUP_DIR}" -name "chataura_db_*.sql.gz" -mtime +7 -exec rm -f {} \;
echo "[$(date)] Pruning complete."
