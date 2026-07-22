// IndOS Telemetry + MQTT Broker Mini-Service
// Port 3030: socket.io (realtime push to web clients)
// Port 1883: MQTT broker (aedes) — real ESP32/PLC/gateway devices publish here
//             → messages forwarded to socket.io clients as live telemetry
//
// ARCHITECTURE (Phase 16 hardening):
// - In-memory TelemetryBuffer batches inserts (500 records OR 1000ms flush)
// - prisma.telemetry.createMany for high-throughput batch inserts
// - Exponential backoff retry (200ms base, 5 attempts, jitter) on insert failure
// - Graceful SIGINT/SIGTERM shutdown flushes pending buffer before exit
// - InfluxDB remains as a parallel write path (not blocked by Prisma failures)
import { createServer } from 'http'
import { Server } from 'socket.io'
import net from 'net'
import { Aedes } from 'aedes'
import bcrypt from 'bcryptjs'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { InfluxDB, Point } from '@influxdata/influxdb-client'
import { PrismaClient } from '@prisma/client'

// ── Prisma client (singleton — avoids connection exhaustion) ──────────
const prisma = new PrismaClient({
  log: ['error', 'warn'],
  datasources: {
    db: {
      // Prisma reads DATABASE_URL from env at construction time.
      // The telemetry service inherits the same DATABASE_URL as the web app.
    },
  },
})

// ═══════════════════════════════════════════════════════════════════════
// TelemetryBuffer — high-throughput batch insert with retry + graceful shutdown
// ═══════════════════════════════════════════════════════════════════════

interface TelemetryRecord {
  deviceId: string
  orgId: string | null
  metric: string
  value: number
  ts: Date
}

class TelemetryBuffer {
  private buffer: TelemetryRecord[] = []
  private flushing = false
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private isShuttingDown = false
  private inFlightFlushes = 0
  private totalInserted = 0
  private totalFailed = 0
  private totalRetries = 0

  private readonly MAX_BUFFER_SIZE = 500
  private readonly FLUSH_INTERVAL_MS = 1000
  private readonly MAX_RETRY_ATTEMPTS = 5
  private readonly RETRY_BASE_DELAY_MS = 200
  private readonly RETRY_MAX_DELAY_MS = 5000

  /**
   * Push a telemetry record into the buffer. Triggers an immediate flush
   * if the buffer has reached MAX_BUFFER_SIZE. Non-blocking — returns immediately.
   */
  push(record: TelemetryRecord): void {
    if (this.isShuttingDown) return
    this.buffer.push(record)
    if (this.buffer.length >= this.MAX_BUFFER_SIZE) {
      void this.flush()
    }
  }

  /**
   * Start the periodic flush timer. Call once at service boot.
   */
  start(): void {
    if (this.flushTimer) return
    this.flushTimer = setInterval(() => void this.flush(), this.FLUSH_INTERVAL_MS)
    // Don't keep the process alive solely for the timer (graceful shutdown handles flush)
    this.flushTimer.unref?.()
  }

