import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler, validateBody } from '@/lib/api'
import { pluginActionSchema } from '@/lib/indos/schemas'

// Plugin marketplace
export const GET = withErrorHandler(async () => {
  const plugins = await db.plugin.findMany({ orderBy: [{ installed: 'desc' }, { downloads: 'desc' }] })
  return NextResponse.json(plugins)
})

export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await req.json()
  const v = validateBody(pluginActionSchema, body)
  if (!v.success) return v.error
  const { id, action } = v.data

  const p = await db.plugin.findUnique({ where: { id } })
  if (!p) return NextResponse.json({ error: 'not found' }, { status: 404 })

  let data: any = {}
  if (action === 'install') {
    // Only count a download when transitioning from not-installed → installed
    data = p.installed
      ? { installed: true, enabled: true }
      : { installed: true, enabled: true, downloads: { increment: 1 } }
  } else if (action === 'enable') {
    data = { enabled: true }
  } else if (action === 'disable') {
    data = { enabled: false }
  } else if (action === 'uninstall') {
    data = { installed: false, enabled: false }
  }

  const updated = await db.plugin.update({ where: { id }, data })
  return NextResponse.json(updated)
})
