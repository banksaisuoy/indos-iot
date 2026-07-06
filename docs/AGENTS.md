# IndOS Multi-Agent Operating Model

This document defines the specialist agent roles, responsibilities, and workflow standard for all engineering phases of the IndOS Industrial IoT OS platform.

## Agent Roster

| Agent | Responsibility |
|-------|---------------|
| **Architecture Agent** | Folder structure, module boundaries, dependency graph, circular deps, clean architecture, DDD, microservice boundaries |
| **Backend/API Agent** | NestJS/Next.js API routes, DTOs, validation, service/repository pattern, API consistency, transaction handling, Prisma |
| **Security Agent** | Auth, authz, JWT, RBAC, CORS, CSRF, XSS, SQLi, secrets, rate limiting, HTTP headers, sensitive logs, privilege escalation |
| **Database Agent** | PostgreSQL schema, Prisma schema, indexes, FKs, transactions, N+1 queries, slow queries, cache strategy, time-series storage |
| **Frontend/UI Agent** | React, Next.js, TypeScript, Tailwind, hydration, state management, accessibility, responsive design, bundle size |
| **IoT/ESP32 Agent** | Heap, stack, watchdog, WiFi/MQTT reconnect, OTA safety, Modbus timeout, RS485 collision, FreeRTOS task priority |
| **DevOps Agent** | Docker, compose, volumes, networks, health checks, monitoring, backups, CI/CD |
| **QA/Test Agent** | Unit tests, integration tests, E2E tests, coverage, edge cases, failure recovery |
| **Documentation Agent** | API docs, README, architecture docs, deployment guide, developer guide, ESP32 SDK guide, plugin guide |
| **Project Manager Agent** | Phase planning, task prioritization by ROI/risk/maintainability, dependency tracking, milestone reporting |

## Workflow Standard

Every phase follows this sequence:

1. **Audit Only** — each agent inspects its area, reports findings with file:line evidence. No modifications.
2. **Consolidated Plan** — PM merges findings, removes duplicates, creates safe fix order.
3. **Implement** — targeted changes only. No unrelated refactoring. Backward compatible.
4. **Verify** — lint, typecheck, build, unit tests, integration tests, E2E tests, browser check.
5. **Worklog** — document every file changed, decisions made, deferred risks.

## Constraints (all phases)

- Do not break existing auth, MQTT auth, signed OTA, or InfluxDB fallback.
- Do not expose secrets to the frontend.
- Do not disable tests or suppress TypeScript errors.
- Do not change public API response shapes unless absolutely required (with backward compat).
- Prefer mature, stable, open-source technologies.

---

# Phase 8 — RBAC, Rate Limiting, Cursor Pagination

## Audit Reports (Read-Only)

### Security Agent — RBAC + Rate Limiting Audit

**Current state:** Middleware enforces authentication (401 for unauth) but NO role-based authorization. Any authenticated user (admin, engineer, operator, viewer) can call ANY API including OTA deploy, firmware register, alarm resolve, user list, audit log, settings.

**Findings:**

| # | Severity | Route | Issue |
|---|----------|-------|-------|
| S1 | Critical | `POST /api/indos/firmware` | Has role check (admin/engineer) but only in this one route — inconsistent |
| S2 | Critical | `POST /api/indos/ota` | Has role check (admin/engineer) — but no RBAC helper, duplicated logic |
| S3 | Critical | `POST /api/indos/plugins` | No role check — viewer can install/uninstall plugins |
| S4 | Critical | `PATCH /api/indos/alarms` | No role check — viewer can ack/resolve any alarm |
| S5 | Critical | `POST /api/indos/workorders` | No role check — viewer can create work orders |
| S6 | Critical | `GET /api/indos/users` | No role check — viewer can see all user emails |
| S7 | Critical | `GET /api/indos/audit` | No role check — viewer can read audit trail |
| S8 | Critical | `GET /api/indos/settings` | No role check — viewer can read platform config |
| S9 | High | `POST /api/indos/ai` | No rate limit — cost/DoS abuse |
| S10 | High | `POST /api/indos/ota` | No rate limit — rapid OTA spam |
| S11 | High | `POST /api/indos/firmware` | No rate limit |
| S12 | High | All write routes | No rate limit — DoS via rapid writes |

