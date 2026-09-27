#!/usr/bin/env bash
# ChatAura PostgreSQL backup.
# Writes a pg_dump custom-format archive (compressed, restorable with pg_restore),
# verifies it, and prunes with tiered retention:
#   - every backup from the last KEEP_ALL_DAYS days
#   - newest backup per day (UTC) for the last KEEP_DAILY_DAYS days
#   - newest backup per ISO week for the last KEEP_WEEKLY_WEEKS weeks
#
# PRUNE_ONLY=1 skips the dump; DRY_RUN=1 only prints what would be deleted.
#
# Restore example:
#   docker exec -i chataura_postgres pg_restore -U chataura_user -d chataura_db \
#     --clean --if-exists --no-owner < /var/backups/chataura/chataura_db_YYYYmmdd_HHMMSS.dump
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/chataura}"
CONTAINER_NAME="${PG_CONTAINER:-chataura_postgres}"
DB_USER="${PG_USER:-chataura_user}"
DB_NAME="${PG_DATABASE:-chataura_db}"
KEEP_ALL_DAYS="${KEEP_ALL_DAYS:-2}"
KEEP_DAILY_DAYS="${KEEP_DAILY_DAYS:-14}"
KEEP_WEEKLY_WEEKS="${KEEP_WEEKLY_WEEKS:-8}"
MIN_BYTES="${MIN_BYTES:-100000}"
PRUNE_ONLY="${PRUNE_ONLY:-0}"
DRY_RUN="${DRY_RUN:-0}"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FINAL_FILE="${BACKUP_DIR}/chataura_db_${TIMESTAMP}.dump"
TMP_FILE="${FINAL_FILE}.partial"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

umask 077
mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

exec 9>"${BACKUP_DIR}/.backup.lock"
if ! flock -n 9; then
  log "Another backup is already running; exiting."
  exit 0
fi

trap 'rm -f "${TMP_FILE}"' EXIT

run_backup() {
  log "Starting backup of ${DB_NAME} from ${CONTAINER_NAME}"

  # No -t: a TTY rewrites \n as \r\n and corrupts the dump stream.
  docker exec -i "${CONTAINER_NAME}" \
    pg_dump -U "${DB_USER}" -d "${DB_NAME}" -Fc -Z 6 > "${TMP_FILE}"

  SIZE=$(stat -c %s "${TMP_FILE}")
  if [ "${SIZE}" -lt "${MIN_BYTES}" ]; then
    log "ERROR: dump is only ${SIZE} bytes (minimum ${MIN_BYTES}); keeping previous backups."
    exit 1
  fi

  if ! docker exec -i "${CONTAINER_NAME}" pg_restore --list < "${TMP_FILE}" > /dev/null; then
    log "ERROR: pg_restore could not read the archive; keeping previous backups."
    exit 1
  fi

  mv "${TMP_FILE}" "${FINAL_FILE}"
  sha256sum "${FINAL_FILE}" > "${FINAL_FILE}.sha256"
  log "Backup verified: ${FINAL_FILE} ($(du -h "${FINAL_FILE}" | cut -f1))"
}

# Ages come from the timestamp in the filename (UTC), not mtime, so copying or
# touching files never changes which tier they fall into.
prune_backups() {
  local now all_cutoff daily_cutoff weekly_cutoff
  now=$(date -u +%s)
  all_cutoff=$(( now - KEEP_ALL_DAYS * 86400 ))
  daily_cutoff=$(( now - KEEP_DAILY_DAYS * 86400 ))
  weekly_cutoff=$(( now - KEEP_WEEKLY_WEEKS * 7 * 86400 ))

  local -A seen_day=() seen_week=()
  local kept=0 deleted=0 f base ts epoch day week keep

  # Newest first, so the first backup seen for a day/week is its newest one.
  while IFS= read -r f; do
    base=$(basename "${f}" .dump)
    ts=${base#chataura_db_}
    [[ "${ts}" =~ ^[0-9]{8}_[0-9]{6}$ ]] || continue
    epoch=$(date -u -d "${ts:0:8} ${ts:9:2}:${ts:11:2}:${ts:13:2}" +%s 2>/dev/null) || continue
    day=${ts:0:8}
    week=$(date -u -d "@${epoch}" +%G-W%V)

    keep=0
    if [ "${epoch}" -ge "${all_cutoff}" ]; then
      keep=1
    elif [ "${epoch}" -ge "${daily_cutoff}" ] && [ -z "${seen_day[${day}]:-}" ]; then
      keep=1
    elif [ "${epoch}" -ge "${weekly_cutoff}" ] && [ -z "${seen_week[${week}]:-}" ]; then
      keep=1
    fi

    if [ "${keep}" -eq 1 ]; then
      seen_day[${day}]=1
      seen_week[${week}]=1
      kept=$(( kept + 1 ))
    else
      deleted=$(( deleted + 1 ))
      if [ "${DRY_RUN}" = "1" ]; then
        log "Would delete ${base}.dump"
      else
        rm -f "${f}" "${f}.sha256"
      fi
    fi
  done < <(find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'chataura_db_*.dump' | sort -r)

  local suffix=""
  [ "${DRY_RUN}" = "1" ] && suffix=" [dry run]"
  log "Retention: kept ${kept}, deleted ${deleted} (all ${KEEP_ALL_DAYS}d, daily ${KEEP_DAILY_DAYS}d, weekly ${KEEP_WEEKLY_WEEKS}w)${suffix}"
}

if [ "${PRUNE_ONLY}" != "1" ]; then
  run_backup
fi
prune_backups
