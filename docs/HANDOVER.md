# IndOS — Executive Handover

> **One-line summary:** IndOS is a self-hosted, enterprise-grade Industrial IoT Operating System built on Next.js 16, TypeScript, Prisma, InfluxDB, Redis, and an MQTT broker — production-ready for single-tenant deployments, with a clear path to multi-tenant and multi-region.

## Project Overview

IndOS unifies the industrial edge — devices (ESP32, PLCs, gateways, meters), protocols (MQTT, Modbus, OPC-UA, BACnet, LoRaWAN), telemetry persistence (InfluxDB with SQLite fallback), real-time dashboards, alarm management, maintenance work orders, signed OTA firmware updates, RBAC, and an AI copilot — into a single web console. It is designed for plant engineers, operators, and managers who need a local-first, air-gappable alternative to cloud-locked IoT platforms.

The platform ships with seeded demo data (5 users across 4 roles, 8 projects, ~60 devices, 10 alarms, 7 work orders, 3 firmware versions, 6 cameras, 12 plugins) so a new evaluator can log in and see a populated dashboard within 60 seconds.

## Technology Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | **Next.js 16** (App Router) | Server components, route handlers, middleware, SSR |
| Language | **TypeScript 5** (strict) | Type safety across the full stack |
| Styling | **Tailwind CSS 4** + **shadcn/ui** (New York) | Consistent, accessible, themeable |
| ORM | **Prisma 6** | Type-safe DB access, migrations, SQLite dev / Postgres prod |
| Auth | **NextAuth.js v4** (Credentials + JWT) | Self-hosted, no external IdP required |
| Realtime | **Socket.io 4** (rooms by project) | Browser push for live telemetry + alarms |
| MQTT broker | **Aedes** (in telemetry mini-service) | Username/password auth + per-device ACL |
| Time-series | **InfluxDB 2.7** (with SQLite fallback) | 90d raw / 365d downsampled retention |
| Cache | **Redis 7** (with in-memory LRU fallback) | Multi-instance ready, dev-friendly |
| State | **Zustand** (client) + **TanStack Query** (server) | Minimal boilerplate, cache invalidation |
| Charts | **Recharts 2** | Composable, responsive |
| OTA signing | **Ed25519** (Node `crypto`) | Manifest signing + SHA-256 checksums |
| Tests | **Vitest 4** (unit) + **Playwright 1.61** (E2E) | 41 + 14 = 55 tests, all passing |
| Runtime | **Bun 1.1** | Fast install, native test runner, drop-in Node |

## What Was Built

**26 modules across 21 views**, plus a 2-port telemetry mini-service, 21 API routes, 29 Prisma models, and 55 tests.

### Views (21)
Dashboard, Devices, Alarms, Projects, Organizations, Gateways, Cameras, OTA Firmware, Maintenance, Deployment, Automation, Analytics, AI Center, Energy, Environment, Reports, Settings, Audit, Plugins, Map, Digital Twin.

### Cross-cutting modules (5)
1. **Auth** — NextAuth config, bcrypt, JWT callbacks, SessionProvider, login page, middleware 401/redirect
2. **RBAC** — `requireRole()`, `hasRole()`, `apiHandler(minRole, rateLimit, handler)` wrapper
3. **OTA signing** — Ed25519 key generation, manifest canonicalization, sign/verify, checksum
4. **Cache** — `cacheGet`/`cacheSet`/`cacheDel`/`cacheDelPattern`/`cached()` with Redis or in-memory LRU
5. **Pagination** — cursor pagination helper, backward-compatible flat array default

### Infrastructure modules (3)
1. **Telemetry mini-service** (`mini-services/telemetry/index.ts`) — Aedes MQTT broker (`:1883`) + Socket.io server (`:3030`), InfluxDB write, 48 simulated devices for demo, project-scoped rooms
2. **API handler** (`src/lib/api-handler.ts`) — combined auth + RBAC + rate-limit guard
3. **Middleware** (`src/middleware.ts`) — protects all routes except `/login`, `/api/auth/*`, `/api/health`, `/api/metrics`

## Architecture (in one paragraph)

A browser hits **Caddy** (`:81` in dev / `:80`+`:443` in production) which reverse-proxies to the **Next.js** app (`:3000`) for everything except requests carrying `?XTransformPort=3030`, which it forwards to the **telemetry mini-service** (`:3030`) — a single Bun process that runs both a Socket.io server (for browser realtime) and an **Aedes MQTT broker** (`:1883`) for physical devices. Devices authenticate to MQTT with bcrypt-hashed credentials and are constrained by per-device topic ACLs; their published telemetry is persisted to **InfluxDB** (5s batch flush) and fan-out-broadcast to Socket.io rooms keyed by project (`project:{slug}`) plus a `global` room for dashboard-wide views. The Next.js app reads/writes relational data (users, projects, devices, alarms, work orders, firmware, audit logs) through **Prisma** against SQLite (dev) or PostgreSQL (production), with **Redis** as an optional cache layer (in-memory LRU fallback for single-instance dev). OTA firmware manifests are signed with **Ed25519** at registration time; devices fetch the signed manifest, verify the signature against an embedded public key, and flash only if both signature and SHA-256 checksum pass.

