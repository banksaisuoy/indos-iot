import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler } from '@/lib/api'
import { apiHandler, RATE_LIMITS } from '@/lib/api-handler'
import { scopedMachineFilter } from '@/lib/org-scope'

// GET: List machines (any authenticated user)
// P0.1: scoped via line.building.factory.project.orgId (deeply nested).
// Admins / platform users (null orgId) see everything.
export const GET = withErrorHandler(apiHandler('viewer', RATE_LIMITS.read, async (_req, session) => {
  const where = scopedMachineFilter(session)
  return NextResponse.json(await db.machine.findMany({
    where,
    include: { line: { include: { building: { include: { factory: { include: { project: true } } } } } }, _count: { select: { devices: true } } },
    orderBy: { name: 'asc' },
  }))
}))
