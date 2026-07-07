import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireRole, type Role } from '@/lib/rbac'
import { applyRateLimit, type RateLimitConfig, RATE_LIMITS } from '@/lib/rate-limit'

/**
 * Combined auth + RBAC + rate-limit guard for API routes.
 *
 * The handler receives the authenticated `session` as its 2nd argument.
 * `session.user.orgId` is now propagated end-to-end (P0.1) so handlers can
 * scope Prisma queries per-tenant. Use the `orgScope(session)` /
 * `scopedProjectFilter(session, slug)` helpers from `@/lib/org-scope` for
 * list endpoints — admins and platform-level users (null orgId) bypass
 * scoping and see everything (backward-compatible).
 *
 * Usage:
 *   export const POST = apiHandler('engineer', RATE_LIMITS.write, async (req, session) => {
 *     // your handler — session is guaranteed non-null, role is verified
 *     // P0.1: scope reads via orgScope(session)
 *   })
 *
 *   export const GET = apiHandler('viewer', RATE_LIMITS.read, async (req, session) => {
 *     const where = { ...orgScope(session), ...otherFilters }
 *     // read-only — any authenticated user, scoped to their org
 *   })
 */
export function apiHandler(
  minRole: Role,
  rateLimit: RateLimitConfig,
  handler: (req: NextRequest, session: any) => Promise<NextResponse | Response>
) {
  return async (req: NextRequest): Promise<NextResponse | Response> => {
    // 1. Get session
    const session = await getServerSession(authOptions)

    // 2. RBAC check
    const denied = requireRole(session, minRole)
    if (denied) return denied

    // 3. Rate limit (keyed by user email)
    const rateKey = `${session!.user!.email}:${req.nextUrl.pathname}`
    const limited = applyRateLimit(rateKey, rateLimit)
    if (limited) return limited

    // 4. Run handler
    return handler(req, session)
  }
}

/**
 * Simple auth-only handler (no role check, just require authentication).
 */
export function authedHandler(
  rateLimit: RateLimitConfig,
  handler: (req: NextRequest, session: any) => Promise<NextResponse | Response>
) {
  return async (req: NextRequest): Promise<NextResponse | Response> => {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Authentication required' }, { status: 401 })
    }
    const rateKey = `${session.user!.email}:${req.nextUrl.pathname}`
    const limited = applyRateLimit(rateKey, rateLimit)
    if (limited) return limited
    return handler(req, session)
  }
}

export { RATE_LIMITS }
