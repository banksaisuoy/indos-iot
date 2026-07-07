import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler, validateBody } from '@/lib/api'
import { otaDeploySchema } from '@/lib/indos/schemas'
import { apiHandler, RATE_LIMITS } from '@/lib/api-handler'
import { parsePaginationParams, cursorPaginate } from '@/lib/pagination'

// GET: List OTA jobs (any authenticated user) — supports cursor pagination
// PLATFORM-LEVEL: OtaJob has no orgId; jobs are scoped by firmware which is itself
// platform-shared. Visibility = all orgs (read-only for org-scoped users).
// Deploying (POST) is restricted by RBAC to admin/engineer.
// TODO (P1 follow-up): filter by devices in org when per-org device ownership lands.
export const GET = withErrorHandler(apiHandler('viewer', RATE_LIMITS.read, async (req) => {
  const { cursor, limit, paginated } = parsePaginationParams(req)

  if (paginated) {
    const result = await cursorPaginate(db.otaJob, {
      cursor, limit,
      include: { firmware: true },
    })
    return NextResponse.json(result)
  }

  const jobs = await db.otaJob.findMany({
    include: { firmware: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return NextResponse.json(jobs)
}))

// POST: Create a real OTA deployment job (admin/engineer only)
export const POST = withErrorHandler(apiHandler('engineer', RATE_LIMITS.ota, async (req, session) => {
  const body = await req.json()
  const v = validateBody(otaDeploySchema, body)
  if (!v.success) return v.error

  const { firmwareId, scope, target } = v.data

  const firmware = await db.firmware.findUnique({ where: { id: firmwareId } })
  if (!firmware) return NextResponse.json({ error: 'NOT_FOUND', message: 'Firmware not found' }, { status: 404 })
  if (!firmware.signature || !firmware.manifest) {
    return NextResponse.json({ error: 'UNSIGNED_FIRMWARE', message: 'Firmware has no valid signature — cannot deploy' }, { status: 400 })
  }

  const job = await db.otaJob.create({
    data: {
      firmwareId, scope, target: target || null,
      status: 'pending', progress: 0,
      total: scope === 'global' ? 0 : scope === 'project' ? 0 : 1,
      done: 0,
      signedBy: session.user?.email || 'unknown',
    },
    include: { firmware: true },
  })

  await db.auditLog.create({
    data: { actor: session.user?.email || 'unknown', action: 'ota.deploy', target: `${firmware.version} → ${scope}:${target || 'all'} (job ${job.id})`, ip: '0.0.0.0' },
  })

  return NextResponse.json(job, { status: 201 })
}))

// PATCH: Update job status (engineer+ — device progress reporting)
export const PATCH = withErrorHandler(apiHandler('engineer', RATE_LIMITS.write, async (req) => {
  const body = await req.json()
  const { id, status, progress, done } = body as { id: string; status: string; progress?: number; done?: number }

  if (!id || !status) return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'id and status required' }, { status: 422 })

  const job = await db.otaJob.update({
    where: { id },
    data: { status, ...(progress !== undefined ? { progress } : {}), ...(done !== undefined ? { done } : {}) },
  })
  return NextResponse.json(job)
}))