## Security Posture

**Grade: A-**

| Surface | Status |
|---------|--------|
| Authentication (NextAuth + bcrypt + JWT) | ✅ |
| RBAC (4 roles × 21 routes, enforced) | ✅ |
| Rate limiting (token bucket, 5 presets) | ✅ |
| MQTT auth + per-device ACL | ✅ |
| Signed OTA (Ed25519 + SHA-256) | ✅ |
| Caddy SSRF protection (XTransformPort=3030 only) | ✅ |
| Secrets in env, never in frontend | ✅ |
| Audit logging on all sensitive actions | ✅ |
| Public health + metrics endpoints (no sensitive data) | ✅ |
| Per-tenant `orgId` scoping | ⚠️ Not enforced (P0 roadmap) |
| Multi-instance rate limiting (Redis-backed) | ⚠️ Not yet (P0 roadmap) |
| mTLS for MQTT | ⚠️ Not yet (P3 roadmap) |

See `SECURITY_MODEL.md` for the full control matrix and `ROADMAP.md` for remediation timelines.

## How to Get Started (3 Steps)

```bash
# Step 1 — Install, create DB, seed demo data
bun install && bun run db:push && bun run prisma db seed

# Step 2 — Generate OTA signing keys and add to .env
bun run scripts/generate-ota-keys.ts
#   → copy OTA_SIGNING_PRIVATE_KEY, OTA_SIGNING_PUBLIC_KEY, OTA_SIGNING_KEY_ID into .env

# Step 3 — Start the app + telemetry service
bun run dev                        # terminal 1 → http://localhost:3000
cd mini-services/telemetry && bun run dev   # terminal 2 → :1883 MQTT + :3030 socket.io
```

**Login:** `admin@indos.io` / `indos123` (also `engineer@`, `operator@`, `viewer@` — same password).

For production deployment, see `DEPLOYMENT_CHECKLIST.md` and run `docker compose up -d --build`.

## Key Contacts & Roles

| Role | Responsibility | Owner |
|------|----------------|-------|
| Platform lead | Architecture, releases, security review | (assign) |
| Backend engineer | API routes, Prisma, MQTT broker, OTA pipeline | (assign) |
| Frontend engineer | 21 views, shell, charts, realtime integration | (assign) |
| DevOps | Docker, Caddy, CI/CD, backups, monitoring | (assign) |
| QA | Vitest + Playwright suites, regression coverage | (assign) |
| Security reviewer | RBAC matrix, secrets, audit log review | (assign) |
| ESP32/embedded | Device firmware, MQTT client, OTA verification | (assign) |

> The IndOS multi-agent operating model (Architecture, Backend, Security, Database, Frontend, IoT, DevOps, QA, Documentation, PM) is documented in `docs/AGENTS.md`. Each agent inspects its area in audit-only mode first, then a consolidated plan is implemented.

## Links to Other Docs

| Doc | Purpose |
|-----|---------|
| `docs/PRODUCTION_READINESS.md` | 12-section readiness report (status, env vars, run/test/deploy, security, risks, checklists) |
| `docs/ARCHITECTURE.md` | System architecture with Mermaid diagrams, folder structure, data flows |
| `docs/SECURITY_MODEL.md` | Authentication flow, RBAC matrix, MQTT security, OTA signing, API security, headers |
| `docs/API_OVERVIEW.md` | Reference for all 21 `/api/indos/*` routes — method, role, rate limit, schema, response |
| `docs/DEPLOYMENT_CHECKLIST.md` | Step-by-step production deployment + rollback |
| `docs/TESTING_GUIDE.md` | How to run unit + E2E tests, what's covered, how to add new tests, CI integration |
| `docs/ROADMAP.md` | 5-year roadmap (P0–P3) including AI initiatives |
| `docs/worklogs/` | Phase-by-phase worklogs (Phases 4–10) — files changed, decisions, deferred risks |
| `docs/AGENTS.md` | Multi-agent operating model and workflow standard |

## Status

- **Phases 4–10:** ✅ Complete
- **Tests:** 55/55 passing (41 vitest unit + 14 Playwright E2E)
- **Lint + typecheck:** Clean
- **Production:** Ready for single-tenant / single-instance (see `PRODUCTION_READINESS.md` §10 for remaining gaps)
