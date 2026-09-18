# MySQL (Laravel) → PostgreSQL (Nest) migration

## Safety

- Laravel MySQL, storage, and `.env` are **read-only**. Nothing is deleted.
- Nest Postgres tables are truncated and reloaded on `--apply` only.
- Always run `--dry-run` first.

## Prerequisites

- Docker Nest stack healthy (`127.0.0.1:5433` Postgres)
- Host packages: `python3-pymysql`, `python3-psycopg2`
- Laravel `.env` reachable at `/var/www/chataura/.env`

## Commands

```bash
cd /var/www/chataura_backend_next
# Do NOT export Laravel DB_* into the shell before docker compose
unset DB_PASSWORD DB_HOST DB_USERNAME DB_DATABASE

python3 scripts/migrate_mysql_to_postgres.py --dry-run
python3 scripts/migrate_mysql_to_postgres.py --apply
```

Reports land in `backups/migration_report_*.md`.

## Key transforms

| Source | Target |
|--------|--------|
| `virtual_gifts` + unique `gift_types` | `gifts` |
| `coin_transactions` (sender/receiver) | Nest ledger rows (often 1→2) |
| `media_posts` / `post_*` | `media_items` / `media_*` |
| `user_bonus_grants` | `bonus_claims` |
| `coin_packages.status` | `is_active` |
| `agency_affiliations.linked_room_id` | `room_id` |

## Skipped (archive in mysqldump only)

`jobs`, `cache*`, `sessions`, `calls*`, `chat_groups`, `wallet_packages`, staff tables, etc. (see script `SKIP_MYSQL_TABLES`).

## After apply

1. Upsert Nest admin if needed (`admin@gmail.com`)
2. `curl https://chataura.in/api/v2/health`
3. Login with a migrated user password hash (same as Laravel)
4. Confirm Laravel `/api/v1` still works
