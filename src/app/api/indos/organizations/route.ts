import { db } from '@/lib/db'
export async function GET() { const o = await db.organization.findMany({ include: { _count: { select: { users: true, projects: true, customers: true } } } }); return Response.json(o) }
