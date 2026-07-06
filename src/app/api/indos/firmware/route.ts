import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { db } from '@/lib/db'
import { withErrorHandler, validateBody } from '@/lib/api'
import { authOptions } from '@/lib/auth'
import { firmwareRegisterSchema } from '@/lib/indos/schemas'
import { buildSignedManifest } from '@/lib/ota-signing'

export const GET = withErrorHandler(async () => {
  const firmware = await db.firmware.findMany({
    include: { _count: { select: { jobs: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(firmware)
})

// POST: Register new firmware + auto-sign the manifest (admin/engineer only)
export const POST = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const role = (session.user as any)?.role
  if (role !== 'admin' && role !== 'engineer') {
    return NextResponse.json({ error: 'FORBIDDEN', message: 'Only admin/engineer can register firmware' }, { status: 403 })
  }

  const body = await req.json()
  const v = validateBody(firmwareRegisterSchema, body)
  if (!v.success) return v.error

  const { version, deviceType, url, sizeKb, notes, checksum, status } = v.data

  // Compute or use provided checksum
  const finalChecksum = checksum || `sha256:pending-${Date.now()}`

  // Build and sign the manifest
  const signedManifest = buildSignedManifest({
    version,
    deviceType,
    url,
    checksum: finalChecksum,
    sizeKb,
    notes: notes || undefined,
  })

  // Store firmware with signature + manifest
  const firmware = await db.firmware.create({
    data: {
      version,
      deviceType,
      url,
      sizeKb,
      notes: notes || null,
      checksum: finalChecksum,
      status,
      signature: signedManifest.signature,
      signingKeyId: signedManifest.signingKeyId,
      manifest: JSON.stringify(signedManifest),
    },
  })

  // Audit log
  await db.auditLog.create({
    data: {
      actor: session.user?.email || 'unknown',
      action: 'firmware.register',
      target: `${version} (${deviceType})`,
      ip: '0.0.0.0',
    },
  })

  return NextResponse.json(firmware, { status: 201 })
})
