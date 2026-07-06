import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler } from '@/lib/api'
import { apiHandler, RATE_LIMITS } from '@/lib/api-handler'

export const GET = withErrorHandler(apiHandler('viewer', RATE_LIMITS.read, async () => {
  const hierarchical = await db.project.findMany({
    where: { factories: { some: {} } },
    include: { factories: { include: { buildings: { include: { lines: { include: { machines: { include: { devices: { select: { id: true, name: true, type: true, status: true } } } } } } } } } } },
    orderBy: { name: 'asc' },
  })
  const flat = await db.project.findMany({ where: { factories: { none: {} } }, include: { _count: { select: { devices: true } } } })
  return NextResponse.json({ hierarchical, flat })
}))
