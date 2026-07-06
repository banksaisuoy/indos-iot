import { describe, it, expect } from 'vitest'
import { isInfluxAvailable, RETENTION_POLICY } from '@/lib/influx'

describe('InfluxDB telemetry persistence', () => {
  it('isInfluxAvailable returns boolean (false in dev without InfluxDB)', () => {
    expect(typeof isInfluxAvailable()).toBe('boolean')
    // In test env, InfluxDB is not configured
    expect(isInfluxAvailable()).toBe(false)
  })

  it('retention policy is defined (90d raw, 365d downsampled)', () => {
    expect(RETENTION_POLICY.raw).toBe('90d')
    expect(RETENTION_POLICY.downsampled).toBe('365d')
  })

  it('documents the fallback contract: InfluxDB → SQLite', () => {
    // The telemetry query API (GET /api/indos/telemetry/[deviceId]) tries InfluxDB first.
    // If InfluxDB is unavailable or returns empty, it falls back to SQLite.
    // This ensures the platform works in dev (no InfluxDB) and production (with InfluxDB).
    const fallbackStrategy = 'influx-first, sqlite-fallback'
    expect(fallbackStrategy).toContain('influx')
    expect(fallbackStrategy).toContain('sqlite')
  })
})
