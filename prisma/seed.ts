// IndOS minimal seed — just enough to start using the platform
// Run: bun run prisma/seed.ts
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const db = new PrismaClient()

async function main() {
  console.log('🌱 Seeding IndOS (minimal)...')

  // 1 admin user (change password after first login!)
  const passwordHash = bcrypt.hashSync('indos123', 10)
  const admin = await db.user.upsert({
    where: { email: 'admin@indos.io' },
    update: {},
    create: { email: 'admin@indos.io', name: 'Admin', role: 'admin', password: passwordHash, status: 'active' },
  })
  console.log(`  ✅ Admin user: ${admin.email} / indos123 (CHANGE PASSWORD AFTER LOGIN!)`)

  // 1 organization
  const org = await db.organization.upsert({
    where: { id: 'org-default' },
    update: {},
    create: { id: 'org-default', name: 'My Organization', type: 'operator', industry: 'Manufacturing', country: 'Thailand' },
  })

  // 1 demo project
  const project = await db.project.upsert({
    where: { slug: 'demo-factory' },
    update: {},
    create: {
      name: 'Demo Factory',
      slug: 'demo-factory',
      category: 'factory',
      status: 'active',
      location: 'Bangkok, TH',
      lat: 13.7563,
      lng: 100.5018,
      orgId: org.id,
    },
  })
  console.log(`  ✅ Project: ${project.name}`)

  // 5 demo devices
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
      update: {},
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
  console.log(`  ✅ 5 demo devices`)

  // 1 gateway
  await db.gateway.upsert({
    where: { mac: 'GW:01:AA:BB:CC:01' },
    update: {},
    create: { name: 'GW-DEMO-01', mac: 'GW:01:AA:BB:CC:01', model: 'IndoS-GW-Pro', firmware: 'v1.0.0', ip: '10.20.0.1', status: 'online', deviceCount: 5, uptime: 99.9, location: 'Demo Factory' },
  })
  console.log(`  ✅ 1 gateway`)

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

  // 1 firmware version (signed)
  // Note: OTA signing keys must be generated first: bun run scripts/generate-ota-keys.ts
  console.log('')
  console.log('📋 Next steps:')
  console.log('  1. Start dev: bun run dev')
  console.log('  2. Start telemetry: cd mini-services/telemetry && bun run dev')
  console.log('  3. Open: http://localhost:3000')
  console.log('  4. Login: admin@indos.io / indos123')
  console.log('  5. CHANGE PASSWORD after first login!')
  console.log('  6. Generate OTA keys: bun run scripts/generate-ota-keys.ts')
  console.log('')
  console.log('✅ Seed complete.')
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
