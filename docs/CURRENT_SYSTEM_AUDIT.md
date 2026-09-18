# ChatAura System Architecture Audit
**Principal Software Architect Review: Post-Migration State (Laravel to Next.js + NestJS)**

- **Date of Audit:** September 17, 2026
- **Auditor Role:** Principal Software Architect
- **Target Codebase:** `chataura_backend_next` (`chataura_backend_nest` + `chataura_admin`) alongside Android client and legacy Laravel repository.
- **Audit Objective:** Produce a rigorous, objective, fact-based technical audit of the codebase in its current state. No code modifications or refactorings are performed during this review.

---

## 1. Current Architecture

### 1.1 High-Level Overview

The current ecosystem is organized as a monorepo under `chataura_backend_next/`, comprising two core software applications, container orchestration definitions, and infrastructure configuration files:

```
chataura_backend_next/
├── chataura_admin/          # Next.js 14 App Router (Web Admin Portal)
├── chataura_backend_nest/   # NestJS 11 + Fastify + Prisma + Socket.IO (Core API & Realtime)
│   ├── docker/              # Dockerfiles, Nginx configs, PostgreSQL configs
│   ├── k6/                  # Load testing scripts
│   ├── prisma/              # Prisma schema, migrations, seeders
│   ├── src/                 # Application modules, guards, interceptors
│   └── test/                # Jest E2E integration test suites
├── docker-compose.yml       # Production multi-container orchestration
└── README.md
```

Alongside this monorepo are:
- **Android Mobile App (`ChatAura/app/`)**: Native Kotlin/Java Android client.
- **Legacy Laravel Backend (`chataura backend/`)**: PHP 8.2 / Laravel application with MySQL schema.
- **Production State:** Production Android mobile traffic currently communicates with the legacy Laravel backend. The NestJS and Next.js applications represent an already completed code migration operating as a staging/cutover-ready sibling service.

### 1.2 System Topology Diagram

```mermaid
graph TD
    Client[Android App Client] -->|HTTP REST /api/v1| Nginx[Nginx Reverse Proxy :8080]
    Client -.->|Socket.IO /ws/*| Nginx
    
    Browser[Admin Web Browser] -->|HTTP / React UI| NextAdmin[Next.js 14 Admin Panel :3100]
    NextAdmin -->|HTTP Client-side Fetch| Nginx
    
    Nginx -->|proxy_pass :3000| NestAPI[NestJS 11 Modular Monolith (Fastify Engine)]
    
    subgraph Core Backend Application Container
        NestAPI --> AuthM[AuthModule]
        NestAPI --> UserM[UserModule]
        NestAPI --> WalletM[WalletModule]
        NestAPI --> RoomM[RoomModule & Gateways]
        NestAPI --> GameM[GameModule & Engine]
        NestAPI --> ChatM[ChatModule]
        NestAPI --> MediaM[MediaModule]
        NestAPI --> AdminM[AdminModule]
    end
    
    NestAPI -->|Prisma ORM :5432| Postgres[(PostgreSQL 16 Alpine)]
    NestAPI -->|ioredis :6379| Redis[(Redis 7 Alpine)]
    
    NestAPI -.->|HMAC Verify / Orders| Razorpay[Razorpay Payment Gateway]
    NestAPI -.->|RTC Tokens| Agora[Agora Voice RTC SDK]
    NestAPI -.->|SMTP TLS| MailServer[SMTP Email Server]
    NestAPI -.->|Token Verification| GoogleOAuth[Google OAuth2 APIs]
```

---

## 2. Frontend Architecture (`chataura_admin`)

### 2.1 Technology Stack
- **Framework:** Next.js `14.2.15` (App Router architecture).
- **Core Runtime:** React `18.3.1`, React DOM `18.3.1`, TypeScript `5.7.3`.
- **CSS / Styling:** Pure Vanilla CSS via `app/globals.css`. No external UI component library (no Tailwind, Shadcn, MUI, AntD, or Chakra).
- **Network Client:** Native Web Fetch API wrapped in `lib/api.ts`.
- **Runtime Model:** Client-Side Rendered (CSR). All primary dashboard pages declare the `'use client'` directive.

### 2.2 Directory Structure & Routing Map
The admin panel adopts the Next.js App Router grouped layout `(dashboard)`:
- `app/layout.tsx`: Root HTML shell and page metadata (`title: 'ChatAura Admin'`).
- `app/login/page.tsx`: Authentication screen (email/password).
- `app/(dashboard)/layout.tsx`: Persistent shell hosting the `Sidebar` component and dynamic content pane.
- `app/(dashboard)/page.tsx`: Main overview analytics dashboard.
- `app/(dashboard)/users/page.tsx`: User listing, search, role modification, star creator tagging, suspension.
- `app/(dashboard)/staff/page.tsx`: Staff member listing and agency role management.
- `app/(dashboard)/reports/page.tsx`: Moderation queue for user reports.
- `app/(dashboard)/withdrawals/page.tsx`: Audit table of user withdrawal requests.
- `app/(dashboard)/staff-commissions/page.tsx`: Commission configuration and audit logs.
- `app/(dashboard)/party-bonuses/page.tsx`: Hourly and daily party room bonus configurations.
- `app/(dashboard)/packages/page.tsx`: Coin package catalog CRUD.
- `app/(dashboard)/levels/page.tsx`: Gamification user level thresholds and rewards.
- `app/(dashboard)/gifts/page.tsx`: Virtual gift catalog management.
- `app/(dashboard)/stickers/page.tsx`: Chat sticker catalog management.
- `app/(dashboard)/frames/page.tsx`: User avatar frame catalog.
- `app/(dashboard)/role-frames/page.tsx`: Role-specific avatar frames.
- `app/(dashboard)/entry-bars/page.tsx`: Special party room entrance banner catalog.
- `app/(dashboard)/room-themes/page.tsx`: Party room visual themes.
- `app/(dashboard)/banners/page.tsx`: App carousel banner management.

