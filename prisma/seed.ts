// IndOS seed — populates the platform with realistic industrial data on first run.
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const now = Date.now()
const ago = (mins: number) => new Date(now - mins * 60_000)

async function main() {
  console.log('🌱 Seeding IndOS...')

  // Organizations
  const org = await db.organization.create({
    data: { name: 'Northwind Industrial Group', type: 'operator', industry: 'Manufacturing', country: 'Thailand' },
  })
  const cust = await db.customer.create({
    data: { name: 'Acme Manufacturing Co.', email: 'ops@acme.com', phone: '+66 2 555 0100', orgId: org.id },
  })

  // Users
  await db.user.createMany({
    data: [
      { email: 'admin@indos.io', name: 'Sarah Chen', role: 'admin', orgId: org.id, status: 'active', twoFA: true, lastLogin: ago(30) },
      { email: 'engineer@indos.io', name: 'Marcus Reed', role: 'engineer', orgId: org.id, status: 'active', lastLogin: ago(120) },
      { email: 'operator@indos.io', name: 'Lin Wang', role: 'operator', orgId: org.id, status: 'active', lastLogin: ago(5) },
      { email: 'viewer@indos.io', name: 'Diego Alvarez', role: 'viewer', orgId: org.id, status: 'active', lastLogin: ago(1440) },
      { email: 'field@indos.io', name: 'Priya Nair', role: 'engineer', orgId: org.id, status: 'active', lastLogin: ago(240) },
    ],
  })

  // Projects (unlimited — seed a diverse portfolio)
  const projects = await db.project.createMany({
    data: [
      { name: 'Bangkok Factory Energy Monitoring', slug: 'bkk-energy', category: 'energy', status: 'active', location: 'Bangkok, TH', lat: 13.7563, lng: 100.5018, orgId: org.id, customerId: cust.id },
      { name: 'Nakhon Duck Farm', slug: 'duck-farm', category: 'agriculture', status: 'active', location: 'Nakhon Pathom, TH', lat: 13.8199, lng: 100.0443, orgId: org.id, customerId: cust.id },
      { name: 'Chiang Mai Greenhouse', slug: 'chiangmai-gh', category: 'greenhouse', status: 'active', location: 'Chiang Mai, TH', lat: 18.7883, lng: 98.9853, orgId: org.id },
      { name: 'Isan Solar Farm', slug: 'isan-solar', category: 'solar', status: 'active', location: 'Khon Kaen, TH', lat: 16.4419, lng: 102.8360, orgId: org.id, customerId: cust.id },
      { name: 'Rayong Water Plant', slug: 'rayong-water', category: 'water', status: 'active', location: 'Rayong, TH', lat: 12.6809, lng: 101.2058, orgId: org.id },
      { name: 'Assembly Line A1', slug: 'line-a1', category: 'factory', status: 'active', location: 'Bangkok, TH', lat: 13.7563, lng: 100.5018, orgId: org.id, customerId: cust.id },
      { name: 'Phuket Cold Storage', slug: 'phuket-cold', category: 'coldstorage', status: 'paused', location: 'Phuket, TH', lat: 7.8804, lng: 98.3923, orgId: org.id },
      { name: 'Doi Suthep Weather Station', slug: 'doi-weather', category: 'weather', status: 'active', location: 'Chiang Mai, TH', lat: 18.8199, lng: 98.9297, orgId: org.id },
    ],
  })

  const allProjects = await db.project.findMany()

  // Topology: Factory → Building → Line → Machines (for the factory project)
  const factoryProj = allProjects.find(p => p.slug === 'line-a1')!
  const factory = await db.factory.create({ data: { name: 'Bangkok Assembly Plant', projectId: factoryProj.id, location: 'Bangkok, TH', lat: 13.7563, lng: 100.5018 } })
  const bldg = await db.building.create({ data: { name: 'Building B — Production', factoryId: factory.id, floors: '3' } })
  const lines = await db.productionLine.createMany({
    data: [
      { name: 'Line A1 — PCB Assembly', buildingId: bldg.id },
      { name: 'Line A2 — Final Assembly', buildingId: bldg.id },
      { name: 'Line A3 — Quality & Pack', buildingId: bldg.id },
    ],
  })
  const lineRows = await db.productionLine.findMany()
  const machineNames = ['CNC Mill 01', 'Pick & Place 01', 'Reflow Oven', 'AOI Inspector', 'Solder Robot', 'Press 02', 'Conveyor C1', 'Test Station T1', 'Packaging Arm', 'Laser Marker']
  const machines: { id: string }[] = []
  for (const line of lineRows) {
    for (let i = 0; i < 4; i++) {
      const m = await db.machine.create({
        data: {
          name: machineNames[(lineRows.indexOf(line) * 4 + i) % machineNames.length] + ` · ${line.name.split(' ')[1]}`,
          lineId: line.id,
          model: ['IndoS-MX200', 'Nordic-S9', 'Yamaha-YM9', 'Siemens-S7'][i % 4],
          manufacturer: ['Siemens', 'Yamaha', 'Mitsubishi', 'ABB'][i % 4],
          serial: `SN-${1000 + lineRows.indexOf(line) * 4 + i}`,
          status: ['running', 'running', 'idle', 'maintenance'][i % 4],
          oee: 70 + Math.random() * 25,
          availability: 80 + Math.random() * 18,
          performance: 75 + Math.random() * 20,
          quality: 90 + Math.random() * 9,
        },
      })
      machines.push({ id: m.id })
    }
  }

  // Devices across all projects
  const deviceTypes = [
    { type: 'sensor', protocol: 'mqtt', metric: 'temperature', unit: '°C', min: -10, max: 120 },
    { type: 'sensor', protocol: 'modbus-rtu', metric: 'humidity', unit: '%', min: 0, max: 100 },
    { type: 'meter', protocol: 'modbus-tcp', metric: 'power', unit: 'kW', min: 0, max: 500 },
    { type: 'meter', protocol: 'mqtt', metric: 'voltage', unit: 'V', min: 200, max: 260 },
    { type: 'sensor', protocol: 'opc-ua', metric: 'pressure', unit: 'bar', min: 0, max: 25 },
    { type: 'sensor', protocol: 'lorawan', metric: 'flow', unit: 'L/min', min: 0, max: 800 },
    { type: 'inverter', protocol: 'modbus-tcp', metric: 'solar_yield', unit: 'kW', min: 0, max: 100 },
    { type: 'sensor', protocol: 'mqtt', metric: 'ph', unit: 'pH', min: 0, max: 14 },
    { type: 'sensor', protocol: 'bacnet', metric: 'co2', unit: 'ppm', min: 300, max: 2000 },
    { type: 'relay', protocol: 'mqtt', metric: 'state', unit: '', min: 0, max: 1 },
    { type: 'plc', protocol: 'ethernet-ip', metric: 'rpm', unit: 'rpm', min: 0, max: 3600 },
    { type: 'sensor', protocol: 'mqtt', metric: 'weight', unit: 'kg', min: 0, max: 5000 },
  ]

  let macCounter = 0
  const deviceIds: string[] = []
  for (const proj of allProjects) {
    const n = proj.slug === 'line-a1' ? 14 : 6 + Math.floor(Math.random() * 8)
    for (let i = 0; i < n; i++) {
      const dt = deviceTypes[(macCounter) % deviceTypes.length]
      const status = Math.random() > 0.12 ? 'online' : (Math.random() > 0.5 ? 'offline' : 'fault')
      const machineId = proj.slug === 'line-a1' && machines.length ? machines[(macCounter) % machines.length].id : null
      const d = await db.device.create({
        data: {
          name: `${dt.metric}-${proj.slug}-${String(i + 1).padStart(2, '0')}`,
          mac: `AA:BB:CC:${(macCounter).toString(16).padStart(2, '0').toUpperCase()}:${(macCounter + 10).toString(16).padStart(2, '0').toUpperCase()}:${(macCounter + 20).toString(16).padStart(2, '0').toUpperCase()}`,
          serial: `SNO-${20000 + macCounter}`,
          type: dt.type,
          protocol: dt.protocol,
          firmware: `v2.${(macCounter % 9)}.${(macCounter % 5)}`,
          ip: `10.20.${(macCounter % 254)}.${(macCounter % 200) + 1}`,
          projectId: proj.id,
          machineId,
          status,
          cpu: 10 + Math.random() * 70,
          memory: 20 + Math.random() * 60,
          temperature: 30 + Math.random() * 40,
          signal: 40 + Math.random() * 60,
          battery: Math.random() > 0.5 ? 20 + Math.random() * 80 : null,
          lastSeen: ago(Math.floor(Math.random() * 60)),
        },
      })
      deviceIds.push(d.id)
      // seed sensor metadata
      await db.sensor.create({ data: { name: d.name, metric: dt.metric, unit: dt.unit, deviceId: d.id, minValue: dt.min, maxValue: dt.max } })
      macCounter++
    }
  }

  // Gateways
  await db.gateway.createMany({
    data: [
      { name: 'GW-BKK-01', mac: 'GW:01:AA:BB:CC:01', model: 'IndoS-GW-Pro', firmware: 'v3.2.1', ip: '10.20.0.10', status: 'online', deviceCount: 14, uptime: 99.8, location: 'Bangkok Plant' },
      { name: 'GW-NKP-02', mac: 'GW:02:BB:CC:DD:02', model: 'IndoS-GW-Lite', firmware: 'v3.1.4', ip: '10.20.1.10', status: 'online', deviceCount: 8, uptime: 98.5, location: 'Duck Farm' },
      { name: 'GW-CNX-03', mac: 'GW:03:CC:DD:EE:03', model: 'IndoS-GW-Pro', firmware: 'v3.2.1', ip: '10.20.2.10', status: 'online', deviceCount: 6, uptime: 99.1, location: 'Greenhouse' },
      { name: 'GW-KKC-04', mac: 'GW:04:DD:EE:FF:04', model: 'IndoS-GW-Solar', firmware: 'v3.0.9', ip: '10.20.3.10', status: 'offline', deviceCount: 5, uptime: 95.2, location: 'Solar Farm' },
    ],
  })

  // Telemetry: last 60 points per metric for a subset of devices (kept compact)
  const sampleDevices = deviceIds.slice(0, 40)
  for (const did of sampleDevices) {
    const dev = await db.device.findUnique({ where: { id: did }, include: { project: true } })
    if (!dev) continue
    const metric = dev.name.split('-')[0]
    let base = 50
    for (let t = 60; t >= 0; t--) {
      base += (Math.random() - 0.5) * 8
      const val = Math.max(0, base + Math.sin(t / 8) * 12)
      await db.telemetry.create({
        data: { deviceId: did, metric, value: Number(val.toFixed(2)), ts: ago(t) },
      })
    }
  }

  // Alarms
  const alarmSeeds = [
    { severity: 'critical', category: 'device', message: 'Pick & Place 01 motor overtemperature — 92°C threshold exceeded' },
    { severity: 'critical', category: 'energy', message: 'Main feeder power factor dropped to 0.71 on Line A2' },
    { severity: 'warning', category: 'environment', message: 'Greenhouse CO₂ above 1400 ppm — ventilation engaged' },
    { severity: 'warning', category: 'device', message: 'GW-KKC-04 heartbeat lost > 5 min' },
    { severity: 'warning', category: 'maintenance', message: 'Reflow Oven maintenance window overdue by 3 days' },
    { severity: 'info', category: 'system', message: 'OTA firmware v2.4.1 rolled out to 14 devices on Line A1' },
    { severity: 'warning', category: 'energy', message: 'Solar inverter INV-03 yield -18% vs forecast' },
    { severity: 'critical', category: 'security', message: 'Unauthorized Modbus write attempt blocked from 10.20.9.44' },
    { severity: 'info', category: 'device', message: 'New device auto-registered: ESP32-CAM-08 (MAC AA:BB:CC:0A:1B:2C)' },
    { severity: 'warning', category: 'environment', message: 'Cold storage Room 2 temp drifting +1.8°C/hour' },
  ]
  for (let i = 0; i < alarmSeeds.length; i++) {
    const a = alarmSeeds[i]
    const state = i < 3 ? 'active' : i < 6 ? 'acknowledged' : 'resolved'
    await db.alarm.create({
      data: {
        ...a,
        state,
        deviceId: deviceIds[i % deviceIds.length],
        projectId: allProjects[i % allProjects.length].id,
        ackedBy: state !== 'active' ? 'Marcus Reed' : null,
        ackedAt: state !== 'active' ? ago(60 - i * 5) : null,
        resolvedAt: state === 'resolved' ? ago(20 - i) : null,
        createdAt: ago(200 - i * 18),
      },
    })
  }

  // Work orders
  await db.workOrder.createMany({
    data: [
      { title: 'Replace Reflow Oven heating element', type: 'corrective', priority: 'high', status: 'inprogress', projectId: factoryProj.id, assignee: 'Priya Nair', machineName: 'Reflow Oven · A1', dueDate: ago(-48) },
      { title: 'Quarterly calibration — power meters', type: 'preventive', priority: 'medium', status: 'open', projectId: factoryProj.id, assignee: 'Marcus Reed', dueDate: ago(-120) },
      { title: 'Inspect GW-KKC-04 connectivity', type: 'corrective', priority: 'critical', status: 'open', assignee: 'Priya Nair', dueDate: ago(-12) },
      { title: 'Bearing vibration analysis — Press 02', type: 'predictive', priority: 'high', status: 'open', projectId: factoryProj.id, assignee: 'Marcus Reed', dueDate: ago(-72) },
      { title: 'Clean solar panels — Isan array C', type: 'preventive', priority: 'low', status: 'completed', dueDate: ago(-240) },
      { title: 'Replace CO₂ sensor calibration gas', type: 'preventive', priority: 'medium', status: 'completed', dueDate: ago(-360) },
      { title: 'Safety interlock test — Line A3', type: 'inspection', priority: 'high', status: 'completed', dueDate: ago(-180) },
    ],
  })

  // Firmware + OTA jobs
  const fw1 = await db.firmware.create({ data: { version: 'v2.4.1', deviceType: 'sensor', checksum: 'sha256:9f3a...', sizeKb: 512, notes: 'Improved MQTT reconnect, security patches', status: 'stable' } })
  const fw2 = await db.firmware.create({ data: { version: 'v3.2.1', deviceType: 'gateway', checksum: 'sha256:7b21...', sizeKb: 2048, notes: 'OPC-UA stack upgrade', status: 'stable' } })
  const fw3 = await db.firmware.create({ data: { version: 'v2.5.0-rc1', deviceType: 'sensor', checksum: 'sha256:1c44...', sizeKb: 540, notes: 'BLE mesh support (beta)', status: 'draft' } })
  await db.otaJob.createMany({
    data: [
      { firmwareId: fw1.id, scope: 'project', target: 'line-a1', status: 'completed', progress: 100, total: 14, done: 14, createdAt: ago(180) },
      { firmwareId: fw2.id, scope: 'group', target: 'gateways', status: 'inprogress', progress: 64, total: 4, done: 2, createdAt: ago(40) },
      { firmwareId: fw1.id, scope: 'global', target: 'all-sensors', status: 'pending', progress: 0, total: 0, done: 0, createdAt: ago(10) },
    ],
  })

  // Cameras
  await db.camera.createMany({
    data: [
      { name: 'CAM-LINE-A1-01', location: 'Line A1 Entry', ip: '10.30.0.11', status: 'online', aiDetection: true, motionDetect: true, recording: true, resolution: '4K' },
      { name: 'CAM-LINE-A2-01', location: 'Line A2 Overview', ip: '10.30.0.12', status: 'online', aiDetection: true, motionDetect: true, recording: true, resolution: '1080p' },
      { name: 'CAM-LOADING-01', location: 'Loading Bay', ip: '10.30.0.13', status: 'online', aiDetection: false, motionDetect: true, recording: false, resolution: '1080p' },
      { name: 'CAM-PERIMETER-N', location: 'North Perimeter', ip: '10.30.0.14', status: 'online', aiDetection: true, motionDetect: true, recording: true, resolution: '4K' },
      { name: 'CAM-COLD-ROOM2', location: 'Cold Room 2', ip: '10.30.0.15', status: 'offline', aiDetection: false, motionDetect: false, recording: false, resolution: '1080p' },
      { name: 'CAM-QUALITY-01', location: 'QC Station', ip: '10.30.0.16', status: 'recording', aiDetection: true, motionDetect: true, recording: true, resolution: '4K' },
    ],
  })

  // Automation flows
  await db.automationFlow.createMany({
    data: [
      { name: 'Peak shaving — shed non-critical loads', trigger: 'threshold', enabled: true, nodes: 7, lastRun: ago(35), runCount: 1284 },
      { name: 'Greenhouse climate control', trigger: 'schedule', enabled: true, nodes: 12, lastRun: ago(2), runCount: 88421 },
      { name: 'Cold storage alarm escalation', trigger: 'alarm', enabled: true, nodes: 5, lastRun: ago(90), runCount: 47 },
      { name: 'Solar inverter morning report', trigger: 'schedule', enabled: true, nodes: 4, lastRun: ago(600), runCount: 312 },
      { name: 'Machine predictive maintenance flag', trigger: 'device-event', enabled: false, nodes: 9, lastRun: ago(2880), runCount: 73 },
    ],
  })

  // Plugins
  await db.plugin.createMany({
    data: [
      { name: 'Energy Monitoring', slug: 'energy', description: 'Real-time power, voltage, current & cost analytics with peak demand tracking.', version: '2.4.0', author: 'IndOS Core', category: 'industry', installed: true, enabled: true, rating: 4.8, downloads: 18420 },
      { name: 'Duck Farm Suite', slug: 'duck-farm', description: 'Poultry environment, feed lines, water & mortality tracking with batch management.', version: '1.9.2', author: 'AgriTech Labs', category: 'industry', installed: true, enabled: true, rating: 4.6, downloads: 9120 },
      { name: 'Greenhouse Control', slug: 'greenhouse', description: 'Climate, irrigation, CO₂ dosing & grow-light schedules for protected cultivation.', version: '3.1.0', author: 'AgriTech Labs', category: 'industry', installed: true, enabled: true, rating: 4.9, downloads: 22110 },
      { name: 'Solar PV Optimizer', slug: 'solar', description: 'Inverter telemetry, yield forecasting, string-level diagnostics & curtailment.', version: '2.0.5', author: 'IndOS Core', category: 'industry', installed: true, enabled: true, rating: 4.7, downloads: 13380 },
      { name: 'Water Treatment', slug: 'water', description: 'Flow, pH, turbidity, dosing pumps & compliance reporting for water plants.', version: '1.5.1', author: 'AquaSys', category: 'industry', installed: true, enabled: true, rating: 4.5, downloads: 6040 },
      { name: 'Factory MES Bridge', slug: 'mes', description: 'OEE, batch, recipe & production order integration with Manufacturing Execution Systems.', version: '0.9.0', author: 'IndOS Core', category: 'integration', installed: false, enabled: false, rating: 4.3, downloads: 2210 },
      { name: 'Modbus Protocol Pack', slug: 'modbus', description: 'Modbus RTU/TCP master & slave drivers, register maps & polling engine.', version: '4.2.0', author: 'IndOS Core', category: 'protocol', installed: true, enabled: true, rating: 4.9, downloads: 41022 },
      { name: 'OPC-UA Connector', slug: 'opcua', description: 'Industrial OPC-UA client with browsable address space & subscription tags.', version: '3.0.2', author: 'IndOS Core', category: 'protocol', installed: true, enabled: true, rating: 4.8, downloads: 27840 },
      { name: 'AI Vision (YOLO)', slug: 'ai-vision', description: 'Local object detection, anomaly & PPE compliance on camera feeds via Frigate + YOLO.', version: '1.2.0', author: 'VisionWorks', category: 'analytics', installed: false, enabled: false, rating: 4.6, downloads: 5400 },
      { name: 'Grafana BI Exporter', slug: 'grafana', description: 'One-click provisioning of IndOS datasources into a bundled Grafana instance.', version: '2.1.0', author: 'IndOS Core', category: 'visualization', installed: true, enabled: true, rating: 4.9, downloads: 19030 },
      { name: 'Weather Station', slug: 'weather', description: 'Wind, rain, UV, solar irradiance & lightning alerts from Davis/Ecowit stations.', version: '1.4.0', author: 'SkySense', category: 'industry', installed: true, enabled: true, rating: 4.4, downloads: 7820 },
      { name: 'Cold Chain Logger', slug: 'coldchain', description: 'Multi-zone temperature logging, compliance reports & door-open detection.', version: '1.8.3', author: 'ColdLogix', category: 'industry', installed: true, enabled: false, rating: 4.6, downloads: 4110 },
    ],
  })

  // Settings
  await db.setting.createMany({
    data: [
      { key: 'platform.name', value: 'IndOS', category: 'system' },
      { key: 'platform.version', value: '1.0.0', category: 'system' },
      { key: 'platform.org', value: 'Northwind Industrial Group', category: 'system' },
      { key: 'mqtt.broker', value: 'mosquitto.indos.local:1883', category: 'connectivity' },
      { key: 'mqtt.topic_root', value: 'indos', category: 'connectivity' },
      { key: 'timeseries.backend', value: 'InfluxDB 2.7', category: 'connectivity' },
      { key: 'cache.backend', value: 'Redis 7.2', category: 'connectivity' },
      { key: 'storage.backend', value: 'MinIO (S3-compatible)', category: 'connectivity' },
      { key: 'ai.backend', value: 'Ollama (llama3.1:8b)', category: 'ai' },
      { key: 'ai.vector_db', value: 'Qdrant 1.8', category: 'ai' },
      { key: 'auth.provider', value: 'Keycloak (OIDC)', category: 'security' },
      { key: 'auth.2fa', value: 'enabled', category: 'security' },
      { key: 'monitoring.metrics', value: 'Prometheus', category: 'observability' },
      { key: 'monitoring.logs', value: 'Loki', category: 'observability' },
      { key: 'monitoring.tracing', value: 'OpenTelemetry', category: 'observability' },
      { key: 'proxy', value: 'Nginx', category: 'system' },
      { key: 'vpn', value: 'WireGuard', category: 'security' },
      { key: 'dns', value: 'Pi-hole', category: 'system' },
      { key: 'backup.schedule', value: 'daily 02:00 ICT', category: 'system' },
      { key: 'theme.default', value: 'dark', category: 'system' },
    ],
  })

  // Audit logs
  await db.auditLog.createMany({
    data: [
      { actor: 'admin@indos.io', action: 'login', ip: '10.0.0.12', ts: ago(30) },
      { actor: 'admin@indos.io', action: 'plugin.install', target: 'solar', ip: '10.0.0.12', ts: ago(420) },
      { actor: 'engineer@indos.io', action: 'ota.deploy', target: 'v2.4.1 → line-a1', ip: '10.0.0.18', ts: ago(180) },
      { actor: 'operator@indos.io', action: 'alarm.ack', target: 'critical-001', ip: '10.0.0.24', ts: ago(64) },
      { actor: 'system', action: 'device.autoregister', target: 'ESP32-CAM-08', ts: ago(12) },
      { actor: 'engineer@indos.io', action: 'workorder.create', target: 'WO-1024', ip: '10.0.0.18', ts: ago(96) },
    ],
  })

  console.log('✅ IndOS seed complete.')
  console.log(`   Projects: ${allProjects.length}, Devices: ${deviceIds.length}, Machines: ${machines.length}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
