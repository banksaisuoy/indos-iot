import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler, validateBody } from '@/lib/api'
import { alarmPatchSchema } from '@/lib/indos/schemas'
import { apiHandler, RATE_LIMITS } from '@/lib/api-handler'
import { parsePaginationParams, cursorPaginate } from '@/lib/pagination'
import { scopedProjectFilter } from '@/lib/org-scope'

// GET: List alarms (any authenticated user) — supports cursor pagination
// P0.1: scoped via project.orgId (nested). Admins / platform users see everything.
export const GET = withErrorHandler(apiHandler('viewer', RATE_LIMITS.read, async (req: NextRequest, session) => {
  const { searchParams } = new URL(req.url)
  const state = searchParams.get('state')
  const severity = searchParams.get('severity')
  const project = searchParams.get('project')
  const where = {
    ...scopedProjectFilter(session, project),
    ...(state && state !== 'all' ? { state } : {}),
    ...(severity && severity !== 'all' ? { severity } : {}),
  }
  const include = { device: { select: { name: true } }, project: { select: { name: true, slug: true } } }

  const { cursor, limit, paginated } = parsePaginationParams(req)
  if (paginated) {
    const result = await cursorPaginate(db.alarm, { cursor, limit, where, include })
    return NextResponse.json(result)
  }

  const alarms = await db.alarm.findMany({
    where, include,
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  return NextResponse.json(alarms)
}))

// PATCH: Acknowledge/resolve alarm (operator+ can ack, engineer+ can resolve)
export const PATCH = withErrorHandler(apiHandler('operator', RATE_LIMITS.write, async (req, session) => {
  const body = await req.json()
  const v = validateBody(alarmPatchSchema, body)
  if (!v.success) return v.error
  const { id, state } = v.data

  // Resolve requires engineer+ (operator can only acknowledge)
  if (state === 'resolved') {
    const role = (session.user as any)?.role
    if (role !== 'admin' && role !== 'engineer') {
      return NextResponse.json({ error: 'FORBIDDEN', message: 'Only admin/engineer can resolve alarms' }, { status: 403 })
    }
  }

  const now = new Date()
  const updated = await db.alarm.update({
    where: { id },
    data: {
      state,
      ackedBy: state === 'acknowledged' ? (session.user?.email || 'operator') : undefined,
      ackedAt: state === 'acknowledged' ? now : undefined,
      resolvedAt: state === 'resolved' ? now : undefined,
    },
  })
  return NextResponse.json(updated)
}))
