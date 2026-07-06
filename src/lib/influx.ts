import { InfluxDB, Point } from '@influxdata/influxdb-client'

/**
 * IndOS InfluxDB Telemetry Client
 *
 * Writes high-frequency telemetry to InfluxDB (time-series database).
 * Falls back silently to no-op if InfluxDB is not configured/reachable,
 * so the platform works in dev without InfluxDB running.
 *
 * In production, set these env vars:
 *   INFLUX_URL=http://localhost:8086
 *   INFLUX_TOKEN=your-token
 *   INFLUX_ORG=indos
 *   INFLUX_BUCKET=telemetry
 */

const INFLUX_URL = process.env.INFLUX_URL || ''
const INFLUX_TOKEN = process.env.INFLUX_TOKEN || ''
const INFLUX_ORG = process.env.INFLUX_ORG || 'indos'
const INFLUX_BUCKET = process.env.INFLUX_BUCKET || 'telemetry'

let writeApi: ReturnType<InfluxDB['getWriteApi']> | null = null
let influxAvailable = false

function initInflux() {
  if (!INFLUX_URL || !INFLUX_TOKEN) {
    console.log('[influx] Not configured — telemetry will use SQLite fallback')
    return
  }
  try {
    const influx = new InfluxDB({ url: INFLUX_URL, token: INFLUX_TOKEN })
    writeApi = influx.getWriteApi(INFLUX_ORG, INFLUX_BUCKET, 'ms')
    influxAvailable = true
    console.log(`[influx] ✅ Connected to InfluxDB at ${INFLUX_URL} (bucket: ${INFLUX_BUCKET})`)
  } catch (e) {
    console.warn('[influx] Failed to connect — using SQLite fallback:', (e as Error).message)
  }
}

initInflux()

export function isInfluxAvailable(): boolean {
  return influxAvailable
}

/**
 * Write a telemetry point to InfluxDB.
 * Non-blocking — errors are logged but don't crash.
 */
export function writeTelemetry(params: {
  deviceId: string
  name: string
  project: string
  metric: string
  unit: string
  value: number
  ts?: Date
}): void {
  if (!writeApi) return // InfluxDB not configured — caller should fallback to SQLite

  try {
    const point = new Point('telemetry')
      .tag('deviceId', params.deviceId)
      .tag('project', params.project)
      .tag('metric', params.metric)
      .tag('unit', params.unit)
      .tag('name', params.name)
      .floatField('value', params.value)
      .timestamp(params.ts || new Date())

    writeApi.writePoint(point)
  } catch (e) {
    console.warn('[influx] Write error:', (e as Error).message)
  }
}

/**
 * Flush pending writes (call periodically).
 */
export async function flushTelemetry(): Promise<void> {
  if (!writeApi) return
  try {
    await writeApi.flush()
  } catch (e) {
    console.warn('[influx] Flush error:', (e as Error).message)
  }
}

/**
 * Query historical telemetry from InfluxDB.
 * Returns array of { ts, value } points.
 */
export async function queryTelemetry(params: {
  deviceId: string
  metric?: string
  range?: string // e.g. '24h', '7d', '1h'
  limit?: number
}): Promise<{ ts: string; value: number; metric: string; unit: string }[]> {
  if (!influxAvailable || !INFLUX_URL) return []

  const range = params.range || '24h'
  const metricFilter = params.metric ? ` AND r.metric == "${params.metric}"` : ''
  const limit = params.limit || 240

  const query = `
    from(bucket: "${INFLUX_BUCKET}")
      |> range(start: -${range})
      |> filter(fn: (r) => r._measurement == "telemetry" AND r.deviceId == "${params.deviceId}"${metricFilter})
      |> sort(columns: ["_time"], desc: true)
      |> limit(n: ${limit})
  `

  try {
    const influx = new InfluxDB({ url: INFLUX_URL, token: INFLUX_TOKEN })
    const queryApi = influx.getQueryApi(INFLUX_ORG)
    const results: { ts: string; value: number; metric: string; unit: string }[] = []

    return new Promise((resolve) => {
      queryApi.queryRows(query, {
        next(row, tableMeta) {
          const o = tableMeta.toObject(row)
          results.push({
            ts: o._time,
            value: Number(o._value),
            metric: o.metric || '',
            unit: o.unit || '',
          })
        },
        error(e) {
          console.warn('[influx] Query error:', e.message)
          resolve([])
        },
        complete() {
          // Reverse to chronological order
          resolve(results.reverse())
        },
      })
    })
  } catch (e) {
    console.warn('[influx] Query failed:', (e as Error).message)
    return []
  }
}

/**
 * Set up retention policy (call on startup).
 * In InfluxDB 2.x, retention is set on the bucket via the UI or API.
 * This function documents the expected retention: 90 days raw, 1 year downsampled.
 */
export const RETENTION_POLICY = {
  raw: '90d',
  downsampled: '365d',
}
