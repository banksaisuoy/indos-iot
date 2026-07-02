// IndOS Telemetry Mini-Service (socket.io on port 3030)
// Simulates live industrial telemetry, device heartbeats & alarm events
// for all registered devices. Clients connect via io("/?XTransformPort=3030").
import { createServer } from 'http'
import { Server } from 'socket.io'

const PORT = 3030
const httpServer = createServer()
const io = new Server(httpServer, {
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

console.log('[indos-telemetry] service starting on port', PORT)

// ── Virtual device registry ───────────────────────────────────────────
// A representative fleet mirroring the seeded IndOS data.
type Metric = 'temperature' | 'humidity' | 'power' | 'voltage' | 'pressure' | 'flow' | 'solar_yield' | 'ph' | 'co2' | 'rpm' | 'weight' | 'state'

interface VDevice {
  id: string
  name: string
  project: string
  metric: Metric
  unit: string
  base: number
  amp: number
  phase: number
  noise: number
  status: 'online' | 'offline' | 'fault'
  cpu: number
  memory: number
  temperature: number
  signal: number
}

const projects = ['bkk-energy', 'duck-farm', 'chiangmai-gh', 'isan-solar', 'rayong-water', 'line-a1', 'phuket-cold', 'doi-weather']

const metricDefs: { metric: Metric; unit: string; base: number; amp: number; noise: number }[] = [
  { metric: 'temperature', unit: '°C', base: 38, amp: 14, noise: 2.2 },
  { metric: 'humidity', unit: '%', base: 62, amp: 16, noise: 3 },
  { metric: 'power', unit: 'kW', base: 180, amp: 60, noise: 8 },
  { metric: 'voltage', unit: 'V', base: 230, amp: 6, noise: 1.5 },
  { metric: 'pressure', unit: 'bar', base: 8.5, amp: 3, noise: 0.4 },
  { metric: 'flow', unit: 'L/min', base: 320, amp: 140, noise: 18 },
  { metric: 'solar_yield', unit: 'kW', base: 48, amp: 32, noise: 4 },
  { metric: 'ph', unit: 'pH', base: 7.1, amp: 0.6, noise: 0.08 },
  { metric: 'co2', unit: 'ppm', base: 850, amp: 450, noise: 40 },
  { metric: 'rpm', unit: 'rpm', base: 1850, amp: 600, noise: 45 },
  { metric: 'weight', unit: 'kg', base: 1200, amp: 400, noise: 12 },
  { metric: 'state', unit: '', base: 1, amp: 0, noise: 0 },
]

const devices: VDevice[] = []
for (let i = 0; i < 48; i++) {
  const md = metricDefs[i % metricDefs.length]
  const proj = projects[i % projects.length]
  devices.push({
    id: `dev-${String(i + 1).padStart(3, '0')}`,
    name: `${md.metric}-${proj}-${String((i % 8) + 1).padStart(2, '0')}`,
    project: proj,
    metric: md.metric,
    unit: md.unit,
    base: md.base,
    amp: md.amp,
    phase: Math.random() * Math.PI * 2,
    noise: md.noise,
    status: Math.random() > 0.1 ? 'online' : Math.random() > 0.5 ? 'offline' : 'fault',
    cpu: 15 + Math.random() * 60,
    memory: 25 + Math.random() * 55,
    temperature: 30 + Math.random() * 35,
    signal: 45 + Math.random() * 55,
  })
}

// ── Alarm generator ───────────────────────────────────────────────────
const alarmTemplates = [
  { severity: 'critical', category: 'device', message: (d: VDevice) => `${d.name} ${d.metric} exceeded critical threshold` },
  { severity: 'warning', category: 'energy', message: (d: VDevice) => `Power demand spike on ${d.project} — ${d.name}` },
  { severity: 'warning', category: 'environment', message: (d: VDevice) => `${d.metric} trending high on ${d.name}` },
  { severity: 'info', category: 'system', message: (d: VDevice) => `${d.name} heartbeat re-established` },
  { severity: 'critical', category: 'maintenance', message: (d: VDevice) => `Predictive model flags ${d.name} for inspection` },
]

let tick = 0

function sample(d: VDevice, t: number): number {
  const wave = Math.sin(t / 9 + d.phase) * d.amp
  const daily = Math.sin(t / 240 + d.phase) * (d.amp * 0.3)
  const val = d.base + wave + daily + (Math.random() - 0.5) * d.noise * 2
  if (d.metric === 'state') return Math.random() > 0.05 ? 1 : 0
  return Number(Math.max(0, val).toFixed(2))
}

function broadcastTick() {
  tick++
  // telemetry batch for ~12 devices per tick (rotating) to keep payload small
  const batch: any[] = []
  for (let i = 0; i < 12; i++) {
    const d = devices[(tick * 12 + i) % devices.length]
    if (d.status === 'offline') continue
    const value = sample(d, tick)
    batch.push({
      deviceId: d.id,
      name: d.name,
      project: d.project,
      metric: d.metric,
      unit: d.unit,
      value,
      ts: new Date().toISOString(),
    })

    // drift device vitals
    d.cpu = Math.max(5, Math.min(98, d.cpu + (Math.random() - 0.5) * 4))
    d.memory = Math.max(10, Math.min(96, d.memory + (Math.random() - 0.5) * 2))
    d.temperature = Math.max(22, Math.min(92, d.temperature + (Math.random() - 0.5) * 1.5))
    d.signal = Math.max(20, Math.min(100, d.signal + (Math.random() - 0.5) * 3))
  }
  io.emit('telemetry', batch)

  // every 5 ticks emit device vitals
  if (tick % 5 === 0) {
    const vitals = devices.slice(0, 24).map((d) => ({
      id: d.id,
      name: d.name,
      status: d.status,
      cpu: Number(d.cpu.toFixed(1)),
      memory: Number(d.memory.toFixed(1)),
      temperature: Number(d.temperature.toFixed(1)),
      signal: Number(d.signal.toFixed(1)),
    }))
    io.emit('device-vitals', vitals)
  }

  // occasionally emit an alarm
  if (tick % 11 === 0) {
    const tpl = alarmTemplates[Math.floor(Math.random() * alarmTemplates.length)]
    const d = devices[Math.floor(Math.random() * devices.length)]
    io.emit('alarm', {
      id: `alm-${Date.now()}`,
      deviceId: d.id,
      project: d.project,
      severity: tpl.severity,
      category: tpl.category,
      message: tpl.message(d),
      state: 'active',
      ts: new Date().toISOString(),
    })
  }

  // system metrics (platform health) every 3 ticks
  if (tick % 3 === 0) {
    io.emit('system-metrics', {
      mqttThroughput: 1200 + Math.round(Math.sin(tick / 10) * 300 + Math.random() * 120),
      activeConnections: 320 + Math.round(Math.sin(tick / 14) * 40 + Math.random() * 20),
      apiLatencyMs: Number((42 + Math.random() * 18).toFixed(1)),
      dbPoolPct: Number((35 + Math.random() * 25).toFixed(1)),
      cpuPct: Number((28 + Math.sin(tick / 8) * 12 + Math.random() * 6).toFixed(1)),
      memPct: Number((54 + Math.sin(tick / 11) * 8 + Math.random() * 4).toFixed(1)),
      diskPct: Number((61 + Math.random() * 2).toFixed(1)),
      netInMbps: Number((180 + Math.random() * 60).toFixed(1)),
      netOutMbps: Number((120 + Math.random() * 40).toFixed(1)),
      ts: new Date().toISOString(),
    })
  }
}

setInterval(broadcastTick, 1500)

io.on('connection', (socket) => {
  console.log(`[indos-telemetry] client connected: ${socket.id}`)
  // send an initial snapshot so the client isn't empty on first paint
  const snapshot = devices.slice(0, 24).map((d) => ({
    deviceId: d.id,
    name: d.name,
    project: d.project,
    metric: d.metric,
    unit: d.unit,
    value: sample(d, tick),
    ts: new Date().toISOString(),
  }))
  socket.emit('telemetry', snapshot)
  socket.emit('device-vitals', devices.slice(0, 24).map((d) => ({
    id: d.id, name: d.name, status: d.status,
    cpu: Number(d.cpu.toFixed(1)), memory: Number(d.memory.toFixed(1)),
    temperature: Number(d.temperature.toFixed(1)), signal: Number(d.signal.toFixed(1)),
  })))

  socket.on('subscribe', (filters: { project?: string; metric?: string }) => {
    socket.join(`filter:${filters.project || 'all'}:${filters.metric || 'all'}`)
  })

  socket.on('ack-alarm', (alarmId: string) => {
    io.emit('alarm-update', { id: alarmId, state: 'acknowledged', ackedBy: 'operator', ts: new Date().toISOString() })
  })

  socket.on('disconnect', () => {
    console.log(`[indos-telemetry] client disconnected: ${socket.id}`)
  })
})

httpServer.listen(PORT, () => {
  console.log(`[indos-telemetry] listening on :${PORT} (socket.io path "/")`)
})
