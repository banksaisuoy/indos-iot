import crypto from 'crypto'

/**
 * IndOS OTA Signing Utility
 *
 * Uses Ed25519 for manifest signing (via Node.js built-in crypto).
 * Private key is loaded from env OTA_SIGNING_PRIVATE_KEY (base64).
 * Public key is loaded from env OTA_SIGNING_PUBLIC_KEY (base64).
 *
 * Security:
 * - Private key must NEVER be sent to the client.
 * - Public key may be embedded in ESP32 firmware for verification.
 * - Manifest is canonicalized JSON before signing to ensure deterministic verification.
 */

export interface OtaManifest {
  version: string
  deviceType: string
  url: string
  checksum: string         // sha256:hex
  sizeKb: number
  notes?: string
  createdAt: string        // ISO 8601
  signingKeyId: string
}

export interface SignedManifest extends OtaManifest {
  signature: string        // base64 Ed25519 signature
}

/**
 * Get the Ed25519 private key as a KeyObject from env.
 */
function getPrivateKey(): crypto.KeyObject {
  const b64 = process.env.OTA_SIGNING_PRIVATE_KEY
  if (!b64) throw new Error('OTA_SIGNING_PRIVATE_KEY env var not set. Run: bun run scripts/generate-ota-keys.ts')
  const der = Buffer.from(b64, 'base64')
  return crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' })
}

/**
 * Get the Ed25519 public key as a KeyObject from env.
 */
export function getPublicKey(): crypto.KeyObject {
  const b64 = process.env.OTA_SIGNING_PUBLIC_KEY
  if (!b64) throw new Error('OTA_SIGNING_PUBLIC_KEY env var not set')
  const der = Buffer.from(b64, 'base64')
  return crypto.createPublicKey({ key: der, format: 'der', type: 'spki' })
}

/**
 * Get the public key as base64 (for embedding in ESP32 firmware).
 */
export function getPublicKeyBase64(): string {
  return process.env.OTA_SIGNING_PUBLIC_KEY || ''
}

/**
 * Canonicalize a manifest object for deterministic signing.
 * Sorts keys alphabetically, no whitespace.
 */
export function canonicalize(manifest: OtaManifest): string {
  return JSON.stringify(manifest, Object.keys(manifest).sort())
}

/**
 * Compute SHA-256 checksum of content (hex string prefixed with 'sha256:').
 */
export function computeChecksum(content: Buffer | string): string {
  const buf = typeof content === 'string' ? Buffer.from(content) : content
  const hash = crypto.createHash('sha256').update(buf).digest('hex')
  return `sha256:${hash}`
}

/**
 * Sign a manifest with the Ed25519 private key.
 * Returns the signature as base64.
 */
export function signManifest(manifest: OtaManifest): string {
  const privateKey = getPrivateKey()
  const data = Buffer.from(canonicalize(manifest), 'utf-8')
  const signature = crypto.sign(null, data, privateKey)
  return signature.toString('base64')
}

/**
 * Verify a manifest signature with the Ed25519 public key.
 * Returns true if the signature is valid.
 */
export function verifyManifest(manifest: OtaManifest, signature: string): boolean {
  try {
    const publicKey = getPublicKey()
    const data = Buffer.from(canonicalize(manifest), 'utf-8')
    const sigBuf = Buffer.from(signature, 'base64')
    return crypto.verify(null, data, publicKey, sigBuf)
  } catch {
    return false
  }
}

/**
 * Verify a checksum matches content.
 */
export function verifyChecksum(content: Buffer | string, expectedChecksum: string): boolean {
  const actual = computeChecksum(content)
  return actual === expectedChecksum
}

/**
 * Build and sign a complete manifest.
 */
export function buildSignedManifest(params: {
  version: string
  deviceType: string
  url: string
  checksum: string
  sizeKb: number
  notes?: string
}): SignedManifest {
  const manifest: OtaManifest = {
    version: params.version,
    deviceType: params.deviceType,
    url: params.url,
    checksum: params.checksum,
    sizeKb: params.sizeKb,
    notes: params.notes,
    createdAt: new Date().toISOString(),
    signingKeyId: process.env.OTA_SIGNING_KEY_ID || 'key-001',
  }
  const signature = signManifest(manifest)
  return { ...manifest, signature }
}

