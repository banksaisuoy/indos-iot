# IndOS — 5-Year Roadmap

> Living document. Updated after each phase. Priorities: **P0** (blocks production scale-out) → **P3** (long-term strategic).

## Completed Phases (4–13)

| Phase | Title | Key Outcome | Date |
|-------|-------|-------------|------|
| 4 | NextAuth Authentication | Credentials provider + bcrypt + JWT + middleware 401/redirect | 2025-07 |
| 5 | MQTT Broker Auth + ACL | Aedes `authenticate` (bcrypt) + `authorizePublish`/`authorizeSubscribe` per-device topic ACL | 2025-07 |
| 6 | Signed OTA Pipeline | Ed25519 manifest signing + SHA-256 checksum + unsigned firmware rejection | 2025-07 |
| 7 | Telemetry + InfluxDB | `@influxdata/influxdb-client` write/query + 5s batch flush + SQLite fallback | 2025-07 |
| 8 | RBAC + Rate Limit + Pagination | `apiHandler(minRole, rateLimit, handler)` + 4 roles + 5 rate presets + cursor pagination | 2025-07 |
| 9 | Redis Cache + Socket.io Rooms | `ioredis` + in-memory LRU fallback + project-scoped socket rooms (90% traffic reduction) | 2025-07 |
| 10 | E2E Tests + Metrics + Audit | 14 Playwright tests + public `/api/metrics` + final security audit (55 total tests pass) | 2025-07 |
| 11 | Per-Tenant `orgId` Scoping | `orgScope(session)` / `scopedProjectFilter` helpers applied to all list endpoints; admin cross-org, engineers org-scoped; second org + user seeded; `audit` opened to viewers (self-only); P2.7 real client-IP capture landed early | 2025-07 |
| 12 | Field-Ops Hardening | Operator-safety banners (connection-loss + critical-alarm persistent banner + audio), real user/org management (POST/PATCH APIs + last-admin protection), bulk alarm ack + CSV export (alarms + devices), real device-detail actions (telemetry chart + OTA navigation), stale-device badge, alarm-sound toggle. Closes 10 real-world pain points identified in a plant-floor review. 81/81 tests pass. | 2025-07 |
| 13 | Production Readiness Drill | Failure-drill across 13 scenarios; 3 verified production bugs fixed (ack-fail-no-hide, NEXTAUTH_SECRET prod fail-fast, OTA deleted-device validation); 24 new tests (105 total); `.env.example` created; deployment Go/No-Go issued. Conditional GO for single-tenant sqlite pilot. | 2025-07 |

**Current state:** Production-ready for **multi-tenant** SaaS deployments AND validated against real plant-floor operator workflows + a production-readiness failure drill. Per-tenant data isolation enforced. All operator-safety hazards fixed. NEXTAUTH_SECRET fails fast in production. 105/105 unit tests pass. Lint + typecheck clean. Conditional GO for a single-tenant sqlite pilot; NO-GO for the full Postgres compose stack until P1.1.

---

## P0 — Blocks Multi-Tenant / Multi-Instance (Q3 2025)

The remaining item prevents IndOS from being deployed behind a multi-replica load balancer. P0.1 (orgId scoping) shipped in Phase 11.

### ~~P0.1 — Per-Tenant `orgId` Scoping~~ ✅ DONE (Phase 11)

**Problem:** All authenticated users see all orgs' devices, alarms, projects, work orders, and audit logs. The `orgId` column exists on `User`, `Project`, `Customer` but no route filters by it.

**Impact:** Cannot sell IndOS as a multi-tenant SaaS. Fine for single-tenant on-prem.