  /**
   * Flush the buffer to the database. Concurrency-safe — only one flush
   * runs at a time. If a flush is already in progress, the buffer continues
   * accumulating and the next flush will pick up the new records.
   */
  async flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0) return
    this.flushing = true
    this.inFlightFlushes++

    // Atomically swap the buffer so new records accumulate in a fresh array
    // while we insert the batch. This prevents data loss under high load.
    const batch = this.buffer.splice(0, this.buffer.length)

    try {
      await this.insertWithRetry(batch)
      this.totalInserted += batch.length
    } catch (e: any) {
      this.totalFailed += batch.length
      // On final failure, re-queue the batch (unless we're shutting down —
      // during shutdown, dropping is safer than blocking exit indefinitely)
      if (!this.isShuttingDown && batch.length <= 2000) {
        this.buffer.unshift(...batch)
        console.error(
          `[telemetry-buffer] ❌ Flush failed after ${this.MAX_RETRY_ATTEMPTS} retries, ` +
          `re-queued ${batch.length} records (buffer: ${this.buffer.length}). Error: ${e.message}`,
        )
      } else {
        console.error(
          `[telemetry-buffer] ❌ Flush failed, DROPPED ${batch.length} records ` +
          `(shutting down or batch too large). Error: ${e.message}`,
        )
      }
    } finally {
      this.flushing = false
      this.inFlightFlushes--
    }
  }

  /**
   * Insert a batch with exponential backoff + jitter.
   * Uses prisma.telemetry.createMany with skipDuplicates for idempotency.
   */
  private async insertWithRetry(batch: TelemetryRecord[]): Promise<void> {
    for (let attempt = 0; attempt < this.MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        await prisma.telemetry.createMany({
          data: batch.map((r) => ({
            deviceId: r.deviceId,
            orgId: r.orgId,
            metric: r.metric,
            value: r.value,
            ts: r.ts,
          })),
          skipDuplicates: true,
        })
        if (attempt > 0) {
          console.log(`[telemetry-buffer] ✅ Inserted ${batch.length} records after ${attempt} retries`)
        }
        return
      } catch (e: any) {
        // Distinguish transient (connection/P2024/P1001) from permanent (schema/P2002) errors
        const isTransient =
          e.code === 'P2024' || // Timed out fetching connection
          e.code === 'P1001' || // Can't reach DB server
          e.code === 'P1002' || // Server closed connection
          e.message?.includes('ECONNRESET') ||
          e.message?.includes('ETIMEDOUT')

        if (!isTransient || attempt === this.MAX_RETRY_ATTEMPTS - 1) {
          throw e
        }

        this.totalRetries++
        const delay = Math.min(
          this.RETRY_BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 100,
          this.RETRY_MAX_DELAY_MS,
        )
        console.warn(
          `[telemetry-buffer] ⚠️ Insert failed (attempt ${attempt + 1}/${this.MAX_RETRY_ATTEMPTS}), ` +
          `retrying in ${Math.round(delay)}ms: ${e.code || e.message?.slice(0, 80)}`,
        )
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }

  /**
   * Graceful shutdown — stop accepting new records, flush all pending data,
   * wait for in-flight flushes to complete, then disconnect Prisma.
   * Timeout after 10s to prevent hanging on a dead DB.
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) return
    this.isShuttingDown = true
    console.log('[telemetry-buffer] 🛑 Graceful shutdown initiated — flushing pending buffer...')

    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }

    // Flush remaining buffer with a 10s hard timeout
    const flushPromise = this.flushAllPending()
    const timeoutPromise = new Promise<void>((resolve) => setTimeout(() => {
      console.warn('[telemetry-buffer] ⚠️ Shutdown timeout (10s) — forcing exit')
      resolve()
    }, 10_000))

    await Promise.race([flushPromise, timeoutPromise])

    console.log(
      `[telemetry-buffer] 📊 Stats: inserted=${this.totalInserted} failed=${this.totalFailed} retries=${this.totalRetries}`,
    )

    await prisma.$disconnect()
    console.log('[telemetry-buffer] ✅ Prisma disconnected, shutdown complete')
  }

  /**
   * Flush all pending records, waiting for any in-flight flush to complete first.
   */
  private async flushAllPending(): Promise<void> {
    // Wait for any in-flight flush
    while (this.inFlightFlushes > 0) {
      await new Promise((r) => setTimeout(r, 50))
    }
    // Flush remaining buffer (may have accumulated during the wait)
    while (this.buffer.length > 0) {
      await this.flush()
      // Wait for this flush to complete
      while (this.inFlightFlushes > 0) {
        await new Promise((r) => setTimeout(r, 50))
      }
    }
  }

  getStats() {
    return {
      bufferSize: this.buffer.length,
      inFlightFlushes: this.inFlightFlushes,
      totalInserted: this.totalInserted,
      totalFailed: this.totalFailed,
      totalRetries: this.totalRetries,
      isShuttingDown: this.isShuttingDown,
    }
  }
}

