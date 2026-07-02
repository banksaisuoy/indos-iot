import { db } from '@/lib/db'
export async function GET() {
  const jobs = await db.otaJob.findMany({ include: { firmware: true }, orderBy: { createdAt: 'desc' } })
  return Response.json(jobs)
}
