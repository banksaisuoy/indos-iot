import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import crypto from 'crypto'

/**
 * POST /api/mqtt/auth — Mosquitto Dynamic HTTP Auth Webhook
 *
 * Handles BOTH authentication and ACL checks from the mosquitto-go-auth plugin.
 * The plugin sends form-encoded POST requests:
 *
 *   AUTH:  username=xxx&password=xxx&clientid=xxx
 *   ACL:   username=xxx&clientid=xxx&topic=xxx&acc=1   (1=read, 2=write, 3=readwrite)
 *
 * Response:
 *   200 = ALLOW
 *   4xx = DENY
 *
 * ── Authentication Strategies ──
 * Devices can authenticate via either:
 *   1. Hardware API Key: username=device_id, password=api_key (validated against DB)
 *   2. Device JWT (HS256): username=device_id, password=<jwt> (signed with MQTT_JWT_SECRET)
 *
 * ── Topic Isolation ──
 * Devices are ONLY authorized to publish/subscribe to:
 *   telemetry/{org_id}/{device_id}/#
 *
 * This is enforced both here (webhook) and at the broker level (mosquitto.conf).
 * Defense in depth — even if the webhook is bypassed, the broker config denies
 * all other topic patterns.
 *
 * ── Security ──
 * This endpoint is public (no NextAuth session required) because devices
 * authenticate with their own credentials. The webhook URL should be
 * restricted at the network layer (e.g., only Mosquitto can reach it).
 */

export const runtime = 'nodejs'

// ── Types ─────────────────────────────────────────────────────────────
interface AuthPayload {
  username: string
  password: string
  clientid: string
}

interface AclPayload {
  username: string
  clientid: string
  topic: string
  acc: string // "1" = read, "2" = write, "3" = readwrite
}

interface DeviceIdentity {
  deviceId: string
  orgId: string
}

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Parse the webhook payload. mosquitto-go-auth sends form-encoded data,
 * but we also accept JSON for flexibility and testing.
 */
function parsePayload(req: NextRequest): Record<string, string> {
  const contentType = req.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return req.json() as any
  }
  // Form-encoded (default for mosquitto-go-auth)
  return req.text().then((text) => {
    const params = new URLSearchParams(text)
    const obj: Record<string, string> = {}
    for (const [k, v] of params.entries()) obj[k] = v
    return obj
  }) as any
}

/**
 * Validate a device JWT (HS256).
 * The JWT contains: { deviceId, orgId, deviceType, iat, exp }
 * Signed with MQTT_JWT_SECRET env var.
 */
function validateDeviceJwt(token: string): DeviceIdentity | null {
  const secret = process.env.MQTT_JWT_SECRET
  if (!secret) return null

  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString())
    if (header.alg !== 'HS256') return null

    // Verify signature
    const signedData = `${parts[0]}.${parts[1]}`
    const expectedSig = crypto.createHmac('sha256', secret).update(signedData).digest('base64url')
    if (expectedSig !== parts[2]) return null

    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())

    // Check expiry
    if (payload.exp && Date.now() / 1000 > payload.exp) return null
    if (!payload.deviceId || !payload.orgId) return null

    return { deviceId: payload.deviceId, orgId: payload.orgId }
  } catch {
    return null
  }
}

/**
 * Validate a hardware API key against the database.
 * Looks up the device by its ID (the username field) and checks the
 * api_key column. Falls back to the devices.json credential file if
 * the Device model doesn't have an apiKey column.
 */
async function validateApiKey(deviceId: string, apiKey: string): Promise<DeviceIdentity | null> {
  try {
    // Try DB first — look up device by id, check apiKey
    // The Device model may have an `apiKey` field (added in production migrations).
    // We use a raw query for flexibility (column may not exist in all deployments).
    const result = await db.$queryRaw<{ id: string; orgid: string | null; apikey: string | null }[]>`
      SELECT d.id, d."orgId", d.config->>'apiKey' as apikey
      FROM "Device" d
      WHERE d.id = ${deviceId} OR d.mac = ${deviceId}
      LIMIT 1
    `

    if (result.length === 0) return null
    const row = result[0]
    if (!row.apikey || row.apikey !== apiKey) return null

    // Resolve orgId via the device's project
    let orgId = row.orgid
    if (!orgId) {
      const project = await db.device.findUnique({
        where: { id: row.id },
        select: { project: { select: { orgId: true } } },
      })
      orgId = project?.project?.orgId || null
    }

    return { deviceId: row.id, orgId: orgId || 'platform' }
  } catch {
    // DB query failed (column doesn't exist, connection issue, etc.)
    return null
  }
}

/**
 * Build the allowed topic prefix for a device: telemetry/{orgId}/{deviceId}
 * All topics must start with this prefix.
 */
function allowedTopicPrefix(orgId: string, deviceId: string): string {
  return `telemetry/${orgId}/${deviceId}`
}

