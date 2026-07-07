import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler, validateBody } from '@/lib/api'
import { firmwareRegisterSchema } from '@/lib/indos/schemas'
import { buildSignedManifest } from '@/lib/ota-signing'
import { apiHandler, RATE_LIMITS } from '@/lib/api-handler'
import { parsePaginationParams, cursorPaginate } from '@/lib/pagination'

// GET: List firmware catalog (any authenticated user) — supports cursor pagination
// PLATFORM-LEVEL: firmware is shared across orgs (binary catalog + signing metadata).
// Org-scoped users can view firmware (read-only) but deploying (POST /api/indos/ota)
// is restricted by RBAC to admin/engineer.
// TODO (P1 follow-up): consider per-org firmware visibility when minio upload lands.
export const GET = withErrorHandler(apiHandler('viewer', RATE_LIMITS.read, async (req) => {
  const { cursor, limit, paginated } = parsePaginationParams(req)

  if (paginated) {
    const result = await cursorPaginate(db.firmware, {
      cursor, limit,
      include: { _count: { select: { jobs: true } } },
    })
    return NextResponse.json(result)
  }

  // Backward compat: flat array
  const firmware = await db.firmware.findMany({
    include: { _count: { select: { jobs: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return NextResponse.json(firmware)
}))

// POST: Register new firmware + auto-sign the manifest (admin/engineer only)
export const POST = withErrorHandler(apiHandler('engineer', RATE_LIMITS.firmware, async (req, session) => {
  const body = await req.json()
  const v = validateBody(firmwareRegisterSchema, body)
  if (!v.success) return v.error

  const { version, deviceType, url, sizeKb, notes, checksum, status } = v.data

  const finalChecksum = checksum || `sha256:pending-${Date.now()}`

  const signedManifest = buildSignedManifest({
    version, deviceType, url, checksum: finalChecksum, sizeKb, notes: notes || undefined,
  })

  const firmware = await db.firmware.create({
    data: {
      version, deviceType, url, sizeKb, notes: notes || null,
      checksum: finalChecksum, status,
      signature: signedManifest.signature,
      signingKeyId: signedManifest.signingKeyId,
      manifest: JSON.stringify(signedManifest),
    },
  })

  await db.auditLog.create({
    data: { actor: session.user?.email || 'unknown', action: 'firmware.register', target: `${version} (${deviceType})`, ip: '0.0.0.0' },
  })

  return NextResponse.json(firmware, { status: 201 })
}))
