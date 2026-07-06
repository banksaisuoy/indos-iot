# IndOS — API Reference

> All `/api/indos/*` routes require authentication (NextAuth session cookie). Unauthenticated requests get **401** from middleware. Authenticated but insufficient-role requests get **403** from `apiHandler`. Rate-limited requests get **429** with `X-RateLimit-*` headers.
>
> All routes use the `apiHandler(minRole, rateLimit, handler)` wrapper from `src/lib/api-handler.ts`. Pagination is opt-in via `?paginated=true&cursor=…&limit=…` (max 100); without it, endpoints return a flat array (backward compatible).

## Conventions

### Error response shape
```json
{ "error": "ERROR_CODE", "message": "Human-readable message" }
```

| Status | Error code | When |
|--------|------------|------|
| 401 | `UNAUTHORIZED` | No session (middleware or apiHandler) |
| 403 | `FORBIDDEN` | Session present but role insufficient |
| 404 | `NOT_FOUND` | Resource doesn't exist |
| 400 | `UNSIGNED_FIRMWARE` | `POST /api/indos/ota` with firmware missing signature |
| 422 | `VALIDATION_ERROR` | Zod schema parse failed |
| 429 | `RATE_LIMITED` | Token bucket exhausted |
| 500 | `SIGNATURE_INVALID` | `GET /api/indos/ota/manifest` re-verify failed |
| 503 | `AI_UNAVAILABLE` | `POST /api/indos/ai` backend unreachable |

### Pagination response shape (when `?paginated=true`)
```json
{
  "items": [ ... ],
  "nextCursor": "base64-encoded-cursor-or-null",
  "hasMore": true
}
```

### Rate limit presets

| Preset | Limit / window |
|--------|----------------|
| `ai` | 5 / min |
| `ota` | 10 / min |
| `firmware` | 10 / min |
| `write` | 30 / min |
| `read` | 120 / min |

---

## Overview & Aggregations

### `GET /api/indos/overview`
Executive dashboard aggregate — counts, OEE averages, distributions. Cached 30s.

| Property | Value |
|----------|-------|
| Min role | `viewer` |
| Rate limit | `read` (120/min) |
| Cache | `cached('overview', 30)` — 21 DB queries reduced to 0 on cache hit |

**Response:**
```json
{
  "counts": {
    "projects": 8, "devices": 62, "onlineDevices": 55, "machines": 12,
    "runningMachines": 8, "activeAlarms": 3, "ackAlarms": 3, "resolvedAlarms": 4,
    "workOrders": 7, "openWorkOrders": 4, "cameras": 6, "onlineCameras": 5,
    "gateways": 4, "onlineGateways": 3, "plugins": 12, "enabledPlugins": 9,
    "users": 5, "activeUsers": 5
  },
  "avgOee": 82.4, "availability": 89.2, "performance": 84.1, "quality": 94.3,
  "projectByCat": { "energy": 1, "agriculture": 1, ... },
  "protocolDist": { "mqtt": 24, "modbus-tcp": 10, ... },
  "alarmByCat": { "device": 1, "energy": 1, ... },
  "gatewayUptime": 98.2
}
```

---

## Projects

### `GET /api/indos/projects`
List all projects with device/alarm/workorder counts.

| Property | Value |
|----------|-------|
| Min role | `viewer` |
| Rate limit | `read` |

**Response:** flat array of `Project` with `_count` and `customer`/`org` relations.

### `POST /api/indos/projects`
Create a new project.

| Property | Value |
|----------|-------|
| Min role | `engineer` |
| Rate limit | `write` (30/min) |

**Request body** (validated by `projectCreateSchema`):
```json
{
  "name": "Solar Farm Extension",
  "description": "Phase 2 of the Isan solar deployment",
  "category": "solar",            // general|energy|agriculture|greenhouse|solar|water|factory|coldstorage|weather|smarthome
  "location": "Khon Kaen, TH",
  "lat": 16.4419,                 // -90..90
  "lng": 102.8360,                // -180..180
  "orgId": "clx...",              // optional
  "customerId": "clx..."          // optional
}
```
**Response:** `201 Created` with the new `Project` (slug auto-generated as `name-slug-<rand>`).

