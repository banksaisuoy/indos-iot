#!/usr/bin/env bun
/**
 * IndOS OTA Key Generator
 *
 * Generates an Ed25519 key pair for signing OTA manifests.
 * Outputs env vars to add to .env
 *
 * Usage: bun run scripts/generate-ota-keys.ts
 */
import { generateKeyPair } from '@/lib/ota-signing'

const { privateKeyBase64, publicKeyBase64 } = generateKeyPair()

console.log('🔐 IndOS OTA Ed25519 Key Pair Generated\n')
console.log('Add these to your .env file:\n')
console.log(`OTA_SIGNING_PRIVATE_KEY=${privateKeyBase64}`)
console.log(`OTA_SIGNING_PUBLIC_KEY=${publicKeyBase64}`)
console.log(`OTA_SIGNING_KEY_ID=key-001\n`)
console.log('⚠️  Keep the private key SECRET. Never commit it to git.')
console.log('📋 The public key can be embedded in ESP32 firmware for verification.')
