import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler } from '@/lib/api'

// Historical telemetry for a device
export const GET = withErrorHandler(async (req: NextRequest, { params }: { params: Promise<{ deviceId: string }> }) => {
  const { deviceId } = await params
  const { searchParams } = new URL(req.url)
  const metric = searchParams.get('metric')
  const points = await db.telemetry.findMany({
    where: { deviceId, ...(metric ? { metric } : {}) },
    orderBy: { ts: 'desc' },
    take: 240,
  })
  // Reverse so the array is chronological (oldest → newest) for chart libs
  return NextResponse.json(points.reverse())
})
