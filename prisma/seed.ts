// IndOS minimal seed — just enough to start using the platform
// Run: bun run prisma/seed.ts
//
// P0.1 (Phase 11) additions:
//   - Second organization "Acme Industries" + second project + 3 devices
//   - Second user `engineer@acme.io` (engineer role, org-scoped to Acme)
//   - Admin user remains orgId=null (platform-level / cross-org by design)
//   - First org renamed "IndOS Demo" (id stable: org-default)
// All operations are idempotent (upsert). Re-running is safe.
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const db = new PrismaClient()

async function main() {
  console.log('🌱 Seeding IndOS (multi-tenant)...')

  // ─── Org 1: IndOS Demo ────────────────────────────────────────────────
  const orgDemo = await db.organization.upsert({
    where: { id: 'org-default' },
    update: { name: 'IndOS Demo' }, // rename "My Organization" → "IndOS Demo"
    create: {
      id: 'org-default',
      name: 'IndOS Demo',
      type: 'operator',
      industry: 'Manufacturing',
      country: 'Thailand',
    },
  })
  console.log(`  ✅ Org 1: ${orgDemo.name} (${orgDemo.id})`)

  // ─── Org 2: Acme Industries (NEW in Phase 11) ─────────────────────────
  const orgAcme = await db.organization.upsert({
    where: { id: 'org-acme' },
    update: {},
    create: {
      id: 'org-acme',
      name: 'Acme Industries',
      type: 'operator',
      industry: 'Heavy Industry',
      country: 'Singapore',
    },
  })
  console.log(`  ✅ Org 2: ${orgAcme.name} (${orgAcme.id})`)

  // ─── Admin user — platform-level (orgId = null, cross-org by design) ──
  // RECOMMENDED: keep admin's orgId null so admin sees ALL orgs.
  // To restrict an admin to one org, set orgId explicitly (defensive option).
  const passwordHash = bcrypt.hashSync('indos123', 10)
  const admin = await db.user.upsert({
    where: { email: 'admin@indos.io' },
    update: { orgId: null }, // force platform-level on re-seed
    create: {
      email: 'admin@indos.io',
      name: 'Admin',
      role: 'admin',
      password: passwordHash,
      status: 'active',
      orgId: null, // platform-level (cross-org)
    },
  })
  console.log(`  ✅ Admin user: ${admin.email} / indos123 (orgId: null = platform-level)`)

  // ─── Engineer user scoped to Acme Industries (NEW in Phase 11) ────────
  const acmePasswordHash = bcrypt.hashSync('acme123', 10)
  const acmeEngineer = await db.user.upsert({
    where: { email: 'engineer@acme.io' },
    update: { orgId: orgAcme.id, role: 'engineer', status: 'active', password: acmePasswordHash },
    create: {
      email: 'engineer@acme.io',
      name: 'Acme Engineer',
      role: 'engineer',
      password: acmePasswordHash,
      status: 'active',
      orgId: orgAcme.id,
    },
  })
  console.log(`  ✅ Acme engineer: ${acmeEngineer.email} / acme123 (orgId: ${orgAcme.id})`)

  // ─── Demo project (under IndOS Demo) ──────────────────────────────────
  const project = await db.project.upsert({
    where: { slug: 'demo-factory' },
    update: { orgId: orgDemo.id },
    create: {
      name: 'Demo Factory',
      slug: 'demo-factory',
      category: 'factory',
      status: 'active',
      location: 'Bangkok, TH',
      lat: 13.7563,
      lng: 100.5018,
      orgId: orgDemo.id,
    },
  })
  console.log(`  ✅ Project 1: ${project.name} (org: ${orgDemo.name})`)

  // ─── Acme project (under Acme Industries — NEW in Phase 11) ───────────
  const acmeProject = await db.project.upsert({
    where: { slug: 'acme-plant-a' },
    update: { orgId: orgAcme.id },
    create: {
      name: 'Acme Plant A',
      slug: 'acme-plant-a',
      category: 'factory',
      status: 'active',
      location: 'Singapore, SG',
      lat: 1.3521,
      lng: 103.8198,
      orgId: orgAcme.id,
    },
  })
  console.log(`  ✅ Project 2: ${acmeProject.name} (org: ${orgAcme.name})`)

  // ─── 5 demo devices under Demo Factory ────────────────────────────────
  const deviceTypes = [
    { type: 'sensor', protocol: 'mqtt', metric: 'temperature', unit: '°C' },
    { type: 'sensor', protocol: 'mqtt', metric: 'humidity', unit: '%' },
    { type: 'meter', protocol: 'modbus-tcp', metric: 'power', unit: 'kW' },
    { type: 'meter', protocol: 'mqtt', metric: 'voltage', unit: 'V' },
    { type: 'relay', protocol: 'mqtt', metric: 'state', unit: '' },
  ]
  for (let i = 0; i < deviceTypes.length; i++) {
    const dt = deviceTypes[i]
    await db.device.upsert({
      where: { mac: `AA:BB:CC:00:00:0${i + 1}` },
      update: { projectId: project.id },
      create: {
        name: `${dt.metric}-demo-${i + 1}`,
        mac: `AA:BB:CC:00:00:0${i + 1}`,
        type: dt.type,
        protocol: dt.protocol,
        firmware: 'v1.0.0',
        ip: `10.20.0.${i + 10}`,
        projectId: project.id,
        status: 'online',
        cpu: 20 + i * 5,
        memory: 30 + i * 5,
        temperature: 35 + i * 2,
        signal: 80 - i * 5,
        lastSeen: new Date(),
      },
    })
  }
  console.log(`  ✅ 5 demo devices under ${project.name}`)

  // ─── 3 Acme devices under Acme Plant A (NEW in Phase 11) ──────────────
  const acmeDevices = [
    { name: 'pressure-acme-1', mac: 'AC:ME:00:00:01', type: 'sensor', protocol: 'mqtt' },
    { name: 'flow-acme-2', mac: 'AC:ME:00:00:02', type: 'meter', protocol: 'modbus-tcp' },
    { name: 'valve-acme-3', mac: 'AC:ME:00:00:03', type: 'relay', protocol: 'mqtt' },
  ]
  for (let i = 0; i < acmeDevices.length; i++) {
    const d = acmeDevices[i]
    await db.device.upsert({
      where: { mac: d.mac },
      update: { projectId: acmeProject.id },
      create: {
        name: d.name,
        mac: d.mac,
        type: d.type,
        protocol: d.protocol,
        firmware: 'v1.2.0',
        ip: `10.30.0.${i + 10}`,
        projectId: acmeProject.id,
        status: 'online',
        cpu: 25 + i * 4,
        memory: 40 + i * 4,
        temperature: 38 + i * 2,
        signal: 75 - i * 5,
        lastSeen: new Date(),
      },
    })
  }
  console.log(`  ✅ 3 Acme devices under ${acmeProject.name}`)

  // ─── Gateways (Phase 14: orgId nullable — null=platform-shared, set=org-owned) ──
  await db.gateway.upsert({
    where: { mac: 'GW:01:AA:BB:CC:01' },
    update: {},
    create: { name: 'GW-DEMO-01', mac: 'GW:01:AA:BB:CC:01', model: 'IndoS-GW-Pro', firmware: 'v1.0.0', ip: '10.20.0.1', status: 'online', deviceCount: 5, uptime: 99.9, location: 'Demo Factory', orgId: null },
  })
  // Acme-owned gateway (org-scoped — only Acme users + admins see it)
  await db.gateway.upsert({
    where: { mac: 'GW:AC:ME:00:00:01' },
    update: {},
    create: { name: 'GW-ACME-01', mac: 'GW:AC:ME:00:00:01', model: 'IndoS-GW-Lite', firmware: 'v1.0.0', ip: '10.30.0.1', status: 'online', deviceCount: 3, uptime: 98.5, location: 'Acme Plant A', orgId: 'org-acme' },
  })
  console.log(`  ✅ 2 gateways (1 platform-shared, 1 Acme-owned)`)

  // ─── Cameras (Phase 14: orgId nullable) ────────────────────────────────
  // Camera.name isn't unique, so use findFirst + create (idempotent by name).
  for (const cam of [
    { name: 'CAM-DEMO-01', location: 'Demo Factory — Line A', ip: '10.20.1.50', status: 'online', aiDetection: true, motionDetect: true, recording: true, resolution: '1080p', orgId: null },
    { name: 'CAM-ACME-01', location: 'Acme Plant A — Floor', ip: '10.30.1.50', status: 'online', aiDetection: false, motionDetect: true, recording: false, resolution: '720p', orgId: 'org-acme' },
  ]) {
    const existing = await db.camera.findFirst({ where: { name: cam.name } })
    if (!existing) await db.camera.create({ data: cam })
  }
  console.log(`  ✅ 2 cameras (1 platform-shared, 1 Acme-owned)`)

  // Platform settings
  const settings = [
    { key: 'platform.name', value: 'IndOS', category: 'system' },
    { key: 'platform.version', value: '1.0.0', category: 'system' },
    { key: 'mqtt.broker', value: 'localhost:1883', category: 'connectivity' },
    { key: 'mqtt.topic_root', value: 'indos', category: 'connectivity' },
    { key: 'timeseries.backend', value: 'InfluxDB', category: 'connectivity' },
    { key: 'cache.backend', value: 'Redis', category: 'connectivity' },
    { key: 'storage.backend', value: 'MinIO', category: 'connectivity' },
    { key: 'ai.backend', value: 'Ollama', category: 'ai' },
    { key: 'auth.provider', value: 'NextAuth', category: 'security' },
    { key: 'monitoring.metrics', value: 'Prometheus', category: 'observability' },
    { key: 'monitoring.logs', value: 'Loki', category: 'observability' },
    { key: 'theme.default', value: 'dark', category: 'system' },
  ]
  for (const s of settings) {
    await db.setting.upsert({ where: { key: s.key }, update: {}, create: s })
  }
  console.log(`  ✅ ${settings.length} settings`)

  // ─── Verification summary ─────────────────────────────────────────────
  const orgCount = await db.organization.count()
  const projectCount = await db.project.count()
  const userCount = await db.user.count()
  const deviceCount = await db.device.count()
  console.log('')
  console.log(`📊 DB state: ${orgCount} orgs, ${projectCount} projects, ${userCount} users, ${deviceCount} devices`)
  console.log('')
  console.log('📋 Next steps:')
  console.log('  1. Start dev: bun run dev')
  console.log('  2. Start telemetry: cd mini-services/telemetry && bun run dev')
  console.log('  3. Open: http://localhost:3000')
  console.log('  4. Login as admin (cross-org): admin@indos.io / indos123')
  console.log('  5. Login as Acme engineer (org-scoped): engineer@acme.io / acme123')
  console.log('  6. Generate OTA keys: bun run scripts/generate-ota-keys.ts')
  console.log('')
  console.log('✅ Seed complete.')
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
