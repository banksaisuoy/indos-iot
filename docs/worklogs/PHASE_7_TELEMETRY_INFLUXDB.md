# Phase 7 — Telemetry Persistence + InfluxDB

**Status:** ✅ Complete

## Summary
Moved high-frequency telemetry to InfluxDB with SQLite fallback. Retention policy: 90d raw, 365d downsampled.

## Files Changed
- `src/lib/influx.ts` (NEW) — InfluxDB client: writeTelemetry, queryTelemetry, isInfluxAvailable
- `mini-services/telemetry/index.ts` — persistTelemetry() on every MQTT publish + sim tick
- `src/app/api/indos/telemetry/[deviceId]/route.ts` — tries InfluxDB first, falls back to SQLite
- `src/lib/influx.test.ts` (NEW) — 3 tests
- `package.json`, `mini-services/telemetry/package.json` — @influxdata/influxdb-client
- `.env.example` — INFLUX_URL, INFLUX_TOKEN, INFLUX_ORG, INFLUX_BUCKET

## Verification
- Dev mode (no InfluxDB): live stream works, query falls back to SQLite
- Production (with InfluxDB): every telemetry point persisted with 5s batch flush
- 23/23 tests pass (at time of phase)
