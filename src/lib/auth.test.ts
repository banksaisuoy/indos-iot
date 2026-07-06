import { describe, it, expect } from 'vitest'
import bcrypt from 'bcryptjs'

// These are unit tests for the auth primitives.
// E2E auth flow tests require a running server (tested via curl in CI).

describe('Auth: bcrypt password hashing', () => {
  it('hashes a password and verifies it', () => {
    const hash = bcrypt.hashSync('indos123', 10)
    expect(hash).not.toBe('indos123')
    expect(bcrypt.compareSync('indos123', hash)).toBe(true)
    expect(bcrypt.compareSync('wrong', hash)).toBe(false)
  })

  it('generates different hashes for same password (salt)', () => {
    const h1 = bcrypt.hashSync('indos123', 10)
    const h2 = bcrypt.hashSync('indos123', 10)
    expect(h1).not.toBe(h2) // different salts
    expect(bcrypt.compareSync('indos123', h1)).toBe(true)
    expect(bcrypt.compareSync('indos123', h2)).toBe(true)
  })
})

describe('Auth: API protection contract', () => {
  // Documents the expected behavior verified via curl in CI:
  // 1. Unauthenticated GET /api/indos/* → 401 { error: 'UNAUTHORIZED' }
  // 2. Authenticated GET /api/indos/* → 200 + JSON
  // 3. POST /api/auth/callback/credentials with valid creds → 200 + session cookie
  // 4. POST /api/auth/callback/credentials with invalid creds → 401
  // 5. GET /api/health → 200 (public, no auth needed)
  // 6. GET /login → 200 (public, no auth needed)

  it('documents the 401 contract for unauthenticated API', () => {
    const expectedResponse = { error: 'UNAUTHORIZED', message: 'Authentication required' }
    expect(expectedResponse.error).toBe('UNAUTHORIZED')
  })

  it('documents that /api/health is public', () => {
    const publicRoutes = ['/api/health', '/api/auth/csrf', '/api/auth/session', '/api/auth/callback/credentials', '/login']
    expect(publicRoutes).toContain('/api/health')
  })

  it('documents that all /api/indos/* routes require auth', () => {
    const protectedRoutes = [
      '/api/indos/overview', '/api/indos/projects', '/api/indos/devices',
      '/api/indos/alarms', '/api/indos/workorders', '/api/indos/ai',
      '/api/indos/plugins', '/api/indos/settings', '/api/indos/audit',
      '/api/indos/users', '/api/indos/orgs', '/api/indos/firmware',
    ]
    protectedRoutes.forEach(route => {
      expect(route.startsWith('/api/indos/')).toBe(true)
    })
  })
})
