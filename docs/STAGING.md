# Test server (staging)

A second, isolated copy of the backend on the same VPS, for testing unfinished work with real
devices before it reaches production users.

| | Production | Staging |
|---|---|---|
| API | `https://chataura.in/api/v2/` | `https://chataura.in/test/api/v2/` |
| Admin panel | `https://chataura.in/nextadmin` | `https://chataura.in/test/nextadmin` |
| Code on VPS | `/var/www/chataura_backend_next` (branch `main`) | `/var/www/chataura_staging` (feature branch) |
| Containers | `chataura_api`, `chataura_postgres`, … | `chataura_stg_api`, `chataura_stg_postgres`, `chataura_stg_redis`, `chataura_stg_admin` |
| Database | `chataura_db` | `chataura_staging` (own volume) |
| Login tokens | own JWT secret | own JWT secret (tokens never work across) |

## Use it from the app

Build the `staging` variant: `./gradlew :app:assembleStaging` (or pick *staging* in Android
Studio's Build Variants). It is the debug app pointed at the test server. Same package name as the
store app (Firebase only knows `com.chataura.app`), so installing it replaces the store app on
that phone.

Test accounts: `bibhude2@`, `bibhude5@`, `bibhude36@gmail.com`, `indsoft24@gmail.com`
(superadmin on staging only). Their staging password is separate from production.

## Deploy a branch

```bash
ssh chataura-vps
cd /var/www/chataura_staging && bash scripts/deploy-staging.sh feature/svip
```

Pulls the branch, rebuilds the staging containers, runs migrations on the staging database, and
health-checks `https://chataura.in/test/api/v2/health`. It refuses to run in the production folder.

## What is shared with production (and why it is safe)

- **Firebase (Firestore, FCM):** one project. Firestore paths are keyed by room UUID and
  conversation id; the staging copy deleted every copied room and conversation and starts new
  conversation ids at 1,000,000,000, so staging can't write into a real room or chat. Only the
  test accounts exist on staging, so pushes go only to test devices.
- **Agora:** same app; staging rooms have their own channel names.
- **GCS bucket:** gift art is read from it. Uploads from staging stay on the staging volume.
- **Payments:** Razorpay keys are blank on staging, so no real charges can happen there.

## Refresh the staging database from production

```bash
docker exec chataura_postgres pg_dump -U chataura_user -d chataura_db -Fc \
  | docker exec -i chataura_stg_postgres pg_restore -U chataura_user -d chataura_staging --clean --if-exists --no-owner --no-privileges
docker exec -i chataura_stg_postgres psql -U chataura_user -d chataura_staging < scripts/staging-prepare-db.sql
bash scripts/deploy-staging.sh   # re-applies the branch's migrations
```

Then fix SVIP art URLs to `/test/svip/` and set test passwords again (see the session notes).

## Take it offline

Remove the `include snippets/chataura-staging.conf;` line from `/etc/nginx/sites-available/chataura`,
`nginx -t && systemctl reload nginx`, then `docker compose -f docker-compose.staging.yml down`.
