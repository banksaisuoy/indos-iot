# Phase 13 — Production Deployment Readiness & Failure Drill

**Task ID:** PHASE13-PRODUCTION-READINESS-DRILL
**Agent:** orchestrator (main)
**Date:** 2025-07-07
**Status:** ✅ Complete (conditional GO for single-tenant sqlite pilot)

## Summary

Final production readiness drill before pilot deployment. No new features;
fix only verified production risks; add minimal tests for high-risk gaps. The
phase audited deployment config, ran 13 failure scenarios, verified operator
safety, ran a security regression, and smoke-tested performance.

## Scope (what was examined)

1. **Deployment readiness** — env vars, Docker/compose, build, DB migration/seed,
   static assets, reverse proxy, healthcheck, startup/restart.
2. **Runtime failure scenarios** — 13 scenarios (WS disconnect, API timeout,
   DB down, telemetry 500, alarm fail, bulk-ack fail, CSV empty/large, stale
   device, session expiry, 403, cross-org, OTA deleted device).
3. **Operator safety** — critical-alarm persistence, connection escalation,
   stale marking, no false "live", sound toggle safety, ack-failure visibility,
   CSV error UX.
4. **Security regression** — admin manage, engineer 403 on admin APIs, org
   isolation server-side (not just UI), no console secrets, no bundle secrets,
   cookie safety.
5. **Performance smoke** — dashboard load, large lists, CSV perf, telemetry
   dialog, WS frequency, re-renders, idle memory.

## Bugs Found & Fixed (3 verified production risks)

### Bug 1 — CRITICAL: Ack failure hides alarm

**File:** `src/components/indos/shell/critical-alarm-banner.tsx`

