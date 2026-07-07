import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler, validateBody } from '@/lib/api'
import { projectCreateSchema } from '@/lib/indos/schemas'
import { apiHandler, RATE_LIMITS } from '@/lib/api-handler'
import { cacheDel } from '@/lib/cache'
import { orgScope, isOrgScoped } from '@/lib/org-scope'

// GET: List projects (any authenticated user)
// P0.1: scoped to the caller's org via top-level orgId column.
// Admins / platform users see everything.
export const GET = withErrorHandler(apiHandler('viewer', RATE_LIMITS.read, async (_req: NextRequest, session) => {
  const projects = await db.project.findMany({
    where: orgScope(session),
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
// P0.1: org-scoped users create projects inside their own org automatically.
export const POST = withErrorHandler(apiHandler('engineer', RATE_LIMITS.write, async (req, session) => {
  const body = await req.json()
  const v = validateBody(projectCreateSchema, body)
  if (!v.success) return v.error
  const { name, description, category, location, lat, lng, orgId, customerId } = v.data

  // P0.1: org-scoped users cannot target another org; force their own orgId.
  // Admins / platform users can specify any orgId (or leave null for platform-level).
  let effectiveOrgId = orgId || null
  if (isOrgScoped(session)) {
    effectiveOrgId = (session.user as any).orgId as string
  }

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
      orgId: effectiveOrgId,
      customerId: customerId || null,
    },
  })
  return NextResponse.json(created, { status: 201 })
  // Note: cache invalidation for overview happens via TTL (30s)
}))
