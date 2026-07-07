'use client'
import { useEffect, useState } from 'react'
import { useRealtime } from '@/lib/indos/realtime'
import { ViewHeader } from '@/components/indos/shared/view-header'
import { KpiCard } from '@/components/indos/shared/kpi-card'
import { Sparkline, LiveDot } from '@/components/indos/shared/charts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Thermometer, Droplets, Wind, AlertTriangle, Fan, Activity, Wifi, Cpu } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Duck Farm Dashboard ─────────────────────────────────────────────
// รับข้อมูลจาก ESP32 AeroDuck Pro v19 ผ่าน MQTT topic: farm/sensor
// ข้อมูลประกอบด้วย: temp_c, humi_pct, thi, thi_level, fan1-6_on, fans_active
//                  sys_mode, failsafe, manual_mode, sensor_ok, wifi_rssi, free_heap

interface DuckData {
  device_id: string
  fw_ver: string
  timestamp_unix: number
  uptime_s: number
  temp_c: number
  humi_pct: number
  thi: number
  thi_level: string
  fan_count: number
  fan1_on: boolean
  fan2_on: boolean
  fan3_on: boolean
  fan4_on: boolean
  fan5_on: boolean
  fan6_on: boolean
  fans_active: number
  sys_mode: string
  failsafe: boolean
  manual_mode: boolean
  sensor_ok: boolean
  wifi_rssi: number
  free_heap: number
}

const THI_COLORS: Record<string, string> = {
  'Comfortable': 'text-emerald-400 bg-emerald-500/10 ring-emerald-500/30',
  'Mild Stress': 'text-amber-400 bg-amber-500/10 ring-amber-500/30',
  'Severe Stress': 'text-orange-400 bg-orange-500/10 ring-orange-500/30',
  'DANGER': 'text-rose-400 bg-rose-500/10 ring-rose-500/30',
}

const tempHistory: number[] = []
const humiHistory: number[] = []
const thiHistory: number[] = []