---

## Devices

### `GET /api/indos/devices`
List devices, optionally filtered by project/type/status. Supports cursor pagination.

| Property | Value |
|----------|-------|
| Min role | `viewer` |
| Rate limit | `read` |
| Pagination | ✅ `?paginated=true&cursor=…&limit=…` (orderBy: `lastSeen` desc) |

**Query params:** `project` (slug), `type` (sensor|gateway|plc|relay|camera|meter|inverter|controller), `status` (online|offline|fault|maintenance), `all` = no filter.

**Response (paginated):** `{ items: Device[], nextCursor, hasMore }` where each `Device` includes `project` and `machine` relations.
**Response (flat, default):** `Device[]` (max 200, orderBy `lastSeen desc`).

---

## Alarms

### `GET /api/indos/alarms`
List alarms, optionally filtered by state/severity. Supports cursor pagination.

| Property | Value |
|----------|-------|
| Min role | `viewer` |
| Rate limit | `read` |
| Pagination | ✅ |

**Query params:** `state` (active|acknowledged|resolved), `severity` (critical|warning|info).

### `PATCH /api/indos/alarms`
Acknowledge or resolve an alarm.

| Property | Value |
|----------|-------|
| Min role | `operator` (ack) / `engineer` (resolve — checked in-handler) |
| Rate limit | `write` |

**Request body** (`alarmPatchSchema`):
```json
{ "id": "clx...", "state": "acknowledged" }    // or "resolved"
```
**Response:** the updated `Alarm` (with `ackedBy`, `ackedAt`, `resolvedAt` set as appropriate).

---

## Work Orders

### `GET /api/indos/workorders`
List work orders + open/in-progress/completed/critical counts.

| Property | Value |
|----------|-------|
| Min role | `viewer` |
| Rate limit | `read` |

**Response:**
```json
{
  "workOrders": [ { ...with project relation } ],   // max 200, orderBy createdAt desc
  "stats": { "open": 2, "inProgress": 1, "completed": 3, "critical": 1 }
}
```

### `POST /api/indos/workorders`
Create a work order.

| Property | Value |
|----------|-------|
| Min role | `operator` |
| Rate limit | `write` |

**Request body** (`workOrderCreateSchema`):
```json
{
  "title": "Replace Reflow Oven heating element",
  "description": "Heating element degraded — replace with P/N RX-220",
  "type": "corrective",           // corrective|preventive|predictive|inspection
  "priority": "high",             // low|medium|high|critical
  "projectId": "clx...",          // optional
  "assignee": "Priya Nair",
  "machineName": "Reflow Oven · A1",
  "dueDate": "2025-07-15"         // ISO date string, optional
}
```
**Response:** `201 Created` with the new `WorkOrder` (status defaults to `open`).

### `PATCH /api/indos/workorders`
Update work order status.

| Property | Value |
|----------|-------|
| Min role | `operator` |
| Rate limit | `write` |

**Request body** (`workOrderPatchSchema`):
```json
{ "id": "clx...", "status": "completed" }   // open|inprogress|onhold|completed|cancelled
```

---

## Firmware & OTA

### `GET /api/indos/firmware`
List firmware catalog. Supports cursor pagination.

| Property | Value |
|----------|-------|
| Min role | `viewer` |
| Rate limit | `read` |
| Pagination | ✅ |

**Response:** `Firmware[]` (each with `_count.jobs`) — includes `signature`, `signingKeyId`, `manifest` fields.

### `POST /api/indos/firmware`
Register new firmware + auto-sign the manifest with Ed25519.

| Property | Value |
|----------|-------|
| Min role | `engineer` |
| Rate limit | `firmware` (10/min) |

