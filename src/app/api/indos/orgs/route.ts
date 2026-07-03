import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler } from '@/lib/api'

export const GET = withErrorHandler(async () => {
  const o = await db.organization.findMany({
    include: { _count: { select: { users: true, projects: true, customers: true } } },
  })
  return NextResponse.json(o)
})
