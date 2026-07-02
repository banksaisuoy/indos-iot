import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const projects = await db.project.findMany({
    include: {
      _count: { select: { devices: true, alarms: true, workOrders: true, factories: true } },
      customer: true,
      org: true,
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(projects)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const slug = body.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const created = await db.project.create({
    data: {
      name: body.name,
      slug: slug + '-' + Math.random().toString(36).slice(2, 6),
      description: body.description || null,
      category: body.category || 'general',
      status: 'active',
      location: body.location || null,
      lat: body.lat ?? null,
      lng: body.lng ?? null,
      orgId: body.orgId || null,
      customerId: body.customerId || null,
    },
  })
  return NextResponse.json(created)
}
