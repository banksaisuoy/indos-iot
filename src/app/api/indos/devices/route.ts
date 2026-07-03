import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const project = searchParams.get('project')
  const type = searchParams.get('type')
  const status = searchParams.get('status')

  const devices = await db.device.findMany({
    where: {
      ...(project && project !== 'all' ? { project: { slug: project } } : {}),
      ...(type && type !== 'all' ? { type } : {}),
      ...(status && status !== 'all' ? { status } : {}),
    },
    include: { project: { select: { name: true, slug: true } }, machine: { select: { name: true } } },
    orderBy: { lastSeen: 'desc' },
    take: 200,
  })
  return NextResponse.json(devices)
}
