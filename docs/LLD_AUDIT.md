# Low-Level Design (LLD) Audit

**Project:** ChatAura (Laravel → Next.js + NestJS Migration)  
**Date:** September 17, 2026  
**Auditor:** Principal Software Engineer / Staff-level LLD Reviewer  
**Scope:** Complete code-level design, concurrency, database access, error handling, and component architecture audit across `chataura_backend_nest` and `chataura_admin`.

---

## Executive Summary

This Low-Level Design (LLD) audit evaluates the concrete implementation of the ChatAura migration from Laravel to NestJS 10 and Next.js 14. In alignment with the approved High-Level Design decisions ([HLD_FINAL_DECISION.md](file:///Users/ashishtayal/AndroidStudioProjects/ChatAura/docs/HLD_FINAL_DECISION.md)), the system appropriately implements a Modular Monolith with PostgreSQL ACID transactions, Fastify HTTP adapters, and in-memory WebSockets for single-VPS hosting.

While the core financial transactions and authorization guards are solid, this in-depth low-level code audit revealed critical concurrency vulnerabilities in game settlement, potential database deadlocks in peer transactions, an unbounded in-memory query in game leaderboards that threatens Node.js process stability, and un-transactional referral balance updates. In the Next.js admin frontend, widespread boilerplate duplication and missing input DTO validation in admin controllers represent meaningful technical debt.

No full-scale rewrites or microservices are required. All findings can be resolved incrementally through targeted low-level corrections that preserve API compatibility, business logic, and financial invariants.

---

## Critical Findings

- **LLD-CRIT-01: Game Settlement Race Condition & Conflicting Winner / Double Payout Hazard**  
  *Files:* `src/modules/game/game.service.ts`, `src/modules/game/game.engine.ts`  
  Settlement of Greedy and Lucky77 rounds is triggered both by the 1-second interval `GameEngine.tick()` and by concurrent client requests (`greedyState`, `greedyResult`). The winner is randomly rolled and the round marked for drawing *outside* an atomic database lock. Two concurrent invocations can roll conflicting winning items and execute duplicate payouts to players.

- **LLD-CRIT-02: Reciprocal Peer Transfer & Gifting Database Deadlock Hazard**  
  *Files:* `src/modules/wallet/wallet.service.ts` (`sellerTransfer`), `src/modules/room/room.service.ts` (`sendRoomGift`)  
  Row-level locks (`SELECT ... FOR UPDATE`) are acquired in caller sequence (sender then receiver). Concurrent reciprocal transfers between User A and User B will acquire locks in opposite order, triggering PostgreSQL transaction deadlocks (`40P01`) and aborted transactions.

- **LLD-CRIT-03: Unbounded In-Memory Aggregation Query in Game Leaderboard**  
  *File:* `src/modules/game/game.service.ts` (`greedyLeaderboard`)  
  `greedyLeaderboard()` executes `findMany` without a limit on all winning bets of the day, loading tens of thousands of records with full user models into Node.js heap memory, aggregating them in JavaScript. Because this is called on every `greedyState()` call, high game activity will trigger V8 heap exhaustion and crash the NestJS process.

---

## High Findings

- **LLD-HIGH-01: Non-Atomic Referral Application & Financial Race Condition**  
  *File:* `src/modules/user/user.service.ts` (`applyInvite`)  
  Referral code application executes five sequential database updates outside a transaction and without row locks. Concurrent requests from the same user can double-credit bonuses, and partial network failures leave accounts in corrupt referral states.

- **LLD-HIGH-02: Agency Weekly Distribution Lacks Financial Ledger Audit Record & Optimistic Lock**  
  *File:* `src/modules/agency/agency.service.ts` (`weeklyApprove`)  
  Weekly gem distributions directly increment user balances by tens of thousands of gems without writing a corresponding ledger entry in `coinTransaction` or any audit table, destroying ledger balance reconciliation.

- **LLD-HIGH-03: N+1 Database Query in Inbox Conversations Listing**  
  *File:* `src/modules/chat/chat.service.ts` (`listConversations`)  
  For each conversation returned in a page (up to 50), an asynchronous `prisma.message.count()` query is issued individually inside a `Promise.all(parts.map(...))` loop, triggering 51 separate SQL queries per page load.

- **LLD-HIGH-04: Oversized God Services with Excessive Domain Coupling**  
  *Files:* `src/modules/room/room.service.ts` (1,495 lines), `src/modules/admin/admin.service.ts` (1,084 lines)  
  `RoomService` mixes 10 distinct sub-domains (room lifecycle, Agora RTC tokens, PK battles, mic locks, background music, chat, stickers, gifting, leaderboards, and moderation). `AdminService` mixes 16 disparate catalog and operational areas into a single class.

---

## Medium Findings

- **LLD-MED-01: Missing DTO Validation Classes in Admin and Media Controllers**  
  *Files:* `src/modules/admin/admin.controller.ts`, `src/modules/media/media.controller.ts`  
  Endpoints use inline anonymous TypeScript type literals rather than `class-validator` decorated DTOs, bypassing the global NestJS `ValidationPipe` and allowing invalid types to hit service layers.

- **LLD-MED-02: Redundant In-Transaction User Row Locking in Ledger Operations**  
  *Files:* `src/modules/wallet/wallet.service.ts` (`convertGems`), `src/modules/gamification/bonus-spin.service.ts` (`play`)  
  Services explicitly lock the user row with `ledger.lockUser(tx, userId)` and then immediately call `ledger.creditCoins()`, which executes an identical `SELECT ... FOR UPDATE` query on the same row in the same transaction.

- **LLD-MED-03: Widespread Auth & Loading Boilerplate Duplication in Admin Frontend**  
  *Files:* 15 page components in `chataura_admin/app/(dashboard)/*`  
  Every dashboard page duplicates identical `useEffect` token checks, router redirects, loading flags, and inline table styles instead of using a layout-level guard or custom auth hook.

- **LLD-MED-04: Multipart Stream Processing Inside Controller Method**  
  *File:* `src/modules/media/media.controller.ts` (`maybeStore`)  
  Fastify multipart stream parsing and MIME validation logic are implemented in a private controller helper rather than an upload pipe or dedicated storage service.

- **LLD-MED-05: Non-Atomic Batch Gifting with Partial Delivery Failure Risk**  
  *File:* `src/modules/room/room.service.ts` (`sendBatchGift`)  
  Iterates over multiple receivers in a serial loop where each gift executes in an isolated transaction. Running out of coins mid-batch leaves the room in a partially delivered state.

---

## Low Findings

- **LLD-LOW-01: Health Check Endpoint Returns HTTP 200 When Dependencies Are Down**  
  *File:* `src/health/health.controller.ts`  
  Catches database and Redis failures but returns HTTP 200 with `{ status: 'ok', checks: { postgres: 'down' } }`, preventing load balancers and orchestrators from detecting container degradation.

- **LLD-LOW-02: Repeated Redis Connection Guard Boilerplate in OtpService**  
  *File:* `src/modules/auth/otp.service.ts`  
  Every method in `OtpService` manually checks `client.status !== 'ready'` instead of relying on lifecycle connection management in `RedisService.onModuleInit()`.

- **LLD-LOW-03: Fetch Client Missing HTTP Error Handling & Unchecked JSON Parsing**  
  *File:* `chataura_admin/lib/api.ts`  
  Calls `res.json()` directly without verifying `res.ok`, throwing unhandled `SyntaxError` exceptions when upstream Nginx proxies return HTML error pages.

- **LLD-LOW-04: Extra Database Write in Room Gifting to Set Metadata**  
  *File:* `src/modules/room/room.service.ts` (lines 819–829)  
  `LedgerService.debitCoins` does not accept a `meta` parameter, forcing `sendRoomGift` to execute an extra `tx.coinTransaction.updateMany` write immediately after creation.

---

## Acceptable Current Design

1. **Modular Monolith Layout:** The 11 domain modules in `src/modules` cleanly map to product features without circular dependency issues.
2. **Fastify HTTP Engine:** High-performance request processing and websocket compatibility on a single VPS host.
3. **Prisma Row Locking in Core Wallet:** `LedgerService.debitCoins` and `creditCoins` correctly use `SELECT ... FOR UPDATE` for atomic balance mutations and twin column synchronization.
4. **Global Response Envelope Interceptor:** `ResponseTransformInterceptor` wraps successful payloads in `{ success: true, data: ... }`, preserving complete Laravel client compatibility.
5. **Sanitizing Exception Filter:** `AllExceptionsFilter` securely logs error stacks while shielding clients from internal database connection strings and SQL details.

---

## False Positives / Not Issues

1. **Direct Database Lookups in `JwtAuthGuard`:**  
   *Observation:* Querying the database on every authenticated request was flagged in early reviews.  
   *Verdict:* Confirmed by HLD as an **acceptable design**. Direct indexed lookups guarantee instantaneous ban and suspension enforcement without cache invalidation bugs.
2. **In-Process Game Loops (`GameEngine` Timer):**  
   *Observation:* Running game rounds using `setInterval` in the API process rather than external workers.  
   *Verdict:* Confirmed by HLD as **acceptable for single-instance VPS**. External queues would add unnecessary architectural overhead.
3. **Absence of Backend OAuth Redirect URI:**  
   *Observation:* No `/auth/google/callback` route exists in `AuthController`.  
   *Verdict:* **Correct by design**. ChatAura uses Google ID Token verification via Google's `tokeninfo` endpoint; no server-side redirect flow is needed.

---

## Detailed Findings

```
ID: LLD-CRIT-01
Severity: CRITICAL
Category: Concurrency / Async Safety
File: src/modules/game/game.service.ts
Class/Function: GameService.settleGreedyIfDue, GameService.settleLuckyIfDue
Current Implementation:
Lines 464-480 check if round.phase !== 'completed' and bettingEndsAt <= now. Then pickWeighted() is called, followed by updating phase to 'drawing'. Finally, a $transaction is opened to calculate payouts and credit winners.
Problem:
settleGreedyIfDue is called both by the 1-second interval timer in GameEngine.tick() AND on-demand by client requests in greedyState() and greedyResult(). Because the phase check and pickWeighted() are not executed inside an atomic conditional database update, two concurrent calls can both pass the phase check, pick two different winning items, and execute double payouts to players.
Technical Impact:
Players receive double coin payouts; round history records conflicting winning items; game ledger records divergent payouts for the same round ID.
Why It Matters:
Direct financial coin inflation and loss of game integrity.
Recommended Fix:
Use atomic conditional status transition:
const claimed = await tx.greedyRound.updateMany({
  where: { id: round.id, phase: 'betting' },
  data: { phase: 'drawing' }
});
if (claimed.count === 0) return; // Another worker/caller is already settling this round
Execute pickWeighted() and payout calculation inside the single winning transaction.
Change Scope: Small (game.service.ts)
Regression Risk: Low
Testing Required: Concurrent test simulating two simultaneous settle calls on the same round.
```

```
ID: LLD-CRIT-02
Severity: CRITICAL
Category: Database Access / Concurrency
File: src/modules/wallet/wallet.service.ts, src/modules/room/room.service.ts
Class/Function: WalletService.sellerTransfer, RoomService.sendRoomGift
Current Implementation:
In sellerTransfer, tx locks senderId with lockUser (SELECT ... FOR UPDATE) and then locks receiverId with creditCoins. In sendRoomGift, senderId is debited (locked) and then receiverId is locked.
Problem:
Locks are acquired in caller order rather than sorted primary key order. If User A transfers to User B while User B transfers to User A simultaneously, Thread 1 holds Lock(A) waiting for Lock(B), while Thread 2 holds Lock(B) waiting for Lock(A).
Technical Impact:
PostgreSQL detects a circular wait deadlock (error code 40P01: deadlock_detected) and terminates one of the client transactions with an unhandled 500 error.
Why It Matters:
Under active peer trading or party room gifting, users will experience random transaction failures and rollbacks.
Recommended Fix:
Whenever locking multiple user rows within a transaction, always sort user IDs and lock in ascending numeric order:
const [firstId, secondId] = userId < receiverId ? [userId, receiverId] : [receiverId, userId];
await ledger.lockUser(tx, firstId);
await ledger.lockUser(tx, secondId);
Change Scope: Medium (ledger.service.ts, wallet.service.ts, room.service.ts)
Regression Risk: Low
Testing Required: Unit test executing reciprocal simultaneous transfers between two test accounts using Promise.all.
```

```
ID: LLD-CRIT-03
Severity: CRITICAL
Category: Concurrency / Database Access
File: src/modules/game/game.service.ts
Class/Function: GameService.greedyLeaderboard
Current Implementation:
Lines 240-270 execute this.prisma.greedyBet.findMany({ where: { status: 'won', createdAt: { gte: start } }, include: { user: true } }). The results are then looped in a JavaScript Map to compute sums, sorted with Array.prototype.sort, and sliced.
Problem:
The query has no take limit and loads the entire set of daily winning bets with their related user models into Node.js heap memory. This method is called inside greedyState() (line 83) on every game screen view and poll.
Technical Impact:
On a busy day with 20,000+ winning bets, each call to greedyState pulls tens of thousands of objects into Node.js heap memory, resulting in severe garbage collection thrashing and eventual Node.js process OOM crash.
Why It Matters:
Immediate production crash hazard for the entire NestJS application under active gaming volume.
Recommended Fix:
Replace the in-memory aggregation with a database group-by aggregation or raw query:
const top = await this.prisma.greedyBet.groupBy({
  by: ['userId'],
  where: { status: 'won', createdAt: { gte: start } },
  _sum: { actualPayout: true },
  orderBy: { _sum: { actualPayout: 'desc' } },
  take,
});
Change Scope: Small (game.service.ts)
Regression Risk: Low
Testing Required: Seed 5,000 winning bets and verify greedyLeaderboard executes in <15ms with flat memory usage.
```

```
ID: LLD-HIGH-01
Severity: HIGH
Category: Concurrency / Financial Ledger
File: src/modules/user/user.service.ts
Class/Function: UserService.applyInvite
Current Implementation:
applyInvite verifies me.invitedBy, then runs user.update (setting invitedBy), then user.update (referee balance), coinTransaction.create, user.update (referrer balance), and coinTransaction.create across 5 separate queries without a $transaction.
Problem:
Lacks transaction atomicity and row locking. Concurrent requests will both read me.invitedBy === null, allowing duplicate referral bonus payouts. Network failure during execution leaves accounts in partially updated states.
Technical Impact:
Duplicate coin issuance to both users; data inconsistency between invitedBy flag and coin transactions.
Why It Matters:
Referral farming exploits can drain platform coin economy.
Recommended Fix:
Wrap applyInvite in this.prisma.$transaction and use LedgerService.creditCoins for both balances.
Change Scope: Small (user.service.ts)
Regression Risk: Low
Testing Required: Concurrent test submitting duplicate apply-invite requests with the same token.
```

```
ID: LLD-HIGH-02
Severity: HIGH
Category: Financial / Ledger
File: src/modules/agency/agency.service.ts
Class/Function: AgencyService.weeklyApprove
Current Implementation:
Lines 272-286 execute a transaction containing user.update (incrementing user.gems) and agencyWeeklyDistribution.update (marking paid). No ledger record is created.
Problem:
Direct balance mutation without writing a ledger audit record. If an agency distributes 100,000 gems, the user balance increases with zero ledger trail in coinTransaction or gemConversion. Additionally, the update lacks optimistic concurrency control on status.
Technical Impact:
Destroys auditability; financial reconciliation reports cannot account for gem balance increases. Concurrent approvals could double-credit gems.
Why It Matters:
Violates the core ledger architecture rule that all balance adjustments must have corresponding transaction records.
Recommended Fix:
Write a coinTransaction or agencyDistribution record inside the transaction, and ensure status: 'pending' is included in the update condition.
Change Scope: Small (agency.service.ts)
Regression Risk: Low
Testing Required: Verify weeklyApprove generates an immutable ledger row with correct before/after balances.
```

```
ID: LLD-HIGH-03
Severity: HIGH
Category: Database Access / Performance
File: src/modules/chat/chat.service.ts
Class/Function: ChatService.listConversations
Current Implementation:
Lines 53-64 iterate over conversation participants using Promise.all(parts.map(async (p) => { ... await this.prisma.message.count(...) })).
Problem:
N+1 query pattern. Fetching a page of 50 conversations executes 51 sequential database queries (1 query for conversations + 50 individual count queries).
Technical Impact:
Significant latency amplification and database connection pool exhaustion under concurrent chat usage.
Why It Matters:
Inbox loading is a frequent mobile user action; high query volume slows down the entire API.
Recommended Fix:
Fetch unread counts in a single grouped query:
SELECT conversation_id, COUNT(*) FROM messages
WHERE sender_id != $userId AND created_at > ...
GROUP BY conversation_id
Change Scope: Small (chat.service.ts)
Regression Risk: Low
Testing Required: Measure query count during listConversations test execution (must be <= 2 queries).
```

```
ID: LLD-HIGH-04
Severity: HIGH
Category: Code Quality / Architecture
File: src/modules/room/room.service.ts, src/modules/admin/admin.service.ts
Class/Function: RoomService, AdminService
Current Implementation:
RoomService contains 1,495 lines with over 50 methods spanning 10 different sub-domains. AdminService contains 1,084 lines spanning 16 catalog and management features.
Problem:
God classes violating the Single Responsibility Principle. High coupling creates high regression risk when modifying any individual feature.
Technical Impact:
Bloated constructor dependencies, hard-to-maintain test suites, and high risk of unintended side-effects during updates.
Why It Matters:
Long-term development velocity and code maintainability are degraded.
Recommended Fix:
Extract focused sub-services into their respective modules:
- RoomService: RoomGiftingService, RoomSeatService, RoomPkService
- AdminService: AdminCatalogService, AdminUserService, AdminFinanceService
Keep the parent services as lightweight coordinators.
Change Scope: Medium (refactoring without changing public method signatures)
Regression Risk: Low
Testing Required: Full E2E suite validation.
```

```
ID: LLD-MED-01
Severity: MEDIUM
Category: API Implementation / Validation
File: src/modules/admin/admin.controller.ts, src/modules/media/media.controller.ts
Class/Function: AdminController, MediaController
Current Implementation:
Methods use inline object types in @Body() decorators (e.g. @Body() body: { coins?: number; price?: number }).
Problem:
NestJS ValidationPipe requires class definitions with class-validator decorators to enforce schema rules, types, and stripping of unknown properties. Inline type definitions are erased at runtime, bypassing validation completely.
Technical Impact:
Invalid payloads (e.g. strings where numbers are expected, negative numbers, missing required attributes) reach the service layer unchecked.
Why It Matters:
Reduces API robustness and causes preventable 500 runtime errors on malformed requests.
Recommended Fix:
Create dedicated DTO classes with @IsNumber(), @IsString(), @IsOptional(), and @Min() decorators.
Change Scope: Medium (create DTO files in admin and media modules)
Regression Risk: Very Low
Testing Required: Test invalid body payloads against admin endpoints to verify 400 Validation Error responses.
```

```
ID: LLD-MED-02
Severity: MEDIUM
Category: Database Access / Efficiency
File: src/modules/wallet/wallet.service.ts, src/modules/gamification/bonus-spin.service.ts
Class/Function: WalletService.convertGems, BonusSpinService.play
Current Implementation:
In convertGems, line 524 calls this.ledger.lockUser(tx, userId) and then line 539 calls this.ledger.creditCoins(tx, userId, ...), which executes an identical lockUser query on the same row in the same transaction.
Problem:
Redundant SQL round-trips to PostgreSQL within an active transaction.
Technical Impact:
Unnecessary database latency and longer transaction hold times.
Why It Matters:
Financial transaction throughput is reduced by redundant queries.
Recommended Fix:
Allow creditCoins and debitCoins to accept an already-locked user record or skip re-locking if the lock has already been established in the current transaction.
Change Scope: Small (ledger.service.ts)
Regression Risk: Low
Testing Required: E2E wallet and gamification test suite.
```

```
ID: LLD-MED-03
Severity: MEDIUM
Category: Next.js Frontend / Maintainability
File: chataura_admin/app/(dashboard)/* (15 page components)
Class/Function: PackagesPage, UsersPage, StaffPage, etc.
Current Implementation:
Every page implements its own useEffect hook that retrieves ca_admin_token from localStorage, checks for null, redirects to /login, manages loading/error states, and duplicates table markup.
Problem:
Violation of DRY principle across all 15 dashboard pages.
Technical Impact:
Maintenance burden; fixing auth redirection or token refreshing requires updating 15 separate files.
Why It Matters:
High code duplication in the frontend increases bug surface area.
Recommended Fix:
Implement an auth guard in app/(dashboard)/layout.tsx or a shared useAdminAuth() hook that provides token, loading state, and standardized error handling.
Change Scope: Medium (admin frontend)
Regression Risk: Low
Testing Required: Verify page navigation and unauthenticated redirection in admin portal.
```

```
ID: LLD-MED-04
Severity: MEDIUM
Category: Separation of Concerns
File: src/modules/media/media.controller.ts
Class/Function: MediaController.maybeStore
Current Implementation:
Lines 357-375 implement Fastify multipart file parsing, MIME validation, and local storage routing inside a private controller method.
Problem:
Controllers should be responsible only for HTTP request routing and response mapping. File stream consumption and MIME inspection belong in a pipe, interceptor, or storage service.
Technical Impact:
MediaController is tightly coupled to Fastify-specific request internals; difficult to unit test without mocking multipart streams.
Why It Matters:
Degrades architectural clean separation and testability.
Recommended Fix:
Extract maybeStore into an UploadInterceptor or dedicate it to MediaService.
Change Scope: Small (media module)
Regression Risk: Low
Testing Required: Test image and video uploads to ensure identical URL generation.
```

```
ID: LLD-MED-05
Severity: MEDIUM
Category: Concurrency / Business Logic
File: src/modules/room/room.service.ts
Class/Function: RoomService.sendBatchGift
Current Implementation:
sendBatchGift executes a for loop calling this.sendRoomGift() for each receiver ID. Each iteration runs an independent $transaction.
Problem:
Lack of atomicity across the batch operation. If a user attempts to send gifts to 8 room seats but balance runs out after 4 seats, the operation fails with an exception while 4 gifts have already been permanently committed.
Technical Impact:
Partial batch failure, inconsistent UI state for the sender and room occupants.
Why It Matters:
Users expect batch actions to either succeed completely or fail cleanly without spending partial funds.
Recommended Fix:
Wrap all gift iterations inside a single transaction, locking the sender once, deducting the aggregate coin total, and distributing gems to all recipients atomically.
Change Scope: Small (room.service.ts)
Regression Risk: Low
Testing Required: Batch gift test with balance sufficient for partial delivery only (must rollback completely).
```

```
ID: LLD-LOW-01
Severity: LOW
Category: Observability / Error Handling
File: src/health/health.controller.ts
Class/Function: HealthController.check
Current Implementation:
Catches Postgres and Redis exceptions, sets their check status to 'down', and returns a 200 OK HTTP response with { status: 'ok', checks: { postgres: 'down' } }.
Problem:
Container orchestrators and load balancers rely on standard HTTP 5xx status codes to identify unhealthy pods. Returning 200 OK prevents automated health detection.
Technical Impact:
A container with a failed database connection will continue receiving live traffic.
Why It Matters:
Standard production health check convention violation.
Recommended Fix:
If any critical check is 'down', return HTTP 503 (Service Unavailable) with the degraded check payload.
Change Scope: Very Small (health.controller.ts)
Regression Risk: Very Low
Testing Required: Trigger health check with database down and verify HTTP 503 response.
```

```
ID: LLD-LOW-02
Severity: LOW
Category: Code Quality
File: src/modules/auth/otp.service.ts
Class/Function: OtpService
Current Implementation:
Every method (store, verify, get, del, incrRate) manually executes:
if (client.status !== 'ready') await client.connect().catch(() => undefined);
Problem:
Repetitive boilerplate that should be handled once during application bootstrap.
Technical Impact:
Unnecessary code clutter in every service method.
Why It Matters:
NestJS lifecycle hooks (OnModuleInit) exist specifically to establish provider readiness cleanly.
Recommended Fix:
Call await this.client.connect().catch(...) inside RedisService.onModuleInit() and remove manual checks from OtpService.
Change Scope: Very Small (redis.service.ts, otp.service.ts)
Regression Risk: Very Low
Testing Required: Verify OTP storage and retrieval works seamlessly on fresh boot.
```

```
ID: LLD-LOW-03
Severity: LOW
Category: Frontend / Error Handling
File: chataura_admin/lib/api.ts
Class/Function: api
Current Implementation:
Executes return res.json() as Promise<T> without checking res.ok or handling non-JSON content.
Problem:
If an upstream reverse proxy returns a 502/504 HTML page, res.json() throws a SyntaxError: Unexpected token '<' instead of a clear network error.
Technical Impact:
Unfriendly raw JavaScript errors displayed in the admin UI.
Why It Matters:
Degrades admin portal error diagnostics.
Recommended Fix:
Check res.ok and content-type header before parsing JSON; return a standardized error object on non-2xx responses.
Change Scope: Very Small (api.ts)
Regression Risk: Very Low
Testing Required: Simulate 502 Bad Gateway response in admin client.
```

```
ID: LLD-LOW-04
Severity: LOW
Category: Database Access / Efficiency
File: src/modules/room/room.service.ts
Class/Function: RoomService.sendRoomGift
Current Implementation:
Lines 819-829 execute tx.coinTransaction.updateMany immediately after debitCoins to attach room and gift metadata.
Problem:
Extra SQL update query executed in every gifting transaction because LedgerService.debitCoins does not accept an optional meta parameter.
Technical Impact:
Extra database write per gift.
Why It Matters:
Room gifting is the highest-frequency financial transaction on the platform.
Recommended Fix:
Add meta?: Prisma.InputJsonValue to LedgerService.debitCoins and pass it directly during creation.
Change Scope: Very Small (ledger.service.ts, room.service.ts)
Regression Risk: Very Low
Testing Required: Verify gift transaction metadata is properly populated in coin_transactions table.
```

---

## LLD Decision

| Module | Current Architectural Health | Decision | Rationale |
|---|---|---|---|
| **Auth Module** | Good (guards, tokens, and verification clean) | **KEEP WITH MINOR FIXES** | Centralize Redis connection in `onModuleInit`; minor cleanup. |
| **Wallet & Ledger** | Solid ACID transaction design with twin columns | **KEEP WITH MINOR FIXES** | Fix reciprocal transfer lock ordering (LLD-CRIT-02) and redundant locks. |
| **Game Module** | High business logic quality; severe concurrency settlement bug | **REFACTOR** | Must fix atomic round settlement (LLD-CRIT-01) and in-memory leaderboard aggregation (LLD-CRIT-03). |
| **Room Module** | Functionally rich but oversized and high coupling | **REFACTOR** | Extract gifting, PK battles, and seats into focused sub-services; make batch gifting atomic. |
| **Chat Module** | Clean gateway and event model | **KEEP WITH MINOR FIXES** | Resolve N+1 unread count query in conversation listing (LLD-HIGH-03). |
| **User Module** | Clean serializers and profile handling | **KEEP WITH MINOR FIXES** | Wrap referral application in a transaction and use `LedgerService` (LLD-HIGH-01). |
| **Agency Module** | Sound role boundaries | **KEEP WITH MINOR FIXES** | Add financial ledger recording to weekly distributions (LLD-HIGH-02). |
| **Admin Backend** | Complete functional coverage | **KEEP WITH MINOR FIXES** | Add validation DTO classes for controllers (LLD-MED-01). |
| **Media Module** | Working local file storage and feed generation | **KEEP WITH MINOR FIXES** | Extract multipart parsing from controller to interceptor/service. |
| **Admin Frontend** | 20 working pages, modern dark UI | **KEEP WITH MINOR FIXES** | Extract shared auth hook/guard and consolidate duplicated table boilerplate. |

---

## Recommended LLD Fix Order

1. **Critical Priority (Immediate Production Risk)**
   1. **Fix `LLD-CRIT-01`**: Atomic conditional round settlement in `GameService.settleGreedyIfDue` and `settleLuckyIfDue` to prevent double payouts and conflicting winners.
   2. **Fix `LLD-CRIT-03`**: Replace unbounded in-memory `findMany` in `GameService.greedyLeaderboard` with a SQL `groupBy` query to eliminate process OOM crash risk.
   3. **Fix `LLD-CRIT-02`**: Sort user IDs prior to row locking in `WalletService.sellerTransfer` and `RoomService.sendRoomGift` to prevent deadlocks under concurrent peer activity.

2. **High Priority (Correctness & Performance)**
   1. **Fix `LLD-HIGH-01`**: Wrap `UserService.applyInvite` inside a transaction and use `LedgerService.creditCoins`.
   2. **Fix `LLD-HIGH-02`**: Record financial ledger entries during `AgencyService.weeklyApprove`.
   3. **Fix `LLD-HIGH-03`**: Replace N+1 loop in `ChatService.listConversations` with a single grouped unread count query.
   4. **Address `LLD-HIGH-04`**: Begin modular extraction of `RoomService` sub-domains.

3. **Medium Priority (Code Quality & Robustness)**
   1. **Fix `LLD-MED-01`**: Introduce formal `class-validator` DTO classes for `AdminController`.
   2. **Fix `LLD-MED-02`**: Eliminate redundant row re-locking between `convertGems`/`play` and `LedgerService`.
   3. **Fix `LLD-MED-05`**: Make `RoomService.sendBatchGift` atomic across all recipients.
   4. **Fix `LLD-MED-03`**: Create shared `useAdminAuth` hook in Next.js admin frontend.
   5. **Fix `LLD-MED-04`**: Move multipart logic from `MediaController` to service layer.

4. **Low Priority (Refinements & Observability)**
   1. **Fix `LLD-LOW-01`**: Return HTTP 503 in `HealthController` when PostgreSQL or Redis is down.
   2. **Fix `LLD-LOW-04`**: Pass `meta` directly in `LedgerService.debitCoins` to eliminate extra update query.
   3. **Fix `LLD-LOW-02`**: Connect Redis on `onModuleInit` in `RedisService`.
   4. **Fix `LLD-LOW-03`**: Add HTTP status checking and error handling in admin `lib/api.ts`.
