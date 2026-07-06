# IndOS — Testing Guide

> **Total: 55 tests** — 41 vitest unit + 14 Playwright E2E. All passing.
>
> Tests are the safety net for every phase. No phase is considered complete until `bun run lint`, `bunx tsc --noEmit`, `bun run test`, and `bun run test:e2e` all pass clean.

## Test Types

| Type | Runner | Purpose | Count | Speed |
|------|--------|---------|-------|-------|
| **Unit** | Vitest 4 | Test pure functions (auth, OTA signing, RBAC, rate limit, pagination, cache, schemas, InfluxDB fallback) in isolation | 41 | ~2s |
| **E2E** | Playwright 1.61 | Drive a real Chromium browser against a running dev server; verify login, navigation, RBAC (403), rate limit (429), pagination, auth (401), and public endpoints | 14 | ~30s |

## How to Run Each

### Unit tests

```bash
# Run all 41 unit tests once
bun run test
# → vitest run

# Watch mode (re-runs on file change — good for TDD)
bunx vitest

# Run a single test file
bunx vitest run src/lib/ota-signing.test.ts

# Run by test name pattern
bunx vitest run -t "rejects a tampered signature"

# Coverage report
bunx vitest run --coverage
```

### E2E tests

```bash
# Run all 14 E2E tests (auto-starts dev server if not running)
bun run test:e2e
# → playwright test

# Interactive UI mode (debug failing tests, step through, inspect DOM)
bun run test:e2e:ui

# Run a single test by name
bunx playwright test -g "Login success"

# Show browser (non-headless) — useful for debugging
bunx playwright test --headed

# Generate trace for failed tests (already enabled via config)
bunx playwright test --trace on

# View trace after a failure
bunx playwright show-trace test-results/.../trace.zip
```

### Lint + typecheck

```bash
# ESLint flat config
bun run lint

# TypeScript strict type-check (no emit)
bunx tsc --noEmit
```

### Run everything (pre-commit sanity check)

```bash
bun run lint && bunx tsc --noEmit && bun run test && bun run test:e2e
```

## Test File Locations

```
src/lib/
├── auth.test.ts                       5 tests  — bcrypt, auth contracts
├── ota-signing.test.ts                8 tests  — Ed25519 sign/verify, tamper, checksum, canonicalize
├── influx.test.ts                     3 tests  — availability, retention, fallback contract
├── rbac.test.ts                      12 tests  — roles, rate limits, pagination
├── cache.test.ts                      6 tests  — in-memory LRU + cached() wrapper
└── indos/
    └── schemas.test.ts                7 tests  — Zod schema validation
                                      ──────
                                      41 unit tests

tests/
└── e2e/
    └── indos.spec.ts                 14 tests  — Playwright browser flows
                                      ──────
                                      14 E2E tests

playwright.config.ts                   — Playwright config (Chromium, webServer auto-start)
vitest.config.ts                       — Vitest config
```

## What's Covered

### Unit tests (41)