**Request body** (`firmwareRegisterSchema`):
```json
{
  "version": "v2.5.0",
  "deviceType": "sensor",
  "url": "https://minio.indos.local/firmware/v2.5.0.bin",
  "sizeKb": 540,
  "notes": "BLE mesh support (beta)",
  "checksum": "sha256:abc...",    // optional — auto-set to "sha256:pending-<ts>" if omitted
  "status": "draft"                // draft|stable|deprecated
}
```
**Response:** `201 Created` with the new `Firmware` (including `signature`, `signingKeyId`, `manifest`).
**Side effect:** writes `AuditLog { action: 'firmware.register' }`.

### `GET /api/indos/ota`
List OTA deployment jobs. Supports cursor pagination.

| Property | Value |
|----------|-------|
| Min role | `viewer` |
| Rate limit | `read` |
| Pagination | ✅ |

**Response:** `OtaJob[]` (each with `firmware` relation).

### `POST /api/indos/ota`
Create an OTA deployment job.

| Property | Value |
|----------|-------|
| Min role | `engineer` |
| Rate limit | `ota` (10/min) |

**Request body** (`otaDeploySchema`):
```json
{
  "firmwareId": "clx...",
  "scope": "single",               // single|group|project|global
  "target": "esp32-sensor-01"      // device id, group name, project slug, or null for global
}
```
**Response:** `201 Created` with the new `OtaJob` (status `pending`, includes `firmware`).
**Errors:** `404 NOT_FOUND` if firmware doesn't exist; `400 UNSIGNED_FIRMWARE` if firmware has no `signature`/`manifest`.
**Side effect:** writes `AuditLog { action: 'ota.deploy', target: '<version> → <scope>:<target>' }`.

### `PATCH /api/indos/ota`
Update OTA job status (device progress reporting).

| Property | Value |
|----------|-------|
| Min role | `engineer` |
| Rate limit | `write` |

**Request body:**
```json
{ "id": "clx...", "status": "completed", "progress": 100, "done": 14 }
```
**Response:** the updated `OtaJob`.

### `GET /api/indos/ota/manifest`
Device-facing endpoint — returns the signed OTA manifest for a device.

| Property | Value |
|----------|-------|
| Min role | any authenticated (`authedHandler`) |
| Rate limit | `read` |

**Query params:** `deviceId` (required).

**Response (no pending job):**
```json
{ "pending": false, "message": "No OTA update pending" }
```

**Response (pending job):**
```json
{
  "pending": true,
  "jobId": "clx...",
  "manifest": {
    "version": "v2.5.0",
    "deviceType": "sensor",
    "url": "https://minio.indos.local/firmware/v2.5.0.bin",
    "checksum": "sha256:abc...",
    "sizeKb": 540,
    "notes": "BLE mesh support",
    "createdAt": "2025-07-04T10:00:00.000Z",
    "signingKeyId": "key-001",
    "signature": "<base64 Ed25519 signature>"
  }
}
```
**Errors:** `422 VALIDATION_ERROR` (no `deviceId`); `500 SIGNATURE_INVALID` (server-side re-verify failed — should never happen, indicates tampering).

---

## AI

### `POST /api/indos/ai`
Industrial copilot chat (powered by `z-ai-web-dev-sdk` in dev, swappable for Ollama in production).

| Property | Value |
|----------|-------|
| Min role | `viewer` |
| Rate limit | `ai` (5/min) — strictest limit due to LLM cost |

**Request body** (`aiChatSchema`):
```json
{
  "messages": [
    { "role": "user", "content": "Why is OEE on Line A2 dropping?" },
    { "role": "assistant", "content": "..." },
    { "role": "user", "content": "What should I check first?" }
  ]
}
```
Constraints: `messages` is 1–30 items; each `content` max 8000 chars; `role` must be `user` or `assistant` (no `system` — the system prompt is server-side only).

**Response:**
```json
{ "reply": "Based on the live context (3 active alarms, 4 open work orders)..." }
```
**Errors:** `503 AI_UNAVAILABLE` if the LLM backend is unreachable.

The handler injects a server-side system prompt (IndOS persona + industrial domain knowledge) and a live platform context snapshot (device count, active alarms, project count, open work orders) to ground the assistant.

---

## Plugins

### `GET /api/indos/plugins`
List the plugin marketplace. Cached 60s.

