import { db } from '@/lib/db'
export async function GET() {
  const rows = await db.setting.findMany()
  const grouped: Record<string, Record<string,string>> = {}
  for (const r of rows) { (grouped[r.category] ||= {})[r.key] = r.value }
  return Response.json(grouped)
}