**Recommended RBAC matrix:**

| Route | admin | engineer | operator | viewer |
|-------|-------|----------|----------|--------|
| GET overview/dashboard | ✓ | ✓ | ✓ | ✓ |
| GET devices/alarms/telemetry | ✓ | ✓ | ✓ | ✓ |
| GET projects/orgs/gateways | ✓ | ✓ | ✓ | ✓ |
| POST projects | ✓ | ✓ | ✗ | ✗ |
| PATCH alarms (ack) | ✓ | ✓ | ✓ | ✗ |
| PATCH alarms (resolve) | ✓ | ✓ | ✗ | ✗ |
| POST/PATCH workorders | ✓ | ✓ | ✓ | ✗ |
| POST plugins (install) | ✓ | ✓ | ✗ | ✗ |
| POST firmware (register) | ✓ | ✓ | ✗ | ✗ |
| POST ota (deploy) | ✓ | ✓ | ✗ | ✗ |
| GET users | ✓ | ✗ | ✗ | ✗ |
| GET audit | ✓ | ✗ | ✗ | ✗ |
| GET settings | ✓ | ✓ | ✓ | ✗ |

### Backend/API Agent — Pagination Audit

**Current state:**

| Route | Current limit | Issue |
|-------|--------------|-------|
| `/devices` | `take: 200` | Silent truncation at 200 |
| `/alarms` | `take: 100` | Silent truncation at 100 |
| `/audit` | `take: 60` | Silent truncation at 60 |
| `/telemetry/[deviceId]` | `take: 240` | OK (time-bounded) |
| `/firmware` | unbounded | No limit |
| `/ota` | unbounded | No limit |
| `/projects` | unbounded | No limit |
| `/workorders` | unbounded | No limit |
| `/cameras` | unbounded | No limit |
| `/gateways` | unbounded | No limit |
| `/automation` | unbounded | No limit |
| `/users` | unbounded | No limit |
| `/orgs` | unbounded | No limit |
| `/machines` | unbounded | No limit |
| `/plugins` | unbounded | No limit |
| `/settings` | unbounded | OK (small config table) |
| `/topology` | unbounded | OK (hierarchical, bounded by factories) |
| `/series` | synthetic | OK (fixed 96 points) |
| `/overview` | aggregated | OK (count/groupBy) |

**Recommendation:** Add `?paginated=true&cursor=xxx&limit=50` to devices, alarms, audit, firmware, ota, projects, workorders. Default returns flat array (backward compat).

### Database Agent — Query Audit

**Findings:**
- Missing `@@index` on `OtaJob.firmwareId` and `OtaJob.status` — added in Phase 3 but verify.
- Cursor pagination should use `createdAt` + `id` composite cursor for stable ordering.
- No N+1 risks in current routes (all use include, not nested loops).

### Frontend/UI Agent — Impact Assessment

**Impact of pagination:** Frontend views currently expect flat arrays. If API returns `{items, nextCursor, hasMore}`, views break. Solution: use `?paginated=true` opt-in — frontend stays unchanged, new paginated mode available for future "load more" UI.

### QA Agent — Test Plan

Tests needed:
1. admin can access admin-only route (GET /users)
2. viewer cannot write (POST /projects → 403)
3. unauthenticated → 401
4. authenticated but wrong role → 403
5. rate limit → 429 after threshold
6. pagination returns items + nextCursor
7. pagination limit max enforced
8. existing successful behavior preserved

### Documentation Agent — Worklog Plan

Create `docs/worklogs/PHASE_8_RBAC_RATE_LIMIT_PAGINATION.md` with: files changed, routes protected, roles matrix, rate limits, pagination endpoints, tests, verification, deferred risks.

---

## Implementation Plan (Phase 8)

### Part 1: RBAC helper (`src/lib/rbac.ts`)
### Part 2: Rate limit helper (`src/lib/rate-limit.ts`)
### Part 3: Cursor pagination helper (`src/lib/pagination.ts`)
### Part 4: Apply to all 22 routes
### Part 5: Tests
### Part 6: Verification
### Part 7: Worklog