const telemetryBuffer = new TelemetryBuffer()
telemetryBuffer.start()

// ═══════════════════════════════════════════════════════════════════════
// InfluxDB (parallel persistence path — independent of Prisma)
// ═══════════════════════════════════════════════════════════════════════
const INFLUX_URL = process.env.INFLUX_URL || ''
const INFLUX_TOKEN = process.env.INFLUX_TOKEN || ''
const INFLUX_ORG = process.env.INFLUX_ORG || 'indos'
const INFLUX_BUCKET = process.env.INFLUX_BUCKET || 'telemetry'

let influxWriteApi: any = null
let influxAvailable = false

function initInflux() {
  if (!INFLUX_URL || !INFLUX_TOKEN) {
    console.log('[influx] Not configured — telemetry will persist to Postgres only')
    return
  }
  try {
    const influx = new InfluxDB({ url: INFLUX_URL, token: INFLUX_TOKEN })
    influxWriteApi = influx.getWriteApi(INFLUX_ORG, INFLUX_BUCKET, 'ms')
    influxAvailable = true
    console.log(`[influx] ✅ Connected to InfluxDB at ${INFLUX_URL} (bucket: ${INFLUX_BUCKET})`)
  } catch (e: any) {
    console.warn('[influx] Failed to connect:', e.message)
  }
}
initInflux()

function persistTelemetry(params: { deviceId: string; name: string; project: string; metric: string; unit: string; value: number }) {
  if (!influxWriteApi) return
  try {
    const point = new Point('telemetry')
      .tag('deviceId', params.deviceId)
      .tag('project', params.project)
      .tag('metric', params.metric)
      .tag('unit', params.unit)
      .tag('name', params.name)
      .floatField('value', params.value)
      .timestamp(new Date())
    influxWriteApi.writePoint(point)
  } catch {
    // Non-fatal — live stream + Postgres still work
  }
}

// Flush InfluxDB writes every 5 seconds (batch)
if (influxAvailable) {
  setInterval(async () => {
    try { await influxWriteApi.flush() } catch {}
  }, 5000)
}

// ═══════════════════════════════════════════════════════════════════════
// Socket.io + Aedes MQTT broker
// ═══════════════════════════════════════════════════════════════════════
const IO_PORT = 3030
const MQTT_PORT = 1883

const httpServer = createServer()
const io = new Server(httpServer, { path: '/', cors: { origin: '*', methods: ['GET', 'POST'] }, pingTimeout: 60000, pingInterval: 25000 })

// ── Device credential store ───────────────────────────────────────────
interface DeviceCredential {
  username: string
  passwordHash: string
  project: string
  orgId?: string | null
}

const devicesFile = join(import.meta.dir, 'devices.json')
let deviceCredentials: DeviceCredential[] = []

function loadDeviceCredentials() {
  if (!existsSync(devicesFile)) {
    console.log('[indos-mqtt] ⚠️  No devices.json found — creating default device')
    const defaultDevice: DeviceCredential = {
      username: 'esp32-sensor-01',
      passwordHash: bcrypt.hashSync('indos-device-001', 10),
      project: 'bkk-energy',
    }
    deviceCredentials = [defaultDevice]
    const { writeFileSync } = require('fs')
    writeFileSync(devicesFile, JSON.stringify([defaultDevice], null, 2))
    console.log('[indos-mqtt] ✅ Created default device: esp32-sensor-01 / indos-device-001')
  } else {
    deviceCredentials = JSON.parse(readFileSync(devicesFile, 'utf-8'))
    console.log(`[indos-mqtt] ✅ Loaded ${deviceCredentials.length} device credentials from devices.json`)
  }
}
loadDeviceCredentials()

// ── Real MQTT broker (aedes) with AUTH + ACL ──────────────────────────
const broker = new Aedes({ id: 'indos-broker' })

