import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler, validateBody } from '@/lib/api'
import { projectCreateSchema } from '@/lib/indos/schemas'
import { apiHandler, RATE_LIMITS } from '@/lib/api-handler'
import { cacheDel } from '@/lib/cache'

// GET: List projects (any authenticated user)
export const GET = withErrorHandler(apiHandler('viewer', RATE_LIMITS.read, async () => {
  const projects = await db.project.findMany({
    include: {
      _count: { select: { devices: true, alarms: true, workOrders: true, factories: true } },
      customer: true,
      org: true,
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(projects)
}))

// POST: Create project (engineer+)
export const POST = withErrorHandler(apiHandler('engineer', RATE_LIMITS.write, async (req) => {
  const body = await req.json()
  const v = validateBody(projectCreateSchema, body)
  if (!v.success) return v.error
  const { name, description, category, location, lat, lng, orgId, customerId } = v.data
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const created = await db.project.create({
    data: {
      name,
      slug: slug + '-' + Math.random().toString(36).slice(2, 6),
      description: description ?? null,
      category,
      status: 'active',
      location: location ?? null,
      lat: lat ?? null,
      lng: lng ?? null,
      orgId: orgId || null,
      customerId: customerId || null,
    },
  })
  return NextResponse.json(created, { status: 201 })
  // Note: cache invalidation for overview happens via TTL (30s)
}))