### 2.3 State Management & Authentication Storage
- **State Management:** Local React component state (`useState`, `useEffect`). No global store (Redux, Zustand, Recoil) or server cache management (TanStack Query, SWR).
- **Token Storage:** The JWT access token is stored directly in browser `localStorage` under the key `ca_admin_token`.
- **Authentication Check:** Pages execute client-side token verification inside `useEffect()`, redirecting to `/login` if `ca_admin_token` is missing.
- **Data Fetching Pattern:** Imperative `fetch` requests inside `useEffect()`. Data mutations (e.g. suspending a user, creating a package) trigger a direct follow-up fetch call to reload local state.

---

## 3. Backend Architecture (`chataura_backend_nest`)

### 3.1 Technology Stack
- **Framework:** NestJS `11.0.1`.
- **HTTP Adapter:** Fastify `11.2.3` (`@nestjs/platform-fastify`) with Fastify Multipart (`9.4.0`) and Fastify Static (`10.1.3`).
- **ORM:** Prisma ORM `6.19.3` (`@prisma/client`).
- **WebSockets:** `@nestjs/websockets` and `@nestjs/platform-socket.io` running Socket.IO `4.8.3`.
- **Validation:** `class-validator` `0.15.1` and `class-transformer` `0.5.1`.
- **Authentication Engine:** Passport.js (`@nestjs/passport`), Passport JWT (`passport-jwt`), `@nestjs/jwt`, and `bcrypt`.
- **Cache & Redis Client:** `ioredis` `6.0.0`.

### 3.2 Request Lifecycle & Pipeline
Every incoming HTTP request traverses the following lifecycle pipeline:
1. **Fastify Engine:** Fastify receives the TCP request on port `3000`. A custom content-type parser handles empty/null JSON request bodies safely without crashing.
2. **Global Prefix:** All REST API routes are routed through `/api/v1`.
3. **CORS:** Configurable via `CORS_ORIGIN` environment variable (defaults to `*` with credentials enabled).
4. **Validation Pipe (`ValidationPipe`):** Enforces strict request body validation (`whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`). Non-whitelisted payload properties are rejected with `400 Bad Request`.
5. **Global Guards Pipeline (executed in sequence):**
   - **`JwtAuthGuard`:** Checks for `@Public()` decorator. If not public, extracts `Authorization: Bearer <token>`, verifies JWT signature, queries the PostgreSQL `User` record to ensure the account is active, not deleted, and not suspended, then attaches `request.user`.
   - **`EmailVerifiedGuard`:** Checks for `@Public()` or `@SkipEmailVerified()`. If not bypassed, verifies `request.user.emailVerifiedAt != null`. If null, throws `403 Forbidden` (`EMAIL_NOT_VERIFIED`).
   - **`RolesGuard`:** Reads `@Roles(...)` metadata. Verifies the user's role satisfies the required roles. Supports role inheritance (admin inherits agency privileges).
6. **Controller & Business Service:** Executes domain logic and queries PostgreSQL via Prisma or executes row-locked transactions.
7. **Response Transformation (`ResponseTransformInterceptor`):** Wraps successful controller outputs in the standard Laravel-compatible response envelope:
   ```json
   {
     "success": true,
     "data": { ... }
   }
   ```
8. **Exception Filter (`AllExceptionsFilter`):** Traps all standard and unhandled exceptions, formatting them into an error contract:
   ```json
   {
     "success": false,
     "error": {
       "code": "ERROR_CODE",
       "message": "Descriptive message",
       "errors": { ... }
     }
   }
   ```

---

## 4. Database Architecture

### 4.1 Engine & Configuration
- **Database:** PostgreSQL 16 Alpine.
- **Connection Provider:** Prisma ORM connected via connection URL with pool size parameter:
  `postgresql://chataura_user:...@postgres:5432/chataura_db?schema=public&connection_limit=25`
- **Memory & Resource Tuning (`docker/postgres/postgresql.conf` & Docker Compose):**
  - `shared_buffers = 256MB`
  - `effective_cache_size = 768MB`
  - `work_mem = 8MB`
  - `maintenance_work_mem = 64MB`
  - `max_connections = 100`

### 4.2 Entity Relationship & Schema Model
The database contains **44 models** and **4 enums**:

| Category | Entities |
| :--- | :--- |
| **Identity & Social Graph** | `User`, `RefreshToken`, `UserDevice`, `UserFollower`, `Friendship`, `FriendRequest`, `BlockedUser`, `UserReport` |
| **Financial Ledger & Wallet** | `CoinPackage`, `CoinPurchaseTransaction`, `CoinTransaction`, `GemConversion`, `WithdrawalRequest`, `AdminSetting` |
| **Gamification & Catalog** | `Level`, `Frame`, `UserUnlockedFrame`, `EntryBar`, `Gift`, `Sticker`, `UserUnlockedSticker`, `BonusClaim` |
| **Party Rooms & RTC** | `Room`, `RoomMember`, `Seat`, `RoomBlock`, `RoomTheme` |
| **Realtime Gaming** | `GreedyRound`, `GreedyBet`, `Lucky77Round`, `Lucky77Bet` |
| **Chat & Messaging** | `Conversation`, `ConversationParticipant`, `Message`, `StarChatSession` |
| **Content & Feeds** | `MediaItem`, `MediaComment`, `MediaLike`, `MediaSave`, `MusicTrack`, `Banner` |
| **Agency & Support** | `AgencyAffiliation`, `AgencyWeeklyDistribution`, `FaqItem`, `Feedback` |

