import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const [workOrders, open, inProgress, completed, critical] = await Promise.all([
    db.workOrder.findMany({ include: { project: { select: { name: true, slug: true } } }, orderBy: { createdAt: 'desc' } }),
    db.workOrder.count({ where: { status: 'open' } }),
    db.workOrder.count({ where: { status: 'inprogress' } }),
    db.workOrder.count({ where: { status: 'completed' } }),
    db.workOrder.count({ where: { priority: 'critical', OR: [{ status: 'open' }, { status: 'inprogress' }] } }),
  ])
  return NextResponse.json({ workOrders, stats: { open, inProgress, completed, critical } })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const created = await db.workOrder.create({
    data: {
      title: body.title,
      description: body.description || null,
      type: body.type || 'corrective',
      priority: body.priority || 'medium',
      status: 'open',
      projectId: body.projectId || null,
      assignee: body.assignee || null,
      machineName: body.machineName || null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
    },
  })
  return NextResponse.json(created)
}

export async function PATCH(req: NextRequest) {
  const { id, status } = await req.json()
  const updated = await db.workOrder.update({ where: { id }, data: { status } })
  return NextResponse.json(updated)
}
