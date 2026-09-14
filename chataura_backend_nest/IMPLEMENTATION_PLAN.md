# Technical Implementation Plan: ChatAura Backend Migration to NestJS & Next.js

## Executive Summary

This implementation plan details the end-to-end migration of the **ChatAura** backend from a legacy PHP/Laravel architecture (constrained by PHP-FPM's 5-worker concurrency bottleneck) to a **high-performance NestJS Modular Monolith** paired with **PostgreSQL 16**, **Redis 7**, and **Docker Compose**, alongside an independent **Next.js Admin Panel**.

The system is engineered to run reliably on a **2 vCPU / ~8 GB RAM VPS**, scaling from **500 to 2,500+ active concurrent users (CCU)** in party rooms and real-time games with sub-50ms latency, while maintaining **100% backward compatibility** with the production Android mobile client (`/api/v1/*`).

---

## User Review Required

> [!IMPORTANT]
> **Key Architectural Decisions Requiring Alignment:**
> 1. **Database Stack**: **PostgreSQL 16 + Redis 7** (MongoDB is strictly dropped to save ~2 GB RAM on the 2 vCPU VPS). PostgreSQL handles all persistent relational & financial ACID data; Redis handles sessions, JWT blacklist, rate limiting, room presence, and WebSocket pub/sub.
> 2. **Admin Panel Hosting**: Next.js Admin Panel is deployed separately to **Vercel** (or Cloudflare Pages), communicating with the NestJS API. This ensures **0% CPU and 0 MB RAM overhead on your production VPS**.
> 3. **Real-time Protocol**: Replace mobile client HTTP polling for games (`/game/greedy/state`, `/game/lucky77/state`), room heartbeats, and chat with **Socket.IO WebSockets backed by Redis Adapter**, while maintaining HTTP endpoints as transparent fallbacks.
> 4. **Zero Android App Downtime**: The base route structure (`/api/v1/...`), request payloads, and response envelopes (`{ success: true, data: ... }`) will match the existing Laravel API contracts precisely.

---

## 1. System Architecture & Resource Allocation

### 1.1 VPS Resource Budget (2 vCPU / ~8 GB RAM)

To prevent Linux Out-Of-Memory (OOM) killer terminations and CPU context-switch thrashing, container resources are strictly bounded:

```
Total System RAM: ~8192 MB
┌─────────────────────────────────────────────────────────────┐
│ [Linux OS + Kernel Network Buffers]        ~600 MB          │
│ [PostgreSQL 16 Database]                   ~2500 MB (Limit) │
│   - shared_buffers = 1024MB                                 │
│   - work_mem = 16MB                                         │
│   - max_connections = 100                                   │
│ [Redis 7 (In-Memory)]                      ~800 MB (Limit)  │
│   - maxmemory = 700mb, allkeys-lru                          │
│ [NestJS Application (Fastify Adapter)]     ~1500 MB (Limit) │
│   - Node.js heap limit: --max-old-space-size=1200           │
│ [Nginx Reverse Proxy + SSL]                ~200 MB          │
│ [OS Page Cache / Headroom Buffer]          ~2592 MB         │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 High-Level Component Architecture

```mermaid
graph TD
    Client[Android App / Mobile Users] -->|HTTPS / WSS| Nginx[Nginx Reverse Proxy (Port 80/443)]
    AdminClient[Browser Admins / Staff] -->|HTTPS| VercelAdmin[Next.js Admin Panel (Hosted on Vercel)]
    VercelAdmin -->|REST API / JWT| Nginx
    
    Nginx -->|Proxy Pass 3000| NestJS[NestJS Modular Monolith (Fastify)]
    
    subgraph NestJS App Core
        AuthMod[AuthModule]
        WalletMod[WalletModule]
        RoomMod[RoomModule]
        GameMod[GameModule]
        ChatMod[ChatModule]
        MediaMod[MediaModule]
        AgencyMod[AgencyModule]
        AdminMod[AdminModule]
        
        RoomWS[RoomGateway (WS)]
        GameWS[GameGateway (WS)]
        ChatWS[ChatGateway (WS)]
    end
    
    NestJS -->|Connection Pool (max 30)| PG[(PostgreSQL 16)]
    NestJS -->|ioredis| Redis[(Redis 7)]
    RoomWS <-->|Pub/Sub Adapter| Redis
    GameWS <-->|Pub/Sub Adapter| Redis
    ChatWS <-->|Pub/Sub Adapter| Redis
    
    NestJS -.->|RTC Tokens| Agora[Agora Voice/Video Cloud]
    NestJS -.->|Signed Uploads| GCS[Google Cloud Storage]
    NestJS -.->|Push Notifications| FCM[Firebase Cloud Messaging]
    NestJS -.->|Payment Verifications| Razorpay[Razorpay Gateway]
```

---

## 2. Directory Structure: NestJS Modular Monolith

```text
chataura_backend_nest/
├── .github/
│   └── workflows/
│       └── deploy.yml                # Cloud CI/CD (GitHub Actions to VPS)
├── docker/
│   ├── nginx/
│   │   └── default.conf              # SSL, WSS, proxy_buffering, rate limits
│   ├── postgres/
│   │   └── postgresql.conf           # Tuned memory & connection parameters
│   └── Dockerfile                    # Multi-stage production build (Node 20 Alpine)
├── docker-compose.yml
├── .env.example
├── prisma/
│   ├── schema.prisma                 # PostgreSQL schema with indexes & relations
│   ├── migrations/                   # Sequential SQL migrations
│   └── seed.ts                       # Seeder for admin settings, gifts, frames, levels
├── src/
│   ├── main.ts                       # Fastify bootstrap, CORS, ValidationPipe, GlobalPrefix
│   ├── app.module.ts                 # Root module wiring all feature modules
│   │
│   ├── common/                       # Cross-cutting concerns
│   │   ├── constants/                # Multipliers, coin rates, error codes
│   │   ├── decorators/               # @CurrentUser(), @Roles(), @Public(), @ClientCountry()
│   │   ├── filters/                  # AllExceptionsFilter, PrismaExceptionFilter
│   │   ├── guards/                   # JwtAuthGuard, RolesGuard, SuspensionGuard, RateLimitGuard
│   │   ├── interceptors/             # ResponseTransformInterceptor, LoggingInterceptor
│   │   ├── pipes/                    # StrictValidationPipe
│   │   ├── redis/                    # RedisService (caching, locking, presence)
│   │   └── utils/                    # Crypto, geo-ip, pagination helpers
│   │
│   └── modules/                      # Modular Business Domains
│       ├── auth/                     # JWT, OTP (Mail), Device tokens, FCM registration
│       │   ├── auth.controller.ts
│       │   ├── auth.service.ts
│       │   ├── dto/
│       │   └── strategies/           # JwtStrategy, RefreshTokenStrategy
│       ├── user/                     # Profile, followers, friends, blocks, reports, star accounts
│       ├── wallet/                   # Coin/Gem balance, Razorpay, withdrawals, ledger
│       │   ├── wallet.controller.ts
│       │   ├── wallet.service.ts     # SELECT ... FOR UPDATE transactions
│       │   ├── ledger.service.ts     # Immutable double-entry coin transactions
│       │   └── razorpay.service.ts
│       ├── room/                     # Party rooms, seats, mutes, Agora RTC token generator
│       │   ├── room.controller.ts
│       │   ├── room.service.ts
│       │   ├── room.gateway.ts       # WebSockets: join, leave, seat locks, gift animations
│       │   └── seat.service.ts
│       ├── game/                     # Greedy Ferris Wheel, Lucky77, Spin, Streaks
│       │   ├── game.controller.ts    # REST compatibility endpoints
│       │   ├── greedy.service.ts     # 20s game loop, weighted RNG, atomic payouts
│       │   ├── lucky77.service.ts    # 20s fruit game loop, atomic payouts
│       │   └── game.gateway.ts       # Broadcasts live countdown, drawing & result states
│       ├── chat/                     # 1-on-1 conversations, messages, stickers, star chat billing
│       │   ├── chat.controller.ts
│       │   ├── chat.service.ts
│       │   └── chat.gateway.ts       # Real-time message push & read receipts
│       ├── call/                     # 1-on-1 audio/video call signaling & Agora tokens
│       ├── media/                    # Posts, Reels, comments, likes, GCS signed upload URLs
│       ├── agency/                   # Agency affiliations, weekly distributions, staff commissions
│       ├── gamification/             # XP, Levels, Avatar frames, Role frames, Entry bars
│       └── admin/                    # Staff management, system settings, moderation, compliance
```

---

## 3. Database Migration & Schema Preservation (MySQL $\rightarrow$ PostgreSQL)

### 3.1 Migration Strategy
1. **Schema Introspection & Normalization**:
   - Translate all 158 Laravel migrations and `chataura.sql` tables into a clean `prisma/schema.prisma`.
   - Convert MySQL types: `TINYINT(1)` $\rightarrow$ `BOOLEAN`, `BIGINT UNSIGNED` $\rightarrow$ `BIGINT` (with sequence), `DATETIME` $\rightarrow$ `TIMESTAMPTZ`.
2. **Automated Data Migration via `pgloader`**:
   - `pgloader` translates schema, indexes, foreign keys, and rows with zero manual SQL string parsing.
   - Run via dockerized script:
     ```bash
     pgloader \
       --cast "type tinyint to boolean using tinyint-to-boolean" \
       --cast "type datetime to timestamptz" \
       mysql://root:rootpass@localhost:3306/indsoft24_chataura \
       postgresql://chataura_user:pgpass@localhost:5432/chataura_db
     ```
3. **Sequence Synchronization**:
   - Reset all PostgreSQL primary key sequences to `MAX(id) + 1` across all tables.

### 3.2 Key Core PostgreSQL Tables & Indexing
* **`users`**: Indexed on `email`, `phone`, `invite_code`, `account_status`, `role`.
* **`wallet_transactions` / `coin_transactions`**: Indexed on `(user_id, created_at DESC)` and `reference_id`.
* **`rooms` & `seats`**: Indexed on `(is_active, display_id)` and `(room_id, seat_index)`.
* **`greedy_rounds` & `greedy_bets`**: Indexed on `(round_number)`, `(round_id, user_id)`, and `(status)`.
* **`lucky77_rounds` & `lucky77_bets`**: Indexed on `(round_number)` and `(round_id, user_id)`.
* **`messages` & `conversations`**: Indexed on `(conversation_id, created_at DESC)` and `(sender_id, receiver_id)`.

---

## 4. Module-by-Module Technical Specifications

### 4.1 AuthModule
* **Endpoints**:
  * `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/google`
  * `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`
  * `POST /api/v1/auth/send-email-otp`, `POST /api/v1/auth/verify-email-otp`
* **Implementation Details**:
  * Access Tokens: Short-lived JWT (15 mins) containing `userId`, `role`, `country`.
  * Refresh Tokens: Cryptographically secure random tokens stored in Redis with 30-day TTL: `redis.set(refresh:${userId}:${tokenId}, hash, 'EX', 2592000)`.
  * Token Revocation: Blacklist mechanism in Redis for immediate logout across devices.

### 4.2 WalletModule & Financial Integrity
* **Endpoints**:
  * `GET /api/v1/wallet/packages`, `POST /api/v1/wallet/recharge/initiate`, `POST /api/v1/wallet/recharge/verify`
  * `POST /api/v1/wallet/transfer`, `POST /api/v1/wallet/withdraw`, `GET /api/v1/wallet/transactions`
* **Concurrency & Double-Spend Prevention**:
  * All coin/gem balance updates MUST execute within a PostgreSQL ACID transaction with pessimistic row-level locking:
    ```typescript
    await this.prisma.$transaction(async (tx) => {
      // 1. Lock user row
      const [user] = await tx.$queryRaw<User[]>`
        SELECT id, wallet_balance FROM users WHERE id = ${userId} FOR UPDATE
      `;
      if (user.wallet_balance < amount) {
        throw new BadRequestException('INSUFFICIENT_BALANCE');
      }
      // 2. Decrement balance
      await tx.user.update({
        where: { id: userId },
        data: { wallet_balance: { decrement: amount } }
      });
      // 3. Write immutable audit ledger entry
      await tx.coinTransaction.create({
        data: { userId, amount: -amount, balanceAfter: user.wallet_balance - amount, type }
      });
    });
    ```
  * Razorpay Webhook Idempotency: Webhook events verify signature and insert the `payment_id` into a unique PostgreSQL constraint table. Duplicate webhook deliveries exit with HTTP 200 without double-crediting.

### 4.3 RoomModule & RoomGateway (Party Rooms)
* **Endpoints**:
  * `GET /api/v1/rooms`, `POST /api/v1/rooms`, `GET /api/v1/rooms/:id`, `POST /api/v1/rooms/:id/join`, `POST /api/v1/rooms/:id/leave`
  * `GET /api/v1/rooms/:id/token` (Agora RTC Dynamic Token generator)
  * `POST /api/v1/rooms/:id/seats/:index/take`, `POST /api/v1/rooms/:id/seats/:index/mute`
  * `POST /api/v1/rooms/:id/gifts/send` (Room gift animation trigger)
* **WebSocket Events (`/ws/rooms`)**:
  * `room:join_seat` $\rightarrow$ verifies seat lock in Redis via atomic Lua script, updates PostgreSQL, and broadcasts `room:seat_updated` to all room listeners.
  * `room:send_gift` $\rightarrow$ validates wallet balance, deducts coins, adds gems/XP, logs transaction, and broadcasts `room:gift_overlay` (gift asset URL, sender info, combo count) to room participants.
* **Agora Token Service**:
  * Replaces legacy PHP `RtcTokenBuilder` with official `agora-token` npm package (`RtcTokenBuilder2.buildTokenWithUid`).

### 4.4 GameModule & GameGateway (Greedy Ferris Wheel & Lucky77)
* **Problem in Current Laravel Code**:
  * The game loop only progresses when clients make HTTP requests. If no user calls `/state`, rounds freeze. When 500 users poll `/state`, PHP-FPM queues collapse.
* **NestJS Engineered Solution**:
  * A dedicated **Autonomous Game Engine Service** runs independently using Node.js precision timers:
    1. **Ticking Phase (20s)**: Ticks every 1s, broadcasting `game:tick` { roundId, secondsRemaining, poolSize } over WebSockets.
    2. **Betting Window Closure (Last 1s)**: Sockets reject incoming bets; state transitions to `DRAWING`.
    3. **Settlement Phase**:
       - Cryptographically secure weighted RNG determines the winning item.
       - Single atomic PostgreSQL transaction: marks round completed, calculates payouts, locks and increments winner wallet balances, sets loser statuses.
    4. **Result Broadcast**: Emits `game:result` { winningItem, multiplier, winnersPodium } to all connected players.
    5. **Auto-Start**: Spawns next round immediately.
  * **Zero Polling Required**: Mobile client listens to WebSocket events. REST endpoints (`/state`, `/bet`, `/result`) are preserved for initial modal loading and fallback.

### 4.5 ChatModule & ChatGateway
* **Endpoints**:
  * `GET /api/v1/conversations`, `GET /api/v1/messages/:conversationId`, `POST /api/v1/messages/send`
  * `POST /api/v1/messages/upload-image`
* **WebSocket Events (`/ws/chat`)**:
  * `message:send` $\rightarrow$ persists to PostgreSQL, checks receiver online status in Redis.
  * If online: directly emits `message:receive` to the user's socket room.
  * If offline: dispatches a background BullMQ job to push FCM notification via Firebase Admin SDK.
* **Star Chat Billing Engine**:
  * Real-time active session heartbeat timer in Redis tracks billed duration/messages, deducting coins per minute automatically.

### 4.6 MediaModule (Posts & Reels)
* **Endpoints**:
  * `GET /api/v1/posts/feed`, `GET /api/v1/reels/feed`, `GET /api/v1/reels/trending`
  * `POST /api/v1/posts/:id/like`, `POST /api/v1/posts/:id/comment`
  * `POST /api/v1/upload` (Returns Google Cloud Storage signed URL for direct client-to-GCS upload, eliminating VPS bandwidth saturation).

---

## 5. Next.js Admin Panel Architecture

* **Framework**: Next.js 14 (App Router), TypeScript, Tailwind CSS, `shadcn/ui`.
* **Deployment**: Hosted on **Vercel** (Production domain: `admin.chataura.in`).
* **Authentication**: Separate JWT-based staff authentication with role-based access control (`superadmin`, `manager`, `moderator`).
* **Features Replicated from Laravel**:
  1. **Dashboard**: Real-time revenue, active rooms, active calls, daily coin burn vs recharge graphs.
  2. **User Management**: User search, wallet adjustments, bans/suspensions, star account badge assignments.
  3. **Withdrawal Approvals**: Pending payouts, KYC details, bank/UPI verification, one-click approve/reject.
  4. **Catalog Management**: Dynamic CRUD for Gift Types, Avatar Frames, Role Frames, Levels, Room Themes, and Banners.
  5. **Moderation & Reports**: Review flagged reels/posts, user reports, room kick logs, and location compliance.

---

## 6. Edge Cases & Robust Error Handling Matrix

| Scenario / Edge Case | Failure Mode in Legacy Stack | Handled in NestJS Architecture |
| :--- | :--- | :--- |
| **Concurrent Bets at $t=19.9s$** | PHP worker race causes bets accepted after draw has started. | Redis Lua script closes betting atomically at $t \le 1.0s$. Late bets rejected with standard `BETTING_CLOSED` DTO. |
| **Simultaneous Seat Take in Room** | Two users assigned to seat index 3 at the same moment. | Atomic Redis lock `SET room:seat:{roomId}:{idx} {userId} NX EX 5` ensures only first request wins; DB updated in transaction. |
| **Client Disconnects Mid-Call** | Call stays in active state forever, billing user indefinitely. | Redis TTL heartbeat (30s). If heartbeat missed twice (60s), background cleanup worker triggers `call:end` and settles wallet. |
| **Wallet Recharge Race Condition** | User clicks recharge twice or webhook fires concurrently. | PostgreSQL unique constraint on `payment_id` + row-level lock `FOR UPDATE` on user record prevents double-credit. |
| **WebSocket Sudden Reconnect Spike** | 2,000 clients reconnect at once after internet glitch, crushing CPU. | Socket.IO connection throttling + Redis token verification cache (avoids querying PostgreSQL for JWT verification). |
| **Database Connection Exhaustion** | 500 requests open 500 connections $\rightarrow$ MySQL `Too many connections`. | Strict Prisma connection pool size (max 25) with PgBouncer queuing requests efficiently. |
| **Uncaught Exception in Game Engine** | Game freezes for entire app until server restart. | Global NestJS `AllExceptionsFilter` + Game loop wrapped in resilient `try/catch/finally` with self-healing restart mechanism. |

---

## 7. Production Docker & Deployment Configuration

### 7.1 Production `docker-compose.yml`

```yaml
version: '3.8'

services:
  nginx:
    image: nginx:1.25-alpine
    container_name: chataura_nginx
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./docker/nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
    depends_on:
      - nestjs-api
    networks:
      - chataura_net

  nestjs-api:
    build:
      context: .
      dockerfile: docker/Dockerfile
      target: production
    container_name: chataura_api
    restart: always
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DATABASE_URL=postgresql://chataura_user:${DB_PASSWORD}@postgres:5432/chataura_db?schema=public&connection_limit=25
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - JWT_SECRET=${JWT_SECRET}
      - AGORA_APP_ID=${AGORA_APP_ID}
      - AGORA_APP_CERTIFICATE=${AGORA_APP_CERTIFICATE}
      - RAZORPAY_KEY_ID=${RAZORPAY_KEY_ID}
      - RAZORPAY_KEY_SECRET=${RAZORPAY_KEY_SECRET}
      - NODE_OPTIONS=--max-old-space-size=1200
    deploy:
      resources:
        limits:
          memory: 1500M
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - chataura_net

  postgres:
    image: postgres:16-alpine
    container_name: chataura_postgres
    restart: always
    environment:
      POSTGRES_USER: chataura_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: chataura_db
    command: >
      postgres 
      -c shared_buffers=1024MB 
      -c effective_cache_size=3072MB 
      -c work_mem=16MB 
      -c maintenance_work_mem=256MB 
      -c max_connections=100 
      -c random_page_cost=1.1
    volumes:
      - postgres_data:/var/lib/postgresql/data
    deploy:
      resources:
        limits:
          memory: 2500M
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U chataura_user -d chataura_db"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - chataura_net

  redis:
    image: redis:7-alpine
    container_name: chataura_redis
    restart: always
    command: >
      redis-server 
      --maxmemory 700mb 
      --maxmemory-policy allkeys-lru 
      --appendonly yes 
      --save 900 1 
      --save 300 10
    volumes:
      - redis_data:/data
    deploy:
      resources:
        limits:
          memory: 800M
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5
    networks:
      - chataura_net

volumes:
  postgres_data:
  redis_data:

networks:
  chataura_net:
    driver: bridge
```

---

## 8. Automated Testing & Quality Assurance Plan

### 8.1 Unit & Integration Tests (Jest)
* **Auth & Security**: JWT signing/verification, OTP expiry, IP rate-limiting guards.
* **Wallet Concurrency**: Simulate 50 concurrent wallet deductions on a single account; verify balance cannot drop below zero and exactly 50 ledger entries match.
* **Game Settlement**: Validate weighted RNG math over 100,000 simulated rounds to confirm RTP (Return-to-Player) matches specification within 0.1% margin.
* **Agora Token Validation**: Verify generated tokens against Agora RTC Token inspector for channel expiration and privileges.

### 8.2 End-to-End (E2E) API Contract Verification
* Execute automated Supertest suite comparing legacy Laravel output with NestJS output for every route documented in `POSTMAN_COLLECTION.json`.
* Validate exact JSON key names, HTTP status codes, and error payload structures.

### 8.3 Load Testing (k6)
* Run automated **k6** load script from an external machine:
  * 1,000 simulated virtual users (VUs) maintaining persistent WebSockets.
  * 250 concurrent requests/sec hitting wallet recharge, room seat changes, and game bets.
  * **Pass Criteria**: $p(95)$ latency $< 50\text{ ms}$, HTTP 5xx error rate $< 0.01\%$, zero VPS OOM crashes.

---

## 9. Phased Execution Roadmap

```text
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 1: Environment & Foundation                                      │
│  - Setup Docker Compose (PG16, Redis 7, Nginx) on VPS                  │
│  - Prisma schema creation & data migration via pgloader                │
│  - NestJS bootstrap with Fastify, CORS, Global /api/v1 prefix          │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 2: Core Authentication & User Systems                            │
│  - AuthModule (JWT, Refresh tokens, OTP, FCM, Device registration)     │
│  - UserModule (Profile, Friends, Followers, Blocks, Star accounts)    │
│  - Verify with Android App Auth flows                                  │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 3: Financial Engine & Gamification                               │
│  - WalletModule (Razorpay webhooks, Coin/Gem ledger, SELECT FOR UPDATE)│
│  - GamificationModule (XP, Levels, Avatar Frames, Entry Bars, Stickers)│
│  - Withdrawal request processing                                       │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 4: Real-time Party Rooms & Games                                 │
│  - RoomModule & RoomGateway (Seats, Agora RTC tokens, Gift animations) │
│  - GameModule (Autonomous Greedy Ferris Wheel & Lucky77 loops)         │
│  - ChatModule & ChatGateway (1-on-1 messaging & Star-Chat billing)     │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 5: Media, Agencies & Admin Panel                                 │
│  - MediaModule (Posts/Reels feeds, GCS direct signed uploads)          │
│  - AgencyModule (Affiliations, weekly payouts, staff commissions)      │
│  - Next.js Admin Panel deployed to Vercel                              │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 6: E2E Contract Testing, k6 Load Testing & Cutover               │
│  - Automated postman regression suite                                  │
│  - k6 load test simulating 1,500 CCU                                   │
│  - DNS cutover with zero downtime                                      │
└────────────────────────────────────────────────────────────────────────┘
```