### 4.3 Key Architectural Patterns in Database Layer
1. **Primary Key Typings:** Primary keys are predominantly 64-bit integers (`BigInt @id @default(autoincrement())`), mapped to PostgreSQL `bigserial`/`int8`.
2. **Pessimistic Row-Level Locking:** Financial balance modifications avoid concurrency race conditions by acquiring explicit pessimistic locks via Prisma raw queries:
   ```sql
   SELECT id, wallet_balance, coin_balance, gems, referral_balance,
          inr_earnings_balance, usd_earnings_balance, xp, level, role
   FROM users WHERE id = $1 FOR UPDATE;
   ```
3. **Twin Spendable Balances:** `User.walletBalance` and `User.coinBalance` are maintained as identical twins to preserve backward compatibility with legacy endpoints expecting either name.
4. **Earned vs. Spendable Currency Separation:** Coins are spendable (purchased or won); Gems are earn-only (received via gifts or creator interactions). Gems can be converted to Coins, but withdrawals to fiat currency are disabled at the business logic layer (`CASH_OUT_DISABLED`).

---

## 5. Authentication Architecture

### 5.1 Authentication Schemes
1. **Password Authentication:**
   - Supports login via email or phone.
   - Verified via `bcrypt.compare()` against `User.password`.
2. **Google OAuth 2.0:**
   - Client sends `id_token`.
   - Backend calls `https://oauth2.googleapis.com/tokeninfo?id_token=<token>`.
   - Validates audience matches `GOOGLE_CLIENT_ID`.
   - Automatically registers new users with verified email status and credits `SIGNUP_BONUS_COINS` (default 50).
3. **Email OTP Verification:**
   - 6-digit random code generated via `crypto.randomBytes` / `Math.random()`.
   - Key stored in Redis: `email_otp:email_verification:<userId>` with a 15-minute TTL.
   - Dispatched via SMTP Nodemailer transporter.
4. **Token Generation & Issuance:**
   - **Access Token:** Signed JWT containing `{ sub: userId, type: 'access', role: user.role }`. Default TTL: 3,600 seconds (1 hour).
   - **Refresh Token:** Cryptographically secure 32-byte random hex string. Stored in the database as a SHA-256 hash in `refresh_tokens` table. Default TTL: 2,592,000 seconds (30 days).

---

## 6. Authorization Architecture

### 6.1 Role Definitions
Defined in Prisma enum `UserRole`:
- `user`: Standard platform consumer.
- `seller`: Official platform coin distributor / seller.
- `agency`: Talent agency owner managing affiliated live-stream hosts.
- `admin`: Superadministrator with comprehensive moderation and configuration authority.

### 6.2 Implementation
- **Controller Annotation:** `@Roles('admin')`, `@Roles('seller')`, `@Roles('agency')`.
- **Roles Guard:** Intercepts route execution and compares `request.user.role` with allowed roles.
- **Granular Privilege Exceptions:**
  - `AdminService.linkExistingUser` permits promoting accounts to `seller` or `admin`.
  - `GameService.assertCanPlay` explicitly forbids accounts with role `seller`, `agency`, or `admin` from participating in betting games to prevent staff liquidity manipulation.

---

## 7. API Architecture

### 7.1 Protocol & Conventions
- **Transport:** HTTP/1.1 (JSON) and WebSockets (Socket.IO).
- **Prefix:** `/api/v1`.
- **Response Format:** Uniform envelope pattern.

### 7.2 Complete Endpoint Map

#### 1. Authentication (`/api/v1/auth/*`)
- `POST /auth/register` - Create account with email, password, and referral code.
- `POST /auth/login` - Authenticate with email/phone and password.
- `POST /auth/google` - Authenticate or register with Google ID token.
- `POST /auth/refresh` - Rotate access token using valid refresh token.
- `POST /auth/logout` - Invalidate refresh token.
- `POST /auth/send-email-otp` - Dispatch 6-digit verification code.
- `POST /auth/verify-email-otp` - Verify code and activate email status.
- `POST /auth/forgot-password` - Request password reset OTP.
- `POST /auth/reset-password` - Update password using reset OTP.
- `POST /auth/change-password/request` - Request change-password OTP for authenticated user.
- `POST /auth/change-password/verify` - Complete password change.

#### 2. User & Social Graph (`/api/v1/user/*` & `/api/v1/users/*`)
- `GET /user/profile`, `GET /users/me` - Authenticated profile details.
- `POST /user/profile`, `PUT /user/profile` - Update bio, name, avatar, and demographics.
- `GET /users/:id` - Public profile view.
- `POST /users/:id/follow`, `POST /users/:id/unfollow` - Social follow/unfollow.
- `GET /users/:id/followers`, `GET /users/:id/following` - Social listings.
- `POST /users/:id/friend-request` - Send mutual friendship invite.
- `POST /users/friend-requests/:id/accept|reject|cancel` - Friend request management.
- `POST /users/:id/block`, `POST /users/:id/unblock` - Block management.
- `POST /users/:id/report` - File abuse report against user.
- `POST /user/register-device`, `POST /user/update-fcm-token` - Register mobile hardware push token.
- `GET /users/me/invite`, `POST /invite/apply` - Referral link and attribution.
- `GET /users/me/availability` - In-room presence status check.

