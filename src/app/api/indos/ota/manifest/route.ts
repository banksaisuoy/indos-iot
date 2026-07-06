import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler } from '@/lib/api'
import { verifyManifest, type OtaManifest } from '@/lib/ota-signing'
import { authedHandler, RATE_LIMITS } from '@/lib/api-handler'

/**
 * GET /api/indos/ota/manifest?deviceId=xxx
 * Device-facing: returns signed OTA manifest. Authenticated (any role).
 */
export const GET = withErrorHandler(authedHandler(RATE_LIMITS.read, async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const deviceId = searchParams.get('deviceId')

  if (!deviceId) {
    return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'deviceId required' }, { status: 422 })
  }

  const job = await db.otaJob.findFirst({
    where: { OR: [{ scope: 'single', target: deviceId, status: 'pending' }, { scope: 'global', status: 'pending' }] },
    include: { firmware: true },
    orderBy: { createdAt: 'desc' },
  })

  if (!job || !job.firmware.manifest) {
    return NextResponse.json({ pending: false, message: 'No OTA update pending' })
  }

  const signedManifest = JSON.parse(job.firmware.manifest)
  const manifest: OtaManifest = {
    version: signedManifest.version, deviceType: signedManifest.deviceType, url: signedManifest.url,
    checksum: signedManifest.checksum, sizeKb: signedManifest.sizeKb, notes: signedManifest.notes,
    createdAt: signedManifest.createdAt, signingKeyId: signedManifest.signingKeyId,
  }

  const valid = verifyManifest(manifest, signedManifest.signature)
  if (!valid) {
    return NextResponse.json({ error: 'SIGNATURE_INVALID', message: 'Manifest signature verification failed' }, { status: 500 })
  }

  return NextResponse.json({ pending: true, jobId: job.id, manifest: signedManifest })
}) as any)
