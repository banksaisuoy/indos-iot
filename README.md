# IndOS — Industrial IoT Operating System

> Self-hosted, enterprise-grade Industrial IoT platform. Multi-tenant, RBAC, signed OTA, real-time telemetry, AI copilot. Built on Next.js 16 + Prisma + Neon Postgres.

![Status](https://img.shields.io/badge/status-production%20ready-emerald)
![Tests](https://img.shields.io/badge/tests-112%2F112%20pass-emerald)
![License](https://img.shields.io/badge/license-MIT-blue)

## 🏭 Live Demo

**URL:** https://indos-iot.vercel.app

| Role | Email | Password | Access |
|------|-------|----------|--------|
| Admin (cross-org) | `admin@indos.io` | `indos123` | All orgs, all features |
| Engineer (org-scoped) | `engineer@acme.io` | `acme123` | Acme Industries only |

## ✨ Features

### Core Platform
- **22 dashboard views** — Executive Dashboard, Devices, Alarms, OTA, AI Center, Analytics, Digital Twin, GIS Map, Camera Center, Automation, Reports, Audit Logs, Settings, and more
- **Multi-tenant org isolation** — Every data surface scoped by `orgId` (devices, alarms, work orders, firmware, gateways, cameras, audit logs)
- **RBAC** — 4 roles (admin / engineer / operator / viewer) enforced server-side on all 23 API routes
- **Rate limiting** — AI 5/min, OTA 10/min, write 30/min, read 120/min

### Industrial IoT
- **MQTT broker** (Aedes) with bcrypt auth + per-device topic ACL + org-namespaced topics
- **Signed OTA pipeline** — Ed25519 manifest signing + SHA-256 checksum + unsigned firmware rejection
- **Real-time telemetry** — Socket.io with project-scoped rooms (90% traffic reduction vs broadcast)
- **InfluxDB** for historical telemetry (90d raw / 365d downsampled) with SQLite fallback
- **ESP32 deployment guide** with MQTT credentials + OTA verification code

### Operator Safety (Phase 12)
- **Connection-loss banner** — sticky amber→red banner when WebSocket disconnects (3s debounce, 30s escalation)
- **Critical alarm banner** — persistent red banner + audio beep until acknowledged
- **Stale device detection** — amber badge when device claims online but hasn't reported in 10+ min
- **Bulk alarm acknowledge** — "Ack All Critical" / "Ack All Active" buttons
- **CSV export** — alarms + devices for shift handover / compliance

### AI Center
- **AI copilot** powered by OpenRouter (gpt-oss-120b) with live platform context
- **Fallback chain** — z-ai SDK (dev) → OpenRouter → Manas API
- **Rate-limited** (5 req/min) to control costs

### Security
- **NextAuth** with bcrypt password hashing + JWT sessions
- **NEXTAUTH_SECRET** fails-fast in production if unset (no silent dev fallback)
- **Last-admin protection** — cannot demote/disable the last remaining admin
- **Cannot-disable-self** — admins can't lock themselves out
- **Audit logging** — every login, firmware register, OTA deploy, user create/update, alarm ack logged with orgId

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript 5 (strict) |
| Database | Neon Postgres (Prisma ORM) |
| Realtime | Socket.io (project-scoped rooms) |
| MQTT | Aedes (bcrypt auth + ACL) |
| Cache | Redis (in-memory LRU fallback) |
| Time-series | InfluxDB (SQLite fallback) |
| Auth | NextAuth.js v4 (Credentials + JWT) |
| UI | shadcn/ui (New York) + Tailwind CSS 4 |
| AI | OpenRouter + Manas + z-ai SDK |
| Storage | Wasabi S3 (firmware binaries) |
| Deploy | Vercel (web) + Render (telemetry WS) |

## 🚀 Quick Start

```bash
# 1. Install
bun install

# 2. Configure environment
cp .env.example .env
# Edit .env: set DATABASE_URL, NEXTAUTH_SECRET, OTA_SIGNING_* keys

# 3. Database
bun run db:push
bun run seed

# 4. Start web app (port 3000)
bun run dev

# 5. Start telemetry service (port 1883 + 3030) — separate terminal
cd mini-services/telemetry && bun install && bun run dev
```

Open http://localhost:3000 → login: `admin@indos.io` / `indos123`

## 📊 Project Structure

```
src/
├── app/
│   ├── api/indos/          # 23 API routes (all RBAC + rate-limited)
│   ├── login/              # NextAuth login page
│   ├── layout.tsx          # Root layout (SessionProvider)
│   └── page.tsx            # Main shell (sidebar + topbar + views)
├── components/
│   ├── indos/
│   │   ├── shell/          # Sidebar, Topbar, Banners, CommandPalette
│   │   ├── views/          # 22 dashboard views
│   │   └── shared/         # KpiCard, Charts, StatusBadge, ViewHeader
│   └── ui/                 # shadcn/ui primitives (40+ components)
├── lib/
│   ├── auth.ts             # NextAuth config
│   ├── auth-secret.ts      # NEXTAUTH_SECRET fail-fast guard
│   ├── org-scope.ts        # Multi-tenant scoping helpers
│   ├── rbac.ts             # Role hierarchy + requireRole()
│   ├── api-handler.ts      # Combined auth+RBAC+rate-limit guard
│   ├── ota-signing.ts      # Ed25519 sign/verify
│   ├── influx.ts           # InfluxDB client
│   └── indos/              # Store, realtime hook, schemas, types
└── middleware.ts           # NextAuth gate (401 API / redirect pages)

mini-services/
└── telemetry/              # MQTT broker + Socket.io (separate process)

prisma/
├── schema.prisma           # 25 models, multi-tenant
└── seed.ts                 # 2 orgs, 2 users, 8 devices, 2 gateways, 2 cameras

tests/
└── e2e/indos.spec.ts       # 22 Playwright tests

docs/
├── worklogs/               # Phase 4–14 worklogs
├── ROADMAP.md              # 5-year roadmap
├── ARCHITECTURE.md
├── SECURITY_MODEL.md
├── DEPLOYMENT_CHECKLIST.md
└── HANDOVER.md
```

## 🧪 Testing

```bash
bun run test          # 112 unit tests (vitest)
bun run test:e2e      # 22 E2E tests (Playwright)
bun run lint          # ESLint
bunx tsc --noEmit     # TypeScript strict
```

## 📈 Phase History

| Phase | Title | Outcome |
|-------|-------|---------|
| 4 | NextAuth Authentication | Credentials + bcrypt + JWT + middleware |
| 5 | MQTT Broker Auth + ACL | Aedes authenticate + authorizePublish/Subscribe |
| 6 | Signed OTA Pipeline | Ed25519 manifest signing + SHA-256 checksum |
| 7 | Telemetry + InfluxDB | Write/query + 5s batch flush + SQLite fallback |
| 8 | RBAC + Rate Limit + Pagination | 4 roles + 5 rate presets + cursor pagination |
| 9 | Redis Cache + Socket.io Rooms | LRU fallback + project-scoped rooms |
| 10 | E2E Tests + Metrics + Audit | 14 Playwright tests + /api/metrics |
| 11 | Per-Tenant orgId Scoping | orgScope() on all list endpoints |
| 12 | Field-Ops Hardening | Safety banners + real user/org mgmt + bulk ack + CSV |
| 13 | Production Readiness Drill | 3 prod bugs fixed + 24 new tests + Go/No-Go |
| 14 | Multi-Tenant Hardening | orgId on AuditLog/Firmware/OTA/Gateway/Camera + MQTT namespacing + E2E org tests |
| 15 | Production Deployment | Vercel + Neon Postgres + AI providers + MCP config |

## 🔐 Security

- All secrets in env vars (`.env.local` gitignored, Vercel encrypted env)
- No secrets in source code or git history
- NEXTAUTH_SECRET fails-fast in production
- OTA firmware requires Ed25519 signature
- MQTT broker requires bcrypt auth + per-device ACL
- API routes enforce RBAC server-side (not just UI hiding)

**⚠️ Rotate all API keys after pilot** — demo credentials (`indos123`, `acme123`) are in seed data by design.

## 📝 License

MIT — see [LICENSE](LICENSE)

---

Built with Next.js 16, Prisma, Neon Postgres, and the shadcn/ui ecosystem.