#### 3. Wallet & Ledger (`/api/v1/wallet/*`)
- `GET /wallet/balance` - Spendable coins, gems, and creator earnings.
- `GET /wallet/packages` - Available coin purchase SKUs.
- `POST /wallet/recharge/initiate` - Create Razorpay order.
- `POST /wallet/recharge/verify` - Verify signature and credit coins.
- `POST /wallet/purchase-with-earnings` - Exchange creator earnings for coins.
- `POST /wallet/transfer` - Seller-to-user coin distribution.
- `POST /wallet/referral/convert` - Transfer referral credits to spendable wallet.
- `POST /wallet/gems/convert` - Convert earned gems into spendable coins.
- `GET /wallet/gem-conversions` - History of gem conversions.
- `GET /wallet/transactions` - Comprehensive financial ledger statement.
- `GET /wallet/earnings-config`, `GET /wallet/withdraw-limits` - Policy limits.
- `POST /wallet/withdraw` - Cash-out attempt (returns `CASH_OUT_DISABLED`).
- `GET /wallet/withdrawals` - Historical withdrawal requests.
- `POST /wallet/gifts/send` - Virtual gift transaction between users.
- `GET /wallet/gifts` - Catalog of virtual gifts.
- `GET /wallet/can-call/:id/:type` - Call eligibility (returns `can_call: false`).

#### 4. Party Rooms (`/api/v1/rooms/*`)
- `GET /rooms` - Paginated active live room feed.
- `POST /rooms` - Initialize and open a new party room.
- `GET /rooms/:id` - Detailed room metadata, seats, and RTC channel.
- `PATCH /rooms/:id` - Update room title, theme, announcements.
- `POST /rooms/:id/close` - End room session.
- `POST /rooms/:id/join`, `POST /rooms/:id/leave` - Audience membership.
- `POST /rooms/:id/seats/:index/take|leave|kick|mute|lock|unlock` - 8-seat grid operations.
- `GET /rooms/:id/agora-token` - Generate Agora voice channel RTC token.
- `POST /rooms/:id/block-user`, `GET /rooms/:id/blocked-users` - In-room user bans.
- `POST /rooms/:id/gift` - In-room gift overlay broadcast and gem crediting.

#### 5. Real-Time Autonomous Games (`/api/v1/game/*`)
- `GET /game/greedy/state`, `GET /game/lucky77/state` - Current round phase, countdown, user bets.
- `POST /game/greedy/bet`, `POST /game/lucky77/bet` - Place chips on board item.
- `POST /game/greedy/quick-bet` - Batch chips across preset selections (salad/feast).
- `GET /game/greedy/result/:id`, `GET /game/lucky77/result/:id` - Settle outcome and fetch winnings.
- `GET /game/greedy/history`, `GET /game/lucky77/history` - Historical round outcomes.
- `GET /game/greedy/leaderboard`, `GET /game/lucky77/leaderboard` - Daily top winners.

#### 6. Direct Messaging & Star Chat (`/api/v1/chat/*`)
- `GET /chat/conversations` - 1-on-1 thread list with unread counts.
- `GET /chat/conversations/:id/messages` - Paginated chat history.
- `POST /chat/conversations/:id/messages` - Transmit direct message.
- `POST /chat/star-chat/start` - Debit coins and initiate paid session with star creator.
- `POST /chat/star-chat/heartbeat` - Renew active star-chat billing window.
- `POST /chat/star-chat/end` - Terminate session.

#### 7. Media Feeds & Posts (`/api/v1/media/*`, `/api/v1/posts/*`, `/api/v1/reels/*`)
- `GET /media/feed`, `GET /posts/feed`, `GET /reels/feed` - Content feeds.
- `POST /media`, `POST /posts`, `POST /reels` - Publish media post.
- `POST /media/upload`, `POST /posts/upload`, `POST /reels/upload` - Multipart file upload.
- `POST /media/signed-url` - Generate storage upload URL.
- `POST /media/:id/like`, `POST /media/:id/save`, `POST /media/:id/share` - Engagement actions.
- `POST /media/:id/comments`, `GET /media/:id/comments` - Discussion threads.
- `GET /media/banners` - Promotional carousel banners.
- `GET /media/music` - Music tracks library.

#### 8. Gamification & Progression (`/api/v1/gamification/*`, `/api/v1/bonuses/*`, `/api/v1/spin/*`)
- `GET /gamification/levels` - Level thresholds and progression badges.
- `GET /gamification/frames`, `POST /gamification/frames/:id/select` - Avatar frames.
- `GET /gamification/entry-bars`, `POST /gamification/entry-bars/:id/select` - Entrance effects.
- `GET /bonuses/config`, `GET /bonuses/status` - Bonus eligibility.
- `POST /bonuses/claim-admob` - Credit reward for AdMob video watch.
- `POST /bonuses/claim-game` - Claim rewards for mini-game achievements.
- `POST /bonuses/claim-streak` - Claim consecutive daily login bonuses.
- `GET /spin/prizes`, `POST /spin/play` - Lucky wheel coin lottery.

#### 9. Agency Operations (`/api/v1/agency/*`)
- `GET /agency/members` - List host creators affiliated with agency.
- `POST /agency/members` - Affiliate creator account with agency.
- `DELETE /agency/members/:id` - Terminate affiliation.
- `GET /agency/weekly-distributions` - Weekly host gem metrics.
- `POST /agency/weekly-distributions/:id/approve` - Admin/Agency gem payout release.

