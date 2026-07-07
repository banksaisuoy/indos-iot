import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'

/**
 * Phase 13 — production fail-fast for NEXTAUTH_SECRET.
 *
 * RISK: if the env var is unset in production, the app previously fell back to
 * a hard-coded dev secret, allowing session forgery. The fix in
 * `src/lib/auth-secret.ts` throws at module-load time in production.
 *
 * Because module caching pins the first resolved value, we isolate the
 * resolution logic by re-importing with a controlled NODE_ENV + NEXTAUTH_SECRET
 * per test. Vitest's module cache is reset between tests via `vi.resetModules()`.
 */

async function loadSecret(): Promise<string> {
  const mod = await import('@/lib/auth-secret')
  return mod.NEXTAUTH_SECRET
}

describe('NEXTAUTH_SECRET resolution (auth-secret.ts)', () => {
  beforeEach(() => {
    vi.resetModules()
  })
  afterEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  it('uses the env var when set (≥16 chars) in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXTAUTH_SECRET', 'a-very-secure-production-secret-32chars')
    expect(await loadSecret()).toBe('a-very-secure-production-secret-32chars')
  })

  it('THROWS in production when NEXTAUTH_SECRET is unset (fail-fast, no forgery)', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXTAUTH_SECRET', '')
    await expect(loadSecret()).rejects.toThrow(/NEXTAUTH_SECRET must be set/)
  })

  it('THROWS in production when NEXTAUTH_SECRET is too short (<16 chars)', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXTAUTH_SECRET', 'short')
    await expect(loadSecret()).rejects.toThrow(/NEXTAUTH_SECRET must be set/)
  })

  it('falls back to the dev secret in non-production (sandbox keeps working)', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXTAUTH_SECRET', '')
    expect(await loadSecret()).toBe('indos-dev-secret-change-in-production')
  })

  it('falls back to the dev secret when NODE_ENV is unset', async () => {
    vi.stubEnv('NODE_ENV', '')
    vi.stubEnv('NEXTAUTH_SECRET', '')
    expect(await loadSecret()).toBe('indos-dev-secret-change-in-production')
  })

  it('trims whitespace from the env var', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXTAUTH_SECRET', '  spaced-out-secret-value-16  ')
    expect(await loadSecret()).toBe('spaced-out-secret-value-16')
  })
})
