import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
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
}
