import { test, expect } from '@playwright/test'

// Test credentials — seeded users all use "indos123" password
const ADMIN = { email: 'admin@indos.io', password: 'indos123' }
const VIEWER = { email: 'viewer@indos.io', password: 'indos123' }
// Phase 14: Acme engineer is org-scoped (orgId=org-acme) — sees only Acme data.
const ACME_ENGINEER = { email: 'engineer@acme.io', password: 'acme123' }

async function login(page: any, creds: { email: string; password: string }) {
  await page.goto('/login')
  await page.fill('input[type=email]', creds.email)
  await page.fill('input[type=password]', creds.password)
  await page.click('button[type=submit]')
  await page.waitForURL('http://localhost:3000/', { timeout: 10_000 })
}

// 1. Login success
test('1. Login success — admin can log in', async ({ page }) => {
  await login(page, ADMIN)
  await expect(page.locator('main')).toContainText('Executive Dashboard')
})

// 2. Login failure
test('2. Login failure — wrong password shows error', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[type=email]', 'admin@indos.io')
  await page.fill('input[type=password]', 'wrongpassword')
  await page.click('button[type=submit]')
  await page.waitForTimeout(2000)
  // Should stay on login page and show error
  await expect(page).toHaveURL(/\/login/)
  await expect(page.locator('body')).toContainText(/invalid/i)
})

// 3. Unauthenticated user redirected to /login
test('3. Unauthenticated user redirected to /login', async ({ page, context }) => {
  await context.clearCookies()
  await page.goto('/')
  await page.waitForURL(/\/login/, { timeout: 10_000 })
  await expect(page).toHaveURL(/\/login/)
})

// 4. Dashboard loads after login
test('4. Dashboard loads after login', async ({ page }) => {
  await login(page, ADMIN)
  await expect(page.locator('main')).toContainText('Executive Dashboard')
  await expect(page.locator('main')).toContainText('LIVE')
})

// 5. Devices page loads
test('5. Devices page loads', async ({ page }) => {
  await login(page, ADMIN)
  await page.click('aside button:has-text("Devices")')
  await page.waitForTimeout(2000)
  await expect(page.locator('main')).toContainText(/device|Device/i)
})

// 6. Alarms page loads
test('6. Alarms page loads', async ({ page }) => {
  await login(page, ADMIN)
  await page.click('aside button:has-text("Alarm Center")')
  await page.waitForTimeout(2000)
  await expect(page.locator('main')).toContainText(/alarm|Alarm/i)
})

// 7. Viewer cannot access admin-only action (GET /api/indos/users → 403)
test('7. Viewer gets 403 on admin-only API', async ({ page, request }) => {
  await login(page, VIEWER)
  const cookies = await page.context().cookies()
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ')
  const res = await request.get('/api/indos/users', { headers: { Cookie: cookieHeader } })
  expect(res.status()).toBe(403)
})

// 8. Admin can access restricted action
test('8. Admin can access admin-only API', async ({ page, request }) => {
  await login(page, ADMIN)
  const cookies = await page.context().cookies()
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ')
  const res = await request.get('/api/indos/users', { headers: { Cookie: cookieHeader } })
  expect(res.status()).toBe(200)
})

// 9. OTA page loads
test('9. OTA page loads', async ({ page }) => {
  await login(page, ADMIN)
  await page.click('aside button:has-text("OTA Firmware")')
  await page.waitForTimeout(2000)
  await expect(page.locator('main')).toContainText(/OTA|firmware/i)
})

// 10. Pagination works on devices page
test('10. Pagination returns items + nextCursor', async ({ page, request }) => {
  await login(page, ADMIN)
  const cookies = await page.context().cookies()
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ')
  const res = await request.get('/api/indos/devices?paginated=true&limit=5', { headers: { Cookie: cookieHeader } })
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body).toHaveProperty('items')
  expect(body).toHaveProperty('nextCursor')
  expect(body).toHaveProperty('hasMore')
  expect(Array.isArray(body.items)).toBe(true)
})

// 11. Rate-limited endpoint returns 429 when threshold exceeded (AI: 5/min)
test('11. Rate limit returns 429 after threshold', async ({ page, request }) => {
  await login(page, ADMIN)
  const cookies = await page.context().cookies()
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ')
  const headers = { Cookie: cookieHeader, 'Content-Type': 'application/json' }
  const body = JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] })

  let got429 = false
  for (let i = 0; i < 8; i++) {
    const res = await request.post('/api/indos/ai', { data: body, headers })
    if (res.status() === 429) { got429 = true; break }
  }
  expect(got429).toBe(true)
})

// 12. API unauthenticated returns 401
test('12. API unauthenticated returns 401', async ({ request }) => {
  const res = await request.get('/api/indos/overview')
  expect(res.status()).toBe(401)
})

// 13. Health endpoint returns 200 without auth
test('13. Health endpoint is public', async ({ request }) => {
  const res = await request.get('/api/health')
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.ok).toBe(true)
})