| Property | Value |
|----------|-------|
| Min role | `viewer` |
| Rate limit | `read` |
| Cache | `cached('plugins', 60)` |

### `POST /api/indos/plugins`
Install / enable / disable / uninstall a plugin.

| Property | Value |
|----------|-------|
| Min role | `engineer` |
| Rate limit | `write` |

**Request body** (`pluginActionSchema`):
```json
{ "id": "clx...", "action": "install" }    // install|enable|disable|uninstall
```
**Response:** the updated `Plugin`. **Side effect:** `cacheDel('plugins')` invalidates the cache.

---

## Settings, Audit, Users

### `GET /api/indos/settings`
List platform settings grouped by category. Cached 60s.

| Property | Value |
|----------|-------|
| Min role | `viewer` |
| Rate limit | `read` |
| Cache | `cached('settings', 60)` |

**Response:** `Record<category, Record<key, value>>` — e.g. `{ "system": { "platform.name": "IndOS", ... }, "security": { "auth.2fa": "enabled" } }`.

### `GET /api/indos/audit`
Audit log — admin only. Supports cursor pagination.

| Property | Value |
|----------|-------|
| Min role | `admin` |
| Rate limit | `read` |
| Pagination | ✅ (uses `ts` field, manual cursor — `AuditLog` has no `createdAt`) |

**Response (flat, default):** `AuditLog[]` (max 60, orderBy `ts desc`).
**Response (paginated):** `{ items, nextCursor, hasMore }` — `nextCursor` is the last item's `id`.

### `GET /api/indos/users`
List all users — admin only (exposes emails, roles, 2FA status).

| Property | Value |
|----------|-------|
| Min role | `admin` |
| Rate limit | `read` |

**Response:** `User[]` (selected fields: `id, email, name, role, status, twoFA, lastLogin, createdAt, org.name`). Password hashes are **never** returned.

---

## Telemetry & Topology

### `GET /api/indos/telemetry/[deviceId]`
Historical telemetry for a device. Tries InfluxDB first, falls back to SQLite.

| Property | Value |
|----------|-------|
| Min role | any authenticated (`authedHandler`) |
| Rate limit | `read` |

**Query params:** `metric` (e.g. `temperature`), `range` (e.g. `24h`, `7d`, `1h`; default `24h`).

**Response:** array of `{ ts, value, metric, unit }` points (max 240, chronological order).

### `GET /api/indos/topology`
Hierarchical topology: Project → Factory → Building → Line → Machine → Device.

| Property | Value |
|----------|-------|
| Min role | `viewer` |
| Rate limit | `read` |

**Response:**
```json
{
  "hierarchical": [ { ...Project, factories: [ { ...Factory, buildings: [...] } ] } ],
  "flat": [ { ...Project, _count: { devices: N } } ]   // projects with no factories
}
```

### `GET /api/indos/series`
Synthetic time-series for dashboard charts (energy, water, gas, solar, environment, machine, production).

| Property | Value |
|----------|-------|
| Min role | `viewer` |
| Rate limit | `read` |

**Query params:** `kind` (energy|water|gas|solar|environment|machine|production; default `energy`).

**Response:** `{ kind, series: Record<name, {t, v}[]>, kpis: Record<name, number> }` — 96 points per series (15-min intervals over 24h).

---

## Supporting Resources

### `GET /api/indos/gateways`
| Property | Value |
|----------|-------|
| Min role | `viewer` | Rate limit: `read` |
**Response:** `Gateway[]` (orderBy `name asc`).

### `GET /api/indos/cameras`
| Property | Value |
|----------|-------|
| Min role | `viewer` | Rate limit: `read` |
**Response:** `Camera[]` (orderBy `name asc`).

### `GET /api/indos/automation`
| Property | Value |
|----------|-------|
| Min role | `viewer` | Rate limit: `read` |
**Response:** `AutomationFlow[]` (orderBy `createdAt desc`).

### `GET /api/indos/machines`
| Property | Value |
|----------|-------|
| Min role | `viewer` | Rate limit: `read` |
**Response:** `Machine[]` with nested `line.building.factory.project` relation and `_count.devices` (orderBy `name asc`).

