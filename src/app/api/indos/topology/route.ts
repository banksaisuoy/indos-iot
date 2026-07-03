import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler } from '@/lib/api'

// Digital twin topology tree: Projects → Factories → Buildings → Lines → Machines → Devices
export const GET = withErrorHandler(async () => {
  const projects = await db.project.findMany({
    where: { factories: { some: {} } },
    include: {
      factories: {
        include: {
          buildings: {
            include: {
              lines: {
                include: {
                  machines: {
                    include: { devices: { select: { id: true, name: true, type: true, status: true } } },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  })

  // Also include projects without factories (single-level)
  const flat = await db.project.findMany({
    where: { factories: { none: {} } },
    include: { _count: { select: { devices: true } } },
  })

  return NextResponse.json({ hierarchical: projects, flat })
})