#### 10. Admin Back-Office (`/api/v1/admin/*`)
- `GET /admin/dashboard` - Platform overview metrics.
- `GET /admin/users` - Searchable, paginated user management.
- `POST /admin/users/:id/suspend|unsuspend` - User access suspension.
- `POST /admin/users/:id/star` - Assign verified star creator status.
- `POST /admin/users/:id/deactivate` - Full account shutdown and live room purge.
- `POST /admin/users/:id/link` - Assign seller/admin/user roles.
- `GET /admin/staff` - Staff roster.
- `GET|POST|PATCH|DELETE /admin/packages` - Coin package catalog CRUD.
- `GET|POST|PATCH|DELETE /admin/gifts` - Virtual gifts catalog CRUD.
- `GET|POST|PATCH|DELETE /admin/banners` - Promotional banner CRUD.
- `GET|POST|PATCH|DELETE /admin/frames` - Frames catalog CRUD.
- `GET|POST|PATCH|DELETE /admin/role-frames` - Role frames catalog CRUD.
- `GET|POST|PATCH|DELETE /admin/entry-bars` - Entry bars catalog CRUD.
- `GET|POST|PATCH|DELETE /admin/room-themes` - Room themes catalog CRUD.
- `GET|POST|PATCH|DELETE /admin/stickers` - Stickers catalog CRUD.
- `GET /admin/reports`, `POST /admin/reports/:id/resolve|dismiss` - Abuse moderation.
- `GET /admin/withdrawals`, `POST /admin/withdrawals/:id/reject` - Withdrawal audits.
- `GET|POST /admin/staff-commissions` - Agency & staff commission rates.
- `GET|PATCH /admin/settings` - Platform parameters (spin costs, gifts commission).

#### 11. Health Checks (`/api/v1/health`)
- `GET /health` - Probes Fastify status, PostgreSQL connectivity, and Redis ping.

---

## 8. Module Dependencies

The modular architecture exhibits clean structural encapsulation with well-defined service dependencies:

```mermaid
graph TD
    AppModule --> AuthModule
    AppModule --> UserModule
    AppModule --> WalletModule
    AppModule --> RoomModule
    AppModule --> GameModule
    AppModule --> ChatModule
    AppModule --> CallModule
    AppModule --> MediaModule
    AppModule --> AgencyModule
    AppModule --> GamificationModule
    AppModule --> AdminModule
    AppModule --> HealthModule
    
    PrismaModule -.->|Globally Exported| AppModule
    RedisModule -.->|Globally Exported| AppModule
    
    WalletModule --> LedgerService
    LedgerService --> PrismaService
    
    RoomModule --> LedgerService
    GameModule --> LedgerService
    ChatModule --> LedgerService
    GamificationModule --> LedgerService
    
    AuthModule --> TokenService
    AuthModule --> OtpService
    
    RoomModule --> AgoraService
```

- **`PrismaModule` & `RedisModule`:** Global providers available throughout the DI container.
- **`LedgerService`:** The central financial ledger authority. Exported by `WalletModule` and injected into `GameService` (payouts), `RoomService` (room gifts), `ChatService` (star-chat billing), and `GamificationService` (spin/streak claims).
- **`TokenService`:** The core JWT authority. Injected into `JwtAuthGuard` and all three WebSocket gateways (`RoomGateway`, `GameGateway`, `ChatGateway`).

---

## 9. External Integrations

| Integration | Library / Client | Production Implementation Status | Dev / Fallback Behavior |
| :--- | :--- | :--- | :--- |
| **Razorpay** | `razorpay` (v2.9.8) | Generates official orders via `orders.create()`. Verifies HMAC-SHA256 signatures with constant-time equality. | If `RAZORPAY_KEY_ID` is empty, generates `order_mock_<hex>` and approves mock signatures. |
| **Agora RTC** | `agora-token` (v2.0.6) | Builds authentic publisher/subscriber RTC tokens via `RtcTokenBuilder.buildTokenWithUid()`. | If `AGORA_APP_ID` is empty, returns `mock_agora_<channel>_<uid>`. |
| **Google OAuth2** | Native HTTP Fetch | Calls `https://oauth2.googleapis.com/tokeninfo` and validates client audience. | If `GOOGLE_CLIENT_ID` is empty, decodes JWT payload base64 directly without signature check. |
| **Nodemailer (SMTP)** | `nodemailer` (v10.0.7) | Opens TLS transport on port 587 to dispatch 6-digit OTP verification codes. | If `SMTP_HOST` is empty, logs OTP to stdout and returns code in JSON (`data.dev_otp`). |
| **Google Cloud Storage** | None (SDK absent) | **Not implemented.** No `@google-cloud/storage` SDK package installed. | `signedUpload()` returns constructed mock URL strings. |
| **Firebase Cloud Messaging** | None (SDK absent) | **Not implemented.** Hardware `fcm_token` is stored in DB, but no push notification SDK exists to send messages. | Endpoint accepts token; no downstream push is dispatched. |

---

## 10. Background Processing, Queues & Scheduled Tasks

### 10.1 Queue Architecture Analysis
- **Distributed Queues:** **None.** There is no Bull, BullMQ, RabbitMQ, Kafka, or AWS SQS configured or installed.
- **Cron Schedulers:** **None.** There is no `@nestjs/schedule` package installed.

### 10.2 In-Process Loop Engine
All background automation is executed via standard Node.js `setInterval` timers running directly in the HTTP server process:

1. **Autonomous Game Engine (`GameEngine` / `GameService.tick()`):**
   - **Frequency:** Every 1,000 milliseconds (1 second).
   - **Operations:**
     - Ensures active `GreedyRound` and `Lucky77Round` exist in PostgreSQL.
     - Broadcasts second-by-second countdown ticks over WebSockets.
     - Evaluates whether betting has closed (`bettingEndsAt <= now`).
     - Computes winning item using weighted probabilities (`pickWeighted`).
     - Executes transactional balance credits for winners via `LedgerService`.
     - Advances round to `completed` and opens new round.
