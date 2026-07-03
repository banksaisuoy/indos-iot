import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler } from '@/lib/api'

export const GET = withErrorHandler(async () => {
  const firmware = await db.firmware.findMany({
    include: { _count: { select: { jobs: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(firmware)
})
