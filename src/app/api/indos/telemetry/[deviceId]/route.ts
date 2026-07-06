import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler } from '@/lib/api'
import { queryTelemetry, isInfluxAvailable } from '@/lib/influx'
import { authedHandler, RATE_LIMITS } from '@/lib/api-handler'

/**
 * GET /api/indos/telemetry/[deviceId]?metric=xxx&range=24h
 * Tries InfluxDB first, falls back to SQLite.
 */
export const GET = withErrorHandler(authedHandler(RATE_LIMITS.read, async (req: NextRequest) => {
  const url = new URL(req.url)
  const parts = url.pathname.split('/')
  const deviceId = parts[parts.length - 1]
  const { searchParams } = url
  const metric = searchParams.get('metric') || undefined
  const range = searchParams.get('range') || '24h'

  if (isInfluxAvailable()) {
    const points = await queryTelemetry({ deviceId, metric, range, limit: 240 })
    if (points.length > 0) return NextResponse.json(points)
  }

  const points = await db.telemetry.findMany({
    where: { deviceId, ...(metric ? { metric } : {}) },
    orderBy: { ts: 'desc' },
    take: 240,
  })
  return NextResponse.json(points.reverse())
}) as any)
