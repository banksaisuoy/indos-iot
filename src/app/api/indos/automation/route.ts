import { db } from '@/lib/db'
export async function GET() { const a = await db.automationFlow.findMany({ orderBy: { createdAt: 'desc' } }); return Response.json(a) }
