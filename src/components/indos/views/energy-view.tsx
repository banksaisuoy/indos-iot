'use client'
import { useEffect, useState } from 'react'
import { useRealtime } from '@/lib/indos/realtime'
import { KpiCard } from '@/components/indos/shared/kpi-card'
import { ViewHeader } from '@/components/indos/shared/view-header'
import { MultiSeriesArea, MultiSeriesLine, SimpleBar, LiveDot } from '@/components/indos/shared/charts'
import { StatusBadge } from '@/components/indos/shared/status-badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import {
  Zap, Droplets, Flame, Sun, Gauge, DollarSign, Leaf, Activity, TrendingUp,
  AlertTriangle, ShieldCheck, CircuitBoard, Waves, Wind, Lightbulb, Cpu, Power,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type SeriesResp = {
  kind: string
  series: Record<string, { t: string; v: number }[]>
  kpis: Record<string, number>
}

type TabId = 'electricity' | 'water' | 'gas' | 'solar'

const kindMap: Record<TabId, string> = {
  electricity: 'energy',
  water: 'water',
  gas: 'gas',
  solar: 'solar',
}

function binByHour(pts: { t: string; v: number }[], hours = 24) {
  const buckets = Array.from({ length: hours }, () => ({ label: '', sum: 0, n: 0 }))
  const now = Date.now()
  for (const p of pts) {
    const d = new Date(p.t).getTime()
    const hoursAgo = Math.floor((now - d) / 3_600_000)
    if (hoursAgo < 0 || hoursAgo >= hours) continue
    const idx = hours - 1 - hoursAgo
    const h = new Date(p.t).getHours()
    if (!buckets[idx].label) buckets[idx].label = `${String(h).padStart(2, '0')}:00`
    buckets[idx].sum += p.v
    buckets[idx].n += 1
  }
  return buckets.map((b) => ({ label: b.label || '—', v: b.n ? Number((b.sum / b.n).toFixed(1)) : 0 }))
}