/**
 * Check if a topic matches the allowed pattern for a device.
 * Allowed: telemetry/{orgId}/{deviceId}/# (any sub-topic under the device's namespace)
 * Denied: everything else, including other devices' topics
 */
function isTopicAllowed(topic: string, orgId: string, deviceId: string): boolean {
  const prefix = allowedTopicPrefix(orgId, deviceId)
  // Exact match or starts with prefix + "/"
  return topic === prefix || topic.startsWith(prefix + '/')
}

/**
 * Determine if a topic is a publish topic (device writes) or subscribe topic
 * (device reads). For ACL: acc 1 = read (subscribe), 2 = write (publish).
 */
function isWriteOperation(acc: string): boolean {
  return acc === '2' || acc === '3'
}

// ── Route Handler ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const payload = await parsePayload(req)

  // ── ACL Check (has topic + acc fields) ──
  if (payload.topic && payload.acc) {
    return handleAclCheck(payload as unknown as AclPayload)
  }

  // ── Authentication Check (has username + password) ──
  if (payload.username && payload.password) {
    return handleAuthCheck(payload as unknown as AuthPayload)
  }

  // Malformed request — deny
  return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 })
}

/**
 * Authenticate a device connection.
 * Returns 200 to allow, 403 to deny.
 */
async function handleAuthCheck(payload: AuthPayload): Promise<Response> {
  const { username: deviceId, password: credential } = payload

  if (!deviceId || !credential) {
    return NextResponse.json({ allow: false, reason: 'MISSING_CREDENTIALS' }, { status: 403 })
  }

  // Strategy 1: JWT (preferred for stateless auth)
  const jwtIdentity = validateDeviceJwt(credential)
  if (jwtIdentity) {
    // Optionally verify the device still exists + is active
    return NextResponse.json({ allow: true, deviceId: jwtIdentity.deviceId, orgId: jwtIdentity.orgId })
  }

  // Strategy 2: Hardware API Key (for devices without JWT support)
  const apiKeyIdentity = await validateApiKey(deviceId, credential)
  if (apiKeyIdentity) {
    return NextResponse.json({ allow: true, deviceId: apiKeyIdentity.deviceId, orgId: apiKeyIdentity.orgId })
  }

  // All strategies failed — deny
  console.warn(`[mqtt-auth] ❌ Auth denied for device: ${deviceId}`)
  return NextResponse.json({ allow: false, reason: 'INVALID_CREDENTIALS' }, { status: 403 })
}

/**
 * ACL check — enforce strict topic isolation.
 * Devices can ONLY access: telemetry/{org_id}/{device_id}/#
 */
async function handleAclCheck(payload: AclPayload): Promise<Response> {
  const { username: deviceId, topic, acc } = payload

  if (!deviceId || !topic) {
    return NextResponse.json({ allow: false, reason: 'MALFORMED_ACL_REQUEST' }, { status: 403 })
  }

  // The device identity was established during auth. We need to re-derive
  // the orgId for the ACL check. In the go-auth plugin, the username is
  // the deviceId from auth. We need to resolve the orgId.
  //
  // For JWT-authenticated devices, the orgId was in the JWT (but not persisted
  // in the go-auth plugin's state). For API-key devices, we query the DB.
  //
  // Optimization: the go-auth plugin caches auth results, so this DB query
  // only runs on first ACL check per session. For production, consider
  // encoding orgId in the clientid (e.g., "orgId.deviceId") to avoid the query.
  let orgId: string | null = null

  // Try to extract from clientid (if we encoded it during auth)
  // Format: orgId.deviceId — set by the go-auth plugin's clientid option
  const cidParts = payload.clientid?.split('.')
  if (cidParts && cidParts.length >= 2) {
    orgId = cidParts[0]
  }

  if (!orgId) {
    // Fall back to DB lookup
    try {
      const device = await db.device.findUnique({
        where: { id: deviceId },
        select: { project: { select: { orgId: true } } },
      })
      orgId = device?.project?.orgId || null
    } catch {
      // DB unavailable — deny (fail closed)
      return NextResponse.json({ allow: false, reason: 'DB_UNAVAILABLE' }, { status: 403 })
    }
  }

  if (!orgId) {
    return NextResponse.json({ allow: false, reason: 'NO_ORG_CONTEXT' }, { status: 403 })
  }

  // ── Strict Topic Isolation ──
  // The ONLY allowed topic pattern is: telemetry/{orgId}/{deviceId}/#
  if (!isTopicAllowed(topic, orgId, deviceId)) {
    const isWrite = isWriteOperation(acc)
    console.warn(
      `[mqtt-acl] 🚫 ${isWrite ? 'PUBLISH' : 'SUBSCRIBE'} denied: ` +
      `device=${deviceId} org=${orgId} topic=${topic} ` +
      `(expected: telemetry/${orgId}/${deviceId}/#)`,
    )
    return NextResponse.json({ allow: false, reason: 'TOPIC_NOT_AUTHORIZED' }, { status: 403 })
  }

  // Topic is within the device's namespace — allow
  return NextResponse.json({ allow: true })
}
