import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Executive overview KPIs for the dashboard
export async function GET() {
  const [
    projects, devices, machines, alarms, workOrders,
    cameras, gateways, plugins, users,
  ] = await Promise.all([
    db.project.findMany({ select: { id: true, status: true, category: true } }),
    db.device.findMany({ select: { id: true, status: true, type: true, protocol: true } }),
    db.machine.findMany({ select: { id: true, status: true, oee: true, availability: true, performance: true, quality: true } }),
    db.alarm.findMany({ select: { id: true, state: true, severity: true, category: true, createdAt: true } }),
    db.workOrder.findMany({ select: { id: true, status: true, priority: true } }),
    db.camera.findMany({ select: { id: true, status: true, recording: true } }),
    db.gateway.findMany({ select: { id: true, status: true, deviceCount: true, uptime: true } }),
    db.plugin.findMany({ select: { id: true, installed: true, enabled: true, category: true } }),
    db.user.findMany({ select: { id: true, status: true, role: true } }),
  ])

  const activeAlarms = alarms.filter(a => a.state === 'active')
  const onlineDevices = devices.filter(d => d.status === 'online').length
  const runningMachines = machines.filter(m => m.status === 'running').length
  const openWO = workOrders.filter(w => w.status === 'open' || w.status === 'inprogress').length
  const avgOee = machines.length ? machines.reduce((s, m) => s + (m.oee || 0), 0) / machines.length : 0
  const onlineCameras = cameras.filter(c => c.status !== 'offline').length
  const onlineGateways = gateways.filter(g => g.status === 'online').length
  const enabledPlugins = plugins.filter(p => p.enabled).length
  const activeUsers = users.filter(u => u.status === 'active').length

  const projectByCat: Record<string, number> = {}
  for (const p of projects) projectByCat[p.category] = (projectByCat[p.category] || 0) + 1

  const protocolDist: Record<string, number> = {}
  for (const d of devices) protocolDist[d.protocol] = (protocolDist[d.protocol] || 0) + 1

  const alarmByCat: Record<string, number> = {}
  for (const a of activeAlarms) alarmByCat[a.category] = (alarmByCat[a.category] || 0) + 1

  return NextResponse.json({
    counts: {
      projects: projects.length,
      devices: devices.length,
      onlineDevices,
      machines: machines.length,
      runningMachines,
      activeAlarms: activeAlarms.length,
      ackAlarms: alarms.filter(a => a.state === 'acknowledged').length,
      resolvedAlarms: alarms.filter(a => a.state === 'resolved').length,
      workOrders: workOrders.length,
      openWorkOrders: openWO,
      cameras: cameras.length,
      onlineCameras,
      gateways: gateways.length,
      onlineGateways,
      plugins: plugins.length,
      enabledPlugins,
      users: users.length,
      activeUsers,
    },
    avgOee: Number(avgOee.toFixed(1)),
    availability: machines.length ? Number((machines.reduce((s, m) => s + (m.availability || 0), 0) / machines.length).toFixed(1)) : 0,
    performance: machines.length ? Number((machines.reduce((s, m) => s + (m.performance || 0), 0) / machines.length).toFixed(1)) : 0,
    quality: machines.length ? Number((machines.reduce((s, m) => s + (m.quality || 0), 0) / machines.length).toFixed(1)) : 0,
    projectByCat,
    protocolDist,
    alarmByCat,
    gatewayUptime: gateways.length ? Number((gateways.reduce((s, g) => s + (g.uptime || 0), 0) / gateways.length).toFixed(1)) : 0,
  })
}
