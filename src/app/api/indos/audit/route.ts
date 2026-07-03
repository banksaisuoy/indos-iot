import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler } from '@/lib/api'

export const GET = withErrorHandler(async () => {
  const a = await db.auditLog.findMany({ orderBy: { ts: 'desc' }, take: 60 })
  return NextResponse.json(a)
})
