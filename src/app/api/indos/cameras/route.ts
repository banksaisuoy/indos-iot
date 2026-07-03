import { db } from '@/lib/db'
export async function GET() { const c = await db.camera.findMany({ orderBy: { name: 'asc' } }); return Response.json(c) }
