# Phase 14 — Multi-Tenant Hardening (Phase 11 Follow-ups)

**Task ID:** PHASE14-MULTI-TENANT-HARDENING
**Agent:** orchestrator (main)
**Date:** 2025-07-07
**Status:** ✅ Complete

## Summary

Closes the four P1 follow-ups that Phase 11 explicitly deferred. IndOS is now a
**complete multi-tenant platform**: every tenant-scoped data surface is org-isolated,
the MQTT broker namespaces topics per org, and the org-scoping contract is locked
by E2E tests.

## What Was Built

### 1. AuditLog orgId (was: self-only for non-admins)

**Problem:** AuditLog had no `orgId` column. Phase 11 fell back to "non-admins see
only their own entries (actor === email)" — so an org member couldn't see a
colleague's actions, breaking the compliance posture for a multi-tenant SaaS.

**Fix:**
- `prisma/schema.prisma` — added `orgId String?` to `AuditLog` + `@@index([orgId])`.
- `src/lib/auth.ts` — login audit log now writes `orgId: user.orgId`.
- `src/app/api/indos/audit/route.ts` — uses `orgScope(session)` instead of the
  self-only fallback. Non-admins now see ALL entries in their org (including
  colleagues'), not just their own.
- `src/app/api/indos/{alarms/bulk-ack,ota,firmware}/route.ts` — audit log writes
  now include `orgId: getOrgId(session) ?? null`. Admin actions (user/org
  management) stay `orgId: null` (platform-level).

### 2. orgId on Firmware / OtaJob / Gateway / Camera (was: platform-level)

**Problem:** These 4 models had no `orgId` — every tenant saw every firmware
binary, every OTA job, every gateway/camera. Fine for single-tenant; wrong for
multi-tenant SaaS.

**Fix:**
- `prisma/schema.prisma` — added nullable `orgId String?` to `Firmware`, `OtaJob`,
  `Gateway`, `Camera` + `@@index([orgId])` on each. Nullable = platform-shared
  (visible to all orgs); set = org-private.
- `src/lib/org-scope.ts` — new `orgScopeWithPlatform(session)` helper returns
  `{ OR: [{ orgId: null }, { orgId: <callerOrgId> }] }` for org-scoped users
  (sees platform + own org) or `{}` for admins/platform (sees all).
- `src/app/api/indos/firmware/route.ts` — GET scoped via `orgScopeWithPlatform`;
  POST stamps `orgId: getOrgId(session) ?? null` on the created firmware.
- `src/app/api/indos/ota/route.ts` — GET scoped; POST stamps orgId on the job.
- `src/app/api/indos/gateways/route.ts` — GET scoped.
- `src/app/api/indos/cameras/route.ts` — GET scoped.
- `prisma/seed.ts` — added 1 Acme-owned gateway + 1 Acme-owned camera (plus the
  existing platform-shared ones) so scoping is testable.

### 3. MQTT topic namespacing (was: flat `indos/devices/...`)

**Problem:** Two orgs publishing to `indos/devices/{username}/telemetry` shared
one flat topic space. ACL was per-username but a misconfiguration could leak
cross-org data.

**Fix:**
- `mini-services/telemetry/index.ts`:
  - `DeviceCredential` interface gained `orgId?: string | null`.
  - `broker.authenticate` stores `client.deviceOrgId` from the credential.
  - `authorizePublish` / `authorizeSubscribe` now build the topic prefix as
    `indos/{orgId}/devices/{username}` for org-scoped devices, or the legacy
    `indos/devices/{username}` for platform devices. A device may ONLY
    publish/subscribe inside its own namespace.
- `mosquitto-acl.conf` — added the org-namespaced patterns
  (`indos/+/devices/%u/...`) alongside the legacy patterns for operators who
  run mosquitto instead of aedes.
- `src/components/indos/views/deployment-view.tsx` — MQTT topic schema table
  updated to show `indos/[{orgId}/]devices/{id}/...` with a note explaining
  when the orgId segment is present.

### 4. E2E org-scoping tests (was: 14 tests, none covered org isolation)

**Problem:** Phase 11's 14 Playwright tests passed but didn't assert org-scoping.
A regression that leaked cross-org data wouldn't be caught.

**Fix:** `tests/e2e/indos.spec.ts` — added 8 E2E tests (15–22):
- 15. Acme engineer login succeeds
- 16. Acme engineer sees only 3 Acme devices (not Demo Factory's 5)
- 17. Admin sees all 8 devices (both orgs)
- 18. Acme engineer sees only Acme Plant A project
- 19. Acme engineer sees only Acme Industries org
- 20. Acme engineer sees platform + Acme gateways (2, not other-org)
- 21. Acme engineer POST /users → 403 (admin-gate server-side)
- 22. Acme engineer POST /orgs → 403

Plus 7 unit tests in `src/lib/rbac.test.ts` for `orgScope` + `orgScopeWithPlatform`
covering admin / platform-user / org-scoped / null-session branches.

## Verification

| Check | Result |
|---|---|
| `bunx tsc --noEmit` | ✅ 0 errors |
| `bun run lint` | ✅ 0 errors |
| `bunx vitest run` | ✅ 112/112 pass (105 existing + 7 new orgScope tests) |
| curl: engineer GET /gateways | 2 (GW-ACME-01 + GW-DEMO-01 platform) ✓ |
| curl: engineer GET /cameras | 2 (CAM-ACME-01 + CAM-DEMO-01 platform) ✓ |
| curl: engineer GET /audit | org-acme entries (not self-only) ✓ |
| Browser: engineer Gateways view | 2 rows, no console errors ✓ |

## Files Changed

**Schema:**
- `prisma/schema.prisma` — orgId added to AuditLog, Firmware, OtaJob, Gateway, Camera (+ indexes)

**Lib:**
- `src/lib/org-scope.ts` — new `orgScopeWithPlatform()` helper
- `src/lib/rbac.test.ts` — +7 unit tests for orgScope / orgScopeWithPlatform

**API routes:**
- `src/app/api/indos/audit/route.ts` — orgScope (was self-only)
- `src/app/api/indos/firmware/route.ts` — orgScopeWithPlatform on GET + stamp orgId on POST
- `src/app/api/indos/ota/route.ts` — orgScopeWithPlatform on GET + stamp orgId on POST
- `src/app/api/indos/gateways/route.ts` — orgScopeWithPlatform
- `src/app/api/indos/cameras/route.ts` — orgScopeWithPlatform
- `src/app/api/indos/alarms/bulk-ack/route.ts` — audit log writes orgId
- `src/lib/auth.ts` — login audit log writes orgId

**MQTT:**
- `mini-services/telemetry/index.ts` — org-namespaced topic ACL
- `mosquitto-acl.conf` — org-namespaced patterns

**UI:**
- `src/components/indos/views/deployment-view.tsx` — topic schema table updated

**Seed:**
- `prisma/seed.ts` — Acme-owned gateway + camera

**Tests:**
- `tests/e2e/indos.spec.ts` — +8 E2E org-scoping tests (15–22)

## Backward Compatibility

- All new `orgId` columns are **nullable** — existing rows get `null` (platform-level),
  visible to everyone. No data migration required.
- Platform devices (no orgId in `devices.json`) keep the legacy flat topic space
  `indos/devices/{username}/...`. Only org-scoped devices use the new namespaced form.
- Admin role and null-orgId users bypass all scoping — single-tenant deployments
  continue to work unchanged.

## What's Now Complete (vs Phase 11 deferred list)

| Phase 11 follow-up | Phase 14 status |
|---|---|
| 1. AuditLog has no orgId column | ✅ Fixed — org-scoped users see their whole org's audit trail |
| 2. Firmware/OTA/Gateways/Cameras have no orgId | ✅ Fixed — nullable orgId + orgScopeWithPlatform scoping |
| 3. MQTT topic namespacing | ✅ Fixed — `indos/{orgId}/devices/...` for org-scoped devices |
| 4. E2E test for org scoping | ✅ Fixed — 8 E2E tests + 7 unit tests lock the contract |

IndOS is now a **complete multi-tenant platform** — no deferred org-isolation items remain.
