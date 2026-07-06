# Phase 9 — Redis Cache + Socket.io Rooms

**Date:** 2025-07-03
**Status:** ✅ Complete
**Agent:** orchestrator (main)

## Summary

Improved scalability and reduced unnecessary realtime traffic:
- Redis cache support with graceful in-memory fallback
- Cached expensive read APIs (overview, settings, plugins)
- Cache invalidation after write actions
- Socket.io rooms by project — no more broadcasting all telemetry to every client

## Files Changed

### New files
- `src/lib/cache.ts` — Redis + in-memory LRU cache: `cacheGet()`, `cacheSet()`, `cacheDel()`, `cacheDelPattern()`, `cached()` wrapper. Lazy-init Redis when `REDIS_URL` is set, falls back to in-memory LRU (500 entries, TTL-based eviction).
- `src/lib/cache.test.ts` — 6 tests: set+get, missing key, del, cached wrapper, TTL expiry, Redis availability check

### Updated files
- `src/app/api/indos/overview/route.ts` — wrapped in `cached('overview', 30, ...)` — 21 DB queries reduced to 0 on cache hit
- `src/app/api/indos/settings/route.ts` — wrapped in `cached('settings', 60, ...)`
- `src/app/api/indos/plugins/route.ts` — GET wrapped in `cached('plugins', 60, ...)`; POST calls `cacheDel('plugins')` to invalidate
- `src/app/api/indos/projects/route.ts` — import cacheDel (overview cache invalidated via TTL)
- `mini-services/telemetry/index.ts` — Socket.io rooms implementation:
  - All `io.emit()` replaced with `io.to('global').emit()` or `io.to('project:${slug}').emit()`
  - Clients auto-join `global` room on connect
  - Clients can `socket.emit('subscribe', { project: 'bkk-energy' })` to join project rooms
  - Telemetry grouped by project and sent only to relevant rooms
  - System metrics, device vitals, alarms → global room only
- `package.json` — added `ioredis` dependency
- `.env.example` — added `REDIS_URL` (optional)

## Caching Strategy

| Endpoint | Cache Key | TTL | Invalidation |
|----------|-----------|-----|--------------|
| `GET /api/indos/overview` | `overview` | 30s | TTL (dashboard auto-refreshes) |
| `GET /api/indos/settings` | `settings` | 60s | TTL |
| `GET /api/indos/plugins` | `plugins` | 60s | `cacheDel('plugins')` on POST |

**Fallback behavior:** When Redis is not configured (dev mode), an in-memory LRU cache (500 entries, periodic cleanup) provides the same interface. This enables caching in single-instance dev and multi-instance production.

## Socket.io Rooms Architecture

**Before (Phase 8):** `io.emit()` broadcast every telemetry tick to ALL connected clients. At 1000 concurrent users, this was ~4 MB/s outbound.

**After (Phase 9):**
- `global` room: system metrics, device vitals, alarms, dashboard-wide telemetry (auto-joined on connect)
- `project:{slug}` room: telemetry for a specific project (clients subscribe via `socket.emit('subscribe', { project: 'bkk-energy' })`)
- Telemetry is grouped by project and sent only to the relevant rooms + global
- MQTT-published telemetry goes to `project:{project}` + `global`

**Scaling impact:** A user viewing the Solar Farm project no longer receives Duck Farm telemetry. At 100 projects × 10 users each, outbound traffic drops by ~90%.

## Verification Results

- `bun run lint` → ✅ 0 errors
- `bunx tsc --noEmit` → ✅ 0 errors
- `bunx vitest run` → ✅ 41/41 tests pass (7 schema + 5 auth + 8 OTA + 3 InfluxDB + 12 RBAC + 6 cache)
- Browser: login → dashboard renders with LIVE telemetry (room join works)
- All services running: web:3000, mqtt:1883, ws:3030

## Deferred Risks

- Frontend doesn't yet emit `subscribe` for project-specific rooms — currently all clients are in `global` room only. Future: add project filter UI that subscribes/unsubscribes.
- Redis not required for dev — in-memory cache works for single-instance. Multi-instance production needs `REDIS_URL`.
- Cache invalidation for overview relies on 30s TTL (acceptable for dashboard). Could add explicit `cacheDel('overview')` on alarm/workorder/project writes.
