// IndOS shared types
export type ViewId =
  | 'dashboard'
  | 'projects'
  | 'devices'
  | 'gateways'
  | 'energy'
  | 'environment'
  | 'alarms'
  | 'maintenance'
  | 'analytics'
  | 'digitaltwin'
  | 'map'
  | 'cameras'
  | 'ota'
  | 'automation'
  | 'ai'
  | 'reports'
  | 'plugins'
  | 'organizations'
  | 'settings'
  | 'audit'
  | 'deployment'

export interface TelemetryPoint {
  deviceId: string
  name: string
  project: string
  metric: string
  unit: string
  value: number
  ts: string
}

export interface DeviceVital {
  id: string
  name: string
  status: 'online' | 'offline' | 'fault'
  cpu: number
  memory: number
  temperature: number
  signal: number
}

export interface SystemMetrics {
  mqttThroughput: number
  activeConnections: number
  apiLatencyMs: number
  dbPoolPct: number
  cpuPct: number
  memPct: number
  diskPct: number
  netInMbps: number
  netOutMbps: number
  ts: string
}

export interface AlarmEvent {
  id: string
  deviceId?: string
  project?: string
  severity: 'critical' | 'warning' | 'info'
  category: string
  message: string
  state: 'active' | 'acknowledged' | 'resolved'
  ts: string
}