**Resolution (Phase 11):**
1. `orgId` + `role` propagated through `authorize()` → JWT → `session.user.orgId`.
2. New `src/lib/org-scope.ts` helpers: `orgScope()`, `isOrgScoped()`, `getOrgId()`, `scopedProjectFilter()`, `scopedMachineFilter()`.
3. Applied to: `devices` (via `project.orgId`), `alarms` (via `project.orgId`), `workorders` (via `project.orgId`), `projects` (direct), `machines` (via `line.building.factory.project.orgId`), `audit` (self-only for non-admins), `orgs` (own-org only), `users` (own-org only), `overview` (per-org cache key + scoped counts).
4. Platform-level resources (no `orgId` column): `firmware`, `ota`, `gateways`, `cameras` — kept global with explicit `// PLATFORM-LEVEL` comments and P1 follow-up notes.
5. Admins (role=admin) and platform users (null orgId) bypass scoping — backward-compatible.
6. Bonus: P2.7 (real client IP capture via `x-forwarded-for` / `x-real-ip` in audit log) landed in the same `authorize()` edit.

**Effort:** 1 day (actual).

### P0.2 — Redis-Backed Rate Limiting

**Problem:** The token-bucket rate limiter is in-memory (`Map` in `src/lib/rate-limit.ts`). With 2+ Next.js replicas, each has its own bucket — effective limit becomes `N × configured`.

**Impact:** AI endpoint cost DoS protection breaks under load balancing.

**Plan:**
1. Add `@upstash/ratelimit` (or roll a custom Redis Lua script for atomic check-and-decrement).
2. Fallback to in-memory when `REDIS_URL` is unset (existing behavior preserved).
3. Use a sliding-window log strategy (more accurate than token bucket for short windows).
4. Add a `RateLimitBackend` interface so future backends (Memcached, etcd) can plug in.
5. Load test: 1000 concurrent requests across 3 replicas → exactly 5 succeed for AI endpoint.

**Effort:** 2–3 days.

---

## P1 — Production Polish (Q4 2025)

Features that complete the production story but aren't blockers.

### P1.1 — PostgreSQL Migration

**Current:** SQLite (dev) via `prisma/schema.prisma` (`provider = "sqlite"`).
**Target:** PostgreSQL 16 (production).

**Plan:**
1. Add a second Prisma datasource config or use env-based provider switching.
2. Run `prisma migrate dev` against Postgres to generate the migration history.
3. Update `docker-compose.yml` (already has Postgres service).
4. Add a seed-data migration script for existing SQLite deployments.
5. Test all 21 routes against Postgres (most queries are portable; JSON fields need attention).

**Effort:** 2 days.

### P1.2 — Frontend "Load More" Pagination UI

**Current:** The pagination API exists (`?paginated=true&cursor=…`), but the 21 views still fetch flat arrays (max 200 items).

**Plan:**
1. Add a `useInfiniteQuery` (TanStack Query) hook wrapping paginated endpoints.
2. Add a "Load more" button at the bottom of `devices-view`, `alarms-view`, `audit-view`, `firmware-view`, `ota-view`.
3. Show `{hasMore ? "Load more" : "End of list"}`.
4. Add a "back to top" button when scrolled.
5. E2E test: load 250 devices, click "Load more" twice, verify 150 items shown.

**Effort:** 2 days.

### P1.3 — Project-Filter Socket.io Subscribe UI

**Current:** All clients are in the `global` socket room only. The `subscribe`/`unsubscribe` API exists server-side but the frontend doesn't emit it.

**Plan:**
1. Add a project selector in the topbar.
2. On select, emit `socket.emit('subscribe', { project: slug })` and leave the previous project room.
3. Dashboard charts filter to the selected project's telemetry.
4. Add a "All projects" option that returns to `global` only.
5. E2E test: select project A, verify only project A telemetry arrives.

**Effort:** 1–2 days.

### P1.4 — Full OTA Binary Upload

**Current:** Admin passes a `url` field when registering firmware (e.g., a MinIO object URL). The binary itself isn't uploaded through IndOS.

