import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler } from '@/lib/api'
import { apiHandler, RATE_LIMITS } from '@/lib/api-handler'
import { parsePaginationParams, cursorPaginate } from '@/lib/pagination'
import { orgScope, isOrgScoped } from '@/lib/org-scope'

// GET: Audit log — open to any authenticated user (was admin-only pre-Phase 11).
//
// Phase 14 multi-tenant scoping (AuditLog now has an orgId column):
//   - Admins (cross-org) and platform users (null orgId) see ALL audit entries.
//   - Org-scoped users see ALL entries in their own org (orgId === session.user.orgId),
//     including other users' actions — true per-org audit visibility.
//   - Entries with orgId = null (platform-level: admin actions, pre-org logins)
//     are visible only to admins / platform users, NOT to org-scoped users.
//
// Pre-Phase 14 limitation (self-only for non-admins) is lifted — org members
// can now audit each other's actions within their org, which is the correct
// compliance posture for a multi-tenant SaaS.
export const GET = withErrorHandler(apiHandler('viewer', RATE_LIMITS.read, async (req, session) => {
  const { cursor, limit, paginated } = parsePaginationParams(req)

  // orgScope returns { orgId } for org-scoped users (filter by their org),
  // or {} for admins/platform (see everything including orgId=null entries).
  const where = orgScope(session)

  if (paginated) {
    // AuditLog uses `ts` not `createdAt` — manual cursor pagination
    const items = await db.auditLog.findMany({
      where,
      orderBy: { ts: 'desc' },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    })
    const hasMore = items.length > limit
    const pageItems = hasMore ? items.slice(0, limit) : items
    return NextResponse.json({ items: pageItems, nextCursor: hasMore ? pageItems[pageItems.length - 1].id : null, hasMore })
  }

  const a = await db.auditLog.findMany({ where, orderBy: { ts: 'desc' }, take: 60 })
  return NextResponse.json(a)
}))
