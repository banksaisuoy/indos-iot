# Phase 12-B — Real User & Organization Management

**Task ID:** `PHASE12-B-USER-ORG-MGMT`
**Agent:** full-stack-developer
**Status:** ✅ Complete
**Verification:** lint 0 / tsc 0 / vitest 81 pass / browser 6/6 scenarios / 3 screenshots

---

## Problem

The `organizations-view.tsx` had an "Invite User" dialog and a "New Organization" dialog that did **nothing** — clicking submit showed `toast.info('...demo-only')`. On a real deployment, an admin could not onboard their team or create tenants from the UI without running SQL. This was P1.6 in the roadmap and a hard blocker for production use.

## What Was Built

### 1. `POST /api/indos/users` (admin only)

File: `src/app/api/indos/users/route.ts`

- RBAC: `apiHandler('admin', RATE_LIMITS.write, ...)`
- Body: validated against `userCreateSchema` (zod) — `{ name (min 1), email (lowercased via transform), password (min 8), role (admin|engineer|operator|viewer), orgId? (string|null) }`
- Email uniqueness checked first → 409 `EMAIL_TAKEN` if exists
- If orgId provided, validates org exists → 400 `ORG_NOT_FOUND` if not
- Hashes password with `bcrypt.hashSync(password, 10)` (same algorithm as `auth.ts`)
- Creates user with `status: 'active'`
- Audit log: `{ actor: session.user.email, action: 'user.create', target: newEmail }`
- Returns 201 with created user (select clause omits `password`)

### 2. `PATCH /api/indos/users/[id]` (admin only)

File: `src/app/api/indos/users/[id]/route.ts`

- RBAC: `apiHandler('admin', RATE_LIMITS.write, ...)`
- Parses id from URL pathname (same pattern as `telemetry/[deviceId]`)
- Body: validated against `userUpdateSchema` — partial `{ name?, role?, status?, password?, orgId? }`
- **Safety rail 1**: `CANNOT_DISABLE_SELF` — admins cannot disable their own account (`session.user.id === id && status === 'disabled'` → 400)
- **Safety rail 2**: `LAST_ADMIN` — if target is currently admin AND the change would demote OR disable them, AND there are ≤1 active admins platform-wide → 400. Prevents the "lockout" foot-gun.
- Validates orgId existence when provided (defensive — UI never sends invalid orgIds)
- Hashes new password if provided
- Audit log: `{ actor: session.user.email, action: 'user.update', target: id }`
- Returns 200 with updated user (no password)

### 3. `POST /api/indos/orgs` (admin only)

File: `src/app/api/indos/orgs/route.ts`

- RBAC: `apiHandler('admin', RATE_LIMITS.write, ...)`
- Body: validated against `orgCreateSchema` — `{ name (min 1), type (operator|customer|integrator), industry?, country? }`
- Creates org with nullable industry/country
- Audit log: `{ actor: session.user.email, action: 'org.create', target: name }`
- Returns 201 with created org including `_count: { users: 0, projects: 0, customers: 0 }`

### 4. UI Wiring (`organizations-view.tsx`)

All five dialogs are now real:

| Dialog / Action | Method | Endpoint | Toast on success |
|---|---|---|---|
| Invite User | POST | `/api/indos/users` | `User "<email>" created` |
| New Organization | POST | `/api/indos/orgs` | `Organization "<name>" created` |
| Row → Disable / Enable | PATCH | `/api/indos/users/[id]` | `<email> is now <status>` |
| Row → Reset password… | PATCH | `/api/indos/users/[id]` | `Password reset for <email>` |
| Row → Change role… | PATCH | `/api/indos/users/[id]` | `<email> is now <role>` |

**Visibility rules (all driven by `useSession()`):**
- "New Organization" button — admin only
- "Invite User" button — admin only
- Row action dropdown — admin only AND not self (`isSelf = !!currentUserId && u.id === currentUserId`)
- Self-row shows "(you)" suffix on the name

**Form state** is held in `useState` per-dialog; submit handlers use `setXxxBusy(true/false)` for the spinner + `disabled={busy}` on the submit button (`<Loader2 className="animate-spin" />` + "Creating…/Saving…" label).

