import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler, validateBody } from '@/lib/api'
import { workOrderCreateSchema, workOrderPatchSchema } from '@/lib/indos/schemas'
import { apiHandler, RATE_LIMITS } from '@/lib/api-handler'
import { scopedProjectFilter, isOrgScoped } from '@/lib/org-scope'

// GET: List work orders + stats (any authenticated user)
// P0.1: scoped via project.orgId (nested). Admins / platform users see everything.
export const GET = withErrorHandler(apiHandler('viewer', RATE_LIMITS.read, async (req: NextRequest, session) => {
  const where = scopedProjectFilter(session)
  const [workOrders, open, inProgress, completed, critical] = await Promise.all([
    db.workOrder.findMany({ where, include: { project: { select: { name: true, slug: true } } }, orderBy: { createdAt: 'desc' }, take: 200 }),
    db.workOrder.count({ where: { ...where, status: 'open' } }),
    db.workOrder.count({ where: { ...where, status: 'inprogress' } }),
    db.workOrder.count({ where: { ...where, status: 'completed' } }),
    db.workOrder.count({ where: { ...where, priority: 'critical', OR: [{ status: 'open' }, { status: 'inprogress' }] } }),
  ])
  return NextResponse.json({ workOrders, stats: { open, inProgress, completed, critical } })
}))

// POST: Create work order (operator+)
export const POST = withErrorHandler(apiHandler('operator', RATE_LIMITS.write, async (req, session) => {
  const body = await req.json()
  const v = validateBody(workOrderCreateSchema, body)
  if (!v.success) return v.error
  const { title, description, type, priority, projectId, assignee, machineName, dueDate } = v.data

  // P0.1: if org-scoped and a projectId was provided, verify it belongs to the caller's org
  if (isOrgScoped(session) && projectId) {
    const orgId = (session.user as any).orgId as string
    const proj = await db.project.findUnique({ where: { id: projectId }, select: { orgId: true } })
    if (!proj || proj.orgId !== orgId) {
      return NextResponse.json({ error: 'FORBIDDEN', message: 'Project is outside your organization' }, { status: 403 })
    }
  }

  const created = await db.workOrder.create({
    data: {
      title, description: description ?? null, type, priority, status: 'open',
      projectId: projectId ?? null, assignee: assignee ?? null, machineName: machineName ?? null,
      dueDate: dueDate ? new Date(dueDate) : null,
    },
  })
  return NextResponse.json(created, { status: 201 })
}))

// PATCH: Update work order status (operator+)
export const PATCH = withErrorHandler(apiHandler('operator', RATE_LIMITS.write, async (req) => {
  const body = await req.json()
  const v = validateBody(workOrderPatchSchema, body)
  if (!v.success) return v.error
  const { id, status } = v.data
  const updated = await db.workOrder.update({ where: { id }, data: { status } })
  return NextResponse.json(updated)
}))
