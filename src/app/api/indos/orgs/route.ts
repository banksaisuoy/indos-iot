import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler } from '@/lib/api'
import { apiHandler, RATE_LIMITS } from '@/lib/api-handler'
import { isOrgScoped } from '@/lib/org-scope'

// GET: List organizations
// P0.1: admins / platform users (null orgId) see ALL orgs.
// Org-scoped users see ONLY their own org.
export const GET = withErrorHandler(apiHandler('viewer', RATE_LIMITS.read, async (_req, session) => {
  const where = isOrgScoped(session)
    ? { id: (session.user as any).orgId as string }
    : {}
  return NextResponse.json(
    await db.organization.findMany({
      where,
      include: { _count: { select: { users: true, projects: true, customers: true } } },
    })
  )
}))
