import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler } from '@/lib/api'
import { apiHandler, RATE_LIMITS } from '@/lib/api-handler'
import { cached } from '@/lib/cache'

// GET: Platform settings (cached 60s — rarely changes)
export const GET = withErrorHandler(apiHandler('viewer', RATE_LIMITS.read, async () => {
  const data = await cached('settings', 60, async () => {
    const rows = await db.setting.findMany()
    const grouped: Record<string, Record<string, string>> = {}
    for (const r of rows) {
      (grouped[r.category] ||= {})[r.key] = r.value
    }
    return grouped
  })
  return NextResponse.json(data)
}))