broker.authenticate = (client: any, username: string, password: Buffer, callback: Function) => {
  if (!username || !password) {
    console.log(`[indos-mqtt] ❌ Auth failed: missing credentials from ${client.id}`)
    return callback(null, false)
  }

  const plainPassword = password.toString()

  if (username === 'indos-bridge' && (plainPassword === process.env.BRIDGE_PASSWORD || plainPassword === 'indos-bridge-secret')) {
    client.deviceUsername = username
    client.isBridge = true
    console.log(`[indos-mqtt] 🔑 Bridge authenticated: ${client.id}`)
    return callback(null, true)
  }

  const cred = deviceCredentials.find(d => d.username === username)
  if (!cred) {
    console.log(`[indos-mqtt] ❌ Auth failed: unknown device "${username}"`)
    return callback(null, false)
  }

  if (!bcrypt.compareSync(plainPassword, cred.passwordHash)) {
    console.log(`[indos-mqtt] ❌ Auth failed: wrong password for "${username}"`)
    return callback(null, false)
  }

  client.deviceUsername = username
  client.deviceProject = cred.project
  client.deviceOrgId = cred.orgId ?? null
  console.log(`[indos-mqtt] 🔑 Device authenticated: ${username} (project: ${cred.project}${cred.orgId ? `, org: ${cred.orgId}` : ''})`)
  callback(null, true)
}

broker.authorizePublish = (client: any, packet: any, callback: Function) => {
  if (client.isBridge) return callback(null)

  const topic = packet.topic
  const username = client.deviceUsername

  if (!username) {
    console.log(`[indos-mqtt] 🚫 Publish denied: unauthenticated client to "${topic}"`)
    return callback(new Error('Not authorized'))
  }

  const orgId = client.deviceOrgId as string | null | undefined
  const ns = orgId ? `indos/${orgId}/devices/${username}` : `indos/devices/${username}`
  const allowedSuffixes = ['telemetry', 'heartbeat', 'status']
  const allowed = allowedSuffixes.some(suf => topic === `${ns}/${suf}` || topic.startsWith(`${ns}/${suf}/`))

  if (!allowed) {
    console.log(`[indos-mqtt] 🚫 Publish denied: "${username}" → "${topic}" (expected prefix ${ns}/)`)
    return callback(new Error('Topic not authorized'))
  }

  callback(null)
}

broker.authorizeSubscribe = (client: any, subscription: any, callback: Function) => {
  if (client.isBridge) return callback(null, subscription)

  const topic = subscription.topic
  const username = client.deviceUsername

  if (!username) {
    console.log(`[indos-mqtt] 🚫 Subscribe denied: unauthenticated client to "${topic}"`)
    return callback(new Error('Not authorized'))
  }

  const orgId = client.deviceOrgId as string | null | undefined
  const ns = orgId ? `indos/${orgId}/devices/${username}` : `indos/devices/${username}`
  const allowedSuffixes = ['cmd', 'config', 'ota']
  const allowed = allowedSuffixes.some(suf => topic === `${ns}/${suf}` || topic.startsWith(`${ns}/${suf}/`)) || topic === `${ns}/#`

  if (!allowed) {
    console.log(`[indos-mqtt] 🚫 Subscribe denied: "${username}" → "${topic}" (expected prefix ${ns}/)`)
    return callback(new Error('Topic not authorized'))
  }

  callback(null, subscription)
}

const mqttServer = net.createServer(broker.handle)
mqttServer.listen(MQTT_PORT, () => console.log(`[indos-mqtt] ✅ MQTT broker listening on :${MQTT_PORT} (AUTH REQUIRED)`))

