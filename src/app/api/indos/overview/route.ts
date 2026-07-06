import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler } from '@/lib/api'
import { apiHandler, RATE_LIMITS } from '@/lib/api-handler'
import { cached } from '@/lib/cache'

// GET: Executive overview (cached for 30s — reduces 21 DB queries to 0 on cache hit)
export const GET = withErrorHandler(apiHandler('viewer', RATE_LIMITS.read, async () => {
  const data = await cached('overview', 30, async () => {
    const [projectCount, projectByStatus, projectByCat, deviceCount, deviceByStatus, protocolDist, machineAgg, machineByStatus, alarmByState, alarmByCatActive, woByStatus, woCritical, cameraCount, cameraByStatus, gatewayCount, gatewayByStatus, gatewayAgg, pluginCount, pluginEnabled, userCount, userActive] = await Promise.all([
      db.project.count(), db.project.groupBy({ by: ['status'], _count: true }), db.project.groupBy({ by: ['category'], _count: true }),
      db.device.count(), db.device.groupBy({ by: ['status'], _count: true }), db.device.groupBy({ by: ['protocol'], _count: true }),
      db.machine.aggregate({ _avg: { oee: true, availability: true, performance: true, quality: true } }), db.machine.groupBy({ by: ['status'], _count: true }),
      db.alarm.groupBy({ by: ['state'], _count: true }), db.alarm.groupBy({ by: ['category'], _count: true, where: { state: 'active' } }),
      db.workOrder.groupBy({ by: ['status'], _count: true }), db.workOrder.count({ where: { priority: 'critical', OR: [{ status: 'open' }, { status: 'inprogress' }] } }),
      db.camera.count(), db.camera.groupBy({ by: ['status'], _count: true }),
      db.gateway.count(), db.gateway.groupBy({ by: ['status'], _count: true }), db.gateway.aggregate({ _avg: { uptime: true } }),
      db.plugin.count(), db.plugin.count({ where: { enabled: true } }),
      db.user.count(), db.user.count({ where: { status: 'active' } }),
    ])
    const toMap = (arr: any[], key: string, val = '_count') => { const m: Record<string, number> = {}; for (const r of arr) m[r[key]] = r[val]; return m }
    const sm = (arr: any[]) => { const m: Record<string, number> = {}; for (const r of arr) m[r.status] = r._count; return m }
    const devStatus = sm(deviceByStatus as any), macStatus = sm(machineByStatus as any), almState = sm(alarmByState as any), camStatus = sm(cameraByStatus as any), gwStatus = sm(gatewayByStatus as any), woStats = sm(woByStatus as any)
    return {
      counts: { projects: projectCount, devices: deviceCount, onlineDevices: devStatus.online || 0, machines: Object.values(macStatus).reduce((a,b)=>a+b,0), runningMachines: macStatus.running || 0, activeAlarms: almState.active || 0, ackAlarms: almState.acknowledged || 0, resolvedAlarms: almState.resolved || 0, workOrders: Object.values(woStats).reduce((a,b)=>a+b,0), openWorkOrders: (woStats.open||0)+(woStats.inprogress||0), cameras: cameraCount, onlineCameras: (camStatus.online||0)+(camStatus.recording||0), gateways: gatewayCount, onlineGateways: gwStatus.online || 0, plugins: pluginCount, enabledPlugins: pluginEnabled, users: userCount, activeUsers: userActive },
      avgOee: Number((machineAgg._avg.oee || 0).toFixed(1)), availability: Number((machineAgg._avg.availability || 0).toFixed(1)), performance: Number((machineAgg._avg.performance || 0).toFixed(1)), quality: Number((machineAgg._avg.quality || 0).toFixed(1)),
      projectByCat: toMap(projectByCat as any[], 'category'), protocolDist: toMap(protocolDist as any[], 'protocol'), alarmByCat: toMap(alarmByCatActive as any[], 'category'), gatewayUptime: Number((gatewayAgg._avg.uptime || 0).toFixed(1)),
    }
  })
  return NextResponse.json(data)
}))
