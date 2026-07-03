import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler } from '@/lib/api'

export const GET = withErrorHandler(async () => {
  const a = await db.automationFlow.findMany({ orderBy: { createdAt: 'desc' } })
  return NextResponse.json(a)
})