`handleAckAll` called `setDismissedAt(Date.now())` + `ackAlarm(id)` for all
live critical alarms BEFORE the fetch resolved. On server failure (500,
network, 401) the banner hid and live alarms were optimistically acked — the
operator thinks alarms are handled but the DB still has them active. This
directly violated the Phase 12-A operator-safety contract ("critical alarms
remain visible until ack").

**Fix:** Extracted a pure, testable `decideAckOutcome(httpStatus, liveCount)`
function in `src/lib/indos/ack-outcome.ts`. The banner now only dismisses +
acks-live on a confirmed 2xx. On any failure (null/4xx/5xx) the banner stays
visible and live alarms stay active, with a clear error toast. The pure
function is unit-tested exhaustively (10 tests, all failure codes).

### Bug 2 — NEXTAUTH_SECRET dev fallback in production

**Files:** `src/lib/auth.ts`, `src/middleware.ts`

Both fell back to `'indos-dev-secret-change-in-production'` if the env var was
unset. In a production deployment where the operator forgets to set it, JWTs
would be signed/verified with a publicly-known secret → any attacker could
forge a session token and impersonate any user (including admin).

**Fix:** Created `src/lib/auth-secret.ts` with a centralised resolver that
THROWS at module-load time in production (`NODE_ENV === 'production'`) if
`NEXTAUTH_SECRET` is missing or <16 chars. Both `auth.ts` and `middleware.ts`
import the shared constant. Fail-closed: the server crashes at startup rather
than running with a forgeable secret. Dev mode preserves the fallback so the
sandbox keeps working. 6 unit tests cover the fail-fast contract.

### Bug 3 — OTA POST didn't validate target device exists

**File:** `src/app/api/indos/ota/route.ts`

A preselected-but-deleted device (from the Devices → Send OTA hand-off)
created a `pending` OTA job that sat forever with no device to report
progress. The operator sees a stuck job with no clear error.

**Fix:** `POST /api/indos/ota` now runs `db.device.findUnique` for
`scope === 'single' && target` → returns 404 `DEVICE_NOT_FOUND` with an
actionable message. The `ota-view` deploy handler also now reads the server
error body so the 404 surfaces a readable toast instead of a generic
`HTTP 404`.

## Tests Added (24 new, 105 total)

| File | Tests | Covers |
|---|---|---|
| `src/lib/indos/ack-outcome.test.ts` | 10 | "ack failure must not hide alarm" contract: 200/201 dismiss+ack; null/400/401/403/404/418/422/429/500/502/503/504 all keep dismiss=false+ackLive=false; exhaustive sweep |
| `src/lib/rbac.test.ts` (+8) | 8 | Engineer/operator/viewer → `requireRole(session,'admin')` = 403; null session → 401; engineer passes engineer-gate; operator 403 on engineer-gate (bulk-ack); hasRole/getRole consistency |
| `src/lib/auth-secret.test.ts` | 6 | Production fail-fast: throws when unset/too-short in production; dev fallback preserved; trims whitespace |

## Verification

| Check | Command | Result |
|---|---|---|
| TypeScript | `bunx tsc --noEmit` | ✅ 0 errors |
| ESLint | `bun run lint` | ✅ 0 errors |
| Unit tests | `bunx vitest run` | ✅ 105/105 pass |
| Production build | `bun run build` | ⛔ Not run — sandbox policy prohibits `bun run build`. Equivalent signals green. **Run in CI before pilot.** |

### curl / browser verification (key scenarios)

- `engineer@acme.io` POST `/api/indos/users` → 403 FORBIDDEN ✓
- `engineer@acme.io` POST `/api/indos/orgs` → 403 FORBIDDEN ✓
- `engineer@acme.io` GET `/api/indos/devices` → 3 Acme devices only ✓
- `admin@indos.io` GET `/api/indos/devices` → 8 devices (both orgs) ✓
- Disconnect banner shows on `:3000` (WS unroutable) after 3s ✓
- Dashboard renders clean, no console errors ✓

## Files Changed

**New (4):**
- `src/lib/indos/ack-outcome.ts` — pure ack-outcome decision function
- `src/lib/indos/ack-outcome.test.ts` — 10 tests
- `src/lib/auth-secret.ts` — centralised NEXTAUTH_SECRET with prod fail-fast
- `src/lib/auth-secret.test.ts` — 6 tests

**Modified (5):**
- `src/components/indos/shell/critical-alarm-banner.tsx` — uses decideAckOutcome; no longer dismisses on failure
- `src/lib/auth.ts` — imports NEXTAUTH_SECRET from auth-secret.ts
- `src/middleware.ts` — imports NEXTAUTH_SECRET from auth-secret.ts
- `src/app/api/indos/ota/route.ts` — validates target device exists (404 DEVICE_NOT_FOUND)
- `src/components/indos/views/ota-view.tsx` — reads server error body for actionable toast

**Deployment config (created in the post-phase gap fix):**
- `.env` — added NEXTAUTH_SECRET, OTA_SIGNING_* keys, documented optional vars
- `.env.example` — full example env file (was missing despite being claimed by Phases 6/7/9)

## Remaining Deployment Risks

| Risk | Severity | Mitigation |
|---|---|---|
| sqlite vs postgres schema mismatch | 🔴 Blocker for compose stack | Complete P1.1 (postgres migration) before using full compose |
| No migrations/seed in Docker CMD | 🟠 Pilot risk | Add entrypoint script running `prisma migrate deploy` + seed |
| `bun run build` unverified | 🟡 Pilot risk | Run in CI; standalone build + static copy not validated in this env |
| `useSecureCookies: false` | 🟡 Hardening | Acceptable behind TLS-terminating Caddy; set true for best practice (P2.4) |
| Audit IP hardcoded `0.0.0.0` in bulk-ack + OTA | 🟡 Compliance | Extract clientIp() helper, reuse (P2.7 follow-up) |
| API list cap 200 rows | 🟢 Scale | Cursor pagination exists; P1.2 "Load More" UI extends |
| Console.log in auth.ts (emails) | 🟢 Low | PII in server logs; reduce to debug for SaaS |

## Go / No-Go

**CONDITIONAL GO** for a single-tenant SQLite pilot behind Caddy with the env
checklist satisfied (NEXTAUTH_SECRET, OTA_SIGNING_*, DATABASE_URL on a
persistent volume) + `bun run build` validated in CI + `prisma/seed.ts` run
once post-deploy.

**NO-GO** for the full docker-compose Postgres stack until P1.1 (PostgreSQL
migration) is complete.
