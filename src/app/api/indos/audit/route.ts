import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler } from '@/lib/api'
import { apiHandler, RATE_LIMITS } from '@/lib/api-handler'
import { parsePaginationParams, cursorPaginate } from '@/lib/pagination'
import { isOrgScoped } from '@/lib/org-scope'

// GET: Audit log — now open to any authenticated user (was admin-only).
//
// P0.1 multi-tenant scoping:
//   AuditLog has no orgId column, so we cannot directly filter by org.
//   - Admins (cross-org) and platform users (null orgId) see ALL audit entries.
//   - Org-scoped users see ONLY their own entries (actor === session.user.email).
//
// LIMITATION: This is a "self-only" view for non-admins — they cannot see other
// users' actions within their org. A future schema change (adding orgId to
// AuditLog) would enable true per-org audit visibility. Tracked as P1 follow-up.
export const GET = withErrorHandler(apiHandler('viewer', RATE_LIMITS.read, async (req, session) => {
  const { cursor, limit, paginated } = parsePaginationParams(req)

  // Admins / platform users see all; org-scoped users see only their own entries.
  const where = isOrgScoped(session) ? { actor: (session.user as any)?.email ?? '__none__' } : {}

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
