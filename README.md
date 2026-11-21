<div align="center">

<h1>BotNoob</h1>

<h3>Build, deploy, and host AI-powered Telegram &amp; Discord bots<br/>without managing servers.</h3>

[![Live Demo](https://img.shields.io/badge/Live-new.tg-16a34a?style=for-the-badge&logo=googlechrome&logoColor=white)](https://botnoob.new.tg)
[![CI Quality & Security](https://github.com/shivamdwivedi2442/botnoob/actions/workflows/ci-quality-security.yml/badge.svg)](https://github.com/shivamdwivedi2442/botnoob/actions/workflows/ci-quality-security.yml)
[![Auto Deploy to AWS](https://github.com/shivamdwivedi2442/botnoob/actions/workflows/cd-microservices-deploy.yml/badge.svg)](https://github.com/shivamdwivedi2442/botnoob/actions/workflows/cd-microservices-deploy.yml)

<br/>

![Node.js](https://img.shields.io/badge/Node.js_22-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![React](https://img.shields.io/badge/React_18-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite_5-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_3-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Docker Compose](https://img.shields.io/badge/Docker_Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![Nginx](https://img.shields.io/badge/Nginx-009639?style=for-the-badge&logo=nginx&logoColor=white)

![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white)
![PostgreSQL RLS](https://img.shields.io/badge/PostgreSQL_RLS-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Google OAuth](https://img.shields.io/badge/Google_OAuth-4285F4?style=for-the-badge&logo=google&logoColor=white)
![GitHub OAuth](https://img.shields.io/badge/GitHub_OAuth-181717?style=for-the-badge&logo=github&logoColor=white)
![Cloudflare Turnstile](https://img.shields.io/badge/Cloudflare_Turnstile-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)

![Gemini](https://img.shields.io/badge/Gemini_BYOK-8E75B2?style=for-the-badge&logo=googlegemini&logoColor=white)
![OpenAI](https://img.shields.io/badge/OpenAI_BYOK-412991?style=for-the-badge&logo=openai&logoColor=white)
![Anthropic](https://img.shields.io/badge/Anthropic_BYOK-191919?style=for-the-badge&logo=anthropic&logoColor=white)
![MCP Protocol](https://img.shields.io/badge/MCP_Protocol-1F2937?style=for-the-badge)
![Telegram Bot API](https://img.shields.io/badge/Telegram_Bot_API-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)
![Discord.js](https://img.shields.io/badge/Discord.js_14-5865F2?style=for-the-badge&logo=discord&logoColor=white)

![GitHub Actions](https://img.shields.io/badge/GitHub_Actions_CI%2FCD-2088FF?style=for-the-badge&logo=githubactions&logoColor=white)
![AWS EC2](https://img.shields.io/badge/AWS_EC2-FF9900?style=for-the-badge&logo=amazonec2&logoColor=white)
![Express](https://img.shields.io/badge/Express_4-000000?style=for-the-badge&logo=express&logoColor=white)
![JWT](https://img.shields.io/badge/JWT-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white)
![SwiftUPI](https://img.shields.io/badge/SwiftUPI-6D28D9?style=for-the-badge&logo=stripe&logoColor=white)

**8 containers · 5 Node.js microservices · 1 Nginx edge · hosted on AWS EC2**

</div>

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Microservices & Tech Stack](#microservices--tech-stack)
- [Key Features](#key-features)
- [Repository Layout](#repository-layout)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Deployment](#deployment)
- [API Routing](#api-routing)
- [Security Model](#security-model)
- [Quality Gates](#quality-gates)

---

## Overview

**BotNoob** is a multi-tenant bot hosting platform. Users describe a bot in natural language, bring their own AI key (BYOK), and BotNoob generates, stores, and runs the bot on Telegram or Discord — with live logs, secrets management, collaborator access, paid plans, and an admin console.

The platform is split into five domain services behind an **Nginx API gateway**, with a **React + Vite + Tailwind** SPA served by its own Nginx container, **Redis** for sessions/caching/rate limits, and **Supabase PostgreSQL** as the system of record with **Row Level Security** enforced.

---

## Architecture

```mermaid
flowchart TB
    subgraph Client["Client"]
        BR["Browser / SPA"]
    end

    subgraph Edge["Edge Layer"]
        FE["frontend<br/>nginx:alpine · :5173"]
        GW["api-gateway<br/>nginx:alpine · :80"]
    end

    subgraph Services["Node.js 22 Microservices"]
        AUTH["auth-service<br/>:4001"]
        BOTS["bots-service<br/>:4002"]
        AI["ai-proxy-service<br/>:4003"]
        BILL["billing-service<br/>:4004"]
        SUP["support-service<br/>:4005"]
    end

    subgraph Data["Data Layer"]
        REDIS[("Redis<br/>:6379")]
        PG[("Supabase PostgreSQL<br/>RLS policies")]
    end

    subgraph External["External Providers"]
        SUPA["Supabase Auth<br/>Google / GitHub OAuth"]
        LLM["Gemini / OpenAI / Anthropic<br/>BYOK"]
        MCP["MCP Endpoint<br/>/v1/:userId"]
        TG["Telegram Bot API"]
        DC["Discord Gateway API"]
        UPI["SwiftUPI<br/>UPI payments"]
    end

    subgraph Ops["Delivery"]
        GHA["GitHub Actions<br/>CI + CD"]
        EC2["AWS EC2<br/>Docker Compose"]
    end

    BR --> FE
    BR -.->|OAuth session| SUPA
    FE -->|/api/*| GW
    GW --> AUTH
    GW --> BOTS
    GW --> AI
    GW --> BILL
    GW --> SUP
    GW -->|static assets / SPA| FE

    AUTH --> REDIS
    BOTS --> REDIS
    BILL --> REDIS
    SUP --> REDIS
    AUTH --> PG
    BOTS --> PG
    AI --> PG
    BILL --> PG
    SUP --> PG

    AUTH <--> SUPA
    AI -->|generate + validate keys| LLM
    AI -->|personal endpoint| MCP
    BOTS -->|long polling / gateway| TG
    BOTS -->|gateway + REST| DC
    BILL <--> UPI

    GHA -->|SSH deploy| EC2
    EC2 --- GW
```

**Request flow (ASCII):**

```text
Browser
  │
  ├── GET /                → frontend (nginx :5173) → React SPA
  └── ANY /api/*           → api-gateway (nginx :80) → rate limit → route
                                   ├── /api/auth/*       → auth-service:4001
                                   ├── /api/bots/*       → bots-service:4002
                                   ├── /api/ai/*         → ai-proxy-service:4003
                                   ├── /api/billing/*    → billing-service:4004
                                   ├── /api/support/*    → support-service:4005
                                   ├── /api/templates/*  → support-service:4005
                                   └── /api/admin/*      → support-service:4005
```

---

## Microservices & Tech Stack

All application containers run on **Node.js 22 Alpine**. Images are built from the repo root so each service can consume the shared `@botnoob/shared` package.

| # | Container | Runtime / Image | Internal Port | Core Technology | Responsibility |
|---|-----------|-----------------|---------------|-----------------|----------------|
| 1 | `api-gateway` | `nginx:alpine` | `80` | Nginx reverse proxy, `limit_req` (30 r/s, burst 60), gzip, security headers | Single public entry point; path-based routing to services and static assets |
| 2 | `auth-service` | Node.js 22 + Express | `4001` | Express, JWT access/refresh rotation, Argon2id, Redis, Supabase, Cloudflare Turnstile | Signup, login, logout, OTP verification, password sync, OAuth session exchange, `/me`, token refresh |
| 3 | `bots-service` | Node.js 22 + Express | `4002` | Express, Telegraf, `node-telegram-bot-api`, Discord.js 14, `ws`, Docker CLI, AES-256-GCM | Bot CRUD, deploy/start/stop/restart, live logs, config, GitHub-repo bots, collaborators, isolated Docker runner |
| 4 | `ai-proxy-service` | Node.js 22 + Express | `4003` | Express, Gemini / OpenAI / Anthropic APIs, Zod, MCP URL issuance, AES-256-GCM | Encrypted BYOK key storage, key validation, AI bot generation, MCP endpoint discovery |
| 5 | `billing-service` | Node.js 22 + Express | `4004` | Express, SwiftUPI API, Supabase JS, HMAC webhooks | Plans, order creation, coupons, signed payment webhooks, transaction state, plan activation |
| 6 | `support-service` | Node.js 22 + Express | `4005` | Express, Express Rate Limit, Redis, Supabase JS | Support tickets/replies, bot templates, pricing configs, coupons, admin overview, role-gated endpoints |
| 7 | `redis` | `redis:alpine` | `6379` | Redis 7 | Token/session state, rate-limit counters, caching, cross-service ephemeral data |
| 8 | `frontend` | Multi-stage: Node 22 build → `nginx:alpine` | `5173 → 80` | React 18, Vite 5, Tailwind CSS 3, Framer Motion, Lucide, React Router 6, Axios, Supabase JS, Turnstile | Marketing site, auth screens, dashboard, AI Studio, templates, pricing, docs, admin console |

**Supporting stack:** PostgreSQL 15+ (Supabase) with RLS, PostCSS + Autoprefixer, oxlint, `concurrently`, `nodemon`, Docker Compose v2, GitHub Actions (`actions/checkout`, `setup-node`, `appleboy/ssh-action`), AWS EC2, Nginx `resolver 127.0.0.11` for Docker DNS.

---

## Key Features

### Bot hosting
- **Telegram + Discord in one platform** — long polling for Telegram; Discord Gateway with heartbeat, resume, and reconnect.
- **Two execution modes** — in-process runner (`USE_DOCKER=false`) or isolated container per bot (`USE_DOCKER=true` + `BOT_RUNNER_IMAGE`).
- **Deploy from custom code or GitHub** — paste starter code or point at a repository; bots are cloned and executed automatically.
- **Full lifecycle controls** — deploy, start, stop, restart, delete, inspect config, and stream live logs.
- **Team collaboration** — invite collaborators by email with editor access, enforced with RLS and service checks.

### AI & BYOK
- **Bring your own key** for **Google Gemini**, **OpenAI**, and **Anthropic**; provider aliases normalized by the shared layer.
- **Encrypted at rest** — API keys and bot tokens use **AES-256-GCM** with a 32-character `ENCRYPTION_KEY`; plaintext never leaves the service.
- **AI bot generator** — natural-language prompt produces runnable Telegram/Discord starter code, with provider-aware error handling.
- **MCP-ready** — every user gets a personal MCP endpoint URL (`MCP_PUBLIC_URL/v1/<userId>`) surfaced in the dashboard.

### Identity & security
- JWT **access + rotating refresh tokens**, Argon2 password hashing, HttpOnly cookies, revocation table, and OTP verification.
- **Google and GitHub OAuth** via Supabase Auth, exchanged server-side for BotNoob cookies.
- **Cloudflare Turnstile** widget on signup/login with a server-side verification hook.
- **Supabase RLS** on users, bots, collaborators, AI keys, tickets, and transactions.
- **Zero-knowledge employee view** (`employee_bot_overview`) intentionally excludes `encrypted_bot_token`.
- Helmet, CORS allow-listing, per-route rate limits, Nginx rate limiting, and security headers.

### Monetization & admin
- **SwiftUPI UPI payments** with order creation, discount coupons, signed webhook verification, and transaction reconciliation.
- Plans: `free_byok`, `byok_pro`, `botnoob_ultra` — with bot limits, duration, and feature flags in `pricing_configs`.
- **Super-admin console** for pricing, coupons, templates, users, and platform overview.
- **Support ticketing** with threaded JSON replies, priority, and status tracking.

### Delivery
- **CI on every PR** — dependency install, oxlint, `npm audit --audit-level=high`, production frontend build.
- **CD on `main`** — SSH into AWS EC2, pull, rebuild, and restart the Compose stack, then prune old images.
- Production Nginx build with gzip, immutable asset caching, SPA fallback, and API proxying.

---

## Repository Layout

```text
Botnoob/
├── .github/workflows/
│   ├── ci-quality-security.yml      # PR: install, lint, audit, build
│   └── cd-microservices-deploy.yml  # main: SSH deploy to AWS EC2
├── api-gateway/
│   └── nginx.conf                   # Edge routing + rate limiting
├── services/
│   ├── auth/                        # :4001 identity service
│   ├── bots/                        # :4002 bot lifecycle + runners
│   ├── ai-proxy/                    # :4003 BYOK + generation + MCP
│   ├── billing/                     # :4004 SwiftUPI billing
│   ├── support/                     # :4005 tickets, templates, admin
│   └── shared/                      # @botnoob/shared (auth, crypto, plans, Redis, providers)
├── frontend/
│   ├── src/                         # React SPA (pages, context, components, hooks)
│   ├── nginx.conf                   # SPA hosting + /api proxy
│   └── Dockerfile                   # Vite build → nginx:alpine
├── supabase/schema.sql              # Tables, indexes, RLS policies, seed plans
├── docker-compose.yml               # All 8 containers
├── .env.example                     # Documented environment template
└── package.json                     # Monorepo dev/install scripts
```

---

## Getting Started

### Prerequisites

| Requirement | Version / Notes |
|-------------|-----------------|
| Docker Engine + Compose v2 | Recommended path; includes Redis |
| Node.js | 22.x for local development (CI uses 20.x) |
| Supabase project | PostgreSQL + Auth + RLS |
| AI provider key | Gemini, OpenAI, or Anthropic (optional to boot) |
| Cloudflare Turnstile keys | Optional for local development |
| SwiftUPI credentials | Optional; billing endpoints return `503` when unset |
| AWS EC2 instance | Required only for CD deployment |

### 1. Clone

```bash
git clone https://github.com/shivamdwivedi2442/botnoob.git
cd botnoob
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in at minimum: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`, `ENCRYPTION_KEY` (exactly 32 characters), and the `VITE_*` build variables. See [Environment Variables](#environment-variables).

### 3. Provision Supabase

Open the Supabase SQL editor and run [`supabase/schema.sql`](supabase/schema.sql). It creates enums, tables, performance indexes, the zero-knowledge employee view, RLS policies, and seeds the three pricing plans.

Then enable **Google** and/or **GitHub** providers under Supabase → Authentication → Providers, and add your deployed callback URL:

```text
https://<your-domain>/auth/callback
```

### 4. Run with Docker Compose

```bash
docker compose up --build -d
```

| Surface | URL |
|---------|-----|
| React app | http://localhost:5173 |
| API gateway | http://localhost (or `/api/*` through the frontend) |
| Health checks | `http://localhost/api/auth/health`, `/api/bots/health`, `/api/ai/health`, `/api/billing/health`, `/api/support/health` |

> If port `80` is already in use locally, change the gateway mapping in `docker-compose.yml` (for example `"8080:80"`). The CD workflow performs this substitution automatically on the server.

### 5. Local development (hot reload)

```bash
npm run install:all
npm run dev:all
```

`dev:all` runs the gateway, all five services, and Vite concurrently. Make sure Redis is reachable (`docker compose up -d redis`) and that `DATABASE_URL` / `REDIS_URL` point at your local or hosted instances (`redis://localhost:6379`).

### 6. First run checklist

1. Sign up and complete the Turnstile challenge.
2. Add a Gemini/OpenAI/Anthropic key in **Dashboard → BYOK & MCP**.
3. Generate a bot in **AI Studio**, or deploy custom/GitHub code.
4. Start the bot and watch **Logs**.
5. Create a Telegram bot token via [@BotFather](https://t.me/BotFather) or a Discord application token before deploying.

---

## Environment Variables

Values are read from the repo-root `.env` by Docker Compose. `VITE_*` variables are **build-time** arguments for the frontend image.

### Core services

| Variable | Required | Used by | Description / Example |
|----------|----------|---------|-----------------------|
| `PORT` | No | Each Node service | Service port override; Compose sets `4001`–`4005` |
| `DATABASE_URL` | Yes | auth, bots, ai-proxy, billing, support | PostgreSQL connection string: `postgresql://postgres:password@host:5432/postgres` |
| `REDIS_URL` | Yes | All backend services | Compose default: `redis://redis:6379`; local: `redis://localhost:6379` |
| `FRONTEND_URL` | Yes | All backend services | Allowed origin for CORS/cookies: `http://localhost` |
| `ACCESS_TOKEN_SECRET` | Yes | All backend services | JWT access-token signing secret; use a long random value |
| `REFRESH_TOKEN_SECRET` | Yes | auth | Refresh-token signing secret; use a long random value |
| `ENCRYPTION_KEY` | Yes | bots, ai-proxy | Exactly 32 characters; AES-256-GCM key for bot tokens, env vars, and AI keys |
| `SUPABASE_URL` | Yes | All backend services | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | All backend services | Server-only key; bypasses RLS — never expose to the browser |

### Frontend (build-time)

| Variable | Required | Description / Example |
|----------|----------|-----------------------|
| `VITE_SUPABASE_URL` | Yes | Public Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Public anon key; safe for browser use with RLS |
| `VITE_TURNSTILE_SITE_KEY` | Optional | Cloudflare Turnstile site key; falls back to a test key |

### Bot runtime

| Variable | Required | Description / Example |
|----------|----------|-----------------------|
| `USE_DOCKER` | No | `true` runs each bot in an isolated container; default `false` (in-process runner) |
| `BOT_RUNNER_IMAGE` | With Docker mode | Image used for bot containers; must include your runtime dependencies |

### AI / MCP

| Variable | Required | Description / Example |
|----------|----------|-----------------------|
| `MCP_PUBLIC_URL` | No | Public base for personal MCP endpoints; default `https://mcp.botnoob.com` |

### Billing (SwiftUPI)

| Variable | Required | Description / Example |
|----------|----------|-----------------------|
| `SWIFTUPI_BASE_URL` | Optional | SwiftUPI API base; default `http://host.docker.internal:5000` |
| `SWIFTUPI_API_KEY` | Optional | SwiftUPI API key |
| `SWIFTUPI_API_SECRET` | Optional | SwiftUPI API secret |
| `SWIFTUPI_WEBHOOK_SECRET` | Optional | HMAC secret for `x-swiftupi-signature` verification |
| `SWIFTUPI_CHECKOUT_URL` | Optional | Hosted checkout base; default `http://localhost:3000` |
| `SWIFTUPI_REDIRECT_URL` | Optional | Post-payment redirect; default `http://localhost/dashboard?payment=success` |

### OAuth

| Variable | Required | Description / Example |
|----------|----------|-----------------------|
| `GITHUB_CLIENT_ID` | Optional | GitHub OAuth app client ID (Supabase provider config) |
| `GITHUB_CLIENT_SECRET` | Optional | GitHub OAuth app client secret |

### GitHub Actions secrets (repository settings, not `.env`)

| Secret | Purpose |
|--------|---------|
| `AWS_HOST` | EC2 public IP or hostname |
| `AWS_USER` | SSH user (for example `ubuntu`) |
| `AWS_SSH_KEY` | Private key authorized on the instance |

---

## Deployment

The CD pipeline (`.github/workflows/cd-microservices-deploy.yml`) runs on every push to `main`:

1. Authenticates to the EC2 instance over SSH using `appleboy/ssh-action`.
2. Pulls the latest `main`.
3. Rewrites the gateway port from `80:80` to `8080:80` to avoid conflicts with host services.
4. Runs `docker compose up --build -d` and prunes dangling images.

### Server preparation

```bash
# On Ubuntu EC2
sudo apt update && sudo apt install -y docker.io docker-compose-plugin git
sudo usermod -aG docker $USER
git clone https://github.com/shivamdwivedi2442/botnoob.git ~/Botnoob
cd ~/Botnoob && cp .env.example .env && nano .env
```

Open ports `8080` (gateway) and `5173` (frontend), or place Nginx/Caddy with TLS in front of them. For Docker-based bot isolation, mount the Docker socket or run the runner on a dedicated worker host.

### CI pipeline

Pull requests against `main`/`develop` run:

```bash
npm run install:all
npx oxlint@latest .
npm audit --audit-level=high
npm run build --prefix frontend
npm test
```

---

## API Routing

The gateway strips the `/api` prefix per service while the frontend keeps it intact:

| Public path | Upstream | Notes |
|-------------|----------|-------|
| `/api/auth/*` | `auth-service:4001` | Rewritten to `/*` |
| `/api/bots/*` | `bots-service:4002` | Deploy, lifecycle, logs, collaborators |
| `/api/ai/*` | `ai-proxy-service:4003` | 60s read/send timeout for generation |
| `/api/billing/*` | `billing-service:4004` | Plans, orders, webhooks |
| `/api/support/*` | `support-service:4005` | Tickets and admin |
| `/api/templates/*` | `support-service:4005` | Rewritten to `/templates/*` |
| `/api/admin/templates/*` | `support-service:4005` | Rewritten to `/templates/*` |
| `/api/admin/*` | `support-service:4005` | Role-gated (`employee`, `super_admin`) |
| `/*` | `frontend:80` | SPA fallback in the frontend Nginx |

---

## Security Model

| Layer | Control |
|-------|---------|
| Transport / edge | Nginx security headers, gzip, 30 r/s per-IP rate limit, request size and timeout caps |
| Authentication | Argon2id hashes, JWT access/refresh rotation, HttpOnly cookies, refresh revocation, OTP |
| Human verification | Cloudflare Turnstile on signup/login |
| Secrets at rest | AES-256-GCM for bot tokens, env vars, and BYOK provider keys |
| Database | Supabase RLS policies; owners, collaborators, and users scoped to their own rows |
| Privacy | `employee_bot_overview` view omits encrypted bot tokens |
| Payments | HMAC-signed SwiftUPI webhook plus transaction lookup and idempotent updates |
| Operations | Service-role key server-only; no secrets committed — use `.env` locally and GitHub secrets in CI/CD |

> Operational note: the Turnstile verification function in `services/shared/security.js` is an integration stub that returns `true`. Wire it to `https://challenges.cloudflare.com/turnstile/v0/siteverify` before relying on it as a production bot defense.

---

## Quality Gates

| Gate | Command |
|------|---------|
| Lint (all packages) | `npx oxlint@latest .` |
| Frontend lint | `npm run lint --prefix frontend` |
| Production build | `npm run build --prefix frontend` |
| Security audit | `npm audit --audit-level=high` |
| Full local stack | `npm run dev:all` |
| Container stack | `docker compose up --build -d` |

---

<div align="center">
<sub>Built with Node.js, React, Docker, Supabase, and a healthy distrust of plaintext secrets.</sub>
</div>
<div align="center">
<sub>© Botnoob. Developed by Shivamcoder.</sub>
</div>