**Organization select** in the Invite dialog lists real orgs + a `— No org (platform-level) —` option (value `__none__` → empty string → backend transforms to null via the schema).

### 5. Zod Schemas (`src/lib/indos/schemas.ts`)

```ts
userCreateSchema  — name (min 1), email (lowercased), password (min 8), role (enum), orgId (optional, empty → null)
userUpdateSchema  — all optional: name, role, status (active|disabled), password (min 8), orgId (nullable)
orgCreateSchema   — name (min 1), type (enum), industry?, country?
```

---

## Critical Bug Caught & Fixed

### The orgId-null injection bug

The original `userUpdateSchema` used a `.transform()` on `orgId` to normalize empty strings to null:

```ts
// ORIGINAL (BUGGY)
orgId: z.string().optional().nullable().transform((s) => (s && s.trim() ? s : null))
```

This looked innocuous, but zod transforms **always produce a value** — when the field is missing from the input, the transform receives `undefined` and returns `null` (not `undefined`). So:

```ts
userUpdateSchema.safeParse({ role: 'engineer' })
// → { role: 'engineer', orgId: null }   ← BUG: orgId key present with value null
// (intended: { role: 'engineer' }       ← orgId key absent, value undefined)
```

The route handler's `if (orgId !== undefined) data.orgId = orgId` check then **passed for every PATCH**, silently setting the user's orgId to null. Concrete impact: every "Disable", "Enable", "Reset password", and "Change role" action would have side-effected the user into platform-level (orgId=null), breaking their org-scoped permissions.

### Fix

Removed the transform from `userUpdateSchema.orgId` (kept `z.string().max(200).optional().nullable()`), tightened the `.refine()` to check `Object.values(data).some((v) => v !== undefined)`, and moved the empty-string → null normalization into the route handler where it only runs when orgId is explicitly provided.

```ts
// FIXED
orgId: z.string().max(200).optional().nullable()
// ...
.refine(
  (data) => Object.values(data).some((v) => v !== undefined),
  { message: 'At least one field must be provided for update' },
)
```

The `userCreateSchema.orgId` transform is correct as-is (orgId is the only optional field there, and missing → null is the intended behavior for create).

### Regression test

The unit test "CRITICAL: does NOT inject orgId=null when orgId is missing" locks this fix:

```ts
it('CRITICAL: does NOT inject orgId=null when orgId is missing', () => {
  const r = userUpdateSchema.safeParse({ role: 'engineer' })
  expect(r.success).toBe(true)
  if (r.success) {
    expect(r.data.orgId).toBeUndefined()
    expect('orgId' in r.data).toBe(false)
  }
})
```

---

## Verification

### Automated

| Check | Result |
|---|---|
| `bun run lint` | ✅ 0 errors |
| `bunx tsc --noEmit` | ✅ 0 errors |
| `bunx vitest run` | ✅ 81/81 pass (57 existing + 24 new schema tests) |

### Browser (agent-browser)

All 6 spec scenarios confirmed:

1. ✅ Admin invites `field.test@indos.io` / `test12345` (engineer, Acme Industries) → POST returns **201**, new row appears in table immediately. Toast `User "field.test@indos.io" created`. Screenshot: `shot-phase12b-invite.png`.
2. ✅ **New user can log in** with their initial password — PROVES bcrypt hashing works end-to-end. `[auth] ✅ Login successful: field.test@indos.io role: engineer orgId: org-acme` in dev.log. Topbar shows "TF Test Field Engineer Engineer". Screenshot: `shot-phase12b-newlogin.png`.
3. ✅ Admin disables field.test → PATCH 200, status flips to "Disabled" → field.test can no longer log in (`[auth] ❌ User inactive or no password`, 401) → admin re-enables → status back to "Active".
4. ✅ Admin creates "Test Tenant Co" (customer, Logistics, Thailand) → POST returns **201**, org card appears with 0/0/0 counts. Toast `Organization "Test Tenant Co" created`. Screenshot: `shot-phase12b-users.png`.
5. ✅ As `engineer@acme.io` (non-admin): "Invite User" button HIDDEN, "New Organization" button HIDDEN, row action dropdowns HIDDEN. The roles/permissions matrix remains visible (informational).
6. ✅ `agent-browser errors` reported empty (no console errors throughout).