2. **Room Seat Stale Cleanup (`RoomService.cleanupTimer`):**
   - **Frequency:** Every 30,000 milliseconds (30 seconds).
   - **Operations:** Scans `RoomMember` records. Removes members who have not sent a heartbeat in over 60 seconds and vacates their audio seats.
3. **Star-Chat Session Expiration (`ChatService.timer`):**
   - **Frequency:** Every 30,000 milliseconds (30 seconds).
   - **Operations:** Terminates `StarChatSession` records where the user has ceased sending heartbeat pings.

---

## 11. Caching

### 11.1 Redis Infrastructure
- **Image:** Redis `7-alpine`.
- **Client Library:** `ioredis` `6.0.0` wrapped in `RedisService`.
- **Connection Configuration:** Configured with `lazyConnect: true` and `maxRetriesPerRequest: 1`.

### 11.2 Actual Redis Usage in Application
Despite Redis being provisioned in Docker Compose, it is **NOT** utilized as a generic cache layer:
- **No HTTP Response Caching:** No NestJS `CacheModule` or Fastify cache interceptors.
- **No Database Query Caching:** Prisma queries are not cached in Redis (every user lookup, catalog request, and leaderboard query hits PostgreSQL directly).
- **No Socket.IO Redis Adapter:** WebSockets run on default memory adapter.
- **Active Redis Usage:** Strictly limited to:
  1. Temporary storage of 6-digit OTP codes with key expiration (`EX 900` seconds) in `OtpService`.
  2. Incremental rate limiting counters (`incrRate`) in `OtpService`.
  3. Health check ping in `HealthController`.

---

## 12. Storage

### 12.1 Local Storage Subsystem
- **Disk Path:** `/app/uploads` (mapped to `process.cwd()/uploads`).
- **Streaming Pipeline:** Handled via `@fastify/multipart` (80 MB file size ceiling). Streams chunks into a Node.js `WriteStream` using `stream/promises.pipeline`.
- **Static Exposure:** Registered in Fastify via `@fastify/static`:
  ```typescript
  await app.register(fastifyStatic, {
    root: uploadsDir,
    prefix: '/uploads/',
  });
  ```
- **URL Resolution:** Serves assets as `${PUBLIC_BASE_URL}/uploads/<timestamp>_<filename>`.

### 12.2 Cloud Storage Status
The `MediaService.signedUpload()` method checks `GCS_BUCKET`:
- If unset: Returns a mock URL pointing to `https://cdn.chataura.local/uploads/...`.
- If set: Returns a string formatted as `https://storage.googleapis.com/${bucket}/${name}?upload=signed`. **Crucial finding:** This does not produce a valid Google Cloud Storage signed V4 upload URL because the Google Cloud Storage client SDK is not installed or integrated.

---

## 13. Deployment Architecture

### 13.1 Docker Compose Specification (`docker-compose.yml`)
Configured to operate within a 2 vCPU / 8 GB RAM VPS budget using Docker bridge network `chataura_net`:

```yaml
services:
  nginx:          # Nginx 1.25 Alpine reverse proxy on host port 8080 -> 80
  nestjs-api:     # NestJS Fastify production image on host port 3005 -> 3000
                  # Memory limit: 1,500 MB | Node heap: --max-old-space-size=1200
  admin-panel:    # Next.js 14 standalone image on host port 3100 -> 3100
  postgres:       # PostgreSQL 16 Alpine on host port 5433 -> 5432
                  # Memory limit: 2,500 MB | Shared buffers: 256 MB
  redis:          # Redis 7 Alpine on host port 6380 -> 6379
                  # Memory limit: 800 MB | Maxmemory policy: allkeys-lru
```

### 13.2 Container Build Definitions
1. **NestJS (`docker/Dockerfile`):** Multi-stage Alpine build.
   - Stage 1 (`builder`): Compiles TypeScript via `nest build`, runs `prisma generate`.
   - Stage 2 (`production`): Installs production-only dependencies (`--omit=dev`), runs as unprivileged user `USER node`.
2. **Next.js Admin (`chataura_admin/Dockerfile`):** Multi-stage build.
   - Stages: `deps` → `builder` (`npm run build`) → `runner` (`npm run start` on port 3100).
3. **Nginx Reverse Proxy (`docker/nginx/default.conf`):**
   - Rate limits HTTP requests: `limit_req_zone $binary_remote_addr zone=api_limit:10m rate=30r/s;` with `burst=60 nodelay`.
   - Maps WebSocket upgrade headers (`Upgrade` / `Connection`) for `/socket.io/` paths with 3600-second read/send timeouts.

---

## 14. Testing Architecture

### 14.1 Backend Test Coverage
1. **End-to-End (E2E) Integration Tests (`test/`):**
   - Executed against live NestJS Fastify instance via Supertest:
     - `app.e2e-spec.ts`: Bootstrapping and health probes.
     - `auth-user.e2e-spec.ts`: Registration, login, profile updates, JWT refresh.
     - `wallet.e2e-spec.ts`: Recharge initiate, mock verify, gem-to-coin conversion, gift ledger deductions.
     - `rooms.e2e-spec.ts`: Room lifecycle, seat locks/mutes, Agora token responses.
     - `games.e2e-spec.ts`: Greedy and Lucky77 bet placements, countdown states, settlement payouts.
     - `chat.e2e-spec.ts`: 1-1 threads, star-chat billing deducts.
     - `spin-bonus-invite.e2e-spec.ts`: Lucky wheel spins, streak bonuses, invite code attribution.
     - `media-agency-admin.e2e-spec.ts`: Feeds, comments, likes, agency distributions, admin actions.
