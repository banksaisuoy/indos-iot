import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler } from '@/lib/api'

export const GET = withErrorHandler(async () => {
  const c = await db.camera.findMany({ orderBy: { name: 'asc' } })
  return NextResponse.json(c)
})
