import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler } from '@/lib/api'
import { apiHandler, RATE_LIMITS } from '@/lib/api-handler'
import { orgScopeWithPlatform } from '@/lib/org-scope'

// GET: List gateways (any authenticated user)
// Phase 14: Gateway has a nullable orgId. Org-scoped users see platform-shared
// (orgId=null) gateways PLUS their own org's gateways. Admins see all.
export const GET = withErrorHandler(apiHandler('viewer', RATE_LIMITS.read, async (_req, session) => {
  const where = orgScopeWithPlatform(session)
  return NextResponse.json(await db.gateway.findMany({ where, orderBy: { name: 'asc' } }))
}))
