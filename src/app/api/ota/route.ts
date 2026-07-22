import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { signBinaryEcdsa, computeChecksum, compareSemanticVersions } from '@/lib/ota-signing'

/**
 * GET /api/ota — Device-facing firmware binary download endpoint
 *
 * Phase 16: Resilient OTA Firmware Pipeline
 *
 * Features:
 *   1. HTTP Range header support (206 Partial Content) for resumable downloads
 *   2. ECDSA P-256 signature in response headers (X-Firmware-Signature)
 *   3. Downgrade prevention: rejects if requested version ≤ device's current version
 *
 * Query params:
 *   ?firmwareId=xxx     — the firmware record ID (required)
 *   ?deviceId=xxx       — the requesting device ID (required, for version check)
 *
 * Headers (from device):
 *   Range: bytes=0-1023         — optional, for resumable downloads
 *   X-Device-Current-Version: v1.2.0  — the device's current firmware version
 *
 * Response headers (to device):
 *   X-Firmware-Signature: <base64 ECDSA signature of FULL binary>
 *   X-Firmware-Signature-Algorithm: ecdsa-p256-sha256
 *   X-Firmware-Signature-Key-Id: key-ecdsa-001
 *   X-Firmware-Checksum: sha256:<hex>
 *   X-Firmware-Version: v1.3.0
 *   X-Firmware-Size: <bytes>
 *   Content-Range: bytes 0-1023/1048576  (for 206 responses)
 *   Accept-Ranges: bytes
 *
 * Status codes:
 *   200 — full binary
 *   206 — partial binary (Range request)
 *   409 — downgrade attempt (requested version ≤ current version)
 *   404 — firmware not found
 *   403 — unsigned firmware (cannot serve)
 */

export const runtime = 'nodejs'
export const maxDuration = 120 // Large firmware binaries may take time to stream

// Cache for firmware binary content + signature (avoids re-fetching + re-signing)
// Key: firmwareId, Value: { buffer, signature, checksum, version, ts }
const firmwareCache = new Map<string, {
  buffer: Buffer
  signature: string
  checksum: string
  version: string
  cachedAt: number
}>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const firmwareId = searchParams.get('firmwareId')
  const deviceId = searchParams.get('deviceId')

  if (!firmwareId) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: 'firmwareId query parameter required' },
      { status: 422 },
    )
  }

  // ── 1. Fetch firmware record ──
  const firmware = await db.firmware.findUnique({ where: { id: firmwareId } })
  if (!firmware) {
    return NextResponse.json(
      { error: 'NOT_FOUND', message: 'Firmware not found' },
      { status: 404 },
    )
  }

  if (!firmware.url) {
    return NextResponse.json(
      { error: 'NO_BINARY', message: 'Firmware has no download URL' },
      { status: 403 },
    )
  }

  // ── 2. Downgrade prevention ──
  // The device sends its current version via X-Device-Current-Version header.
  // We reject the download if the requested firmware version is ≤ current.
  const currentVersion = req.headers.get('x-device-current-version')
  if (currentVersion && deviceId) {
    const comparison = compareSemanticVersions(firmware.version, currentVersion)
    if (comparison <= 0) {
      // Log the downgrade attempt for audit
      console.warn(
        `[ota] 🚫 Downgrade denied: device=${deviceId} current=${currentVersion} ` +
        `requested=${firmware.version}`,
      )
      try {
        await db.auditLog.create({
          data: {
            actor: `device:${deviceId}`,
            action: 'ota.downgrade_denied',
            target: `${currentVersion} → ${firmware.version} (rejected)`,
            ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
          },
        })
      } catch { /* non-fatal */ }

      return NextResponse.json(
        {
          error: 'DOWNGRADE_DENIED',
          message: `Firmware v${firmware.version} is not newer than current v${currentVersion}. Downgrade attacks are blocked.`,
          currentVersion,
          requestedVersion: firmware.version,
        },
        { status: 409 },
      )
    }
  }

  // ── 3. Fetch binary (from cache or HTTP source) ──
  let cached = firmwareCache.get(firmwareId)
  if (!cached || Date.now() - cached.cachedAt > CACHE_TTL_MS) {
    try {
      const binaryResponse = await fetch(firmware.url, { cache: 'force-cache' })
      if (!binaryResponse.ok) {
        return NextResponse.json(
          { error: 'BINARY_UNAVAILABLE', message: `Firmware binary returned ${binaryResponse.status}` },
          { status: 502 },
        )
      }
      const buffer = Buffer.from(await binaryResponse.arrayBuffer())

      // Sign the FULL binary with ECDSA P-256
      let signature: string
      try {
        signature = signBinaryEcdsa(buffer)
      } catch {
        return NextResponse.json(
          { error: 'SIGNING_FAILED', message: 'OTA_ECDSA_PRIVATE_KEY not configured. Run: bun run scripts/generate-ota-keys.ts' },
          { status: 500 },
        )
      }

      const checksum = computeChecksum(buffer)

      cached = {
        buffer,
        signature,
        checksum,
        version: firmware.version,
        cachedAt: Date.now(),
      }
      firmwareCache.set(firmwareId, cached)
    } catch (e: any) {
      return NextResponse.json(
        { error: 'BINARY_FETCH_FAILED', message: e.message },
        { status: 502 },
      )
    }
  }

  const { buffer, signature, checksum } = cached
  const totalSize = buffer.length

  // ── 4. Common response headers (signature + metadata) ──
  // These are sent on BOTH 200 (full) and 206 (partial) responses.
  // The device must verify the signature AFTER reassembling all chunks.
  const securityHeaders: Record<string, string> = {
    'X-Firmware-Signature': signature,
    'X-Firmware-Signature-Algorithm': 'ecdsa-p256-sha256',
    'X-Firmware-Signature-Key-Id': process.env.OTA_ECDSA_KEY_ID || 'key-ecdsa-001',
    'X-Firmware-Checksum': checksum,
    'X-Firmware-Version': firmware.version,
    'X-Firmware-Size': String(totalSize),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=300, immutable',
  }

  // ── 5. Handle Range request (206 Partial Content) ──
  const rangeHeader = req.headers.get('range')
  if (rangeHeader && rangeHeader.startsWith('bytes=')) {
    const rangeMatch = rangeHeader.match(/bytes=(\d*)-(\d*)/)
    if (rangeMatch) {
      const start = rangeMatch[1] ? parseInt(rangeMatch[1], 10) : 0
      const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : totalSize - 1

      // Validate range
      if (start > end || start >= totalSize || end >= totalSize) {
        return NextResponse.json(
          { error: 'RANGE_NOT_SATISFIABLE', message: `Valid range: 0-${totalSize - 1}` },
          { status: 416, headers: { 'Content-Range': `bytes */${totalSize}` } },
        )
      }

      const chunk = buffer.subarray(start, end + 1)
      const contentRange = `bytes ${start}-${end}/${totalSize}`

      return new NextResponse(new Blob([chunk as BlobPart]), {
        status: 206,
        headers: {
          ...securityHeaders,
          'Content-Range': contentRange,
          'Content-Length': String(chunk.length),
          'Content-Type': 'application/octet-stream',
        },
      })
    }
  }

  // ── 6. Full binary (200 OK) ──
  return new NextResponse(new Blob([buffer as BlobPart]), {
    status: 200,
    headers: {
      ...securityHeaders,
      'Content-Length': String(totalSize),
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="firmware-${firmware.version}.bin"`,
    },
  })
}
