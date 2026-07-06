import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler, validateBody } from '@/lib/api'
import { pluginActionSchema } from '@/lib/indos/schemas'
import { apiHandler, RATE_LIMITS } from '@/lib/api-handler'
import { cached, cacheDel } from '@/lib/cache'

// GET: Plugin marketplace (cached 60s)
export const GET = withErrorHandler(apiHandler('viewer', RATE_LIMITS.read, async () => {
  const plugins = await cached('plugins', 60, async () => {
    return db.plugin.findMany({ orderBy: [{ installed: 'desc' }, { downloads: 'desc' }] })
  })
  return NextResponse.json(plugins)
}))

// POST: Install/enable/disable/uninstall plugin (engineer+) — invalidates cache
export const POST = withErrorHandler(apiHandler('engineer', RATE_LIMITS.write, async (req) => {
  const body = await req.json()
  const v = validateBody(pluginActionSchema, body)
  if (!v.success) return v.error
  const { id, action } = v.data

  const p = await db.plugin.findUnique({ where: { id } })
  if (!p) return NextResponse.json({ error: 'not found' }, { status: 404 })

  let data: any = {}
  if (action === 'install') {
    data = p.installed ? { installed: true, enabled: true } : { installed: true, enabled: true, downloads: { increment: 1 } }
  } else if (action === 'enable') { data = { enabled: true } }
  else if (action === 'disable') { data = { enabled: false } }
  else if (action === 'uninstall') { data = { installed: false, enabled: false } }

  const updated = await db.plugin.update({ where: { id }, data })
  // Invalidate plugins cache
  await cacheDel('plugins')
  return NextResponse.json(updated)
}))