function SemiGauge({ value, max, label, unit, color }: { value: number; max: number; label: string; unit?: string; color: string }) {
  const pct = Math.min(1, Math.max(0, value / max))
  const r = 60
  const circ = Math.PI * r
  const offset = circ * (1 - pct)
  return (
    <div className="relative mx-auto w-full max-w-[260px]">
      <svg viewBox="0 0 140 80" className="block w-full">
        <path d="M 10 70 A 60 60 0 0 1 130 70" fill="none" stroke="oklch(1 0 0 / 0.08)" strokeWidth="12" strokeLinecap="round" />
        <path
          d="M 10 70 A 60 60 0 0 1 130 70"
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-x-0 top-[58%] -translate-y-1/2 text-center">
        <p className="text-2xl font-bold leading-none tnum">
          {value.toLocaleString()}
          {unit && <span className="ml-1 text-xs text-muted-foreground">{unit}</span>}
        </p>
        <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted/30', className)} />
}

const feeders = [
  { name: 'Main-MSB', desc: 'Main Switchboard', kw: 182, voltage: 400, pf: 0.92, status: 'online' },
  { name: 'Solar-Inverter', desc: 'PV Inverter Bay', kw: 96, voltage: 400, pf: 0.99, status: 'online' },
  { name: 'HVAC', desc: 'Chillers & AHUs', kw: 68, voltage: 400, pf: 0.88, status: 'online' },
  { name: 'Compressors', desc: 'Compressed Air', kw: 54, voltage: 400, pf: 0.85, status: 'maintenance' },
  { name: 'Lighting', desc: 'Plant Lighting', kw: 22, voltage: 230, pf: 0.95, status: 'online' },
] as const

const pumpStations = [
  { name: 'Raw Water Pump P-101', flow: 86, pressure: 4.2, runtime: 4820, status: 'running' },
  { name: 'Treated Water Pump P-204', flow: 72, pressure: 3.8, runtime: 3940, status: 'running' },
  { name: 'Booster Pump B-301', flow: 54, pressure: 5.1, runtime: 5210, status: 'running' },
  { name: 'Distribution Pump D-405', flow: 64, pressure: 4.6, runtime: 6108, status: 'idle' },
  { name: 'Fire Pump F-501', flow: 0, pressure: 6.4, runtime: 312, status: 'idle' },
] as const

const solarStrings = [
  { id: 'INV1-A', inv: 'Inverter 1', current: 11.8, voltage: 612, health: 96, status: 'online' },
  { id: 'INV1-B', inv: 'Inverter 1', current: 11.4, voltage: 608, health: 94, status: 'online' },
  { id: 'INV2-C', inv: 'Inverter 2', current: 12.6, voltage: 624, health: 98, status: 'online' },
  { id: 'INV2-D', inv: 'Inverter 2', current: 9.8, voltage: 590, health: 81, status: 'maintenance' },
  { id: 'INV3-E', inv: 'Inverter 3', current: 12.2, voltage: 618, health: 95, status: 'online' },
  { id: 'INV3-F', inv: 'Inverter 3', current: 11.9, voltage: 615, health: 93, status: 'online' },
] as const

export function EnergyView() {
  const rt = useRealtime()
  const [tab, setTab] = useState<TabId>('electricity')
  const [cache, setCache] = useState<Partial<Record<TabId, SeriesResp>>>({})

  useEffect(() => {
    if (cache[tab]) return
    let cancelled = false
    fetch(`/api/indos/series?kind=${kindMap[tab]}`)
      .then((r) => r.json())
      .then((d: SeriesResp) => {
        if (!cancelled) setCache((c) => ({ ...c, [tab]: d }))
      })
      .catch(() => {
        if (!cancelled) setCache((c) => ({ ...c, [tab]: { kind: kindMap[tab], series: {}, kpis: {} } }))
      })
    return () => {
      cancelled = true
    }
  }, [tab, cache])

  const data = cache[tab]
  const loading = !data

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <ViewHeader
        title="Energy & Utilities"
        description="Power, water, gas and solar PV across all monitored sites in real time."
        icon={<Zap className="h-5 w-5" />}
        actions={
          <Badge variant="outline" className="gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
            <LiveDot color="bg-emerald-400" /> {rt.connected ? 'LIVE' : 'CONNECTING'}
          </Badge>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
        <TabsList className="h-9 w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="electricity" className="gap-1.5 text-xs"><Zap className="h-3.5 w-3.5" /> Electricity</TabsTrigger>
          <TabsTrigger value="water" className="gap-1.5 text-xs"><Droplets className="h-3.5 w-3.5" /> Water</TabsTrigger>
          <TabsTrigger value="gas" className="gap-1.5 text-xs"><Flame className="h-3.5 w-3.5" /> Gas</TabsTrigger>
          <TabsTrigger value="solar" className="gap-1.5 text-xs"><Sun className="h-3.5 w-3.5" /> Solar PV</TabsTrigger>
        </TabsList>

        <TabsContent value="electricity" className="space-y-4">
          <ElectricityTab data={data} loading={loading} />
        </TabsContent>
        <TabsContent value="water" className="space-y-4">
          <WaterTab data={data} loading={loading} />
        </TabsContent>
        <TabsContent value="gas" className="space-y-4">
          <GasTab data={data} loading={loading} />
        </TabsContent>
        <TabsContent value="solar" className="space-y-4">
          <SolarTab data={data} loading={loading} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

/* ============ ELECTRICITY ============ */
function ElectricityTab({ data, loading }: { data?: SeriesResp; loading: boolean }) {
  const k = data?.kpis
  const hourly = data ? binByHour(data.series.consumption || []) : []
  const peakPct = k ? Math.min(100, (k.peakKw / 600) * 100) : 0

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {loading || !k ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonBlock key={i} className="h-[104px]" />)
        ) : (
          <>
            <KpiCard label="Total kWh" value={k.totalKwh.toLocaleString()} unit="kWh" icon={Zap} accent="amber" delta={3.4} hint="today" />
            <KpiCard label="Peak kW" value={k.peakKw} unit="kW" icon={TrendingUp} accent="rose" delta={-1.2} hint="14:02" />
            <KpiCard label="Cost Today" value={`$${k.costToday.toLocaleString()}`} icon={DollarSign} accent="emerald" delta={4.1} hint="$0.50/kWh" />
            <KpiCard label="Carbon" value={k.carbonKg.toLocaleString()} unit="kg" icon={Leaf} accent="violet" hint="CO₂e" />
            <KpiCard label="Power Factor" value={k.powerFactor.toFixed(2)} icon={Activity} accent="sky" hint="lagging" />
            <KpiCard label="Load Factor" value={`${(k.loadFactor * 100).toFixed(0)}`} unit="%" icon={Gauge} accent="slate" hint="24h avg" />
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4 text-amber-400" /> Power Flow
              </CardTitle>
              <CardDescription className="text-xs">Consumption · generation · solar · grid draw (kW)</CardDescription>
            </div>
            <div className="hidden gap-3 text-[10px] sm:flex">
              <LegendDot color="#fbbf24" label="Consumption" />
              <LegendDot color="#34d399" label="Generation" />
              <LegendDot color="#38bdf8" label="Solar" />
              <LegendDot color="#f472b6" label="Grid" />
            </div>
          </CardHeader>
          <CardContent>
            {data ? (
              <MultiSeriesArea series={data.series} unit="kW" height={260} />
            ) : (
              <SkeletonBlock className="h-[260px]" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="h-4 w-4 text-rose-400" /> Peak Demand
            </CardTitle>
            <CardDescription className="text-xs">vs contracted 600 kW</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {k ? (
              <SemiGauge value={k.peakKw} max={600} label="Peak demand" unit="kW" color="#fb7185" />
            ) : (
              <SkeletonBlock className="mx-auto h-[120px] w-[220px]" />
            )}
            <div>
              <div className="mb-1.5 flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Contract utilisation</span>
                <span className="font-medium tnum text-rose-400">{peakPct.toFixed(0)}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted/40">
                <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-rose-500 transition-all" style={{ width: `${peakPct}%` }} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="rounded-md border border-border/60 bg-card/40 p-2">
                <p className="text-[10px] uppercase text-muted-foreground">Avg</p>
                <p className="text-sm font-semibold tnum">{k ? Math.round(k.totalKwh / 24) : '—'} <span className="text-[10px] text-muted-foreground">kW</span></p>
              </div>
              <div className="rounded-md border border-border/60 bg-card/40 p-2">
                <p className="text-[10px] uppercase text-muted-foreground">Reactive</p>
                <p className="text-sm font-semibold tnum">{k ? (k.peakKw * 0.42).toFixed(0) : '—'} <span className="text-[10px] text-muted-foreground">kVAR</span></p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><CircuitBoard className="h-4 w-4 text-sky-400" /> Hourly Consumption</CardTitle>
            <CardDescription className="text-xs">Avg kW per hour · last 24h</CardDescription>
          </CardHeader>
          <CardContent>
            {data ? (
              <SimpleBar data={hourly} height={200} color="#fbbf24" unit="kW" />
            ) : (
              <SkeletonBlock className="h-[200px]" />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Power className="h-4 w-4 text-emerald-400" /> Feeder Lines</CardTitle>
            <CardDescription className="text-xs">Live distribution board readings</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-border/60">
                  <TableHead className="text-[11px] uppercase text-muted-foreground">Feeder</TableHead>
                  <TableHead className="text-[11px] uppercase text-muted-foreground">Load</TableHead>
                  <TableHead className="text-[11px] uppercase text-muted-foreground">Voltage</TableHead>
                  <TableHead className="text-[11px] uppercase text-muted-foreground">PF</TableHead>
                  <TableHead className="text-right text-[11px] uppercase text-muted-foreground">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feeders.map((f) => (
                  <TableRow key={f.name} className="border-border/40">
                    <TableCell>
                      <div className="font-medium">{f.name}</div>
                      <div className="text-[10px] text-muted-foreground">{f.desc}</div>
                    </TableCell>
                    <TableCell className="font-medium tnum">{f.kw} <span className="text-[10px] text-muted-foreground">kW</span></TableCell>
                    <TableCell className="tnum text-muted-foreground">{f.voltage} V</TableCell>
                    <TableCell>
                      <span className={cn('font-medium tnum', f.pf < 0.9 ? 'text-amber-400' : 'text-emerald-400')}>{f.pf.toFixed(2)}</span>
                    </TableCell>
                    <TableCell className="text-right"><StatusBadge status={f.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  )
}

/* ============ WATER ============ */
function WaterTab({ data, loading }: { data?: SeriesResp; loading: boolean }) {
  const k = data?.kpis
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
        {loading || !k ? (
          Array.from({ length: 5 }).map((_, i) => <SkeletonBlock key={i} className="h-[104px]" />)
        ) : (
          <>
            <KpiCard label="Total Volume" value={k.totalM3.toLocaleString()} unit="m³" icon={Droplets} accent="sky" delta={2.1} hint="today" />
            <KpiCard label="pH Avg" value={k.phAvg.toFixed(1)} icon={Activity} accent="emerald" hint="6.5 – 8.5 ok" />
            <KpiCard label="Turbidity" value={k.turbidityAvg.toFixed(1)} unit="NTU" icon={Waves} accent="amber" hint="< 5 NTU" />
            <KpiCard label="Chlorine" value={k.chlorineAvg.toFixed(2)} unit="mg/L" icon={ShieldCheck} accent="violet" hint="residual" />
            <KpiCard label="Uptime" value={k.uptimePct.toFixed(1)} unit="%" icon={Cpu} accent="emerald" hint="30-day" />
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Droplets className="h-4 w-4 text-sky-400" /> Flow</CardTitle>
            <CardDescription className="text-xs">Inflow vs outflow (m³/h)</CardDescription>
          </CardHeader>
          <CardContent>
            {data ? (
              <MultiSeriesArea
                series={{ inflow: data.series.inflow || [], outflow: data.series.outflow || [] }}
                unit="m³/h"
                height={220}
                colors={['#38bdf8', '#34d399']}
              />
            ) : (
              <SkeletonBlock className="h-[220px]" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4 text-emerald-400" /> Water Quality</CardTitle>
            <CardDescription className="text-xs">pH · turbidity (NTU) · chlorine (mg/L)</CardDescription>
          </CardHeader>
          <CardContent>
            {data ? (
              <MultiSeriesLine
                series={{ ph: data.series.ph || [], turbidity: data.series.turbidity || [], chlorine: data.series.chlorine || [] }}
                unit=""
                height={220}
              />
            ) : (
              <SkeletonBlock className="h-[220px]" />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><CircuitBoard className="h-4 w-4 text-sky-400" /> Pump Stations</CardTitle>
          <CardDescription className="text-xs">Live pump telemetry</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-border/60">
                <TableHead className="text-[11px] uppercase text-muted-foreground">Pump</TableHead>
                <TableHead className="text-[11px] uppercase text-muted-foreground">Flow</TableHead>
                <TableHead className="text-[11px] uppercase text-muted-foreground">Pressure</TableHead>
                <TableHead className="text-[11px] uppercase text-muted-foreground">Runtime</TableHead>
                <TableHead className="text-right text-[11px] uppercase text-muted-foreground">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pumpStations.map((p) => (
                <TableRow key={p.name} className="border-border/40">
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="font-medium tnum">{p.flow} <span className="text-[10px] text-muted-foreground">m³/h</span></TableCell>
                  <TableCell className="tnum text-muted-foreground">{p.pressure.toFixed(1)} bar</TableCell>
                  <TableCell className="tnum text-muted-foreground">{p.runtime.toLocaleString()} h</TableCell>
                  <TableCell className="text-right"><StatusBadge status={p.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  )
}

/* ============ GAS ============ */
function GasTab({ data, loading }: { data?: SeriesResp; loading: boolean }) {
  const k = data?.kpis
  const leakAlerts = k?.leakAlerts ?? 0
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {loading || !k ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} className="h-[104px]" />)
        ) : (
          <>
            <KpiCard label="Total Volume" value={k.totalM3.toLocaleString()} unit="m³" icon={Flame} accent="amber" delta={1.8} hint="today" />
            <KpiCard label="Pressure Avg" value={k.pressureAvg.toFixed(1)} unit="bar" icon={Gauge} accent="sky" hint="nominal 4.0" />
            <KpiCard label="Methane" value={k.methanePct.toFixed(1)} unit="%" icon={Wind} accent="emerald" hint="CH₄ purity" />
            <KpiCard label="Leak Alerts" value={leakAlerts} icon={AlertTriangle} accent={leakAlerts > 0 ? 'rose' : 'emerald'} hint={leakAlerts > 0 ? 'action required' : 'all clear'} />
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Flame className="h-4 w-4 text-amber-400" /> Gas Flow</CardTitle>
            <CardDescription className="text-xs">Metered flow rate (m³/h)</CardDescription>
          </CardHeader>
          <CardContent>
            {data ? (
              <MultiSeriesArea series={{ flow: data.series.flow || [] }} unit="m³/h" height={220} colors={['#fbbf24']} />
            ) : (
              <SkeletonBlock className="h-[220px]" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Gauge className="h-4 w-4 text-sky-400" /> Pressure & Methane</CardTitle>
            <CardDescription className="text-xs">Line pressure (bar) · CH₄ (%)</CardDescription>
          </CardHeader>
          <CardContent>
            {data ? (
              <MultiSeriesLine
                series={{ pressure: data.series.pressure || [], methane: data.series.methane || [] }}
                unit=""
                height={220}
                colors={['#38bdf8', '#34d399']}
              />
            ) : (
              <SkeletonBlock className="h-[220px]" />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className={cn('border-l-4', leakAlerts > 0 ? 'border-l-rose-500/60' : 'border-l-emerald-500/60')}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className={cn('h-4 w-4', leakAlerts > 0 ? 'text-rose-400' : 'text-emerald-400')} />
            Leak Detection System
          </CardTitle>
          <CardDescription className="text-xs">Distributed CH₄ sensors · 12 zones monitored</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {['BAY-1', 'BAY-2', 'BAY-3', 'PIPE-A', 'PIPE-B', 'TANK-FARM'].map((zone, i) => {
              const triggered = leakAlerts > 0 && i === 2
              return (
                <div key={zone} className={cn('rounded-md border p-2.5 text-center', triggered ? 'border-rose-500/40 bg-rose-500/10' : 'border-border/60 bg-card/40')}>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{zone}</p>
                  <p className={cn('mt-1 text-xs font-semibold', triggered ? 'text-rose-400' : 'text-emerald-400')}>{triggered ? 'ALARM' : 'OK'}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{(Math.random() * 0.4 + 0.1).toFixed(2)} %LEL</p>
                </div>
              )
            })}
          </div>
          <div className={cn('mt-3 flex items-center gap-2 rounded-md p-3 text-xs', leakAlerts > 0 ? 'bg-rose-500/10 text-rose-300' : 'bg-emerald-500/10 text-emerald-300')}>
            <AlertTriangle className="h-4 w-4" />
            {leakAlerts > 0 ? `${leakAlerts} active leak alarm(s). Auto-isolation armed. Dispatching maintenance team.` : 'No active leak alarms. All sensor zones nominal. Continuous monitoring active.'}
          </div>
        </CardContent>
      </Card>
    </>
  )
}

/* ============ SOLAR ============ */
function SolarTab({ data, loading }: { data?: SeriesResp; loading: boolean }) {
  const k = data?.kpis
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {loading || !k ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} className="h-[104px]" />)
        ) : (
          <>
            <KpiCard label="Yield Today" value={k.totalKwh.toLocaleString()} unit="kWh" icon={Sun} accent="amber" delta={6.4} hint="generation" />
            <KpiCard label="Peak Output" value={k.peakKw} unit="kW" icon={Zap} accent="amber" hint="12:48" />
            <KpiCard label="Perf. Ratio" value={`${(k.performanceRatio * 100).toFixed(0)}`} unit="%" icon={Gauge} accent="emerald" hint="vs modeled" />
            <KpiCard label="CO₂ Avoided" value={k.co2Avoided.toLocaleString()} unit="kg" icon={Leaf} accent="violet" hint="today" />
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Sun className="h-4 w-4 text-amber-400" /> Yield & Irradiance</CardTitle>
            <CardDescription className="text-xs">PV yield (kW) · plane irradiance (W/m²)</CardDescription>
          </CardHeader>
          <CardContent>
            {data ? (
              <MultiSeriesArea
                series={{ yield: data.series.yield || [], irradiance: data.series.irradiance || [] }}
                unit=""
                height={220}
                colors={['#fbbf24', '#38bdf8']}
              />
            ) : (
              <SkeletonBlock className="h-[220px]" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><CircuitBoard className="h-4 w-4 text-emerald-400" /> Inverter Output</CardTitle>
            <CardDescription className="text-xs">Per-inverter AC output (kW)</CardDescription>
          </CardHeader>
          <CardContent>
            {data ? (
              <MultiSeriesArea
                series={{ inverter1: data.series.inverter1 || [], inverter2: data.series.inverter2 || [], inverter3: data.series.inverter3 || [] }}
                unit="kW"
                height={220}
                colors={['#34d399', '#fbbf24', '#a78bfa']}
              />
            ) : (
              <SkeletonBlock className="h-[220px]" />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><Lightbulb className="h-4 w-4 text-amber-400" /> String Health</CardTitle>
          <CardDescription className="text-xs">Per-string DC monitoring</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-border/60">
                <TableHead className="text-[11px] uppercase text-muted-foreground">String</TableHead>
                <TableHead className="text-[11px] uppercase text-muted-foreground">Inverter</TableHead>
                <TableHead className="text-[11px] uppercase text-muted-foreground">Current</TableHead>
                <TableHead className="text-[11px] uppercase text-muted-foreground">Voltage</TableHead>
                <TableHead className="text-[11px] uppercase text-muted-foreground">Health</TableHead>
                <TableHead className="text-right text-[11px] uppercase text-muted-foreground">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {solarStrings.map((s) => (
                <TableRow key={s.id} className="border-border/40">
                  <TableCell className="font-medium">{s.id}</TableCell>
                  <TableCell className="text-muted-foreground">{s.inv}</TableCell>
                  <TableCell className="font-medium tnum">{s.current.toFixed(1)} <span className="text-[10px] text-muted-foreground">A</span></TableCell>
                  <TableCell className="tnum text-muted-foreground">{s.voltage} V</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted/40">
                        <div
                          className={cn('h-full rounded-full', s.health >= 90 ? 'bg-emerald-500' : s.health >= 80 ? 'bg-amber-500' : 'bg-rose-500')}
                          style={{ width: `${s.health}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-medium tnum">{s.health}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right"><StatusBadge status={s.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-muted-foreground">
      <span className="h-2 w-2 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  )
}
