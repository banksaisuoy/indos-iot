import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { buildSignedManifest } from '@/lib/ota-signing'

// TEMPORARY endpoint to seed the Postgres DB from Vercel (sandbox blocks outbound DB).
// Protected by SETUP_TOKEN. Idempotent. Remove after use.
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: Request) {
  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  if (!process.env.SETUP_TOKEN || token !== process.env.SETUP_TOKEN) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }
  try {
    await db.organization.upsert({ where: { id: 'org-default' }, update: {}, create: { id: 'org-default', name: 'IndOS Demo', type: 'operator', industry: 'Manufacturing', country: 'Thailand' } })
    await db.organization.upsert({ where: { id: 'org-acme' }, update: {}, create: { id: 'org-acme', name: 'Acme Industries', type: 'operator', industry: 'Heavy Industry', country: 'Singapore' } })

    const adminHash = bcrypt.hashSync('indos123', 10)
    await db.user.upsert({ where: { email: 'admin@indos.io' }, update: {}, create: { id: 'user-admin', email: 'admin@indos.io', name: 'Admin', role: 'admin', password: adminHash, orgId: null, status: 'active' } })

    const engHash = bcrypt.hashSync('acme123', 10)
    await db.user.upsert({ where: { email: 'engineer@acme.io' }, update: {}, create: { id: 'user-acme-eng', email: 'engineer@acme.io', name: 'Acme Engineer', role: 'engineer', password: engHash, orgId: 'org-acme', status: 'active' } })

    await db.project.upsert({ where: { slug: 'demo-factory' }, update: {}, create: { id: 'proj-demo', name: 'Demo Factory', slug: 'demo-factory', category: 'factory', status: 'active', orgId: 'org-default', location: 'Bangkok, TH', lat: 13.7563, lng: 100.5018 } })
    await db.project.upsert({ where: { slug: 'acme-plant-a' }, update: {}, create: { id: 'proj-acme', name: 'Acme Plant A', slug: 'acme-plant-a', category: 'factory', status: 'active', orgId: 'org-acme', location: 'Singapore, SG', lat: 1.3521, lng: 103.8198 } })

    const demoDevices = [
      { id: 'dev-temp-1', name: 'temperature-demo-1', mac: 'AA:BB:CC:00:00:01', type: 'sensor', protocol: 'mqtt', ip: '10.20.0.10', firmware: 'v1.2.0' },
      { id: 'dev-hum-2', name: 'humidity-demo-2', mac: 'AA:BB:CC:00:00:02', type: 'sensor', protocol: 'mqtt', ip: '10.20.0.11', firmware: 'v1.2.0' },
      { id: 'dev-pwr-3', name: 'power-demo-3', mac: 'AA:BB:CC:00:00:03', type: 'meter', protocol: 'modbus-tcp', ip: '10.20.0.12', firmware: 'v1.1.0' },
      { id: 'dev-volt-4', name: 'voltage-demo-4', mac: 'AA:BB:CC:00:00:04', type: 'meter', protocol: 'mqtt', ip: '10.20.0.13', firmware: 'v1.2.0' },
      { id: 'dev-state-5', name: 'state-demo-5', mac: 'AA:BB:CC:00:00:05', type: 'relay', protocol: 'mqtt', ip: '10.20.0.14', firmware: 'v1.2.0' },
    ]
    for (const d of demoDevices) {
      await db.device.upsert({ where: { mac: d.mac }, update: {}, create: { ...d, projectId: 'proj-demo', status: 'online', cpu: 20 + Math.random() * 40, memory: 40 + Math.random() * 30, temperature: 35 + Math.random() * 15, signal: -60 - Math.random() * 20, lastSeen: new Date() } })
    }

    const acmeDevices = [
      { id: 'dev-acme-1', name: 'pressure-acme-1', mac: 'AC:ME:00:00:01', type: 'sensor', protocol: 'mqtt', ip: '10.30.0.10', firmware: 'v1.2.0' },
      { id: 'dev-acme-2', name: 'flow-acme-2', mac: 'AC:ME:00:00:02', type: 'meter', protocol: 'modbus-tcp', ip: '10.30.0.11', firmware: 'v1.2.0' },
      { id: 'dev-acme-3', name: 'valve-acme-3', mac: 'AC:ME:00:00:03', type: 'relay', protocol: 'mqtt', ip: '10.30.0.12', firmware: 'v1.2.0' },
    ]
    for (const d of acmeDevices) {
      await db.device.upsert({ where: { mac: d.mac }, update: {}, create: { ...d, projectId: 'proj-acme', status: 'online', cpu: 20 + Math.random() * 40, memory: 40 + Math.random() * 30, temperature: 35 + Math.random() * 15, signal: -60 - Math.random() * 20, lastSeen: new Date() } })
    }

    await db.gateway.upsert({ where: { mac: 'GW:01:AA:BB:CC:01' }, update: {}, create: { name: 'GW-DEMO-01', mac: 'GW:01:AA:BB:CC:01', model: 'IndoS-GW-Pro', firmware: 'v1.0.0', ip: '10.20.0.1', status: 'online', deviceCount: 5, uptime: 99.9, location: 'Demo Factory', orgId: null } })
    await db.gateway.upsert({ where: { mac: 'GW:AC:ME:00:00:01' }, update: {}, create: { name: 'GW-ACME-01', mac: 'GW:AC:ME:00:00:01', model: 'IndoS-GW-Lite', firmware: 'v1.0.0', ip: '10.30.0.1', status: 'online', deviceCount: 3, uptime: 98.5, location: 'Acme Plant A', orgId: 'org-acme' } })

    for (const cam of [
      { name: 'CAM-DEMO-01', location: 'Demo Factory — Line A', ip: '10.20.1.50', status: 'online', aiDetection: true, motionDetect: true, recording: true, resolution: '1080p', orgId: null },
      { name: 'CAM-ACME-01', location: 'Acme Plant A — Floor', ip: '10.30.1.50', status: 'online', aiDetection: false, motionDetect: true, recording: false, resolution: '720p', orgId: 'org-acme' },
    ]) {
      const existing = await db.camera.findFirst({ where: { name: cam.name } })
      if (!existing) await db.camera.create({ data: cam })
    }

    const settings = [
      { key: 'platform.name', value: 'IndOS', category: 'system' },
      { key: 'platform.version', value: '1.0.0', category: 'system' },
      { key: 'mqtt.broker', value: 'localhost:1883', category: 'connectivity' },
      { key: 'mqtt.topic_root', value: 'indos', category: 'connectivity' },
      { key: 'timeseries.backend', value: 'InfluxDB', category: 'connectivity' },
      { key: 'cache.backend', value: 'Redis', category: 'connectivity' },
      { key: 'storage.backend', value: 'Wasabi', category: 'connectivity' },
      { key: 'ai.backend', value: 'OpenRouter', category: 'ai' },
      { key: 'auth.provider', value: 'NextAuth', category: 'security' },
      { key: 'ota.signing', value: 'Ed25519', category: 'security' },
      { key: 'backup.schedule', value: '02:00 ICT daily', category: 'backup' },
      { key: 'monitoring.backend', value: 'Prometheus + Grafana', category: 'observability' },
    ]
    for (const s of settings) {
      const existing = await db.setting.findUnique({ where: { key: s.key } })
      if (!existing) await db.setting.create({ data: s })
    }

    const fwExisting = await db.firmware.findFirst({ where: { version: 'v1.2.0' } })
    if (!fwExisting) {
      const manifest = buildSignedManifest({ version: 'v1.2.0', deviceType: 'sensor', url: 'https://example.com/fw/v1.2.0.bin', checksum: 'sha256:abc123', sizeKb: 256, notes: 'Stable release' })
      await db.firmware.create({ data: { version: 'v1.2.0', deviceType: 'sensor', checksum: 'sha256:abc123', sizeKb: 256, notes: 'Stable release', status: 'stable', url: 'https://example.com/fw/v1.2.0.bin', signature: manifest.signature, signingKeyId: manifest.signingKeyId, manifest: JSON.stringify(manifest), orgId: null } })
    }

    return NextResponse.json({
      ok: true,
      orgs: await db.organization.count(),
      users: await db.user.count(),
      projects: await db.project.count(),
      devices: await db.device.count(),
      gateways: await db.gateway.count(),
      cameras: await db.camera.count(),
      settings: await db.setting.count(),
      firmware: await db.firmware.count(),
      message: 'Seed complete. Login: admin@indos.io / indos123',
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e.message || '').slice(0, 500), stack: (e.stack || '').slice(0, 300) }, { status: 500 })
  }
}
