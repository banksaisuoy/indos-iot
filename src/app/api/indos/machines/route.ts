import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler } from '@/lib/api'

export const GET = withErrorHandler(async () => {
  const machines = await db.machine.findMany({
    include: {
      line: {
        include: {
          building: {
            include: {
              factory: {
                include: { project: true },
              },
            },
          },
        },
      },
      _count: { select: { devices: true } },
    },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(machines)
})
