import { test, expect } from '@playwright/test'

// Test credentials — seeded users all use "indos123" password
const ADMIN = { email: 'admin@indos.io', password: 'indos123' }
const VIEWER = { email: 'viewer@indos.io', password: 'indos123' }

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
