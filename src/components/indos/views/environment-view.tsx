'use client'
import { useEffect, useState } from 'react'
import { useRealtime } from '@/lib/indos/realtime'
import { KpiCard } from '@/components/indos/shared/kpi-card'
import { ViewHeader } from '@/components/indos/shared/view-header'
import { MultiSeriesArea, MultiSeriesLine, Sparkline, LiveDot } from '@/components/indos/shared/charts'
import { StatusBadge } from '@/components/indos/shared/status-badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Thermometer, Droplets, Wind, Volume2, Gauge, Leaf, Activity, AlertTriangle,
  ShieldCheck, Factory, Snowflake, SprayCan, Boxes, FlaskConical, Warehouse,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type SeriesResp = {
  kind: string
  series: Record<string, { t: string; v: number }[]>
  kpis: Record<string, number>
}

function aqiColor(aqi: number) {
  if (aqi <= 50) return { c: '#34d399', label: 'Good', text: 'text-emerald-400' }
  if (aqi <= 100) return { c: '#fbbf24', label: 'Moderate', text: 'text-amber-400' }
  if (aqi <= 150) return { c: '#fb923c', label: 'Unhealthy (Sensitive)', text: 'text-orange-400' }
  return { c: '#fb7185', label: 'Unhealthy', text: 'text-rose-400' }
}

function spark(seed: number, n = 16, base = 50, amp = 20) {
  let s = seed
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    s = (s * 9301 + 49297) % 233280
    const r = s / 233280
    out.push(Number((base + Math.sin(i / 2.2) * amp + (r - 0.5) * amp * 0.6).toFixed(1)))
  }
  return out
}

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted/30', className)} />
}

type Zone = {
  name: string
  icon: typeof Thermometer
  temp: number
  humidity: number
  co2: number
  status: 'online' | 'offline' | 'maintenance' | 'fault'
  sparkTemp: number[]
  sparkHum: number[]
}

const zones: Zone[] = [
  { name: 'Greenhouse Zone A', icon: Leaf, temp: 26.4, humidity: 72, co2: 820, status: 'online', sparkTemp: spark(11, 16, 26, 2), sparkHum: spark(12, 16, 70, 6) },
  { name: 'Cold Storage R2', icon: Snowflake, temp: 3.2, humidity: 58, co2: 410, status: 'online', sparkTemp: spark(13, 16, 3, 1), sparkHum: spark(14, 16, 58, 4) },
  { name: 'Paint Booth', icon: SprayCan, temp: 31.8, humidity: 48, co2: 690, status: 'maintenance', sparkTemp: spark(15, 16, 31, 2), sparkHum: spark(16, 16, 48, 5) },
  { name: 'Assembly Hall', icon: Factory, temp: 24.1, humidity: 54, co2: 720, status: 'online', sparkTemp: spark(17, 16, 24, 1.5), sparkHum: spark(18, 16, 54, 4) },
  { name: 'Welding Bay', icon: Activity, temp: 33.6, humidity: 41, co2: 880, status: 'online', sparkTemp: spark(19, 16, 33, 2), sparkHum: spark(20, 16, 41, 5) },
  { name: 'QA Lab', icon: FlaskConical, temp: 22.4, humidity: 50, co2: 540, status: 'online', sparkTemp: spark(21, 16, 22, 1), sparkHum: spark(22, 16, 50, 3) },
  { name: 'Warehouse East', icon: Warehouse, temp: 27.8, humidity: 62, co2: 600, status: 'online', sparkTemp: spark(23, 16, 27, 2), sparkHum: spark(24, 16, 62, 4) },
  { name: 'Server Room', icon: Boxes, temp: 18.6, humidity: 45, co2: 480, status: 'fault', sparkTemp: spark(25, 16, 19, 1), sparkHum: spark(26, 16, 45, 3) },
]

