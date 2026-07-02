import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Historical telemetry for a device
export async function GET(req: NextRequest, { params }: { params: Promise<{ deviceId: string }> }) {
  const { deviceId } = await params
  const { searchParams } = new URL(req.url)
  const metric = searchParams.get('metric')
  const points = await db.telemetry.findMany({
    where: { deviceId, ...(metric ? { metric } : {}) },
    orderBy: { ts: 'asc' },
    take: 240,
  })
  return NextResponse.json(points)
}