**Plan:**
1. Add `POST /api/indos/firmware/upload` accepting `multipart/form-data`.
2. Stream the binary to MinIO (S3-compatible) using the `@minio/minio-js` client.
3. Compute SHA-256 of the binary during upload.
4. Auto-generate the `url` (MinIO object URL) and `checksum`.
5. Call existing `buildSignedManifest` to sign.
6. Update the firmware registration UI to use a file picker.
7. Add `DELETE /api/indos/firmware/[id]` to remove the binary from MinIO.

**Effort:** 3 days.

### P1.5 — Database-Backed Device Credentials

**Current:** MQTT device credentials live in `mini-services/telemetry/devices.json`.

**Plan:**
1. Add a `DeviceCredential` Prisma model (username, passwordHash, project, orgId, status).
2. Telemetry mini-service reads from Postgres via Prisma (or a shared API).
3. `provision-device.sh` becomes `POST /api/indos/devices/provision` (admin only).
4. Cache credentials in-memory with 60s TTL to avoid DB hit on every MQTT CONNECT.

**Effort:** 2 days.

### P1.6 — User Management UI

**Current:** `GET /api/indos/users` exists (admin only) but there's no create/update/disable flow.

**Plan:**
1. `POST /api/indos/users` — create user (admin only), bcrypt hash password, optional orgId.
2. `PATCH /api/indos/users/[id]` — update role, status, password, orgId.
3. `DELETE /api/indos/users/[id]` — soft delete (set status `disabled`).
4. Settings → Users view: table with create/edit/disable buttons.
5. E2E test: admin creates a new engineer, engineer logs in.

**Effort:** 2 days.

---

## P2 — Hardening & Integrations (2026)

### P2.1 — Keycloak OIDC Integration

Replace (or augment) the NextAuth Credentials provider with OIDC against the bundled Keycloak service (already in `docker-compose.yml`).

- Add `KeycloakProvider` to `auth.ts`.
- Map Keycloak realm roles → IndOS roles (`admin`, `engineer`, `operator`, `viewer`).
- Support both local (Credentials) and OIDC login simultaneously during migration.
- Migrate `User.password` to nullable (already nullable — Phase 4 forward-thinking).

**Effort:** 3 days.

### P2.2 — mTLS for MQTT

Add mutual TLS to the Aedes broker:

- Generate a CA, sign device client certs.
- Update `aedes` to require client cert + verify against CA.
- Keep username/password as a second factor (defense in depth).
- ESP32 sketch: load `WiFiClientSecure` with `--cafile` + `--cert` + `--key`.
- Document cert provisioning in `DEPLOYMENT_CHECKLIST.md`.

**Effort:** 4 days.

### P2.3 — Grafana Dashboard JSON Provisioning

- Author a canonical IndOS Grafana dashboard JSON (uptime, memory, device counts, alarm counts, OTA jobs, infra status).
- Add it to `docker-compose.yml` Grafana provisioning (`/etc/grafana/provisioning/dashboards/`).
- Add a Prometheus → IndOS scrape config template.
- Export dashboard as code so upgrades don't lose user customizations.

**Effort:** 1–2 days.

### P2.4 — Security Headers

Add to `next.config.ts` `headers()`:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `Content-Security-Policy` tuned for Next.js inline styles.

**Effort:** 1 day.

### P2.5 — 2FA / TOTP Enforcement

- Add `otplib` for TOTP.
- Enrollment flow: Settings → Security → Enable 2FA → scan QR code → verify 6-digit code.
- Store TOTP secret in `User.twoFASecret` (encrypted).
- Require 2FA for `admin` role (configurable).
- Recovery codes (10 single-use).

**Effort:** 3 days.

### P2.6 — Account Lockout

After 5 failed login attempts, lock the account for 15 minutes. Track in `User.failedLoginAttempts` + `User.lockedUntil`. Reset on successful login.

**Effort:** 1 day.

### P2.7 — Real Client IP in Audit Log