function AqiGauge({ value }: { value: number }) {
  const { c, label, text } = aqiColor(value)
  const pct = Math.min(1, value / 200)
  const r = 60
  const circ = Math.PI * r
  const offset = circ * (1 - pct)
  return (
    <div className="relative mx-auto w-full max-w-[280px]">
      <svg viewBox="0 0 140 80" className="block w-full">
        <path d="M 10 70 A 60 60 0 0 1 130 70" fill="none" stroke="oklch(1 0 0 / 0.08)" strokeWidth="14" strokeLinecap="round" />
        <path
          d="M 10 70 A 60 60 0 0 1 130 70"
          fill="none"
          stroke={c}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.4s' }}
        />
        <line x1="40" y1="70" x2="42" y2="64" stroke="oklch(0.7 0.01 250)" strokeWidth="1" />
        <line x1="70" y1="70" x2="70" y2="62" stroke="oklch(0.7 0.01 250)" strokeWidth="1" />
        <line x1="100" y1="70" x2="98" y2="64" stroke="oklch(0.7 0.01 250)" strokeWidth="1" />
      </svg>
      <div className="absolute inset-x-0 top-[58%] -translate-y-1/2 text-center">
        <p className="text-4xl font-bold leading-none tnum">{value}</p>
        <p className={cn('mt-1 text-xs font-semibold uppercase tracking-wider', text)}>{label}</p>
      </div>
      <div className="mt-2 flex justify-between text-[9px] uppercase text-muted-foreground">
        <span>0</span><span>50</span><span>100</span><span>150</span><span>200+</span>
      </div>
    </div>
  )
}