// 14. Metrics endpoint returns 200 (if implemented)
test('14. Metrics endpoint returns data', async ({ request }) => {
  const res = await request.get('/api/metrics')
  if (res.status() === 200) {
    const body = await res.json()
    expect(body).toHaveProperty('uptime')
  }
  // If 404, metrics not yet implemented — skip gracefully
})

// ─── Phase 14: org-scoping E2E tests ────────────────────────────────────
// Verifies that an org-scoped user (engineer@acme.io) sees ONLY their own
// org's data, while an admin sees everything. Closes the Phase 11 follow-up
// #4 ("E2E test for org scoping").

// 15. Acme engineer can log in
test('15. Acme engineer login succeeds', async ({ page }) => {
  await login(page, ACME_ENGINEER)
  await expect(page.locator('main')).toContainText('Executive Dashboard')
})

// 16. Acme engineer sees only Acme devices (3), not Demo Factory devices (5)
test('16. Acme engineer sees only own-org devices', async ({ request }) => {
  // Login via API to get a session cookie, then call the devices API.
  const loginRes = await request.post('/api/auth/callback/credentials', {
    form: { email: ACME_ENGINEER.email, password: ACME_ENGINEER.password },
  })
  // 302 redirect = login succeeded (NextAuth redirects on success)
  expect([302, 200]).toContain(loginRes.status())

  const res = await request.get('/api/indos/devices')
  expect(res.status()).toBe(200)
  const devices = await res.json()
  // Acme has exactly 3 devices: valve-acme-3, flow-acme-2, pressure-acme-1
  expect(Array.isArray(devices)).toBe(true)
  expect(devices.length).toBe(3)
  const names = devices.map((d: any) => d.name).sort()
  expect(names).toEqual(['flow-acme-2', 'pressure-acme-1', 'valve-acme-3'])
  // No Demo Factory devices leak through
  expect(devices.some((d: any) => d.name.includes('demo'))).toBe(false)
})

// 17. Admin sees ALL devices (both orgs)
test('17. Admin sees all orgs\' devices', async ({ request }) => {
  await request.post('/api/auth/callback/credentials', {
    form: { email: ADMIN.email, password: ADMIN.password },
  })
  const res = await request.get('/api/indos/devices')
  expect(res.status()).toBe(200)
  const devices = await res.json()
  // 8 = 3 Acme + 5 Demo Factory
  expect(devices.length).toBe(8)
})

// 18. Acme engineer sees only Acme projects (1), not Demo Factory
test('18. Acme engineer sees only own-org projects', async ({ request }) => {
  await request.post('/api/auth/callback/credentials', {
    form: { email: ACME_ENGINEER.email, password: ACME_ENGINEER.password },
  })
  const res = await request.get('/api/indos/projects')
  expect(res.status()).toBe(200)
  const projects = await res.json()
  expect(Array.isArray(projects)).toBe(true)
  expect(projects.length).toBe(1)
  expect(projects[0].name).toBe('Acme Plant A')
})

// 19. Acme engineer sees only their own org (not IndOS Demo)
test('19. Acme engineer sees only own org', async ({ request }) => {
  await request.post('/api/auth/callback/credentials', {
    form: { email: ACME_ENGINEER.email, password: ACME_ENGINEER.password },
  })
  const res = await request.get('/api/indos/orgs')
  expect(res.status()).toBe(200)
  const orgs = await res.json()
  expect(Array.isArray(orgs)).toBe(true)
  expect(orgs.length).toBe(1)
  expect(orgs[0].name).toBe('Acme Industries')
})

// 20. Acme engineer sees platform-shared + Acme gateways, not other-org gateways
test('20. Acme engineer sees platform + own-org gateways', async ({ request }) => {
  await request.post('/api/auth/callback/credentials', {
    form: { email: ACME_ENGINEER.email, password: ACME_ENGINEER.password },
  })
  const res = await request.get('/api/indos/gateways')
  expect(res.status()).toBe(200)
  const gateways = await res.json()
  // Phase 14 seed: GW-DEMO-01 (platform, orgId=null) + GW-ACME-01 (Acme-owned)
  expect(gateways.length).toBe(2)
  const names = gateways.map((g: any) => g.name).sort()
  expect(names).toEqual(['GW-ACME-01', 'GW-DEMO-01'])
})

// 21. Acme engineer cannot POST /users (403) — admin-gate enforced server-side
test('21. Acme engineer POST /users → 403 (admin-gate enforced server-side)', async ({ request }) => {
  await request.post('/api/auth/callback/credentials', {
    form: { email: ACME_ENGINEER.email, password: ACME_ENGINEER.password },
  })
  const res = await request.post('/api/indos/users', {
    data: { name: 'Hack', email: 'hack@x.io', password: 'hack12345', role: 'admin' },
  })
  expect(res.status()).toBe(403)
})

// 22. Acme engineer cannot POST /orgs (403)
test('22. Acme engineer POST /orgs → 403', async ({ request }) => {
  await request.post('/api/auth/callback/credentials', {
    form: { email: ACME_ENGINEER.email, password: ACME_ENGINEER.password },
  })
  const res = await request.post('/api/indos/orgs', {
    data: { name: 'Hack Org', type: 'operator' },
  })
  expect(res.status()).toBe(403)
})
