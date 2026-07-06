import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler } from '@/lib/api'
import { queryTelemetry, isInfluxAvailable } from '@/lib/influx'

/**
 * GET /api/indos/telemetry/[deviceId]?metric=xxx&range=24h
 *
 * Historical telemetry for a device.
 * Tries InfluxDB first (production). Falls back to SQLite (dev/seed data).
 */
export const GET = withErrorHandler(async (req: NextRequest, { params }: { params: Promise<{ deviceId: string }> }) => {
  const { deviceId } = await params
  const { searchParams } = new URL(req.url)
  const metric = searchParams.get('metric') || undefined
  const range = searchParams.get('range') || '24h'

  // Try InfluxDB first (production path)
  if (isInfluxAvailable()) {
    const points = await queryTelemetry({ deviceId, metric, range, limit: 240 })
    if (points.length > 0) {
      return NextResponse.json(points)
    }
    // If InfluxDB returns empty, fall through to SQLite
  }

  // Fallback: SQLite (dev/seed data or when InfluxDB is not configured)
  const points = await db.telemetry.findMany({
    where: { deviceId, ...(metric ? { metric } : {}) },
    orderBy: { ts: 'desc' },
    take: 240,
  })
  // Reverse so the array is chronological (oldest → newest) for chart libs
  return NextResponse.json(points.reverse())
})