export function EnvironmentView() {
  const rt = useRealtime()
  const [data, setData] = useState<SeriesResp | null>(null)

  useEffect(() => {
    fetch('/api/indos/series?kind=environment').then((r) => r.json()).then(setData).catch(() => {})
  }, [])

  const k = data?.kpis
  const aqi = k?.aqi ?? 0
  const aqiInfo = aqiColor(aqi)

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <ViewHeader
        title="Environmental Monitoring"
        description="Ambient conditions, air quality and per-zone sensor telemetry across facilities."
        icon={<Leaf className="h-5 w-5" />}
        actions={
          <Badge variant="outline" className="gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
            <LiveDot color="bg-emerald-400" /> {rt.connected ? 'LIVE' : 'CONNECTING'}
          </Badge>
        }
      />

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {!k ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonBlock key={i} className="h-[104px]" />)
        ) : (
          <>
            <KpiCard label="Temp Avg" value={k.tempAvg.toFixed(1)} unit="°C" icon={Thermometer} accent="amber" delta={1.2} hint="24h mean" />
            <KpiCard label="Humidity Avg" value={k.humidityAvg.toFixed(0)} unit="%" icon={Droplets} accent="sky" delta={-2.4} hint="24h mean" />
            <KpiCard label="CO₂ Avg" value={k.co2Avg.toLocaleString()} unit="ppm" icon={Wind} accent="violet" hint="< 1000 ppm ok" />
            <KpiCard label="PM2.5 Avg" value={k.pm25Avg.toFixed(0)} unit="µg/m³" icon={Activity} accent="rose" hint="< 35 ok" />
            <KpiCard label="Noise Avg" value={k.noiseAvg.toFixed(0)} unit="dB" icon={Volume2} accent="slate" hint="8h TWA" />
            <KpiCard
              label="AQI"
              value={aqi}
              icon={Gauge}
              accent={aqi <= 50 ? 'emerald' : aqi <= 100 ? 'amber' : aqi <= 150 ? 'amber' : 'rose'}
              hint={aqiInfo.label}
            />
          </>
        )}
      </div>

      {/* Main charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Thermometer className="h-4 w-4 text-amber-400" /> Temperature & Humidity
              </CardTitle>
              <CardDescription className="text-xs">Ambient temperature (°C) · relative humidity (%)</CardDescription>
            </div>
            <div className="hidden gap-3 text-[10px] sm:flex">
              <span className="flex items-center gap-1 text-muted-foreground"><span className="h-2 w-2 rounded-sm bg-amber-400" /> Temperature</span>
              <span className="flex items-center gap-1 text-muted-foreground"><span className="h-2 w-2 rounded-sm bg-sky-400" /> Humidity</span>
            </div>
          </CardHeader>
          <CardContent>
            {data ? (
              <MultiSeriesArea
                series={{ temperature: data.series.temperature || [], humidity: data.series.humidity || [] }}
                unit=""
                height={240}
                colors={['#fbbf24', '#38bdf8']}
              />
            ) : (
              <SkeletonBlock className="h-[240px]" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className={cn('h-4 w-4', aqiInfo.text)} /> Air Quality Index
            </CardTitle>
            <CardDescription className="text-xs">US EPA standard · plant-wide aggregate</CardDescription>
          </CardHeader>
          <CardContent>
            {k ? (
              <AqiGauge value={aqi} />
            ) : (
              <SkeletonBlock className="mx-auto h-[140px] w-[240px]" />
            )}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-md border border-border/60 bg-card/40 p-2">
                <p className="text-[10px] uppercase text-muted-foreground">PM2.5</p>
                <p className="text-sm font-semibold tnum">{k?.pm25Avg.toFixed(0) ?? '—'} <span className="text-[10px] text-muted-foreground">µg/m³</span></p>
              </div>
              <div className="rounded-md border border-border/60 bg-card/40 p-2">
                <p className="text-[10px] uppercase text-muted-foreground">CO₂</p>
                <p className="text-sm font-semibold tnum">{k?.co2Avg.toLocaleString() ?? '—'} <span className="text-[10px] text-muted-foreground">ppm</span></p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* CO2 + PM2.5 line chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wind className="h-4 w-4 text-violet-400" /> Air Composition
          </CardTitle>
          <CardDescription className="text-xs">CO₂ (ppm) · PM2.5 (µg/m³)</CardDescription>
        </CardHeader>
        <CardContent>
          {data ? (
            <MultiSeriesLine
              series={{ co2: data.series.co2 || [], pm25: data.series.pm25 || [] }}
              unit=""
              height={200}
              colors={['#a78bfa', '#fb7185']}
            />
          ) : (
            <SkeletonBlock className="h-[200px]" />
          )}
        </CardContent>
      </Card>

      {/* Zone sensor cards */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Zone Sensors</h2>
            <p className="text-xs text-muted-foreground">Per-zone ambient telemetry · {zones.length} zones</p>
          </div>
          <Badge variant="outline" className="text-[11px]">{zones.filter((z) => z.status === 'online').length}/{zones.length} online</Badge>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {zones.map((z) => {
            const Icon = z.icon
            const tempColor = z.temp > 30 ? 'text-rose-400' : z.temp < 5 ? 'text-sky-400' : 'text-amber-400'
            return (
              <Card key={z.name} className="gap-0 p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="rounded-md bg-primary/10 p-1.5 text-primary ring-1 ring-primary/20">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium leading-tight">{z.name}</p>
                      <p className="text-[10px] text-muted-foreground">Environmental node</p>
                    </div>
                  </div>
                  <StatusBadge status={z.status} />
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">Temp</p>
                    <p className={cn('text-sm font-semibold tnum', tempColor)}>{z.temp.toFixed(1)}°</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">Humid</p>
                    <p className="text-sm font-semibold tnum text-sky-400">{z.humidity.toFixed(0)}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">CO₂</p>
                    <p className={cn('text-sm font-semibold tnum', z.co2 > 1000 ? 'text-rose-400' : 'text-emerald-400')}>{z.co2}</p>
                  </div>
                </div>

                <div className="mt-3 rounded-md border border-border/60 bg-card/40 p-2">
                  <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>Trend</span>
                    <span>24h</span>
                  </div>
                  <Sparkline data={z.sparkTemp} color="#fbbf24" height={32} />
                </div>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Alerts strip */}
      <Card className="border-l-4 border-l-amber-500/60">
        <CardContent className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            <div>
              <p className="text-sm font-medium">2 zones require attention</p>
              <p className="text-xs text-muted-foreground">Paint Booth in maintenance · Server Room fault — HVAC offline, manual intervention required.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <span className="text-xs text-muted-foreground">All other zones nominal · thresholds: T&gt;32°C, CO₂&gt;1000 ppm, H&lt;30%</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
