import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { withErrorHandler, validateBody } from '@/lib/api'
import { apiHandler, RATE_LIMITS } from '@/lib/api-handler'
import { orgScope, isOrgScoped } from '@/lib/org-scope'
import { userCreateSchema } from '@/lib/indos/schemas'

// GET: List users
// P0.1: admins (cross-org) and platform users (null orgId) see ALL users.
// Org-scoped admins are NOT a thing (admin role = cross-org by design).
// Org-scoped engineers/operators/viewers see only users in their own org.
//
// Note: the RBAC gate is 'admin' so in practice only admins reach this handler.
// The orgScope check below is a defensive guard for org-scoped admins (rare).
export const GET = withErrorHandler(apiHandler('admin', RATE_LIMITS.read, async (_req, session) => {
  // Admins (role=admin) bypass scoping — they are cross-org by design.
  // Users with null orgId (platform-level) also bypass — backward compat.
  // Any other admin with an orgId (defensive) gets scoped to their org.
  const where = isOrgScoped(session) ? orgScope(session) : {}
  const u = await db.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: { id: true, email: true, name: true, role: true, status: true, twoFA: true, lastLogin: true, createdAt: true, org: { select: { name: true } } },
  })
  return NextResponse.json(u)
}))

// POST: Create a new user (admin only)
// Phase 12-B — replaces the previously-fake "Invite User" dialog. Hashes the
// initial password with bcrypt (same as auth.ts) so the new user can log in
// immediately. Admins are cross-org so they can place users in any org or
// leave orgId null (platform-level).
export const POST = withErrorHandler(apiHandler('admin', RATE_LIMITS.write, async (req, session) => {
  const body = await req.json().catch(() => null)
  const v = validateBody(userCreateSchema, body)
  if (!v.success) return v.error

  const { name, email, password, role, orgId } = v.data

  // Email uniqueness — explicit check so we return our own 409 code, not Prisma's generic one.
  const existing = await db.user.findUnique({ where: { email }, select: { id: true } })
  if (existing) {
    return NextResponse.json(
      { error: 'EMAIL_TAKEN', message: 'A user with this email already exists' },
      { status: 409 },
    )
  }

  // If an orgId was supplied, verify it exists (otherwise Prisma FK would throw, but
  // a clean 400 with a clear code is friendlier and prevents silent 400s in the UI).
  if (orgId) {
    const org = await db.organization.findUnique({ where: { id: orgId }, select: { id: true } })
    if (!org) {
      return NextResponse.json(
        { error: 'ORG_NOT_FOUND', message: 'The specified organization does not exist' },
        { status: 400 },
      )
    }
  }

  const hashed = bcrypt.hashSync(password, 10)

  const created = await db.user.create({
    data: { name, email, password: hashed, role, orgId: orgId ?? null, status: 'active' },
    select: {
      id: true, email: true, name: true, role: true, status: true,
      twoFA: true, lastLogin: true, createdAt: true,
      org: { select: { name: true } },
    },
  })

  await db.auditLog.create({
    data: {
      actor: session.user?.email || 'unknown',
      action: 'user.create',
      target: email,
      ip: '0.0.0.0',
    },
  })

  return NextResponse.json(created, { status: 201 })
}))
