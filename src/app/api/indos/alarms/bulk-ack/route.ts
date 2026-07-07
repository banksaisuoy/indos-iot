import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler, validateBody } from '@/lib/api'
import { apiHandler, RATE_LIMITS } from '@/lib/api-handler'
import { scopedProjectFilter, getOrgId } from '@/lib/org-scope'
import { bulkAckSchema } from '@/lib/indos/schemas'

/**
 * POST /api/indos/alarms/bulk-ack
 *
 * Phase 12-C — Bulk alarm acknowledge for control-room workflow friction fix.
 * Acknowledges multiple active alarms in a single request:
 *   - `{ ids: string[] }`      → ack a specific set of alarm ids
 *   - `{ severity: 'critical'|'warning'|'info' }` → ack every active alarm with that severity
 *   - `{ all: true }`          → ack every active alarm visible to the caller
 *
 * At least one of `ids` (non-empty) / `severity` / `all===true` must be provided,
 * otherwise we return 400 `NO_TARGET` so the UI can distinguish "nothing selected"
 * from a real validation error.
 *
 * Always intersects with `state: 'active'` so already-acked/resolved alarms are
 * silently skipped (idempotent — re-acking an acked alarm is a no-op).
 *
 * Engineer+ only — bulk ack is a write operation that can suppress many alarms
 * at once; operators can still ack individual alarms via PATCH /api/indos/alarms.
 *
 * Org-scoped: non-admin engineers ack ONLY alarms in their own org's projects
 * (via `project: { orgId }`). Admins (cross-org) see and ack all alarms.
 *
 * Audit-logged: `actor: <email>, action: 'alarm.bulk_ack', target: JSON.stringify({severity, all, count})`.
 */
export const POST = withErrorHandler(apiHandler('engineer', RATE_LIMITS.write, async (req: NextRequest, session) => {
  const body = await req.json().catch(() => null)
  const v = validateBody(bulkAckSchema, body)
  if (!v.success) return v.error
  const { ids, severity, all } = v.data

  // Enforce at-least-one target. zod alone can't express "ids is a non-empty array
  // OR severity is set OR all is true" cleanly without producing a generic 422, so
  // we surface a dedicated 400 `NO_TARGET` for actionable caller feedback.
  const hasIds = Array.isArray(ids) && ids.length > 0
  if (!hasIds && !severity && !all) {
    return NextResponse.json(
      { error: 'NO_TARGET', message: 'Provide ids[], severity, or all=true' },
      { status: 400 },
    )
  }

  // Build the Prisma `where` — always intersect with state: 'active' so already
  // acked/resolved alarms are skipped (idempotent). Precedence: ids > severity > all.
  // Org scoping is mirrored from GET /api/indos/alarms — `scopedProjectFilter(session)`
  // returns `{ project: { orgId } }` for non-admin org-scoped users, `{}` otherwise.
  const where: Record<string, unknown> = {
    state: 'active',
    ...scopedProjectFilter(session),
  }
  if (hasIds) {
    where.id = { in: ids }
  } else if (severity) {
    where.severity = severity
  }
  // else: all === true → no further filter, ack every active alarm in scope.

  const now = new Date()
  const ackedBy = session.user?.email || 'unknown'

  const result = await db.alarm.updateMany({
    where: where as any,
    data: {
      state: 'acknowledged',
      ackedBy,
      ackedAt: now,
    },
  })

  // Audit log — capture which mode was used + how many were acked.
  await db.auditLog.create({
    data: {
      actor: ackedBy,
      action: 'alarm.bulk_ack',
      target: JSON.stringify({
        severity: severity ?? null,
        all: !!all,
        ids: hasIds ? ids!.length : 0,
        count: result.count,
      }),
      ip: '0.0.0.0',
      orgId: getOrgId(session) ?? null,
    },
  })

  return NextResponse.json({ count: result.count })
}))
