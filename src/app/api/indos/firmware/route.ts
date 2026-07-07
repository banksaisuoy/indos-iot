import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler, validateBody } from '@/lib/api'
import { firmwareRegisterSchema } from '@/lib/indos/schemas'
import { buildSignedManifest } from '@/lib/ota-signing'
import { apiHandler, RATE_LIMITS } from '@/lib/api-handler'
import { parsePaginationParams, cursorPaginate } from '@/lib/pagination'
import { getOrgId, orgScopeWithPlatform } from '@/lib/org-scope'

// GET: List firmware catalog (any authenticated user) — supports cursor pagination
// Phase 14: firmware has a nullable orgId. Org-scoped users see platform-shared
// (orgId=null) firmware PLUS their own org's private firmware. Admins see all.
export const GET = withErrorHandler(apiHandler('viewer', RATE_LIMITS.read, async (req, session) => {
  const { cursor, limit, paginated } = parsePaginationParams(req)
  const where = orgScopeWithPlatform(session)

  if (paginated) {
    const result = await cursorPaginate(db.firmware, {
      cursor, limit, where,
      include: { _count: { select: { jobs: true } } },
    })
    return NextResponse.json(result)
  }

  // Backward compat: flat array
  const firmware = await db.firmware.findMany({
    where,
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
      // Phase 14: stamp the actor's orgId. Admin/platform → null (shared catalog).
      orgId: getOrgId(session) ?? null,
    },
  })

  await db.auditLog.create({
    data: { actor: session.user?.email || 'unknown', action: 'firmware.register', target: `${version} (${deviceType})`, ip: '0.0.0.0', orgId: getOrgId(session) ?? null },
  })

  return NextResponse.json(firmware, { status: 201 })
}))