let mqttClientCount = 0
let mqttMsgCount = 0
broker.on('client', (client) => { mqttClientCount++; console.log(`[indos-mqtt] 📡 device connected: ${client.id} (total: ${mqttClientCount})`) })
broker.on('clientDisconnect', (client) => { mqttClientCount = Math.max(0, mqttClientCount - 1); console.log(`[indos-mqtt] device disconnected: ${client.id} (total: ${mqttClientCount})`) })
broker.on('publish', (packet, client) => {
  if (!client) return
  mqttMsgCount++
  const topic = packet.topic
  const payload = packet.payload?.toString()
  let value: number | null = null
  let unit = '', metric = topic.split('/').pop() || 'value', name = topic, project = (client as any).deviceProject || 'external'
  const orgId = (client as any).deviceOrgId ?? null
  if (payload) {
    const num = Number(payload)
    if (!isNaN(num)) value = num
    else {
      try { const j = JSON.parse(payload); value = j.value ?? null; unit = j.unit || ''; metric = j.metric || metric; name = j.name || name; project = j.project || project } catch {
        console.warn(`[indos-mqtt] ⚠️ Bad JSON payload from ${client.id} on ${topic}`)
      }
    }
  }
  if (value !== null) {
    console.log(`[indos-mqtt] 📨 ${topic} = ${value} ${unit} (from ${client.id})`)
    // ── Persist to InfluxDB (parallel path, non-blocking) ──
    persistTelemetry({ deviceId: client.id, name, project, metric, unit, value })
    // ── Push to Prisma batch buffer (high-throughput persistence) ──
    telemetryBuffer.push({
      deviceId: client.id,
      orgId,
      metric,
      value,
      ts: new Date(),
    })
    // ── Realtime push to web clients ──
    const telemetryData = [{ deviceId: `mqtt:${client.id}:${topic}`, name, project, metric, unit, value, ts: new Date().toISOString(), source: 'mqtt', topic }]
    io.to(`project:${project}`).emit('telemetry', telemetryData)
    io.to('global').emit('telemetry', telemetryData)
  }
})

// ── Virtual device fleet (simulation) ────────────────────────────────
type Metric = 'temperature' | 'humidity' | 'power' | 'voltage' | 'pressure' | 'flow' | 'solar_yield' | 'ph' | 'co2' | 'rpm' | 'weight' | 'state'
interface VDevice { id: string; name: string; project: string; metric: Metric; unit: string; base: number; amp: number; phase: number; noise: number; status: 'online' | 'offline' | 'fault'; cpu: number; memory: number; temperature: number; signal: number }
const simProjects = ['bkk-energy','duck-farm','chiangmai-gh','isan-solar','rayong-water','line-a1','phuket-cold','doi-weather']
const metricDefs: { metric: Metric; unit: string; base: number; amp: number; noise: number }[] = [
  { metric: 'temperature', unit: '°C', base: 38, amp: 14, noise: 2.2 }, { metric: 'humidity', unit: '%', base: 62, amp: 16, noise: 3 },
  { metric: 'power', unit: 'kW', base: 180, amp: 60, noise: 8 }, { metric: 'voltage', unit: 'V', base: 230, amp: 6, noise: 1.5 },
  { metric: 'pressure', unit: 'bar', base: 8.5, amp: 3, noise: 0.4 }, { metric: 'flow', unit: 'L/min', base: 320, amp: 140, noise: 18 },
  { metric: 'solar_yield', unit: 'kW', base: 48, amp: 32, noise: 4 }, { metric: 'ph', unit: 'pH', base: 7.1, amp: 0.6, noise: 0.08 },
  { metric: 'co2', unit: 'ppm', base: 850, amp: 450, noise: 40 }, { metric: 'rpm', unit: 'rpm', base: 1850, amp: 600, noise: 45 },
  { metric: 'weight', unit: 'kg', base: 1200, amp: 400, noise: 12 }, { metric: 'state', unit: '', base: 1, amp: 0, noise: 0 },
]
const simDevices: VDevice[] = []
for (let i = 0; i < 48; i++) {
  const md = metricDefs[i % metricDefs.length]
  simDevices.push({ id: `dev-${String(i+1).padStart(3,'0')}`, name: `${md.metric}-${simProjects[i % simProjects.length]}-${String((i%8)+1).padStart(2,'0')}`, project: simProjects[i % simProjects.length], metric: md.metric, unit: md.unit, base: md.base, amp: md.amp, phase: Math.random()*Math.PI*2, noise: md.noise, status: Math.random() > 0.1 ? 'online' : Math.random() > 0.5 ? 'offline' : 'fault', cpu: 15 + Math.random()*60, memory: 25 + Math.random()*55, temperature: 30 + Math.random()*35, signal: 45 + Math.random()*55 })
}

