import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler } from '@/lib/api'
import { apiHandler, RATE_LIMITS } from '@/lib/api-handler'
import { orgScope, isOrgScoped } from '@/lib/org-scope'

// GET: List users
// P0.1: admins (cross-org) and platform users (null orgId) see ALL users.
// Org-scoped admins are NOT a thing (admin role = cross-org by design).
// Org-scoped engineers/operators/viewers see only users in their own org.
//
// Note: the RBAC gate is 'admin' so in practice only admins reach this handler.
// The orgScope check below is a defensive guard for org-scoped admins (rare).
export const GET = withErrorHandler(apiHandler('admin', RATE_LIMITS.read, async (_req, session) => {
  // Admins (role=admin) bypass scoping — they are cross-org by design.
  // Users with null orgId (platform-level) also bypass — backward compat.
  // Any other admin with an orgId (defensive) gets scoped to their org.
  const where = isOrgScoped(session) ? orgScope(session) : {}
  const u = await db.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: { id: true, email: true, name: true, role: true, status: true, twoFA: true, lastLogin: true, createdAt: true, org: { select: { name: true } } },
  })
  return NextResponse.json(u)
}))
