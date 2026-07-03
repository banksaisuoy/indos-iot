import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler } from '@/lib/api'

export const GET = withErrorHandler(async () => {
  const g = await db.gateway.findMany({ orderBy: { name: 'asc' } })
  return NextResponse.json(g)
})
