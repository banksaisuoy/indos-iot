import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler } from '@/lib/api'
import { apiHandler, RATE_LIMITS } from '@/lib/api-handler'
import { parsePaginationParams, cursorPaginate } from '@/lib/pagination'

// GET: List devices (any authenticated user) — supports cursor pagination
export const GET = withErrorHandler(apiHandler('viewer', RATE_LIMITS.read, async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const project = searchParams.get('project')
  const type = searchParams.get('type')
  const status = searchParams.get('status')
  const where = {
    ...(project && project !== 'all' ? { project: { slug: project } } : {}),
    ...(type && type !== 'all' ? { type } : {}),
    ...(status && status !== 'all' ? { status } : {}),
  }
  const include = { project: { select: { name: true, slug: true } }, machine: { select: { name: true } } }

  const { cursor, limit, paginated } = parsePaginationParams(req)
  if (paginated) {
    const result = await cursorPaginate(db.device, { cursor, limit, where, include, orderByField: 'lastSeen' })
    return NextResponse.json(result)
  }

  const devices = await db.device.findMany({
    where, include,
    orderBy: { lastSeen: 'desc' },
    take: 200,
  })
  return NextResponse.json(devices)
}))
