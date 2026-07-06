import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler } from '@/lib/api'
import { apiHandler, RATE_LIMITS } from '@/lib/api-handler'

export const GET = withErrorHandler(apiHandler('viewer', RATE_LIMITS.read, async () => {
  return NextResponse.json(await db.machine.findMany({ include: { line: { include: { building: { include: { factory: { include: { project: true } } } } } }, _count: { select: { devices: true } } }, orderBy: { name: 'asc' } }))
}))
