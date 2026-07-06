// IndOS Telemetry + MQTT Broker Mini-Service
// Port 3030: socket.io (realtime push to web clients)
// Port 1883: MQTT broker (aedes) — real ESP32/PLC/gateway devices publish here
//             → messages forwarded to socket.io clients as live telemetry
//
// SECURITY: Broker requires username/password auth + per-device topic ACL.
// Devices can only publish to indos/devices/{username}/telemetry|heartbeat|status
// and subscribe to indos/devices/{username}/cmd|config|ota.
import { createServer } from 'http'
import { Server } from 'socket.io'
import net from 'net'
import { Aedes } from 'aedes'
import bcrypt from 'bcryptjs'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { InfluxDB, Point } from '@influxdata/influxdb-client'

// ── InfluxDB configuration ────────────────────────────────────────────
const INFLUX_URL = process.env.INFLUX_URL || ''
const INFLUX_TOKEN = process.env.INFLUX_TOKEN || ''
const INFLUX_ORG = process.env.INFLUX_ORG || 'indos'
const INFLUX_BUCKET = process.env.INFLUX_BUCKET || 'telemetry'

let influxWriteApi: any = null
let influxAvailable = false

function initInflux() {
  if (!INFLUX_URL || !INFLUX_TOKEN) {
    console.log('[influx] Not configured — telemetry will stream live only (no persistence)')
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
  } catch (e: any) {
    // Non-fatal — live stream still works
  }
}

// Flush InfluxDB writes every 5 seconds (batch)
if (influxAvailable) {
  setInterval(async () => {
    try { await influxWriteApi.flush() } catch {}
  }, 5000)
}

const IO_PORT = 3030
const MQTT_PORT = 1883

const httpServer = createServer()
const io = new Server(httpServer, { path: '/', cors: { origin: '*', methods: ['GET', 'POST'] }, pingTimeout: 60000, pingInterval: 25000 })

// ── Device credential store ───────────────────────────────────────────
// Credentials are loaded from mini-services/telemetry/devices.json
// Format: [{ "username": "esp32-sensor-01", "passwordHash": "$2a$10$...", "project": "bkk-energy" }]
// In production, this would be backed by the database.
interface DeviceCredential {
  username: string
  passwordHash: string
  project: string
}

const devicesFile = join(import.meta.dir, 'devices.json')
let deviceCredentials: DeviceCredential[] = []

