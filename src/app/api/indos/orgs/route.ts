import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler, validateBody } from '@/lib/api'
import { apiHandler, RATE_LIMITS } from '@/lib/api-handler'
import { isOrgScoped } from '@/lib/org-scope'
import { orgCreateSchema } from '@/lib/indos/schemas'

// GET: List organizations
// P0.1: admins / platform users (null orgId) see ALL orgs.
// Org-scoped users see ONLY their own org.
export const GET = withErrorHandler(apiHandler('viewer', RATE_LIMITS.read, async (_req, session) => {
  const where = isOrgScoped(session)
    ? { id: (session.user as any).orgId as string }
    : {}
  return NextResponse.json(
    await db.organization.findMany({
      where,
      include: { _count: { select: { users: true, projects: true, customers: true } } },
    })
  )
}))

// POST: Create a new organization (admin only)
// Phase 12-B — replaces the previously-fake "New Organization" dialog. Admins
// are cross-org so they can provision new tenants freely. Orgs created here
// start empty (_count = 0 across users/projects/customers) and are immediately
// selectable from the Invite User dialog's org dropdown.
export const POST = withErrorHandler(apiHandler('admin', RATE_LIMITS.write, async (req, session) => {
  const body = await req.json().catch(() => null)
  const v = validateBody(orgCreateSchema, body)
  if (!v.success) return v.error

  const { name, type, industry, country } = v.data

  const created = await db.organization.create({
    data: {
      name,
      type,
      industry: industry || null,
      country: country || null,
    },
    include: { _count: { select: { users: true, projects: true, customers: true } } },
  })

  await db.auditLog.create({
    data: {
      actor: session.user?.email || 'unknown',
      action: 'org.create',
      target: name,
      ip: '0.0.0.0',
    },
  })

  return NextResponse.json(created, { status: 201 })
}))
