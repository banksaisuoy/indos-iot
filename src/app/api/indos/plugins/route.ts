import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Plugin marketplace
export async function GET() {
  const plugins = await db.plugin.findMany({ orderBy: [{ installed: 'desc' }, { downloads: 'desc' }] })
  return NextResponse.json(plugins)
}

export async function POST(req: NextRequest) {
  const { id, action } = await req.json() // action: install | enable | disable | uninstall
  const p = await db.plugin.findUnique({ where: { id } })
  if (!p) return NextResponse.json({ error: 'not found' }, { status: 404 })

  let data: any = {}
  if (action === 'install') data = { installed: true, enabled: true, downloads: { increment: 1 } }
  else if (action === 'enable') data = { enabled: true }
  else if (action === 'disable') data = { enabled: false }
  else if (action === 'uninstall') data = { installed: false, enabled: false }

  const updated = await db.plugin.update({ where: { id }, data })
  return NextResponse.json(updated)
}