function loadDeviceCredentials() {
  if (!existsSync(devicesFile)) {
    console.log('[indos-mqtt] ⚠️  No devices.json found — creating default device')
    // Create a default device with known credentials
    const defaultDevice: DeviceCredential = {
      username: 'esp32-sensor-01',
      passwordHash: bcrypt.hashSync('indos-device-001', 10),
      project: 'bkk-energy',
    }
    deviceCredentials = [defaultDevice]
    // Write the file for reference
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

// AUTHENTICATION: verify username + password against device credentials
broker.authenticate = (client: any, username: string, password: Buffer, callback: Function) => {
  // Reject if no username or password
  if (!username || !password) {
    console.log(`[indos-mqtt] ❌ Auth failed: missing credentials from ${client.id}`)
    return callback(null, false)
  }

  const plainPassword = password.toString()

  // Service account for internal bridge (can subscribe to everything)
  if (username === 'indos-bridge' && plainPassword === process.env.BRIDGE_PASSWORD || plainPassword === 'indos-bridge-secret') {
    client.deviceUsername = username
    client.isBridge = true
    console.log(`[indos-mqtt] 🔑 Bridge authenticated: ${client.id}`)
    return callback(null, true)
  }

  // Device authentication: find credential and verify bcrypt hash
  const cred = deviceCredentials.find(d => d.username === username)
  if (!cred) {
    console.log(`[indos-mqtt] ❌ Auth failed: unknown device "${username}"`)
    return callback(null, false)
  }

  if (!bcrypt.compareSync(plainPassword, cred.passwordHash)) {
    console.log(`[indos-mqtt] ❌ Auth failed: wrong password for "${username}"`)
    return callback(null, false)
  }

  // Store the device username on the client for ACL checks
  client.deviceUsername = username
  client.deviceProject = cred.project
  console.log(`[indos-mqtt] 🔑 Device authenticated: ${username} (project: ${cred.project})`)
  callback(null, true)
}

// ACL: authorize PUBLISH — devices can only publish to their own topics
broker.authorizePublish = (client: any, packet: any, callback: Function) => {
  // Bridge can publish anything
  if (client.isBridge) return callback(null)

  const topic = packet.topic
  const username = client.deviceUsername

  if (!username) {
    console.log(`[indos-mqtt] 🚫 Publish denied: unauthenticated client to "${topic}"`)
    return callback(new Error('Not authorized'))
  }

  // Allowed publish patterns for devices:
  // indos/devices/{username}/telemetry
  // indos/devices/{username}/heartbeat
  // indos/devices/{username}/status
  const allowedPrefixes = [
    `indos/devices/${username}/telemetry`,
    `indos/devices/${username}/heartbeat`,
    `indos/devices/${username}/status`,
  ]

  const allowed = allowedPrefixes.some(prefix => topic === prefix || topic.startsWith(prefix + '/'))

  if (!allowed) {
    console.log(`[indos-mqtt] 🚫 Publish denied: "${username}" → "${topic}" (not in own topic space)`)
    return callback(new Error('Topic not authorized'))
  }

  callback(null)
}

// ACL: authorize SUBSCRIBE — devices can only subscribe to their own command topics
broker.authorizeSubscribe = (client: any, subscription: any, callback: Function) => {
  // Bridge can subscribe to everything
  if (client.isBridge) return callback(null, subscription)

  const topic = subscription.topic
  const username = client.deviceUsername

  if (!username) {
    console.log(`[indos-mqtt] 🚫 Subscribe denied: unauthenticated client to "${topic}"`)
    return callback(new Error('Not authorized'))
  }

  // Allowed subscribe patterns for devices:
  // indos/devices/{username}/cmd
  // indos/devices/{username}/config
  // indos/devices/{username}/ota
  const allowedPrefixes = [
    `indos/devices/${username}/cmd`,
    `indos/devices/${username}/config`,
    `indos/devices/${username}/ota`,
  ]

  const allowed = allowedPrefixes.some(prefix => topic === prefix || topic.startsWith(prefix + '/') || topic === `indos/devices/${username}/#`)

  if (!allowed) {
    console.log(`[indos-mqtt] 🚫 Subscribe denied: "${username}" → "${topic}" (not in own topic space)`)
    return callback(new Error('Topic not authorized'))
  }

  callback(null, subscription)
}

const mqttServer = net.createServer(broker.handle)
mqttServer.listen(MQTT_PORT, () => console.log(`[indos-mqtt] ✅ MQTT broker listening on :${MQTT_PORT} (AUTH REQUIRED — devices need username+password)`))

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
  if (payload) {
    const num = Number(payload)
    if (!isNaN(num)) value = num
    else {
      try { const j = JSON.parse(payload); value = j.value ?? null; unit = j.unit || ''; metric = j.metric || metric; name = j.name || name; project = j.project || project } catch (e) {
        console.warn(`[indos-mqtt] ⚠️ Bad JSON payload from ${client.id} on ${topic}: ${(e as Error).message}`)
      }
    }
  }
  if (value !== null) {
    console.log(`[indos-mqtt] 📨 ${topic} = ${value} ${unit} (from ${client.id})`)
    // Persist to InfluxDB (if configured)
    persistTelemetry({ deviceId: client.id, name, project, metric, unit, value })
    // Send to project room only (not all clients)
    const telemetryData = [{ deviceId: `mqtt:${client.id}:${topic}`, name, project, metric, unit, value, ts: new Date().toISOString(), source: 'mqtt', topic }]
    io.to(`project:${project}`).emit('telemetry', telemetryData)
    // Also send to a "global" room for dashboard-wide views
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
  for (let i = 0; i < 12; i++) {
    const d = simDevices[(tick*12 + i) % simDevices.length]
    if (d.status === 'offline') continue
    const val = sample(d, tick)
    batch.push({ deviceId: d.id, name: d.name, project: d.project, metric: d.metric, unit: d.unit, value: val, ts: new Date().toISOString(), source: 'sim' })
    // Persist simulation telemetry to InfluxDB (if configured)
    persistTelemetry({ deviceId: d.id, name: d.name, project: d.project, metric: d.metric, unit: d.unit, value: val })
    d.cpu = Math.max(5, Math.min(98, d.cpu + (Math.random()-0.5)*4))
    d.memory = Math.max(10, Math.min(96, d.memory + (Math.random()-0.5)*2))
    d.temperature = Math.max(22, Math.min(92, d.temperature + (Math.random()-0.5)*1.5))
    d.signal = Math.max(20, Math.min(100, d.signal + (Math.random()-0.5)*3))
  }
  // Send telemetry to project rooms + global room (not all clients)
  if (batch.length > 0) {
    // Group by project for targeted delivery
    const byProject: Record<string, any[]> = {}
    for (const b of batch) {
      (byProject[b.project] ||= []).push(b)
    }
    for (const [proj, items] of Object.entries(byProject)) {
      io.to(`project:${proj}`).emit('telemetry', items)
    }
    // Global room gets the full batch (dashboard overview)
    io.to('global').emit('telemetry', batch)
  }
  if (tick % 5 === 0) io.to('global').emit('device-vitals', simDevices.slice(0,24).map((d) => ({ id: d.id, name: d.name, status: d.status, cpu: Number(d.cpu.toFixed(1)), memory: Number(d.memory.toFixed(1)), temperature: Number(d.temperature.toFixed(1)), signal: Number(d.signal.toFixed(1)) })))
  if (tick % 11 === 0) { const tpl = alarmTemplates[Math.floor(Math.random()*alarmTemplates.length)]; const d = simDevices[Math.floor(Math.random()*simDevices.length)]; io.to('global').emit('alarm', { id: `alm-${Date.now()}`, deviceId: d.id, project: d.project, severity: tpl.severity, category: tpl.category, message: tpl.message(d), state: 'active', ts: new Date().toISOString() }) }
  if (tick % 3 === 0) io.to('global').emit('system-metrics', { mqttThroughput: 1200 + Math.round(Math.sin(tick/10)*300 + Math.random()*120) + mqttMsgCount, activeConnections: 320 + Math.round(Math.sin(tick/14)*40 + Math.random()*20) + mqttClientCount, apiLatencyMs: Number((42 + Math.random()*18).toFixed(1)), dbPoolPct: Number((35 + Math.random()*25).toFixed(1)), cpuPct: Number((28 + Math.sin(tick/8)*12 + Math.random()*6).toFixed(1)), memPct: Number((54 + Math.sin(tick/11)*8 + Math.random()*4).toFixed(1)), diskPct: Number((61 + Math.random()*2).toFixed(1)), netInMbps: Number((180 + Math.random()*60).toFixed(1)), netOutMbps: Number((120 + Math.random()*40).toFixed(1)), mqttConnected: mqttClientCount > 0, mqttClients: mqttClientCount, mqttMessages: mqttMsgCount, ts: new Date().toISOString() })
}
setInterval(broadcastTick, 1500)

io.on('connection', (socket) => {
  console.log(`[indos-telemetry] ws client connected: ${socket.id}`)

  // Auto-join global room (for dashboard overview, system metrics, alarms)
  socket.join('global')

  // Support project-scoped subscriptions
  // Client emits: socket.emit('subscribe', { project: 'bkk-energy' })
  socket.on('subscribe', (data: { project?: string; projects?: string[] }) => {
    if (data.project) {
      socket.join(`project:${data.project}`)
      console.log(`[indos-telemetry] ${socket.id} joined project:${data.project}`)
    }
    if (data.projects) {
      for (const p of data.projects) {
        socket.join(`project:${p}`)
      }
      console.log(`[indos-telemetry] ${socket.id} joined ${data.projects.length} project rooms`)
    }
  })

  // Unsubscribe from a project
  socket.on('unsubscribe', (data: { project?: string }) => {
    if (data.project) {
      socket.leave(`project:${data.project}`)
    }
  })

  // Send initial snapshot (only to this socket)
  socket.emit('telemetry', simDevices.slice(0,24).map((d) => ({ deviceId: d.id, name: d.name, project: d.project, metric: d.metric, unit: d.unit, value: sample(d, tick), ts: new Date().toISOString(), source: 'sim' })))
  socket.emit('device-vitals', simDevices.slice(0,24).map((d) => ({ id: d.id, name: d.name, status: d.status, cpu: Number(d.cpu.toFixed(1)), memory: Number(d.memory.toFixed(1)), temperature: Number(d.temperature.toFixed(1)), signal: Number(d.signal.toFixed(1)) })))

  // Ack alarm — broadcast to global room
  socket.on('ack-alarm', (id: string) => io.to('global').emit('alarm-update', { id, state: 'acknowledged', ackedBy: 'operator', ts: new Date().toISOString() }))

  socket.on('disconnect', () => {
    console.log(`[indos-telemetry] ws client disconnected: ${socket.id}`)
  })
})

httpServer.listen(IO_PORT, () => console.log(`[indos-telemetry] ✅ socket.io listening on :${IO_PORT}`))