2. **Unit Tests:**
   - Only 1 unit test exists: `src/modules/game/game.constants.spec.ts` (verifying mathematical RNG distribution of `pickWeighted`).
3. **Load & Concurrency Tests (`k6/`):**
   - `k6/load.local.js` and `k6/load.prod.js`: Evaluates 50 to 500 concurrent virtual users hitting health endpoints, login, and room polling.
4. **Frontend Tests:**
   - **Zero tests.** `chataura_admin` contains no Jest, Vitest, Cypress, Playwright, or React Testing Library suites.
5. **CI/CD Pipeline:**
   - **Zero CI/CD automation.** No `.github/workflows` or automated test triggers on commit/PR exist in the repository.

---

## 15. Security Architecture

### 15.1 Strengths
- **Constant-Time Verification:** Razorpay payment webhooks utilize `crypto.timingSafeEqual` over HMAC-SHA256 digests to prevent timing attacks.
- **Refresh Token Hashing:** Refresh tokens are never stored in plaintext in the database; only SHA-256 hashes are stored.
- **Pessimistic Concurrency Protection:** All coin debits and credits employ database-level row locks (`SELECT ... FOR UPDATE`), mathematically preventing double-spending in race conditions.
- **Input Sanitization:** `ValidationPipe` with `forbidNonWhitelisted: true` prevents object property injection into database queries.
- **Least-Privilege Docker User:** NestJS container executes as non-root user `node`.

### 15.2 Vulnerabilities & Weaknesses
- **Token in `localStorage`:** Next.js Admin stores authentication tokens in `window.localStorage`, vulnerable to Cross-Site Scripting (XSS) exfiltration compared to `httpOnly`, `Secure`, `SameSite=Strict` cookies.
- **Database Auth Bottleneck:** `JwtAuthGuard` performs a database query (`prisma.user.findUnique`) on every authenticated HTTP request, turning database read I/O into a bottleneck under high CCU.
- **Permissive CORS:** Default configuration allows `CORS_ORIGIN=*`.
- **Insecure Development Fallbacks:** In development environments without `GOOGLE_CLIENT_ID`, unverified Google ID tokens are decoded and trusted. When `SMTP_HOST` is unset, verification OTPs are returned in API response bodies.
- **Unauthenticated WebSockets Handshake Validation:** Socket.IO connections falling back to query strings can expose JWTs in server access logs.

---

## 16. Major Technical Risks

1. **In-Memory Single-Process Game Loop Risk (CRITICAL):**
   - The autonomous game engine runs via `setInterval` in the Node.js event loop.
   - If the NestJS container crashes, restarts, or hangs during a heavy GC pause, game rounds and bet settlement freeze.
   - **Scaling Failure:** If the NestJS container is scaled horizontally (e.g. 2 or more replicas behind Nginx), each replica will instantiate its own independent `setInterval` timer, generating duplicate game rounds, concurrent settlements, and catastrophic ledger corruption.
2. **Missing Distributed Cache & Session Adapter:**
   - Socket.IO uses the in-memory adapter. WebSockets cannot scale horizontally across multiple instances without `@socket.io/redis-adapter`.
3. **Local Ephemeral File Storage Risk:**
   - Media posts, user avatars, and reels are saved to the container's local `/app/uploads` folder.
   - Unless an external Docker volume is mounted to host storage, re-deploying or recreating the `nestjs-api` container will permanently delete all uploaded media.
4. **Discrepancy in Third-Party Cloud Integrations:**
   - The architectural plans describe Google Cloud Storage and Firebase Cloud Messaging.
   - Neither `@google-cloud/storage` nor `firebase-admin` is installed in `package.json`. Media signed URLs and FCM notifications are non-functional stubs.
5. **Database Connection Saturation:**
   - With `connection_limit=25` on Prisma and `max_connections=100` on Postgres, aggressive concurrency across HTTP endpoints, game loops, room member cleanups, and chat threads could exhaust database connections if connection lifecycles are prolonged.

---

## 17. Technical Debt

1. **Hardcoded Admin Dashboard Metrics:**
   - `chataura_admin/app/(dashboard)/page.tsx` contains hardcoded revenue numbers (`"8,785"`, `"87,830"`), commission tables, and platform flow metrics that do not reflect database values.
   - Date picker filters on the dashboard are visual mock elements with no functional binding to backend query parameters.
2. **Database Schema Redundancy:**
   - `User.walletBalance` and `User.coinBalance` are stored as two separate columns in the `users` table and must be updated together in every transaction to prevent balance drift.
   - `User.exp` and `User.xp` represent identical level progression data stored under two distinct columns.
3. **Absence of Unit Testing:**
   - Nearly all testing relies on end-to-end integration tests (`test/*.e2e-spec.ts`). Core business logic services (`WalletService`, `RoomService`, `ChatService`) possess 0 unit tests with mocked database layers.
4. **Lack of Automated CI/CD:**
   - Quality checks, testing, linting, and Docker container builds rely entirely on manual developer execution.

---

## 18. Areas That Appear Well Designed

1. **Financial Ledger & ACID Integrity (`LedgerService`):**
   - The separation of concerns in `LedgerService` is clean.
   - Row-level locking (`SELECT ... FOR UPDATE`) is consistently applied across every coin debit, credit, transfer, and bet.
   - Immutable audit logging into `coin_transactions` records every balance alteration with `balanceAfter` snapshots.
