import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { withErrorHandler, validateBody } from '@/lib/api'
import { apiHandler, RATE_LIMITS } from '@/lib/api-handler'
import { userUpdateSchema } from '@/lib/indos/schemas'

/**
 * PATCH /api/indos/users/[id] — update a user (admin only).
 *
 * Phase 12-B — supports: rename, change role, change status (active/disabled),
 * reset password, change org (or move to platform-level via orgId: null).
 *
 * Safety rails (CRITICAL — without these an admin could lock everyone out):
 * 1. CANNOT_DISABLE_SELF — admins cannot disable their own account.
 * 2. LAST_ADMIN — the last remaining admin cannot be demoted or disabled.
 *    Without this, an admin could demote every admin and lock the platform.
 *
 * The id is parsed from the URL pathname (same pattern as telemetry/[deviceId]).
 */
export const PATCH = withErrorHandler(apiHandler('admin', RATE_LIMITS.write, async (req: NextRequest, session) => {
  // Parse the user id from the URL (the apiHandler wrapper doesn't forward `params`).
  const url = new URL(req.url)
  const parts = url.pathname.split('/')
  const id = parts[parts.length - 1]

  if (!id) {
    return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'User id is required' }, { status: 422 })
  }

  const body = await req.json().catch(() => null)
  const v = validateBody(userUpdateSchema, body)
  if (!v.success) return v.error

  const { name, role, status, password, orgId } = v.data

  // Fetch the target user (need current role/status to validate last-admin + self rules).
  const existing = await db.user.findUnique({ where: { id }, select: { id: true, role: true, status: true, email: true } })
  if (!existing) {
    return NextResponse.json({ error: 'NOT_FOUND', message: 'User not found' }, { status: 404 })
  }

  // ── Safety rail 1: cannot disable yourself ──────────────────────────
  if (status === 'disabled' && session.user?.id === id) {
    return NextResponse.json(
      { error: 'CANNOT_DISABLE_SELF', message: 'You cannot disable your own account' },
      { status: 400 },
    )
  }

  // ── Safety rail 2: protect the last admin ───────────────────────────
  // Triggers when:
  //  (a) the target is currently an admin AND the change would demote them (role !== 'admin'), OR
  //  (b) the target is currently an admin AND the change would disable them (status === 'disabled')
  // AND there are no OTHER active admins left in the platform.
  const willLoseAdmin =
    existing.role === 'admin' &&
    ((role !== undefined && role !== 'admin') || status === 'disabled')

  if (willLoseAdmin) {
    const activeAdminCount = await db.user.count({ where: { role: 'admin', status: 'active' } })
    // If this user is the only active admin, refuse the change.
    // (existing.status === 'disabled' can't happen here because willLoseAdmin requires role=admin
    //  AND a demotion/disable; an already-disabled admin would have been excluded by the count.)
    if (activeAdminCount <= 1) {
      return NextResponse.json(
        { error: 'LAST_ADMIN', message: 'Cannot demote or disable the last remaining admin' },
        { status: 400 },
      )
    }
  }

  // ── Validate orgId if provided ──────────────────────────────────────
  // Three valid "shapes" reach here:
  //   • undefined  → caller didn't include the field; SKIP (don't touch org).
  //   • null       → caller explicitly clears org (move to platform-level).
  //   • string     → caller sets a new org. Empty string is normalized to null
  //                  defensively (the schema no longer transforms, to avoid
  //                  the missing-key-becomes-null foot-gun).
  let normalizedOrgId: string | null | undefined = undefined
  if (orgId !== undefined) {
    normalizedOrgId = (typeof orgId === 'string' && orgId.trim()) ? orgId : null
    if (normalizedOrgId !== null) {
      const org = await db.organization.findUnique({ where: { id: normalizedOrgId }, select: { id: true } })
      if (!org) {
        return NextResponse.json(
          { error: 'ORG_NOT_FOUND', message: 'The specified organization does not exist' },
          { status: 400 },
        )
      }
    }
  }

  // ── Build the update payload (only touch fields that were provided) ─
  const data: Record<string, unknown> = {}
  if (name !== undefined) data.name = name
  if (role !== undefined) data.role = role
  if (status !== undefined) data.status = status
  if (normalizedOrgId !== undefined) data.orgId = normalizedOrgId
  if (password !== undefined) data.password = bcrypt.hashSync(password, 10)

  const updated = await db.user.update({
    where: { id },
    data,
    select: {
      id: true, email: true, name: true, role: true, status: true,
      twoFA: true, lastLogin: true, createdAt: true,
      org: { select: { name: true } },
    },
  })

  await db.auditLog.create({
    data: {
      actor: session.user?.email || 'unknown',
      action: 'user.update',
      target: id,
      ip: '0.0.0.0',
    },
  })

  return NextResponse.json(updated)
}))