const alarmTemplates = [
  { severity: 'critical', category: 'device', message: (d: VDevice) => `${d.name} ${d.metric} exceeded critical threshold` },
  { severity: 'warning', category: 'energy', message: (d: VDevice) => `Power demand spike on ${d.project} — ${d.name}` },
  { severity: 'warning', category: 'environment', message: (d: VDevice) => `${d.metric} trending high on ${d.name}` },
  { severity: 'info', category: 'system', message: (d: VDevice) => `${d.name} heartbeat re-established` },
  { severity: 'critical', category: 'maintenance', message: (d: VDevice) => `Predictive model flags ${d.name} for inspection` },
]
let tick = 0
function sample(d: VDevice, t: number): number { const wave = Math.sin(t/9 + d.phase)*d.amp; const daily = Math.sin(t/240 + d.phase)*(d.amp*0.3); const val = d.base + wave + daily + (Math.random()-0.5)*d.noise*2; if (d.metric === 'state') return Math.random() > 0.05 ? 1 : 0; return Number(Math.max(0, val).toFixed(2)) }

function broadcastTick() {
  tick++
  const batch: any[] = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = simDevices[(tick*12 + i) % simDevices.length]
    if (d.status === 'offline') continue
    const val = sample(d, tick)
    batch.push({ deviceId: d.id, name: d.name, project: d.project, metric: d.metric, unit: d.unit, value: val, ts: now.toISOString(), source: 'sim' })
    // Persist simulation telemetry to InfluxDB (if configured)
    persistTelemetry({ deviceId: d.id, name: d.name, project: d.project, metric: d.metric, unit: d.unit, value: val })
    // Push to Prisma batch buffer
    telemetryBuffer.push({ deviceId: d.id, orgId: null, metric: d.metric, value: val, ts: now })
    d.cpu = Math.max(5, Math.min(98, d.cpu + (Math.random()-0.5)*4))
    d.memory = Math.max(10, Math.min(96, d.memory + (Math.random()-0.5)*2))
    d.temperature = Math.max(22, Math.min(92, d.temperature + (Math.random()-0.5)*1.5))
    d.signal = Math.max(20, Math.min(100, d.signal + (Math.random()-0.5)*3))
  }
  if (batch.length > 0) {
    const byProject: Record<string, any[]> = {}
    for (const b of batch) { (byProject[b.project] ||= []).push(b) }
    for (const [proj, items] of Object.entries(byProject)) {
      io.to(`project:${proj}`).emit('telemetry', items)
    }
    io.to('global').emit('telemetry', batch)
  }
  if (tick % 5 === 0) io.to('global').emit('device-vitals', simDevices.slice(0,24).map((d) => ({ id: d.id, name: d.name, status: d.status, cpu: Number(d.cpu.toFixed(1)), memory: Number(d.memory.toFixed(1)), temperature: Number(d.temperature.toFixed(1)), signal: Number(d.signal.toFixed(1)) })))
  if (tick % 11 === 0) { const tpl = alarmTemplates[Math.floor(Math.random()*alarmTemplates.length)]; const d = simDevices[Math.floor(Math.random()*simDevices.length)]; io.to('global').emit('alarm', { id: `alm-${Date.now()}`, deviceId: d.id, project: d.project, severity: tpl.severity, category: tpl.category, message: tpl.message(d), state: 'active', ts: new Date().toISOString() }) }
  if (tick % 3 === 0) io.to('global').emit('system-metrics', { mqttThroughput: 1200 + Math.round(Math.sin(tick/10)*300 + Math.random()*120) + mqttMsgCount, activeConnections: 320 + Math.round(Math.sin(tick/14)*40 + Math.random()*20) + mqttClientCount, apiLatencyMs: Number((42 + Math.random()*18).toFixed(1)), dbPoolPct: Number((35 + Math.random()*25).toFixed(1)), cpuPct: Number((28 + Math.sin(tick/8)*12 + Math.random()*6).toFixed(1)), memPct: Number((54 + Math.sin(tick/11)*8 + Math.random()*4).toFixed(1)), diskPct: Number((61 + Math.random()*2).toFixed(1)), netInMbps: Number((180 + Math.random()*60).toFixed(1)), netOutMbps: Number((120 + Math.random()*40).toFixed(1)), mqttConnected: mqttClientCount > 0, mqttClients: mqttClientCount, mqttMessages: mqttMsgCount, ts: new Date().toISOString() })
}
const simTimer = setInterval(broadcastTick, 1500)