### Audit trail

Every create/update writes to the `AuditLog` table:
- `user.create` — actor: admin email, target: new user email
- `user.update` — actor: admin email, target: user id
- `org.create` — actor: admin email, target: org name

---

## Files Changed

| File | Status | Notes |
|---|---|---|
| `src/lib/indos/schemas.ts` | MODIFIED | Fixed `userUpdateSchema` orgId-null injection bug; tightened refine; added explanatory comment block. `userCreateSchema` + `orgCreateSchema` unchanged (already correct). |
| `src/app/api/indos/users/[id]/route.ts` | MODIFIED | Added defensive empty-string → null normalization for orgId; clearer comments documenting the three valid input shapes (undefined/null/string). |
| `src/lib/indos/schemas.test.ts` | MODIFIED | +24 new tests (7 userCreate + 10 userUpdate + 6 orgCreate). Includes "CRITICAL" regression test for the orgId-null bug. Existing 7 tests untouched. |
| `docs/worklogs/PHASE_12_B_USER_ORG_MGMT.md` | NEW | This file. |
| `agent-ctx/PHASE12-B-USER-ORG-MGMT-full-stack-developer.md` | NEW | Agent work record. |
| `shot-phase12b-invite.png` | NEW | Browser screenshot — admin inviting a new user. |
| `shot-phase12b-newlogin.png` | NEW | Browser screenshot — newly-created user successfully logged in. |
| `shot-phase12b-users.png` | NEW | Browser screenshot — Organizations view with Test Tenant Co created. |

### Pre-existing files (confirmed spec-compliant, NOT modified)

These were already in place from a prior partial pass — reviewed line-by-line against the spec, no changes needed:

- `src/app/api/indos/users/route.ts` (GET + POST)
- `src/app/api/indos/orgs/route.ts` (GET + POST)
- `src/components/indos/views/organizations-view.tsx` (all 5 dialogs + row dropdown wired)

---

## Test Data Left In DB

For proof-of-work and downstream agent convenience, the following test records remain in the database (referenced in screenshots):

- User: `field.test@indos.io` / `test12345` (engineer, Acme Industries, Active)
- Org: `Test Tenant Co` (customer, Logistics, Thailand)

Downstream agents can delete these via SQL if they interfere:

```sql
DELETE FROM User WHERE email = 'field.test@indos.io';
DELETE FROM Organization WHERE name = 'Test Tenant Co';
```

---

## Constraints Honored

- ✅ Used only existing shadcn/ui components (Dialog, Input, Select, Label, DropdownMenu, Button)
- ✅ bcryptjs already a dependency — no new npm deps installed
- ✅ Did NOT modify `page.tsx`, `topbar.tsx`, `realtime.ts`, `alarms-view.tsx`, `devices-view.tsx`, `settings-view.tsx`, or any other agent's files
- ✅ Did NOT touch `/api/indos/alarms/bulk-ack`
- ✅ OrgId scoping from Phase 11 intact (admin is cross-org, can create users in any org or null)
- ✅ Footer stays sticky (untouched)
- ✅ TypeScript strict (tsc --noEmit clean)
- ✅ Existing tests pass (57/57 + 24 new = 81/81)

---

## Impact

The IndOS platform now supports **real team onboarding and tenant provisioning** from the UI — no SQL required. An admin can:

1. Provision a new tenant (Organization) with industry + country metadata.
2. Invite team members with pre-assigned roles and an initial password.
3. Reset passwords, change roles, and disable/enable accounts — all with audit logging.
4. Trust that the platform cannot be locked out (last-admin protection + cannot-disable-self).
5. Trust that org-scoped permissions cannot be silently corrupted (the orgId-null injection bug is fixed + regression-tested).

P1.6 in the roadmap is complete. IndOS is one step closer to production-ready.
