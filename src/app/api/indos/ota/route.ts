import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler } from '@/lib/api'

export const GET = withErrorHandler(async () => {
  const jobs = await db.otaJob.findMany({
    include: { firmware: true },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(jobs)
})
