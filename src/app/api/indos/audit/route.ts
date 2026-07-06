import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler } from '@/lib/api'
import { apiHandler, RATE_LIMITS } from '@/lib/api-handler'
import { parsePaginationParams, cursorPaginate } from '@/lib/pagination'

// GET: Audit log (admin only — contains actor emails, IPs, actions)
export const GET = withErrorHandler(apiHandler('admin', RATE_LIMITS.read, async (req) => {
  const { cursor, limit, paginated } = parsePaginationParams(req)

  if (paginated) {
    // AuditLog uses `ts` not `createdAt` — manual cursor pagination
    const items = await db.auditLog.findMany({
      orderBy: { ts: 'desc' },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    })
    const hasMore = items.length > limit
    const pageItems = hasMore ? items.slice(0, limit) : items
    return NextResponse.json({ items: pageItems, nextCursor: hasMore ? pageItems[pageItems.length - 1].id : null, hasMore })
  }

  const a = await db.auditLog.findMany({ orderBy: { ts: 'desc' }, take: 60 })
  return NextResponse.json(a)
}))
