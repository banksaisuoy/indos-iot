import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { db } from '@/lib/db'
import { withErrorHandler, validateBody } from '@/lib/api'
import { authOptions } from '@/lib/auth'
import { otaDeploySchema } from '@/lib/indos/schemas'

export const GET = withErrorHandler(async () => {
  const jobs = await db.otaJob.findMany({
    include: { firmware: true },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(jobs)
})

// POST: Create a real OTA deployment job (admin/engineer only)
export const POST = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const role = (session.user as any)?.role
  if (role !== 'admin' && role !== 'engineer') {
    return NextResponse.json({ error: 'FORBIDDEN', message: 'Only admin/engineer can deploy OTA' }, { status: 403 })
  }

  const body = await req.json()
  const v = validateBody(otaDeploySchema, body)
  if (!v.success) return v.error

  const { firmwareId, scope, target } = v.data

  // Verify firmware exists and is signed
  const firmware = await db.firmware.findUnique({ where: { id: firmwareId } })
  if (!firmware) return NextResponse.json({ error: 'NOT_FOUND', message: 'Firmware not found' }, { status: 404 })
  if (!firmware.signature || !firmware.manifest) {
    return NextResponse.json({ error: 'UNSIGNED_FIRMWARE', message: 'Firmware has no valid signature — cannot deploy' }, { status: 400 })
  }

  // Create the OTA job
  const job = await db.otaJob.create({
    data: {
      firmwareId,
      scope,
      target: target || null,
      status: 'pending',
      progress: 0,
      total: scope === 'global' ? 0 : scope === 'project' ? 0 : 1,
      done: 0,
      signedBy: session.user?.email || 'unknown',
    },
    include: { firmware: true },
  })

  // Audit log
  await db.auditLog.create({
    data: {
      actor: session.user?.email || 'unknown',
      action: 'ota.deploy',
      target: `${firmware.version} → ${scope}:${target || 'all'} (job ${job.id})`,
      ip: '0.0.0.0',
    },
  })

  return NextResponse.json(job, { status: 201 })
})

// PATCH: Update job status (for device progress reporting)
export const PATCH = withErrorHandler(async (req: Request) => {
  const body = await req.json()
  const { id, status, progress, done } = body as { id: string; status: string; progress?: number; done?: number }

  if (!id || !status) return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'id and status required' }, { status: 422 })

  const job = await db.otaJob.update({
    where: { id },
    data: {
      status,
      ...(progress !== undefined ? { progress } : {}),
      ...(done !== undefined ? { done } : {}),
    },
  })
  return NextResponse.json(job)
})
