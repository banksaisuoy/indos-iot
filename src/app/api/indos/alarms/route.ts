import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const state = searchParams.get('state')
  const severity = searchParams.get('severity')
  const alarms = await db.alarm.findMany({
    where: {
      ...(state && state !== 'all' ? { state } : {}),
      ...(severity && severity !== 'all' ? { severity } : {}),
    },
    include: { device: { select: { name: true } }, project: { select: { name: true, slug: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  return NextResponse.json(alarms)
}

export async function PATCH(req: NextRequest) {
  const { id, state, ackedBy } = await req.json()
  const now = new Date()
  const updated = await db.alarm.update({
    where: { id },
    data: {
      state,
      ackedBy: state === 'acknowledged' ? (ackedBy || 'operator') : undefined,
      ackedAt: state === 'acknowledged' ? now : undefined,
      resolvedAt: state === 'resolved' ? now : undefined,
    },
  })
  return NextResponse.json(updated)
}