### `GET /api/indos/orgs`
| Property | Value |
|----------|-------|
| Min role | `viewer` | Rate limit: `read` |
**Response:** `Organization[]` with `_count` for `users`, `projects`, `customers`.

---

## Health & Metrics (public, no auth)

### `GET /api/health`
Docker/K8s liveness probe. **Public.**

**Response (200):** `{ ok: true, checks: { db: true }, ts: "..." }`
**Response (503):** `{ ok: false, checks: { db: false }, ts: "..." }` — DB unreachable.

### `GET /api/metrics`
Prometheus/Grafana scrape endpoint. **Public.** Exposes only aggregate counts (no sensitive data).

**Response (200):**
```json
{
  "uptime": 1234.5,
  "memory": { "rss": 156, "heapUsed": 84, "heapTotal": 128 },
  "devices": { "total": 62, "online": 55, "offline": 7 },
  "alarms": { "active": 3 },
  "ota": { "totalJobs": 3, "firmwareVersions": 3 },
  "users": { "total": 5 },
  "infrastructure": { "redis": false, "influxdb": false },
  "ts": "2025-07-04T10:30:00.000Z"
}
```

### `GET /api/auth/*`
NextAuth routes (csrf, session, signin, signout, callback/credentials). **Public.** See NextAuth.js v4 docs.

---

## Quick Reference: All 21 `/api/indos/*` Routes

| # | Method | Path | Min role | Rate limit | Pagination |
|---|--------|------|----------|------------|------------|
| 1 | GET | `/api/indos/overview` | viewer | read | — |
| 2 | GET | `/api/indos/projects` | viewer | read | — |
| 3 | POST | `/api/indos/projects` | engineer | write | — |
| 4 | GET | `/api/indos/devices` | viewer | read | ✅ |
| 5 | GET | `/api/indos/alarms` | viewer | read | ✅ |
| 6 | PATCH | `/api/indos/alarms` | operator / engineer (resolve) | write | — |
| 7 | GET | `/api/indos/workorders` | viewer | read | — |
| 8 | POST | `/api/indos/workorders` | operator | write | — |
| 9 | PATCH | `/api/indos/workorders` | operator | write | — |
| 10 | GET | `/api/indos/firmware` | viewer | read | ✅ |
| 11 | POST | `/api/indos/firmware` | engineer | firmware | — |
| 12 | GET | `/api/indos/ota` | viewer | read | ✅ |
| 13 | POST | `/api/indos/ota` | engineer | ota | — |
| 14 | PATCH | `/api/indos/ota` | engineer | write | — |
| 15 | GET | `/api/indos/ota/manifest` | authenticated | read | — |
| 16 | GET | `/api/indos/telemetry/[deviceId]` | authenticated | read | — |
| 17 | GET | `/api/indos/gateways` | viewer | read | — |
| 18 | GET | `/api/indos/cameras` | viewer | read | — |
| 19 | GET | `/api/indos/automation` | viewer | read | — |
| 20 | GET | `/api/indos/machines` | viewer | read | — |
| 21 | GET | `/api/indos/topology` | viewer | read | — |
| 22 | GET | `/api/indos/series` | viewer | read | — |
| 23 | GET | `/api/indos/settings` | viewer | read | — |
| 24 | GET | `/api/indos/audit` | admin | read | ✅ |
| 25 | GET | `/api/indos/users` | admin | read | — |
| 26 | GET | `/api/indos/orgs` | viewer | read | — |
| 27 | GET | `/api/indos/plugins` | viewer | read | — |
| 28 | POST | `/api/indos/plugins` | engineer | write | — |
| 29 | POST | `/api/indos/ai` | viewer | ai | — |

> The platform ships with **21 route files** under `src/app/api/indos/`. The table above lists 29 rows because some files export multiple methods (GET + POST + PATCH). Counting unique route files: overview, projects, devices, alarms, workorders, firmware, ota, ota/manifest, telemetry/[deviceId], gateways, cameras, automation, machines, topology, series, settings, audit, users, orgs, plugins, ai = **21 routes**.
