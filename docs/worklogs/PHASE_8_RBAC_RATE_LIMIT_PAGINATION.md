# Phase 8 — RBAC, Rate Limiting, Cursor Pagination

**Date:** 2025-07-03
**Status:** ✅ Complete
**Agent:** orchestrator (main)

## Summary

Closed remaining production-readiness gaps after Phases 4-7:
- Full RBAC enforcement per API route (admin/engineer/operator/viewer)
- Rate limiting for AI, OTA, firmware, write, and read routes
- Cursor pagination for large list endpoints (backward compatible)

## Files Changed

### New infrastructure (3 files)
- `src/lib/rbac.ts` — RBAC helper: `requireRole()`, `hasRole()`, `requireAnyRole()`, `getRole()`
- `src/lib/rate-limit.ts` — In-memory token-bucket rate limiter: `checkRateLimit()`, `applyRateLimit()`, `RATE_LIMITS` presets
- `src/lib/pagination.ts` — Cursor pagination: `parsePaginationParams()`, `cursorPaginate()` (backward-compatible flat array by default, `{items, nextCursor, hasMore}` with `?paginated=true`)
- `src/lib/api-handler.ts` — Combined guard: `apiHandler(minRole, rateLimit, handler)` and `authedHandler(rateLimit, handler)`
- `src/lib/rbac.test.ts` — 12 tests for RBAC, rate limiting, pagination

### Routes updated (22 files)
All `/api/indos/*` routes now use `apiHandler()` or `authedHandler()` with RBAC + rate limiting:

| Route | Methods | Min Role | Rate Limit | Pagination |
|-------|---------|----------|------------|------------|
| `/overview` | GET | viewer | read (120/min) | — |
| `/projects` | GET | viewer | read | — |
| `/projects` | POST | engineer | write (30/min) | — |
| `/devices` | GET | viewer | read | ✅ |
| `/gateways` | GET | viewer | read | — |
| `/alarms` | GET | viewer | read | ✅ |
| `/alarms` | PATCH | operator | write | — |
| `/workorders` | GET | viewer | read | — |
| `/workorders` | POST | operator | write | — |
| `/workorders` | PATCH | operator | write | — |
| `/cameras` | GET | viewer | read | — |
| `/automation` | GET | viewer | read | — |
| `/machines` | GET | viewer | read | — |
| `/topology` | GET | viewer | read | — |
| `/series` | GET | viewer | read | — |
| `/settings` | GET | viewer | read | — |
| `/orgs` | GET | viewer | read | — |
| `/users` | GET | **admin** | read | — |
| `/audit` | GET | **admin** | read | ✅ |
| `/plugins` | GET | viewer | read | — |
| `/plugins` | POST | engineer | write | — |
| `/firmware` | GET | viewer | read | ✅ |
| `/firmware` | POST | engineer | firmware (10/min) | — |
| `/ota` | GET | viewer | read | ✅ |
| `/ota` | POST | engineer | ota (10/min) | — |
| `/ota` | PATCH | engineer | write | — |
| `/ota/manifest` | GET | authenticated | read | — |
| `/telemetry/[deviceId]` | GET | authenticated | read | — |
| `/ai` | POST | viewer | **ai (5/min)** | — |

### Deleted
- `src/app/api/indos/organizations/route.ts` — duplicate of `/orgs` (dead code)

## Roles & Permissions Matrix

| Action | admin | engineer | operator | viewer |
|--------|-------|----------|----------|--------|
| Read dashboard/telemetry/devices/alarms | ✓ | ✓ | ✓ | ✓ |
| Acknowledge alarms | ✓ | ✓ | ✓ | ✗ |
| Resolve alarms | ✓ | ✓ | ✗ | ✗ |
| Create/edit work orders | ✓ | ✓ | ✓ | ✗ |
| Create projects | ✓ | ✓ | ✗ | ✗ |
| Install/uninstall plugins | ✓ | ✓ | ✗ | ✗ |
| Register firmware | ✓ | ✓ | ✗ | ✗ |
| Deploy OTA | ✓ | ✓ | ✗ | ✗ |
| Update OTA job status | ✓ | ✓ | ✗ | ✗ |
| List users | ✓ | ✗ | ✗ | ✗ |
| View audit logs | ✓ | ✗ | ✗ | ✗ |
| AI chat | ✓ | ✓ | ✓ | ✓ |

## Rate Limits Applied

| Category | Limit | Window | Routes |
|----------|-------|--------|--------|
| AI | 5 req | 1 min | `/api/indos/ai` |
| OTA deploy | 10 req | 1 min | `POST /api/indos/ota` |
| Firmware register | 10 req | 1 min | `POST /api/indos/firmware` |
| Write (general) | 30 req | 1 min | POST/PATCH on all other routes |
| Read | 120 req | 1 min | All GET routes |

Rate limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`

## Pagination Endpoints

These endpoints support `?paginated=true&cursor=xxx&limit=50` (max 100):
- `/api/indos/devices`
- `/api/indos/alarms`
- `/api/indos/audit`
- `/api/indos/firmware`
- `/api/indos/ota`

Without `?paginated=true`, they return flat arrays (backward compatible).

## Tests Added

- `src/lib/rbac.test.ts` — 12 tests:
  - RBAC role hierarchy
  - Viewer cannot access admin routes
  - Viewer cannot write
  - Operator can ack but not resolve alarms
  - 401 vs 403 contract
  - Rate limit allows under threshold
  - Rate limit blocks over threshold (429)
  - Rate limit presets
  - Rate limit headers
  - Pagination default/max limit
  - Pagination response shape
  - Backward compat flat array

## Verification Results

- `bun run lint` → ✅ 0 errors
- `bunx tsc --noEmit` → ✅ 0 errors
- `bunx vitest run` → ✅ 35/35 tests pass (7 schema + 5 auth + 8 OTA + 3 InfluxDB + 12 RBAC)
- Browser: login → dashboard → devices → alarms → OTA all render correctly
- API tests:
  - admin GET /users → 200
  - unauth GET /users → 401
  - pagination ?paginated=true → {items, nextCursor, hasMore}
  - flat array (no ?paginated) → backward compat
  - AI rate limit: 6th request → 429

## Deferred Risks

- Per-tenant (orgId) scoping not yet implemented — all users see all orgs' data. Roadmap item.
- Redis-backed rate limiting not implemented — in-memory limiter works for single-instance, but multi-instance deployments need Redis. Roadmap item.
- Frontend "load more" UI not added — pagination API is ready, frontend can adopt incrementally.
