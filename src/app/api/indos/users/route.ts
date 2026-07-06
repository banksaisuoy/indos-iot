import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler } from '@/lib/api'
import { apiHandler, RATE_LIMITS } from '@/lib/api-handler'

// GET: List users (admin only — exposes emails, roles, 2FA status)
export const GET = withErrorHandler(apiHandler('admin', RATE_LIMITS.read, async () => {
  const u = await db.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, email: true, name: true, role: true, status: true, twoFA: true, lastLogin: true, createdAt: true, org: { select: { name: true } } },
  })
  return NextResponse.json(u)
}))
