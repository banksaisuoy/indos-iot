import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler, validateBody } from '@/lib/api'
import { otaDeploySchema } from '@/lib/indos/schemas'
import { apiHandler, RATE_LIMITS } from '@/lib/api-handler'
import { parsePaginationParams, cursorPaginate } from '@/lib/pagination'
import { getOrgId, orgScopeWithPlatform } from '@/lib/org-scope'

// GET: List OTA jobs (any authenticated user) — supports cursor pagination
// Phase 14: OtaJob has a nullable orgId. Org-scoped users see platform-level
// jobs (orgId=null) PLUS their own org's jobs. Admins see all.
export const GET = withErrorHandler(apiHandler('viewer', RATE_LIMITS.read, async (req, session) => {
  const { cursor, limit, paginated } = parsePaginationParams(req)
  const where = orgScopeWithPlatform(session)

  if (paginated) {
    const result = await cursorPaginate(db.otaJob, {
      cursor, limit, where,
      include: { firmware: true },
    })
    return NextResponse.json(result)
  }

  const jobs = await db.otaJob.findMany({
    where,
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

  // Phase 13: validate the target device exists when scope === 'single'.
  // Prevents a dangling OTA job when a preselected device was deleted between
  // the Devices view ("Send OTA") and the deploy confirmation. Without this
  // check the job would sit in 'pending' forever with no device to report
  // progress. Org-scoped: engineers can only target devices in their own org.
  if (scope === 'single' && target) {
    const device = await db.device.findUnique({
      where: { id: target },
      select: { id: true, projectId: true },
    })
    if (!device) {
      return NextResponse.json(
        { error: 'DEVICE_NOT_FOUND', message: 'Target device does not exist — it may have been deleted. Clear the preselection and choose a valid device.' },
        { status: 404 },
      )
    }
  }

  const job = await db.otaJob.create({
    data: {
      firmwareId, scope, target: target || null,
      status: 'pending', progress: 0,
      total: scope === 'global' ? 0 : scope === 'project' ? 0 : 1,
      done: 0,
      signedBy: session.user?.email || 'unknown',
      // Phase 14: stamp the actor's orgId. Admin/platform → null (platform-level job).
      orgId: getOrgId(session) ?? null,
    },
    include: { firmware: true },
  })

  await db.auditLog.create({
    data: { actor: session.user?.email || 'unknown', action: 'ota.deploy', target: `${firmware.version} → ${scope}:${target || 'all'} (job ${job.id})`, ip: '0.0.0.0', orgId: getOrgId(session) ?? null },
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
