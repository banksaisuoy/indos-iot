import { db } from '@/lib/db'
export async function GET() {
  const firmware = await db.firmware.findMany({ include: { _count: { select: { jobs: true } } }, orderBy: { createdAt: 'desc' } })
  return Response.json(firmware)
}
