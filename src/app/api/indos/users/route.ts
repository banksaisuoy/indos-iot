import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler } from '@/lib/api'

export const GET = withErrorHandler(async () => {
  const u = await db.user.findMany({
    include: { org: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(u)
})
