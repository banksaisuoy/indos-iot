import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler } from '@/lib/api'
import { apiHandler, RATE_LIMITS } from '@/lib/api-handler'

// GET: List cameras (any authenticated user)
// PLATFORM-LEVEL: Camera has no orgId; cameras are platform-shared infrastructure.
// Visibility = all orgs.
// TODO (P1 follow-up): add orgId to Camera when per-tenant camera fleets land.
export const GET = withErrorHandler(apiHandler('viewer', RATE_LIMITS.read, async () => {
  return NextResponse.json(await db.camera.findMany({ orderBy: { name: 'asc' } }))
}))
