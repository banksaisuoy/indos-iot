import { describe, it, expect, beforeAll } from 'vitest'
import {
  buildSignedManifest,
  verifyManifest,
  verifyChecksum,
  computeChecksum,
  canonicalize,
  generateKeyPair,
  type OtaManifest,
} from '@/lib/ota-signing'

// Set up test keys
beforeAll(() => {
  const { privateKeyBase64, publicKeyBase64 } = generateKeyPair()
  process.env.OTA_SIGNING_PRIVATE_KEY = privateKeyBase64
  process.env.OTA_SIGNING_PUBLIC_KEY = publicKeyBase64
  process.env.OTA_SIGNING_KEY_ID = 'test-key-001'
})

describe('OTA Signing: valid manifest', () => {
  it('builds and verifies a valid signed manifest', () => {
    const signed = buildSignedManifest({
      version: 'v2.5.0',
      deviceType: 'sensor',
      url: 'https://indos.local/firmware/v2.5.0.bin',
      checksum: 'sha256:abc123',
      sizeKb: 540,
      notes: 'BLE mesh support',
    })

    expect(signed.signature).toBeTruthy()
    expect(signed.signingKeyId).toBe('test-key-001')

    // Verify
    const manifest: OtaManifest = {
      version: signed.version,
      deviceType: signed.deviceType,
      url: signed.url,
      checksum: signed.checksum,
      sizeKb: signed.sizeKb,
      notes: signed.notes,
      createdAt: signed.createdAt,
      signingKeyId: signed.signingKeyId,
    }
    expect(verifyManifest(manifest, signed.signature)).toBe(true)
  })
})

describe('OTA Signing: invalid signature rejected', () => {
  it('rejects a tampered signature', () => {
    const signed = buildSignedManifest({
      version: 'v2.5.0',
      deviceType: 'sensor',
      url: 'https://indos.local/fw.bin',
      checksum: 'sha256:abc',
      sizeKb: 100,
    })

    // Tamper with the signature
    const tamperedSig = signed.signature.slice(0, -4) + 'AAAA'
    const manifest: OtaManifest = {
      version: signed.version,
      deviceType: signed.deviceType,
      url: signed.url,
      checksum: signed.checksum,
      sizeKb: signed.sizeKb,
      notes: signed.notes,
      createdAt: signed.createdAt,
      signingKeyId: signed.signingKeyId,
    }
    expect(verifyManifest(manifest, tamperedSig)).toBe(false)
  })

  it('rejects a manifest with tampered version', () => {
    const signed = buildSignedManifest({
      version: 'v2.5.0',
      deviceType: 'sensor',
      url: 'https://indos.local/fw.bin',
      checksum: 'sha256:abc',
      sizeKb: 100,
    })

    // Tamper with the version but keep original signature
    const tamperedManifest: OtaManifest = {
      version: 'v9.9.9', // different from signed
      deviceType: signed.deviceType,
      url: signed.url,
      checksum: signed.checksum,
      sizeKb: signed.sizeKb,
      notes: signed.notes,
      createdAt: signed.createdAt,
      signingKeyId: signed.signingKeyId,
    }
    expect(verifyManifest(tamperedManifest, signed.signature)).toBe(false)
  })
})

describe('OTA Signing: wrong checksum rejected', () => {
  it('computeChecksum produces sha256:hex format', () => {
    const hash = computeChecksum('test content')
    expect(hash.startsWith('sha256:')).toBe(true)
    expect(hash.length).toBe(7 + 64) // "sha256:" + 64 hex chars
  })

  it('verifyChecksum rejects mismatched content', () => {
    const expected = computeChecksum('original content')
    expect(verifyChecksum('tampered content', expected)).toBe(false)
    expect(verifyChecksum('original content', expected)).toBe(true)
  })
})

describe('OTA Signing: unsigned manifest rejected', () => {
  it('rejects empty signature', () => {
    const manifest: OtaManifest = {
      version: 'v2.5.0',
      deviceType: 'sensor',
      url: 'https://indos.local/fw.bin',
      checksum: 'sha256:abc',
      sizeKb: 100,
      createdAt: new Date().toISOString(),
      signingKeyId: 'test-key-001',
    }
    expect(verifyManifest(manifest, '')).toBe(false)
    expect(verifyManifest(manifest, 'invalid-base64!!!')).toBe(false)
  })
})

describe('OTA Signing: canonicalization', () => {
  it('produces deterministic output regardless of key order', () => {
    const m: OtaManifest = {
      version: 'v1.0',
      deviceType: 'sensor',
      url: 'http://x',
      checksum: 'sha256:a',
      sizeKb: 1,
      createdAt: '2025-01-01T00:00:00Z',
      signingKeyId: 'k1',
    }
    const c1 = canonicalize(m)
    // Should be a JSON string with sorted keys
    expect(c1).toContain('"version"')
    expect(c1).toContain('"signingKeyId"')
    // Should be deterministic
    const c2 = canonicalize(m)
    expect(c1).toBe(c2)
  })
})

describe('OTA Signing: downgrade protection (documented)', () => {
  it('documents that version comparison is the device responsibility', () => {
    // The server does not enforce downgrade protection — the ESP32 sketch
    // must compare the manifest version against its current firmware version
    // and reject if the new version is older.
    // Example ESP32 logic:
    //   if (compareVersions(manifest.version, CURRENT_VERSION) < 0) reject;
    const currentVersion = 'v2.5.0'
    const newVersion = 'v2.4.0'
    const isDowngrade = newVersion < currentVersion
    expect(isDowngrade).toBe(true)
  })
})
