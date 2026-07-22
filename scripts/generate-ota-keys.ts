#!/usr/bin/env bun
/**
 * IndOS OTA Key Generator
 *
 * Generates TWO key pairs for OTA firmware signing:
 *   1. Ed25519 — for manifest signing (fast, compact signatures)
 *   2. ECDSA P-256 — for binary signing (widely supported on ESP32/mbedtls)
 *
 * Outputs env vars to add to .env
 *
 * Usage: bun run scripts/generate-ota-keys.ts
 */
import crypto from 'crypto'

// ── Ed25519 (manifest signing) ────────────────────────────────────────
const ed25519 = crypto.generateKeyPairSync('ed25519')
const ed25519PrivDer = ed25519.privateKey.export({ type: 'pkcs8', format: 'der' })
const ed25519PubDer = ed25519.publicKey.export({ type: 'spki', format: 'der' })

// ── ECDSA P-256 (binary signing — ESP32/mbedtls compatible) ──────────
const ecdsa = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const ecdsaPrivDer = ecdsa.privateKey.export({ type: 'pkcs8', format: 'der' })
const ecdsaPubDer = ecdsa.publicKey.export({ type: 'spki', format: 'der' })

console.log('🔐 IndOS OTA Key Pair Generation (Phase 16)\n')
console.log('─'.repeat(60))
console.log('Add these to your .env file:\n')

console.log('# ── Ed25519 (manifest signing) ──')
console.log(`OTA_SIGNING_PRIVATE_KEY=${ed25519PrivDer.toString('base64')}`)
console.log(`OTA_SIGNING_PUBLIC_KEY=${ed25519PubDer.toString('base64')}`)
console.log(`OTA_SIGNING_KEY_ID=key-001\n`)

console.log('# ── ECDSA P-256 (binary signing — for ESP32 Range-download) ──')
console.log(`OTA_ECDSA_PRIVATE_KEY=${ecdsaPrivDer.toString('base64')}`)
console.log(`OTA_ECDSA_PUBLIC_KEY=${ecdsaPubDer.toString('base64')}`)
console.log(`OTA_ECDSA_KEY_ID=key-ecdsa-001\n`)

console.log('─'.repeat(60))
console.log('⚠️  Keep ALL private keys SECRET. Never commit to git.')
console.log('📋 Public keys can be embedded in ESP32 firmware for verification.')
console.log('\nESP32 verification (mbedtls):')
console.log('  - Ed25519: use mbedtls_pk_parse_public_key() + mbedtls_pk_verify()')
console.log('  - ECDSA P-256: use mbedtls_ecdsa_verify() with SHA-256')