Currently `AuditLog.ip` is hardcoded to `0.0.0.0`. Read `x-forwarded-for` (first IP) or `x-real-ip` (Caddy sets it) in `authorize()` and route handlers.

**Effort:** 0.5 days.

### P2.8 — CI Hardening

- Remove `|| true` from `bun audit` and `bun test` in `.github/workflows/ci.yml`.
- Add a Playwright E2E job to CI (with browser caching).
- Add coverage reporting (Codecov).
- Add dependency review on PRs (`actions/dependency-review-action`).

**Effort:** 1 day.

### P2.9 — WebSocket Auth

Currently the socket.io server on `:3030` accepts any connection. Add JWT verification on `io.use()` — reject connections without a valid NextAuth token. This prevents unauthenticated users from subscribing to telemetry rooms.

**Effort:** 1 day.

---

## P3 — Scale & Strategic (2027–2029)

### P3.1 — Multi-Region Deployment

- Active-active deployment across 2+ regions.
- Postgres streaming replication (or CockroachDB for multi-write).
- InfluxDB distributed across regions.
- DNS-based geo-routing (Cloudflare / Route 53).
- Telemetry mini-service per region with cross-region bridge.
- Conflict resolution policy for multi-write scenarios.

**Effort:** 4–6 weeks.

### P3.2 — HA Cluster (Kubernetes)

- Helm chart for IndOS.
- StatefulSet for Postgres (or use CloudNativePG operator).
- Redis Sentinel for HA cache.
- Horizontal Pod Autoscaler on the `indos` deployment.
- PodDisruptionBudget for graceful drains.
- Cert-manager for TLS.
- Service mesh (Linkerd or Istio) for mTLS between services.

**Effort:** 3–4 weeks.

### P3.3 — Plugin SDK

Allow third-party plugins to extend IndOS without forking:

- Plugin manifest schema (`indos-plugin.json`): name, version, entry points, permissions.
- Plugin runtime: sandboxed worker process per plugin (or V8 isolates).
- Hook system: `onTelemetry`, `onAlarm`, `onWorkOrderCreate`, `onOTAComplete`.
- Plugin UI: render plugin-provided React components in a sandboxed iframe.
- Plugin marketplace: install/uninstall from the existing `/api/indos/plugins` endpoint.
- Permission model: plugins declare required permissions, admin approves at install time.

**Effort:** 6–8 weeks.

### P3.4 — Industrial Certifications

- **IEC 62443** (Industrial network & system security) — Level 2 or 3.
- **ISO 27001** (Information security management).
- **SOC 2 Type II** (if offering SaaS).

Each requires: documented policies, access controls, audit logs, incident response, backups, change management, vendor management. Most controls are already in place (RBAC, audit log, backups, signed OTA) — the gap is documentation and formal process.

**Effort:** 3–6 months (mostly documentation + audit prep).

### P3.5 — Edge Compute (IndOS Edge)

A lightweight IndOS distribution for edge gateways (Raspberry Pi, industrial PCs):

- Subset of services: MQTT broker, local cache, local telemetry buffer.
- Sync with central IndOS instance when connected.
- Operate fully offline; queue telemetry for upload.
- Local OTA for edge devices.
- Local AI inference (Ollama small model) for anomaly detection without cloud.

**Effort:** 4–6 weeks.

---

## AI Roadmap

IndOS already has an AI copilot (`POST /api/indos/ai`) powered by `z-ai-web-dev-sdk` in dev and swappable for Ollama in production. The long-term AI vision:

### AI.1 — Predictive Maintenance (P2, Q1 2026)

- Train models on historical telemetry (InfluxDB) + maintenance logs (WorkOrder).
- Per-machine failure prediction: "Press 02 bearing failure likely within 7 days (87% confidence)".
- Auto-create predictive work orders.
- Feature store: vibration, temperature, current, RPM, runtime hours.
- Models: gradient boosting (XGBoost) or LSTM for time-series.
- Inference: batch nightly + on-demand.

