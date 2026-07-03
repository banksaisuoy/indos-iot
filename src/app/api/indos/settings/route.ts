import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler } from '@/lib/api'

export const GET = withErrorHandler(async () => {
  const rows = await db.setting.findMany()
  const grouped: Record<string, Record<string, string>> = {}
  for (const r of rows) {
    (grouped[r.category] ||= {})[r.key] = r.value
  }
  return NextResponse.json(grouped)
})
