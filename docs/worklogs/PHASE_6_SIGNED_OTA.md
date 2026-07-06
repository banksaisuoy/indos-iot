# Phase 6 — Signed OTA Pipeline

**Status:** ✅ Complete

## Summary
Replaced fake Math.random OTA flow with secure signed OTA pipeline (Ed25519 + SHA-256).

## Files Changed
- `prisma/schema.prisma` — added url, signature, signingKeyId, manifest to Firmware; signedBy to OtaJob
- `src/lib/ota-signing.ts` (NEW) — Ed25519 sign/verify utility
- `src/lib/indos/schemas.ts` — firmwareRegisterSchema, otaDeploySchema
- `src/app/api/indos/firmware/route.ts` — POST registers + auto-signs manifest
- `src/app/api/indos/ota/route.ts` — POST creates signed job, rejects unsigned (400)
- `src/app/api/indos/ota/manifest/route.ts` (NEW) — device fetches signed manifest
- `src/components/indos/views/ota-view.tsx` — removed Math.random, calls real API
- `src/components/indos/views/deployment-view.tsx` — added OTA tab with ESP32 verification code
- `scripts/generate-ota-keys.ts` (NEW) — key generation
- `src/lib/ota-signing.test.ts` (NEW) — 8 tests
- `.env`, `.env.example` — OTA signing keys

## Verification
- Private key in env only, never sent to client
- Unsigned firmware rejected at API level
- 20/20 tests pass (at time of phase)