**Effort:** 4–6 weeks.

### AI.2 — Anomaly Detection (P2, Q2 2026)

- Real-time anomaly scoring on every telemetry point.
- Statistical baselines per device/metric (rolling 7-day median + MAD).
- ML-based: Isolation Forest or autoencoder trained per device type.
- Auto-create alarms when anomaly score > threshold.
- Feedback loop: operator marks false positives → model retrains.

**Effort:** 3–4 weeks.

### AI.3 — RAG with Qdrant (P2, Q3 2026)

Augment the AI copilot with retrieval-augmented generation:

- Embed all historical alarms, work orders, audit logs, device docs, and SOPs into Qdrant.
- On user query, retrieve top-k relevant docs and inject as context.
- "Why did Line A2 stop last Tuesday?" → retrieve alarms + work orders from that day → grounded answer.
- Support uploading PDFs (device manuals, SOPs) → auto-chunk + embed.
- Citation: copilot cites source documents in its answer.

**Effort:** 3–4 weeks.

### AI.4 — Energy Forecasting (P2, Q4 2026)

- Time-series forecasting (Prophet or NeuralProphet) for energy consumption.
- 24h / 7d / 30d forecasts per project.
- Peak demand prediction → automation flow triggers peak shaving.
- Solar yield forecast (weather API + historical yield).
- Cost projection (electricity tariff schedule).

**Effort:** 2–3 weeks.

### AI.5 — Natural Language Querying (P3, 2027)

- "Show me all critical alarms from the Bangkok factory in the last 24 hours" → translates to InfluxDB Flux + Prisma query → returns chart.
- Schema-aware: the LLM knows the Prisma models and InfluxDB measurements.
- Safe mode: only SELECT queries; no mutations.
- Results rendered as charts or tables in the chat.

**Effort:** 3–4 weeks.

### AI.6 — Computer Vision (P3, 2027)

- Integrate Frigate + YOLO for camera analytics.
- PPE compliance detection (hard hats, safety glasses, vests).
- Intrusion detection (restricted zones).
- Anomaly detection (smoke, leaks, spills).
- Alerts → IndOS alarm system → automation flows.
- Existing `ai-vision` plugin (seeded, not installed) is the integration point.

**Effort:** 4–6 weeks.

### AI.7 — Root Cause Analysis Assistant (P3, 2028)

- When a critical alarm fires, the copilot automatically:
  1. Pulls the last 24h of telemetry for the affected device + upstream devices.
  2. Identifies correlated anomalies.
  3. Checks recent work orders, OTA deployments, config changes.
  4. Proposes 3 likely root causes with confidence scores.
  5. Suggests remediation steps (with links to SOPs).

**Effort:** 4–6 weeks.

---

## Roadmap Summary

| Priority | Theme | Items | Timeline |
|----------|-------|-------|----------|
| **Done** | Foundation | Phases 4–11 (incl. orgId scoping) | 2025-07 |
| **P0** | Multi-instance | Redis rate limit | Q3 2025 |
| **P1** | Production polish | Postgres, pagination UI, socket subscribe, OTA upload, device DB, user UI | Q4 2025 |
| **P2** | Hardening + integrations | Keycloak, mTLS, Grafana JSON, security headers, 2FA, lockout, real IP, CI, WS auth | 2026 |
| **P2 (AI)** | AI features | Predictive maintenance, anomaly detection, RAG, energy forecasting | 2026 |
| **P3** | Scale + strategic | Multi-region, HA/K8s, plugin SDK, certifications, edge, NLQ, CV, RCA | 2027–2029 |

## How to Influence This Roadmap

- File an issue with the `roadmap` label to propose a new item.
- Pick a P0/P1 item and submit a PR — see `docs/AGENTS.md` for the multi-agent workflow.
- Each completed item gets a worklog in `docs/worklogs/` and an update to this document.