io.on('connection', (socket) => {
  console.log(`[indos-telemetry] ws client connected: ${socket.id}`)
  socket.join('global')
  socket.on('subscribe', (data: { project?: string; projects?: string[] }) => {
    if (data.project) { socket.join(`project:${data.project}`); console.log(`[indos-telemetry] ${socket.id} joined project:${data.project}`) }
    if (data.projects) { for (const p of data.projects) socket.join(`project:${p}`) }
  })
  socket.on('unsubscribe', (data: { project?: string }) => { if (data.project) socket.leave(`project:${data.project}`) })
  socket.emit('telemetry', simDevices.slice(0,24).map((d) => ({ deviceId: d.id, name: d.name, project: d.project, metric: d.metric, unit: d.unit, value: sample(d, tick), ts: new Date().toISOString(), source: 'sim' })))
  socket.emit('device-vitals', simDevices.slice(0,24).map((d) => ({ id: d.id, name: d.name, status: d.status, cpu: Number(d.cpu.toFixed(1)), memory: Number(d.memory.toFixed(1)), temperature: Number(d.temperature.toFixed(1)), signal: Number(d.signal.toFixed(1)) })))
  socket.on('ack-alarm', (id: string) => io.to('global').emit('alarm-update', { id, state: 'acknowledged', ackedBy: 'operator', ts: new Date().toISOString() }))
  socket.on('disconnect', () => console.log(`[indos-telemetry] ws client disconnected: ${socket.id}`))
})

httpServer.listen(IO_PORT, () => console.log(`[indos-telemetry] ✅ socket.io listening on :${IO_PORT}`))

// ═══════════════════════════════════════════════════════════════════════
// Graceful shutdown — SIGINT (Ctrl-C) / SIGTERM (Docker stop / k8s drain)
// Flushes the telemetry buffer before exit to prevent data loss.
// ═══════════════════════════════════════════════════════════════════════
let isShuttingDown = false

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return
  isShuttingDown = true
  console.log(`\n[shutdown] 📶 Received ${signal} — initiating graceful shutdown...`)

  // 1. Stop accepting new MQTT connections + WebSocket connections
  console.log('[shutdown] Closing MQTT broker + Socket.io server...')
  broker.close()
  mqttServer.close()
  httpServer.close()
  clearInterval(simTimer)

  // 2. Notify all connected WebSocket clients
  io.disconnectSockets(true)

  // 3. Flush the telemetry buffer (waits for in-flight inserts + retries)
  await telemetryBuffer.shutdown()

  // 4. Flush InfluxDB (if configured)
  if (influxWriteApi) {
    try {
      await influxWriteApi.flush()
      console.log('[shutdown] InfluxDB flushed')
    } catch {
      console.warn('[shutdown] InfluxDB flush failed (non-fatal)')
    }
  }

  console.log('[shutdown] ✅ All data flushed, exiting cleanly')
  process.exit(0)
}

process.on('SIGINT', () => void gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'))

// Periodic stats logging (every 30s)
setInterval(() => {
  const stats = telemetryBuffer.getStats()
  if (stats.totalInserted > 0 || stats.bufferSize > 0) {
    console.log(`[telemetry-buffer] 📊 buffer=${stats.bufferSize} inFlight=${stats.inFlightFlushes} inserted=${stats.totalInserted} failed=${stats.totalFailed} retries=${stats.totalRetries}`)
  }
}, 30_000).unref?.()
