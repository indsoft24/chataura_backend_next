# ChatAura NestJS Backend

Sibling NestJS modular monolith next to the existing Laravel API (`../chataura backend/`).  
**Laravel is not replaced** — production Android traffic still hits Laravel until a later cutover phase.

## Stack
- NestJS 11 + Fastify
- PostgreSQL 16 + Redis 7
- Prisma

## Quick start (local)

```bash
# Postgres on host port 5433 (5432 often taken); Redis uses local 6379 or compose 6380
docker compose up -d postgres
cp .env.example .env
npm install
npx prisma migrate dev
npm run start:dev
```

Health: `GET http://localhost:3000/api/v1/health`

## Phase status
- **Phase 1** — Docker, Fastify bootstrap, module shells, health
- **Phase 2** — Auth (JWT/refresh/OTP/Google/password) + User social graph
- **Phase 3** — Wallet (recharge, ledger, gems→coins, gifts, closed-loop withdraw disabled) + Gamification (XP/levels/frames/entry bars)
- **Phase 4** — Party rooms (join/seats/Agora/gifts), autonomous Greedy + Lucky77, 1-1 chat + star-chat billing. Socket.IO (`/ws/rooms`, `/ws/games`, `/ws/chat`) is additive; Android still uses HTTP.
- **Phase 5** — Posts/reels feeds + local/GCS-mock uploads, agency affiliations/weekly gems, Nest `/admin/*` + sibling Next.js panel (`../chataura_admin`)
- **Phase 6** — Spin / bonuses / invite / presence, Jest contract suites, k6 local, cutover **readiness** (Laravel still production)

### Phase 6 notes
- `GET /spin/prizes`, `POST /spin/play` (cost from `admin_settings.spin_cost`, default 50)
- `GET /bonuses/config|status`, `POST /bonuses/claim-admob|claim-game|claim-streak` (DB limits, ledger credits)
- `GET /users/me/invite`, `POST /invite/apply`; `GET /users/me/availability` (busy only if in a live room)
- `GET /rooms/:id/blocked-users` (host list)
- 1-1 calls stay disabled: `/call/*`, `/agora/token`, `/calls/history` → `FEATURE_DISABLED`; `GET /wallet/can-call/:id/:type` → `can_call: false`
- Contract tests: `npm run test:e2e`. RNG unit: `npm test`. Local load: `npm run test:k6`
- Health `phase: 6`

### Ops (Prisma / build)
- Host Prisma **P1001** to `localhost:5433` even when the port is open: use `127.0.0.1` or run inside Docker network `chataura_backend_nest_chataura_net` (`chataura_postgres:5432`)
- `tsconfig.build.json` has `incremental: false` so `dist/main.js` is a complete entry (do not rely on incremental `dist/src/main.js`)

## Cutover runbook (readiness — do not flip in this phase)

Preflight on the Nest sibling:

1. `docker compose up -d postgres redis` (or local Redis on `REDIS_PORT`)
2. `cp .env.example .env` — set `JWT_SECRET`, `DATABASE_URL`, empty Agora/Razorpay/GCS stay mock
3. `npx prisma migrate deploy && npm run prisma:seed`
4. `npm run build && npm run test:e2e && npm run test:k6`
5. Confirm Laravel directory is unchanged

Feature flags / env:

| Variable | Cutover note |
| --- | --- |
| `DATABASE_URL` | Postgres 16 (host 5433 locally) |
| `REDIS_URL` | Required for OTP |
| `JWT_SECRET` | Must be long and unique per environment |
| `AGORA_APP_ID` / `AGORA_APP_CERTIFICATE` | Empty → `mock_agora_*` party-room tokens |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Empty → `order_mock_*` |
| `GCS_BUCKET` | Empty → local `/uploads` + mock signed URLs |
| `SIGNUP_BONUS_COINS` | Default 50 |
| `PUBLIC_BASE_URL` | Invite links |

When **you** decide to flip (not this phase):

- Point Android `BASE_URL` at Nest `https://<host>/api/v1`
- Or switch DNS from Laravel to Nest
- Keep Laravel running for rollback

**Rollback:** switch Android `BASE_URL` / DNS back to Laravel. Nest writes are not automatically replayed to Laravel.

Do **not** change production DNS or ship a Play Store `BASE_URL` change until QA is green **and** you explicitly ask for the flip.

### Phase 3 notes
- Spendable balance is `wallet_balance` (synced with `coin_balance` on mutations)
- Gems are earn-only; convert via `POST /wallet/gems/convert` with `currency: "COINS"`
- `POST /wallet/withdraw` always returns `CASH_OUT_DISABLED`
- Without `RAZORPAY_KEY_ID`/`SECRET`, initiate creates `order_mock_*` orders; verify accepts them for local testing
- Seed packages/gifts/levels/frames: `npm run prisma:seed`

### Phase 4 notes
- Android stays on HTTP (`/api/v1`); Socket.IO namespaces `/ws/rooms`, `/ws/games`, `/ws/chat` are optional for future clients
- Greedy and Lucky77 run on 20s server timers — `/state` and `/result` hydrate/fallback; rounds do not freeze if nobody polls
- Empty `AGORA_APP_ID` / `AGORA_APP_CERTIFICATE` yields unsigned `mock_agora_*` tokens
- In-room text chat stays on Firestore; Nest stores 1-1 / star-chat only
- Seed themes, stickers, and a demo room: `npm run prisma:seed`

### Phase 5 notes
- Multipart `POST /upload`, `/posts/upload`, `/reels/upload` store files under `uploads/` (or accept `file_url` JSON for tests)
- Empty `GCS_BUCKET` returns mock signed URLs from `POST /upload/signed-url`
- Agency weekly approve credits gems to the room owner
- Admin routes require `role=admin`; Next.js panel: `chataura_admin/` (`NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1`)

