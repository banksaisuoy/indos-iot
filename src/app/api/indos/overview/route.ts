import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withErrorHandler } from '@/lib/api'
import { apiHandler, RATE_LIMITS } from '@/lib/api-handler'
import { cached } from '@/lib/cache'
import { orgScope, scopedProjectFilter, scopedMachineFilter, isOrgScoped } from '@/lib/org-scope'

// GET: Executive overview (cached for 30s — reduces 21 DB queries to 0 on cache hit)
// P0.1: counts are scoped by org where the model supports it (projects, devices
// via project.orgId, alarms via project.orgId, workorders via project.orgId,
// machines via line.building.factory.project.orgId).
// Gateways/cameras/firmware are PLATFORM-LEVEL resources (no orgId) — counts
// remain global. Admins / platform users see global counts.
export const GET = withErrorHandler(apiHandler('viewer', RATE_LIMITS.read, async (_req, session) => {
  // Cache key includes orgId so each tenant gets its own overview snapshot.
  const cacheKey = isOrgScoped(session)
    ? `overview:${(session.user as any).orgId}`
    : 'overview:global'
  const data = await cached(cacheKey, 30, async () => {
    const projectWhere = orgScope(session)
    const deviceWhere = scopedProjectFilter(session)
    const alarmWhere = scopedProjectFilter(session)
    const woWhere = scopedProjectFilter(session)
    const machineWhere = scopedMachineFilter(session)

    const [projectCount, projectByStatus, projectByCat, deviceCount, deviceByStatus, protocolDist, machineAgg, machineByStatus, alarmByState, alarmByCatActive, woByStatus, woCritical, cameraCount, cameraByStatus, gatewayCount, gatewayByStatus, gatewayAgg, pluginCount, pluginEnabled, userCount, userActive] = await Promise.all([
      db.project.count({ where: projectWhere }), db.project.groupBy({ by: ['status'], _count: true, where: projectWhere }), db.project.groupBy({ by: ['category'], _count: true, where: projectWhere }),
      db.device.count({ where: deviceWhere }), db.device.groupBy({ by: ['status'], _count: true, where: deviceWhere }), db.device.groupBy({ by: ['protocol'], _count: true, where: deviceWhere }),
      db.machine.aggregate({ _avg: { oee: true, availability: true, performance: true, quality: true }, where: machineWhere }), db.machine.groupBy({ by: ['status'], _count: true, where: machineWhere }),
      db.alarm.groupBy({ by: ['state'], _count: true, where: alarmWhere }), db.alarm.groupBy({ by: ['category'], _count: true, where: { ...alarmWhere, state: 'active' } }),
      db.workOrder.groupBy({ by: ['status'], _count: true, where: woWhere }), db.workOrder.count({ where: { ...woWhere, priority: 'critical', OR: [{ status: 'open' }, { status: 'inprogress' }] } }),
      // PLATFORM-LEVEL: cameras + gateways have no orgId → counts stay global
      db.camera.count(), db.camera.groupBy({ by: ['status'], _count: true }),
      db.gateway.count(), db.gateway.groupBy({ by: ['status'], _count: true }), db.gateway.aggregate({ _avg: { uptime: true } }),
      db.plugin.count(), db.plugin.count({ where: { enabled: true } }),
      // PLATFORM-LEVEL: user counts stay global (admins see total platform users)
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
