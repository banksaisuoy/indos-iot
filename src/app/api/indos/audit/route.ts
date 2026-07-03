import { db } from '@/lib/db'
export async function GET() { const a = await db.auditLog.findMany({ orderBy: { ts: 'desc' }, take: 60 }); return Response.json(a) }