| File | Tests | What's verified |
|------|-------|-----------------|
| `src/lib/auth.test.ts` | 5 | bcrypt hash + verify; salt uniqueness (same password → different hashes); 401 contract for unauth API; `/api/health` is public; all `/api/indos/*` require auth |
| `src/lib/ota-signing.test.ts` | 8 | Valid manifest builds + verifies; tampered signature rejected; tampered version rejected (signature doesn't match); `computeChecksum` produces `sha256:` + 64 hex chars; `verifyChecksum` rejects mismatched content; empty/invalid signature rejected; canonicalization is deterministic; downgrade protection is documented (device-side responsibility) |
| `src/lib/influx.test.ts` | 3 | `isInfluxAvailable()` returns boolean (false in dev without InfluxDB); retention policy is `90d` raw / `365d` downsampled; fallback contract documented (InfluxDB → SQLite) |
| `src/lib/rbac.test.ts` | 12 | Role hierarchy `admin > engineer > operator > viewer`; viewer cannot access admin routes (`/users`, `/audit`); viewer cannot write (`/projects`, `/ota`, `/firmware`, `/plugins`, `/workorders`, `/alarms`); operator can ack but not resolve alarms; 401 vs 403 contract; rate limit allows under threshold; rate limit blocks over threshold (429); rate limit presets (`ai:5`, `ota:10`, `firmware:10`, `write:30`, `read:120`); rate limit headers (`X-RateLimit-*`, `Retry-After`); pagination default 50 / max 100; paginated response shape `{items, nextCursor, hasMore}`; backward compat (flat array without `?paginated`) |
| `src/lib/cache.test.ts` | 6 | `set + get` round trip; `get` returns null for missing key; `del` removes key; `cached()` wrapper doesn't recompute on cache hit; TTL expires entries; `isRedisAvailable()` returns boolean |
| `src/lib/indos/schemas.test.ts` | 7 | `projectCreateSchema` rejects empty name; accepts valid project with category; `alarmPatchSchema` rejects invalid state; accepts `acknowledged`; `pluginActionSchema` rejects unknown action; `aiChatSchema` rejects empty messages; rejects `system` role |

### E2E tests (14) — `tests/e2e/indos.spec.ts`

| # | Test name | What it verifies |
|---|-----------|------------------|
| 1 | Login success — admin can log in | `admin@indos.io` / `indos123` → redirect to `/` → dashboard renders `Executive Dashboard` |
| 2 | Login failure — wrong password shows error | Wrong password → stays on `/login` → shows `invalid` |
| 3 | Unauthenticated user redirected to `/login` | Cleared cookies + GET `/` → 302 to `/login` |
| 4 | Dashboard loads after login | Dashboard renders with `LIVE` indicator |
| 5 | Devices page loads | Sidebar → Devices → main content renders |
| 6 | Alarms page loads | Sidebar → Alarm Center → main content renders |
| 7 | Viewer cannot access admin-only API | `viewer@indos.io` GET `/api/indos/users` → **403** |
| 8 | Admin can access admin-only API | `admin@indos.io` GET `/api/indos/users` → **200** |
| 9 | OTA page loads | Sidebar → OTA Firmware → main content renders |
| 10 | Pagination returns items + nextCursor | GET `/api/indos/devices?paginated=true&limit=5` → `{items, nextCursor, hasMore}` |
| 11 | Rate limit returns 429 after threshold | 8 rapid POST `/api/indos/ai` → at least one **429** (limit is 5/min) |
| 12 | API unauthenticated returns 401 | No cookie GET `/api/indos/overview` → **401** |
| 13 | Health endpoint is public | GET `/api/health` (no auth) → **200** `{ok: true}` |
| 14 | Metrics endpoint returns data | GET `/api/metrics` (no auth) → **200** with `uptime` field |

## How to Add New Tests

### Adding a unit test

1. **Create the test file** next to the source file, named `<source>.test.ts`:
   ```
   src/lib/my-new-thing.ts
   src/lib/my-new-thing.test.ts   ← here
   ```

2. **Write tests** using vitest's `describe` / `it` / `expect`:
   ```ts
   import { describe, it, expect } from 'vitest'
   import { myFunction } from '@/lib/my-new-thing'

   describe('myFunction', () => {
     it('does the right thing', () => {
       expect(myFunction('input')).toBe('expected output')
     })

     it('rejects bad input', () => {
       expect(() => myFunction('')).toThrow()
     })
   })
   ```

3. **Run it:**
   ```bash
   bunx vitest run src/lib/my-new-thing.test.ts
   ```

4. **For tests that need env vars** (like OTA signing), use `beforeAll`:
   ```ts
   import { beforeAll } from 'vitest'

   beforeAll(() => {
     process.env.OTA_SIGNING_PRIVATE_KEY = '<test-key>'
     process.env.OTA_SIGNING_PUBLIC_KEY = '<test-key>'
   })
   ```

### Adding an E2E test

1. **Open `tests/e2e/indos.spec.ts`** and add a new `test(...)` block. Use the existing `login()` helper:
   ```ts
   test('15. New view loads', async ({ page }) => {
     await login(page, ADMIN)
     await page.click('aside button:has-text("New View")')
     await page.waitForTimeout(2000)
     await expect(page.locator('main')).toContainText(/expected text/i)
   })
   ```

2. **For API tests**, reuse the cookie extraction pattern:
   ```ts
   test('16. New API behavior', async ({ page, request }) => {
     await login(page, ADMIN)
     const cookies = await page.context().cookies()
     const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ')
     const res = await request.get('/api/indos/new-endpoint', {
       headers: { Cookie: cookieHeader },
     })
     expect(res.status()).toBe(200)
   })
   ```

3. **Run it:**
   ```bash
   bunx playwright test -g "New view loads"
   ```

4. **Keep tests independent** — each test logs in fresh and clears cookies. Don't share state between tests.

### Conventions

- **Test IDs**: Use `#` suffix in test names for ordering (`1. Login success`, `2. Login failure`, …).
- **Wait strategy**: Prefer `waitForURL`, `expect(...).toContainText`, and `waitForResponse` over `waitForTimeout`. Use `waitForTimeout(2000)` only as a last resort for animations.
- **No shared state**: Each test starts with a clean browser context. Don't rely on a previous test's login.
- **Real credentials**: Use `admin@indos.io` / `indos123` (seeded). Don't create users in tests — the seed is the contract.
- **Single browser**: Only Chromium is configured (see `playwright.config.ts`). Adding Firefox/WebKit is a P2 item.

## CI Integration

The CI workflow at `.github/workflows/ci.yml` runs on every push/PR to `main`:

```yaml
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.1
      - run: bun install --frozen-lockfile
      - name: Lint
        run: bun run lint
      - name: Type check
        run: bunx tsc --noEmit
      - name: Build
        run: bun run build
        env:
          DATABASE_URL: "file:./ci-test.db"
          NEXTAUTH_SECRET: "ci-test-secret"

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - name: Audit dependencies
        run: bun audit || true      # ⚠️ non-blocking — P2: remove || true
      - name: Run tests
        run: bun test || true        # ⚠️ non-blocking — P2: remove || true
```

### CI gaps (P2 roadmap)

- [ ] Remove `|| true` from audit and test steps — make them blocking
- [ ] Add `bun run test:e2e` job (currently only `bun test` runs, which is vitest unit tests only)
- [ ] Add Playwright browser caching for faster CI
- [ ] Add coverage reporting (e.g., Codecov)
- [ ] Add dependency review on PRs

### Local pre-commit hook (recommended)

Add to `.husky/pre-commit` (install husky first):
```bash
#!/bin/sh
bun run lint || exit 1
bunx tsc --noEmit || exit 1
bun run test || exit 1
```

This catches issues before they reach CI.

## Test Credentials

All four seeded roles use the same password: **`indos123`**.

| Email | Role | Use case |
|-------|------|----------|
| `admin@indos.io` | admin | Full access — users, audit, firmware, OTA, plugins, projects, alarms |
| `engineer@indos.io` | engineer | Firmware register, OTA deploy, plugin install, project create, alarm resolve |
| `operator@indos.io` | operator | Work order create/update, alarm acknowledge |
| `viewer@indos.io` | viewer | Read-only — used in E2E test 7 to verify 403 on admin routes |

> **Production warning:** Change all four passwords immediately after deploying to production (see `DEPLOYMENT_CHECKLIST.md` step 6). The seed is a known public credential.

## Troubleshooting

### `bun run test` fails with "Cannot find module '@/lib/...'"

Vitest uses the `vite-tsconfig-paths` plugin to resolve `@/` aliases. Make sure `tsconfig.json` has `paths` configured and `vitest.config.ts` includes the plugin.

### `bun run test:e2e` fails with "webServer timeout"

The Playwright config waits up to 60s for `/api/health` to return 200. If the dev server is slow to start:
1. Check `dev.log` for errors
2. Make sure `bun run db:push` has been run (DB must exist)
3. Make sure `.env` has `DATABASE_URL` and `NEXTAUTH_SECRET`
4. Try starting the dev server manually first: `bun run dev`, then run `bunx playwright test`

### E2E test 11 (rate limit) is flaky

The AI rate limit is 5/min. The test fires 8 rapid requests and expects at least one 429. If the dev server has leftover tokens from a previous run, the test might fail. Wait 60 seconds and re-run, or restart the dev server.

### E2E test 7/8 (RBAC) fails with 200 instead of 403/200

Make sure the seed has been run (`bun run prisma db seed`). The `viewer@indos.io` user must exist with role `viewer` for test 7 to get 403.

### Playwright browser not installed

```bash
bunx playwright install chromium
# or: bunx playwright install --with-deps chromium
```

## Summary

| Check | Command | Expected |
|-------|---------|----------|
| Lint | `bun run lint` | 0 errors |
| Type-check | `bunx tsc --noEmit` | 0 errors |
| Unit tests | `bun run test` | 41/41 pass |
| E2E tests | `bun run test:e2e` | 14/14 pass |
| **Total** | — | **55/55 pass** |
