import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isRedisAvailable } from '@/lib/cache'
import { isInfluxAvailable } from '@/lib/influx'

/**
 * GET /api/metrics
 *
 * Basic platform metrics for Prometheus/Grafana scraping.
 * Public endpoint (no auth) — exposes only aggregate counts, no sensitive data.
 */
export async function GET() {
  const uptime = process.uptime()
  const mem = process.memoryUsage()

  let deviceCount = 0, onlineDevices = 0, activeAlarms = 0, otaJobCount = 0, userCount = 0, firmwareCount = 0
  try {
    ;[deviceCount, onlineDevices, activeAlarms, otaJobCount, userCount, firmwareCount] = await Promise.all([
      db.device.count(),
      db.device.count({ where: { status: 'online' } }),
      db.alarm.count({ where: { state: 'active' } }),
      db.otaJob.count(),
      db.user.count(),
      db.firmware.count(),
    ])
  } catch {
    // DB may be initializing
  }

  return NextResponse.json({
    // Process metrics
    uptime: Number(uptime.toFixed(1)),
    memory: {
      rss: Math.round(mem.rss / 1024 / 1024),       // MB
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024), // MB
    },
    // Platform metrics
    devices: {
      total: deviceCount,
      online: onlineDevices,
      offline: deviceCount - onlineDevices,
    },
    alarms: {
      active: activeAlarms,
    },
    ota: {
      totalJobs: otaJobCount,
      firmwareVersions: firmwareCount,
    },
    users: {
      total: userCount,
    },
    // Infrastructure status
    infrastructure: {
      redis: isRedisAvailable(),
      influxdb: isInfluxAvailable(),
    },
    ts: new Date().toISOString(),
  })
}
