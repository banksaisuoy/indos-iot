import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler } from '@/lib/api'
import { verifyManifest, type OtaManifest } from '@/lib/ota-signing'

/**
 * GET /api/indos/ota/manifest?deviceId=xxx
 *
 * Devices fetch this endpoint to get their pending OTA manifest.
 * The manifest includes the Ed25519 signature which the device verifies
 * against the embedded public key before downloading/flashing firmware.
 *
 * This endpoint is authenticated (device uses its session or API token).
 * In a future phase, device auth will use mTLS or per-device JWT.
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const deviceId = searchParams.get('deviceId')

  if (!deviceId) {
    return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'deviceId required' }, { status: 422 })
  }

  // Find the latest pending OTA job for this device
  // In a real system, there would be a DeviceOtaJob join table mapping jobs to specific devices
  // For now, find jobs targeting this device (single scope) or all (global)
  const job = await db.otaJob.findFirst({
    where: {
      OR: [
        { scope: 'single', target: deviceId, status: 'pending' },
        { scope: 'global', status: 'pending' },
      ],
    },
    include: { firmware: true },
    orderBy: { createdAt: 'desc' },
  })

  if (!job || !job.firmware.manifest) {
    return NextResponse.json({ pending: false, message: 'No OTA update pending' })
  }

  // Parse the stored manifest
  const signedManifest = JSON.parse(job.firmware.manifest)

  // Re-verify the signature server-side before serving (defense in depth)
  const manifest: OtaManifest = {
    version: signedManifest.version,
    deviceType: signedManifest.deviceType,
    url: signedManifest.url,
    checksum: signedManifest.checksum,
    sizeKb: signedManifest.sizeKb,
    notes: signedManifest.notes,
    createdAt: signedManifest.createdAt,
    signingKeyId: signedManifest.signingKeyId,
  }

  const valid = verifyManifest(manifest, signedManifest.signature)
  if (!valid) {
    return NextResponse.json({ error: 'SIGNATURE_INVALID', message: 'Manifest signature verification failed' }, { status: 500 })
  }

  return NextResponse.json({
    pending: true,
    jobId: job.id,
    manifest: signedManifest,
  })
})