/**
 * Generate a new Ed25519 key pair.
 * Returns { privateKeyBase64, publicKeyBase64 }.
 */
export function generateKeyPair(): { privateKeyBase64: string; publicKeyBase64: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519')
  const privDer = privateKey.export({ type: 'pkcs8', format: 'der' })
  const pubDer = publicKey.export({ type: 'spki', format: 'der' })
  return {
    privateKeyBase64: privDer.toString('base64'),
    publicKeyBase64: pubDer.toString('base64'),
  }
}

// ═══════════════════════════════════════════════════════════════════════
// ECDSA P-256 Binary Signing (Phase 16)
// Used for signing firmware BINARIES (not manifests). The signature is
// appended to HTTP response headers so ESP32 devices can verify the
// downloaded binary after reassembling Range-request chunks.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get the ECDSA P-256 private key as a KeyObject from env.
 * Used for signing firmware binaries.
 */
function getEcdsaPrivateKey(): crypto.KeyObject {
  const b64 = process.env.OTA_ECDSA_PRIVATE_KEY
  if (!b64) throw new Error('OTA_ECDSA_PRIVATE_KEY env var not set. Run: bun run scripts/generate-ota-keys.ts')
  const der = Buffer.from(b64, 'base64')
  return crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' })
}

/**
 * Get the ECDSA P-256 public key as a KeyObject from env.
 * Used for verifying firmware binaries on the device side.
 */
export function getEcdsaPublicKey(): crypto.KeyObject {
  const b64 = process.env.OTA_ECDSA_PUBLIC_KEY
  if (!b64) throw new Error('OTA_ECDSA_PUBLIC_KEY env var not set')
  const der = Buffer.from(b64, 'base64')
  return crypto.createPublicKey({ key: der, format: 'der', type: 'spki' })
}

/**
 * Sign a binary buffer with ECDSA P-256 + SHA-256.
 * Returns the signature as base64 (DER-encoded, mbedtls-compatible).
 *
 * The ESP32 verifies this using:
 *   mbedtls_pk_parse_public_key() with the ECDSA public key
 *   mbedtls_pk_verify() with SHA-256 hash of the reassembled binary
 */
export function signBinaryEcdsa(binary: Buffer): string {
  const privateKey = getEcdsaPrivateKey()
  // SHA-256 is the hash algorithm; the signature is DER-encoded ECDSA
  const signature = crypto.sign('sha256', binary, privateKey)
  return signature.toString('base64')
}

/**
 * Verify an ECDSA P-256 signature against a binary buffer.
 * Returns true if the signature is valid.
 */
export function verifyBinaryEcdsa(binary: Buffer, signatureBase64: string): boolean {
  try {
    const publicKey = getEcdsaPublicKey()
    const signature = Buffer.from(signatureBase64, 'base64')
    return crypto.verify('sha256', binary, publicKey, signature)
  } catch {
    return false
  }
}

/**
 * Generate a new ECDSA P-256 key pair.
 */
export function generateEcdsaKeyPair(): { privateKeyBase64: string; publicKeyBase64: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const privDer = privateKey.export({ type: 'pkcs8', format: 'der' })
  const pubDer = publicKey.export({ type: 'spki', format: 'der' })
  return {
    privateKeyBase64: privDer.toString('base64'),
    publicKeyBase64: pubDer.toString('base64'),
  }
}

/**
 * Compare two semantic version strings (e.g., "v1.2.3" vs "v1.3.0").
 * Returns: 1 if a > b, -1 if a < b, 0 if equal.
 * Handles "v" prefix, build metadata, and pre-release suffixes.
 */
export function compareSemanticVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const clean = v.replace(/^v/i, '').split('-')[0].split('+')[0]
    return clean.split('.').map((n) => parseInt(n, 10) || 0)
  }
  const [aParts, bParts] = [parse(a), parse(b)]
  for (let i = 0; i < 3; i++) {
    const av = aParts[i] || 0
    const bv = bParts[i] || 0
    if (av > bv) return 1
    if (av < bv) return -1
  }
  return 0
}
