# ChatAura Backend & Admin Monorepo

Enterprise-grade backend ecosystem for the **ChatAura** live-streaming, party rooms, real-time gaming, and audio chat platform.

This monorepo consolidates both core backend services:
1. **`chataura_backend_nest/`**: High-performance **NestJS 10** Modular Monolith API powering Android mobile clients, WebSocket party rooms, real-time greedy/lucky77 games, and payment webhooks.
2. **`chataura_admin/`**: Modern **Next.js 14** web administration dashboard for platform moderation, package management, user bans, and agency analytics.

---

## Repository Structure

```
chataura_backend_next/
├── README.md                 # Monorepo documentation & quickstart
├── .gitignore                # Professional monorepo gitignore
├── chataura_admin/           # Next.js 14 Admin Dashboard
│   ├── app/                  # Next.js App Router (users, packages, staff, login)
│   ├── lib/                  # Shared API client & auth tokens
│   ├── .env.example          # Environment template for admin
│   ├── .gitignore            # Next.js specific ignore rules
│   ├── package.json
│   ├── tsconfig.json
│   └── README.md
└── chataura_backend_nest/    # NestJS 10 Core API & Real-time Services
    ├── docker/               # Dockerfile, nginx proxy & postgres configs
    ├── k6/                   # Performance & concurrency load tests
    ├── prisma/               # Schema, migrations & seeders
    ├── src/                  # Controllers, services, websockets, auth guards
    ├── test/                 # Comprehensive E2E test suite
    ├── docker-compose.yml    # Multi-container orchestration (API, Postgres, Redis, Nginx)
    ├── .env.example          # Safe backend environment template
    ├── .gitignore            # NestJS & Prisma ignore rules
    ├── package.json
    ├── tsconfig.json
    └── README.md
```

---

## Services & Port Reference

| Service | Technology | Port | Description |
| :--- | :--- | :--- | :--- |
| **NestJS API** | Node.js / NestJS 10 | `3000` | REST API (`/api/v1/*`) + Socket.IO WebSockets |
| **Admin Portal** | Next.js 14 App Router | `3001` / `3002` | Platform back-office administration |
| **PostgreSQL** | PostgreSQL 16 Alpine | `5433` *(host)* / `5432` | Relational ACID database (Prisma ORM) |
| **Redis** | Redis 7 Alpine | `6380` *(host)* / `6379` | Cache, sessions, rate-limiting & WS pub/sub |
| **Nginx Proxy** | Nginx 1.25 Alpine | `8080` | Production reverse-proxy & rate gatekeeper |

---

## Quickstart Guide

### 1. NestJS Backend (`chataura_backend_nest`)

#### Prerequisites
- Node.js 20+
- Docker & Docker Compose

#### Environment Setup
```bash
cd chataura_backend_nest
cp .env.example .env
# Edit .env with your local credentials if needed
```

#### Running via Docker Compose
To boot the full stack (NestJS API + PostgreSQL 16 + Redis 7 + Nginx):
```bash
docker compose up -d postgres redis
npm run prisma:migrate
npm run prisma:seed
npm run start:dev
```

#### Running Tests
```bash
# E2E test suite
npm run test:e2e

# Concurrency & load tests
npm run test:load:local
```

---

### 2. Admin Dashboard (`chataura_admin`)

#### Setup & Launch
```bash
cd chataura_admin
cp .env.example .env.local
npm install
npm run dev
```

The admin portal will start at `http://localhost:3000` (or `http://localhost:3001` if port 3000 is occupied by NestJS). Set `NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1` in your `.env.local`.

---

## Security & Environment Notice

> [!IMPORTANT]
> - Never commit actual `.env` files. Both subprojects use `.env.example` templates with mock credentials.
> - All production credentials, database passwords, JWT secrets, and payment API keys must be injected securely via server environment variables or Docker secrets.
