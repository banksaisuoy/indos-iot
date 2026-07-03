import { db } from '@/lib/db'
export async function GET() { const u = await db.user.findMany({ include: { org: { select: { name: true } } }, orderBy: { createdAt: 'desc' } }); return Response.json(u) }
