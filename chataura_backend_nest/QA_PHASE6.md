# Phase 6 QA results

Automated contract + security + concurrency checks for `chataura_backend_nest`.  
Laravel (`../chataura backend/`) stays production until an explicit DNS / Android `BASE_URL` flip.

## Commands

```bash
npm run build
npx prisma migrate deploy   # or Docker network if host Prisma P1001
npm run test                # unit: 100k RNG vs weights
npm run test:e2e            # Fastify inject contract suites
npm run test:k6             # local 20–50 VUs; 0 HTTP 5xx
```

Host Prisma **P1001** even when `nc localhost 5433` works: run migrate/API on Docker network `chataura_backend_nest_chataura_net` against `chataura_postgres:5432`, or bind `DATABASE_URL` to `127.0.0.1:5433`. Keep `tsconfig.build.json` `incremental: false` so `dist/main.js` is complete.

## Security / envelope checklist

| Check | Expected | Result |
| --- | --- | --- |
| Unauthenticated `GET /users/me` | 401 `{ success:false, error.code:UNAUTHORIZED }` | Pass (`test/app.e2e-spec.ts`) |
| RolesGuard on `/admin/*` | non-admin 403 `FORBIDDEN` | Pass (`test/media-agency-admin.e2e-spec.ts`) |
| Coin-seller cannot play games | `COIN_SELLER_GAMES_FORBIDDEN` | Pass (`test/games.e2e-spec.ts`) |
| Staff cannot play games | `STAFF_GAMES_FORBIDDEN` | Pass (`test/games.e2e-spec.ts`) |
| No negative `wallet_balance` under parallel gifts | balance ≥ 0; ledger count = successes | Pass (`test/wallet.e2e-spec.ts` 50-way) |
| Spin / bonus claims never negative | `new_balance` / `wallet_balance` ≥ 0 | Pass (`test/spin-bonus-invite.e2e-spec.ts`) |
| 1-1 `/call/*`, `/agora/token`, `/calls/history` | `FEATURE_DISABLED` | Pass (`test/spin-bonus-invite.e2e-spec.ts`) |
| `GET /wallet/can-call/:id/:type` | `can_call: false` | Pass (`test/wallet.e2e-spec.ts`) |
| Laravel folder `git status` clean | no Nest edits leak into Laravel | Confirmed at verify |

## Module contracts

| Suite | Android keys asserted |
| --- | --- |
| Auth / User | Gmail-only register, login, refresh, `dev_otp`, follow/friend/block, `EMAIL_NOT_VERIFIED`, `ACCOUNT_SUSPENDED` |
| Wallet | `packages`, mock recharge `wallet_balance`, gift `sender_balance_after`, gems→coins, `CASH_OUT_DISABLED` |
| Rooms | join empty JSON, audience take-seat `FORBIDDEN`, seats assign/mute, heartbeat, gift, `blocked-users` |
| Games | greedy/lucky77 `round_id` / settle / `user_balance` ≥ 0 |
| Chat | `conversation_id`, `STAR_CHAT_SESSION_REQUIRED`, session start/heartbeat/end debit |
| Media / agency / admin | feed `data` + `current_page`/`has_more`, like/comment, join/accept/weekly pay |
| Spin / bonuses / invite | `spin_cost`, `prize_type`, `invite_code`, availability `is_busy` only in live room |

## k6

- Local: `k6/load.local.js` — 20→50 VUs, health + login + greedy state/bet + room heartbeat. Pass = 0 HTTP 5xx.
- Prod: `k6/load.prod.js` — documented 1,000 WS / 250 rps profile. **Not** a laptop pass gate.

## Cutover

Readiness only. Do **not** change production DNS or ship a Play Store `BASE_URL` change in this phase. Rollback is switch Android/DNS back to Laravel. See README cutover runbook.
