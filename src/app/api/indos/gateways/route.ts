import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler } from '@/lib/api'
import { apiHandler, RATE_LIMITS } from '@/lib/api-handler'

// GET: List gateways (any authenticated user)
// PLATFORM-LEVEL: Gateway has no orgId; gateways are platform-shared infrastructure
// (e.g. global MQTT brokers, edge gateways). Visibility = all orgs.
// TODO (P1 follow-up): add orgId to Gateway when per-tenant gateways land.
export const GET = withErrorHandler(apiHandler('viewer', RATE_LIMITS.read, async () => {
  return NextResponse.json(await db.gateway.findMany({ orderBy: { name: 'asc' } }))
}))
