import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler, validateBody } from '@/lib/api'
import { alarmPatchSchema } from '@/lib/indos/schemas'

export const GET = withErrorHandler(async (req: NextRequest) => {
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
})

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const body = await req.json()
  const v = validateBody(alarmPatchSchema, body)
  if (!v.success) return v.error
  const { id, state, ackedBy } = v.data
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
})
