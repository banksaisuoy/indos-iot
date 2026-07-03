import { db } from '@/lib/db'
export async function GET() { const g = await db.gateway.findMany({ orderBy: { name: 'asc' } }); return Response.json(g) }