2. **Standardized Response Envelope & Error Handling:**
   - `ResponseTransformInterceptor` and `AllExceptionsFilter` provide consistent contract compliance with the Android mobile app, preventing unexpected crash behaviors from unstructured error payloads.
3. **Clean Domain Modularization:**
   - The NestJS modular architecture cleanly segments business domains into independent modules (`auth`, `wallet`, `room`, `game`, `chat`, `media`, `agency`, `admin`).
4. **Production Resource Bounding:**
   - Docker Compose configuration strictly bounds memory allocations (`1500M` API, `2500M` DB, `800M` Redis) to prevent Out-Of-Memory (OOM) kernel terminations on constrained 8 GB VPS hardware.
5. **Contract Compatibility:**
   - Endpoints, query parameters, and JSON payloads accurately mimic legacy Laravel signatures, allowing Android clients to transition without rewrite.

---

## 19. Areas That Require Investigation

1. **Android Client Cutover Readiness:**
   - Examine Android `app/src/main/java/com/chataura/app/api/ApiConfig.kt` to verify whether the mobile client can switch to the NestJS URL immediately or if any residual legacy Laravel endpoints remain un-migrated.
2. **Persistent Storage Strategy:**
   - Decide whether production will rely on persistent host volume mounts for `/uploads` or if an authentic S3/GCS SDK driver must be implemented before traffic cutover.
3. **Distributed Worker Architecture:**
   - Investigate transitioning the in-memory game tick, stale room cleanup, and star-chat expiration from Node.js `setInterval` to a dedicated distributed worker (e.g. BullMQ on Redis) to enable horizontal container scaling.
4. **Database-Free Authentication Caching:**
   - Benchmark the overhead of `JwtAuthGuard` performing a PostgreSQL read on every single HTTP request. Investigate caching user authentication and suspension status in Redis with a short TTL (e.g. 60 seconds).
5. **FCM Push Dispatch Requirement:**
   - Verify whether mobile clients depend on server-initiated FCM push notifications for 1-1 chat messages and room invites. If required, integrate the official `firebase-admin` SDK.

---

## 20. End-to-End Flow Tracing

### Flow A: User Registration & Referral Attribution
```
[Android Client / Web]
       │  POST /api/v1/auth/register { email, password, referral_code }
       ▼
[Nginx Proxy (:8080)] ───► [Fastify HTTP Adapter (:3000)]
                                   │
                                   ▼
                       [ValidationPipe (RegisterDto)]
                                   │
                                   ▼
                       [AllExceptionsFilter / ResponseTransformInterceptor]
                                   │
                                   ▼
                         [AuthService.register()]
                                   │
         ┌─────────────────────────┴─────────────────────────┐
         ▼                                                   ▼
[prisma.user.findUnique(email)]              [prisma.user.findUnique(inviteCode)]
   Check duplication                            Find referring user
         │                                                   │
         └─────────────────────────┬─────────────────────────┘
                                   │
                                   ▼
                      [bcrypt.hash(password, 10)]
                                   │
                                   ▼
                         [prisma.user.create()]
                       Insert user into PostgreSQL
                                   │
                                   ▼
                    [AuthService.grantReferralCoins()]
                                   │
                                   ▼
                 [LedgerService.creditSpendable() x2]
              Pessimistic lock: SELECT FOR UPDATE
              Credit referee (50) & referrer (100)
              Write to coin_transactions audit table
                                   │
                                   ▼
                   [TokenService.generateAccessToken()]
                   [TokenService.generateRefreshToken()]
              Sign JWT & store hashed token in refresh_tokens
                                   │
                                   ▼
                      [ResponseTransformInterceptor]
                                   │
                                   ▼
          HTTP 201 { success: true, data: { access_token, user } }
```

### Flow B: Live Party Room Virtual Gift Transaction
```
[Android Client in Party Room]
       │  POST /api/v1/wallet/gifts/send { gift_id: 12, receiver_id: 45 }
       ▼
[Nginx Proxy] ───► [Fastify]
                         │
                         ▼
             [JwtAuthGuard (Validates Bearer token & DB active status)]
             [EmailVerifiedGuard (Verifies emailVerifiedAt != null)]
             [RolesGuard (Permits active user role)]
                         │
                         ▼
             [WalletService.sendGift()]
                         │
                         ▼
             [prisma.gift.findFirst(gift_id)]
             Calculate cost, giftCommissionPct, and netGems
                         │
                         ▼
             [prisma.$transaction()]
                         │
         ┌───────────────┴────────────────────────────────┐
         ▼                                                ▼
[LedgerService.debitCoins(senderId)]      [LedgerService.lockUser(receiverId)]
  SELECT ... FOR UPDATE (sender)            SELECT ... FOR UPDATE (receiver)
  Verify wallet_balance >= cost             Increment gems by netGems
  Decrement walletBalance & coinBalance     Increment totalEarnedCoins
  Insert coin_transactions (GIFT)           Update user record
  Insert coin_transactions (COMMISSION)
         │                                                │
         └───────────────────────┬────────────────────────┘
                                 │
                                 ▼
                     [RoomEvents.emitGiftOverlay()]
                                 │
                                 ▼
             [RoomGateway.server.to("room:123").emit()]
          Socket.IO broadcasts gift visual animation to all peers
                                 │
                                 ▼
        HTTP 200 { success: true, data: { sender_balance_after, receiver_gems_after } }
```

---
*Audit completed and documented into `/docs/CURRENT_SYSTEM_AUDIT.md`.*