export function DuckFarmView() {
  const rt = useRealtime()
  const [data, setData] = useState<DuckData | null>(null)
  const [history, setHistory] = useState<{ temp: number[]; humi: number[]; thi: number[] }>({ temp: [], humi: [], thi: [] })

  // ดึงข้อมูลจาก realtime telemetry (ที่ ESP32 ส่งผ่าน MQTT)
  useEffect(() => {
    const telemetry = Object.values(rt.telemetry)
    const duckData = telemetry.find(t => t.metric === 'temp_c' || t.metric === 'temperature' || t.name?.includes('duck') || t.name?.includes('DUCK'))

    if (duckData) {
      // สร้าง DuckData จาก telemetry แบบง่าย (ใน production จะรวมจากหลาย metric)
      const d: DuckData = {
        device_id: duckData.deviceId,
        fw_ver: 'v19.0.0',
        timestamp_unix: Math.floor(new Date(duckData.ts).getTime() / 1000),
        uptime_s: 0,
        temp_c: duckData.metric === 'temp_c' || duckData.metric === 'temperature' ? duckData.value : 0,
        humi_pct: 0,
        thi: 0,
        thi_level: 'Comfortable',
        fan_count: 6,
        fan1_on: false, fan2_on: false, fan3_on: false,
        fan4_on: false, fan5_on: false, fan6_on: false,
        fans_active: 0,
        sys_mode: 'Auto',
        failsafe: false,
        manual_mode: false,
        sensor_ok: true,
        wifi_rssi: -60,
        free_heap: 200000,
      }
      setData(d)

      // อัปเดต history
      tempHistory.push(d.temp_c)
      humiHistory.push(d.humi_pct)
      thiHistory.push(d.thi)
      if (tempHistory.length > 30) tempHistory.shift()
      if (humiHistory.length > 30) humiHistory.shift()
      if (thiHistory.length > 30) thiHistory.shift()
      setHistory({ temp: [...tempHistory], humi: [...humiHistory], thi: [...thiHistory] })
    }
  }, [rt.telemetry])

  // ข้อมูลจำลองสำหรับแสดงตัวอย่าง (เมื่อยังไม่มี ESP32 จริงเชื่อม)
  const demoData: DuckData = {
    device_id: 'DUCK-DEMO-01',
    fw_ver: 'v19.0.0',
    timestamp_unix: Math.floor(Date.now() / 1000),
    uptime_s: 86400,
    temp_c: 32.5,
    humi_pct: 75,
    thi: 28.4,
    thi_level: 'Mild Stress',
    fan_count: 6,
    fan1_on: true, fan2_on: true, fan3_on: true,
    fan4_on: false, fan5_on: false, fan6_on: false,
    fans_active: 3,
    sys_mode: 'Running (Target Met)',
    failsafe: false,
    manual_mode: false,
    sensor_ok: true,
    wifi_rssi: -58,
    free_heap: 215000,
  }

  const display = data || demoData
  const fans = [display.fan1_on, display.fan2_on, display.fan3_on, display.fan4_on, display.fan5_on, display.fan6_on]

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <ViewHeader
        title="Duck Farm Controller"
        description="AeroDuck Pro v19 — ควบคุมพัดลมโรงเรือนเป็ดไข่ 6 ตัว ตาม THI (Temperature-Humidity Index)"
        icon={<Wind className="h-5 w-5" />}
        actions={
          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
            <LiveDot color="bg-emerald-400" /> {data ? 'LIVE (ESP32 เชื่อมแล้ว)' : 'DEMO MODE'}
          </Badge>
        }
      />

      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard label="Temperature" value={display.temp_c.toFixed(1)} unit="°C" icon={Thermometer} accent="rose" hint={display.sensor_ok ? 'Sensor OK' : 'Sensor FAIL!'} />
        <KpiCard label="Humidity" value={display.humi_pct.toFixed(0)} unit="%" icon={Droplets} accent="sky" hint="RS485 SHT20" />
        <KpiCard label="THI (Stress Index)" value={display.thi.toFixed(1)} icon={Activity} accent={display.thi_level === 'DANGER' ? 'rose' : display.thi_level === 'Severe Stress' ? 'amber' : 'emerald'} hint={display.thi_level} />
        <KpiCard label="Fans Active" value={`${display.fans_active}/${display.fan_count}`} icon={Fan} accent="violet" hint={display.sys_mode} />
      </div>

      {/* THI Status Bar */}
      <Card className={cn('border-2', display.failsafe ? 'border-rose-500/50 bg-rose-500/5' : 'border-border')}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {display.failsafe ? (
                <AlertTriangle className="h-8 w-8 text-rose-500 animate-pulse" />
              ) : (
                <Activity className="h-8 w-8 text-emerald-400" />
              )}
              <div>
                <p className="text-xs text-muted-foreground">Duck Stress Level (THI)</p>
                <p className={cn('text-xl font-bold', THI_COLORS[display.thi_level]?.split(' ')[0] || 'text-foreground')}>
                  {display.thi_level}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold tnum">{display.thi.toFixed(1)}</p>
              <p className="text-[10px] text-muted-foreground">
                {display.failsafe ? '⚠️ FAILSAFE — พัดลมเปิดหมด' : display.manual_mode ? '>manual mode' : ' auto mode'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charts + Fan Status */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Sensor Charts */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Thermometer className="h-4 w-4 text-rose-400" /> Temperature Trend</CardTitle>
            <CardDescription className="text-xs">Sparkline 30 ค่าล่าสุด (°C)</CardDescription>
          </CardHeader>
          <CardContent>
            {history.temp.length > 0 ? (
              <Sparkline data={history.temp} color="#f43f5e" height={80} />
            ) : (
              <div className="h-20 flex items-center justify-center text-xs text-muted-foreground">รอข้อมูลจาก ESP32...</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Droplets className="h-4 w-4 text-sky-400" /> Humidity Trend</CardTitle>
            <CardDescription className="text-xs">Sparkline 30 ค่าล่าสุด (%)</CardDescription>
          </CardHeader>
          <CardContent>
            {history.humi.length > 0 ? (
              <Sparkline data={history.humi} color="#38bdf8" height={80} />
            ) : (
              <div className="h-20 flex items-center justify-center text-xs text-muted-foreground">รอข้อมูลจาก ESP32...</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Fan Status Grid */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><Fan className="h-4 w-4 text-violet-400" /> Fan Status (6 Fans)</CardTitle>
          <CardDescription className="text-xs">สถานะพัดลมแบบเรียลไทม์ — LOW = ON</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {fans.map((on, i) => (
              <div key={i} className={cn('rounded-lg border-2 p-3 text-center transition-all', on ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-border bg-muted/20')}>
                <Fan className={cn('mx-auto h-6 w-6 mb-1', on ? 'text-emerald-400 animate-spin' : 'text-muted-foreground')} style={on ? { animationDuration: '0.5s' } : {}} />
                <p className="text-xs font-semibold">Fan {i + 1}</p>
                <Badge variant="outline" className={cn('mt-1 text-[10px]', on ? 'border-emerald-500/30 text-emerald-400' : 'border-slate-500/30 text-slate-400')}>
                  {on ? 'ON' : 'OFF'}
                </Badge>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Active: <span className="font-bold text-violet-400">{display.fans_active}</span> / {display.fan_count}</span>
            <span className="text-muted-foreground">Mode: <span className="font-bold">{display.sys_mode}</span></span>
          </div>
        </CardContent>
      </Card>

      {/* Device Info */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-primary" />
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">Device</p>
                <p className="font-mono text-xs font-semibold">{display.device_id}</p>
                <p className="text-[10px] text-muted-foreground">{display.fw_ver}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Wifi className="h-4 w-4 text-sky-400" />
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">WiFi RSSI</p>
                <p className="font-mono text-xs font-semibold">{display.wifi_rssi} dBm</p>
                <p className="text-[10px] text-muted-foreground">{display.wifi_rssi > -70 ? 'ดี' : display.wifi_rssi > -85 ? 'ปานกลาง' : 'อ่อน'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-400" />
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">Uptime</p>
                <p className="font-mono text-xs font-semibold">{Math.floor(display.uptime_s / 3600)}h {Math.floor((display.uptime_s % 3600) / 60)}m</p>
                <p className="text-[10px] text-muted-foreground">Free Heap: {(display.free_heap / 1024).toFixed(0)} KB</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className={cn('h-4 w-4', display.sensor_ok ? 'text-emerald-400' : 'text-rose-500')} />
              <div>
                <p className="text-[10px] uppercase text-muted-foreground">Sensor</p>
                <p className="font-mono text-xs font-semibold">{display.sensor_ok ? 'OK' : 'FAIL!'}</p>
                <p className="text-[10px] text-muted-foreground">{display.failsafe ? 'FAILSAFE active' : 'Normal'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Failsafe Alert */}
      {display.failsafe && (
        <Card className="border-rose-500/50 bg-rose-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-rose-500 animate-pulse" />
              <div>
                <p className="font-bold text-rose-400">⚠️ FAILSAFE MODE</p>
                <p className="text-xs text-muted-foreground">เซ็นเซอร์เสีย — พัดลมเปิดทั้ง 6 ตัวเพื่อความปลอดภัย ไซเรนเตือนดัง ตรวจสอบสาย RS485 ด่วน</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
