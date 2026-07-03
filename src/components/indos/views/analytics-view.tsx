'use client'
import { useEffect, useState } from 'react'
import { useRealtime } from '@/lib/indos/realtime'
import { KpiCard } from '@/components/indos/shared/kpi-card'
import { ViewHeader } from '@/components/indos/shared/view-header'
import { MultiSeriesArea, SimpleBar, LiveDot } from '@/components/indos/shared/charts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import {
  BarChart3, Database, Timer, Tag, ShieldCheck, Activity, Factory, AlertTriangle,
  Cpu, CircuitBoard, Boxes, TrendingUp, Radio, Layers, Workflow, Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type SeriesResp = {
  kind: string
  series: Record<string, { t: string; v: number }[]>
  kpis: Record<string, number>
}

type Overview = {
  counts: Record<string, number>
  avgOee: number
  projectByCat: Record<string, number>
  protocolDist: Record<string, number>
  alarmByCat: Record<string, number>
}

type Range = '24h' | '7d' | '30d'

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted/30', className)} />
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
    if (!buckets[idx].label) buckets[idx].label = `${String(h).padStart(2, '0')}`
    buckets[idx].sum += p.v
    buckets[idx].n += 1
  }
  return buckets.map((b) => ({ label: b.label || '—', v: b.n ? Number((b.sum / b.n).toFixed(0)) : 0 }))
}

function Donut({ segments, size = 140 }: { segments: { label: string; value: number; color: string }[]; size?: number }) {
  const r = 42
  const c = 2 * Math.PI * r
  const total = segments.reduce((s, x) => s + x.value, 0) || 1
  // Build each segment with its cumulative offset (pure functional pass).
  const segs = segments.reduce<{ label: string; value: number; color: string; dash: number; off: number; cum: number }[]>(
    (acc, s) => {
      const frac = s.value / total
      const prev = acc.length ? acc[acc.length - 1].cum : 0
      acc.push({ ...s, dash: frac * c, off: -prev * c, cum: prev + frac })
      return acc
    },
    [],
  )
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 110 110" className="h-full w-full -rotate-90">
          <circle cx="55" cy="55" r={r} fill="none" stroke="oklch(1 0 0 / 0.06)" strokeWidth="10" />
          {segs.map((s, i) => (
            <circle
              key={i}
              cx="55"
              cy="55"
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth="10"
              strokeDasharray={`${s.dash} ${c - s.dash}`}
              strokeDashoffset={s.off}
              style={{ transition: 'stroke-dasharray 0.6s ease' }}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-lg font-bold leading-none tnum">{total.toLocaleString()}</p>
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">units</p>
        </div>
      </div>
      <div className="grid w-full grid-cols-1 gap-1.5 text-[11px]">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
              {s.label}
            </span>
            <span className="font-medium tnum">
              {s.value.toLocaleString()}
              <span className="ml-1 text-[10px] text-muted-foreground">{((s.value / total) * 100).toFixed(1)}%</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

const topDevices = [
  { name: 'PLC-Line-A1', project: 'Detroit EV', metric: 'cycle_time', samples: 184_220, value: 42.8, unit: 's', status: 'online' },
  { name: 'VFD-Pump-204', project: 'Houston Refinery', metric: 'flow_rate', samples: 168_540, value: 72.4, unit: 'm³/h', status: 'online' },
  { name: 'SCADA-Inv3', project: 'Phoenix Solar', metric: 'ac_power', samples: 142_180, value: 21.6, unit: 'kW', status: 'online' },
  { name: 'RTU-Chiller-7', project: 'Dallas DC', metric: 'coil_temp', samples: 121_980, value: 6.2, unit: '°C', status: 'online' },
  { name: 'Gateway-Bay-2', project: 'Austin Plant', metric: 'throughput', samples: 98_440, value: 412, unit: 'msg/s', status: 'maintenance' },
  { name: 'Sensor-Press-9', project: 'Houston Refinery', metric: 'line_pressure', samples: 88_720, value: 4.18, unit: 'bar', status: 'online' },
  { name: 'Camera-East-3', project: 'Detroit EV', metric: 'motion_score', samples: 56_310, value: 0.18, unit: '', status: 'online' },
  { name: 'PLC-Welder-12', project: 'Austin Plant', metric: 'arc_current', samples: 42_180, value: 184.5, unit: 'A', status: 'offline' },
] as const

export function AnalyticsView() {
  const rt = useRealtime()
  const [range, setRange] = useState<Range>('24h')
  const [machine, setMachine] = useState<SeriesResp | null>(null)
  const [production, setProduction] = useState<SeriesResp | null>(null)
  const [overview, setOverview] = useState<Overview | null>(null)

  useEffect(() => {
    fetch('/api/indos/series?kind=machine').then((r) => r.json()).then(setMachine).catch(() => {})
    fetch('/api/indos/series?kind=production').then((r) => r.json()).then(setProduction).catch(() => {})
    fetch('/api/indos/overview').then((r) => r.json()).then(setOverview).catch(() => {})
  }, [])

  const mk = machine?.kpis
  const pk = production?.kpis

  const throughputHourly = machine ? binByHour(machine.series.throughput || []) : []
  const projectDist = overview ? Object.entries(overview.projectByCat).map(([k, v]) => ({ label: k.slice(0, 8), v })) : []
  const protocolMix = overview ? Object.entries(overview.protocolDist).map(([k, v]) => ({ label: k, v })) : []
  const alarmHeat = overview ? Object.entries(overview.alarmByCat).map(([k, v]) => ({ label: k.slice(0, 8), v })) : []

  const goodUnits = pk?.goodUnits ?? 0
  const totalUnits = pk?.totalUnits ?? 0
  const defectUnits = pk ? pk.totalUnits - pk.goodUnits : 0
  const scrapUnits = pk ? Math.round(defectUnits * (pk.scrapRate / (pk.defectRate || 1))) : 0
  const reworkUnits = Math.max(0, defectUnits - scrapUnits)

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <ViewHeader
        title="Analytics & BI"
        description="Cross-platform analytics — production, OEE, quality, telemetry ingestion and alarm distribution."
        icon={<BarChart3 className="h-5 w-5" />}
        actions={
          <>
            <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
              <TabsList className="h-8">
                <TabsTrigger value="24h" className="text-xs">24H</TabsTrigger>
                <TabsTrigger value="7d" className="text-xs">7D</TabsTrigger>
                <TabsTrigger value="30d" className="text-xs">30D</TabsTrigger>
              </TabsList>
            </Tabs>
            <Badge variant="outline" className="gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <LiveDot color="bg-emerald-400" /> {rt.connected ? 'LIVE' : 'CONNECTING'}
            </Badge>
          </>
        }
      />

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {!mk ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} className="h-[104px]" />)
        ) : (
          <>
            <KpiCard label="Data Points Ingested" value="2.43M" icon={Database} accent="emerald" delta={8.2} hint={`${range} window`} />
            <KpiCard label="Avg Query Latency" value="38" unit="ms" icon={Timer} accent="sky" delta={-12.4} hint="p95: 92ms" />
            <KpiCard label="Active Tags" value="1,842" icon={Tag} accent="amber" delta={2.1} hint="across 14 projects" />
            <KpiCard label="Platform Uptime" value="99.96" unit="%" icon={ShieldCheck} accent="violet" hint="30-day SLA" />
          </>
        )}
      </div>

      {/* Production & OEE */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Factory className="h-4 w-4 text-violet-400" /> Production & OEE
              </CardTitle>
              <CardDescription className="text-xs">OEE · availability · performance · quality (%)</CardDescription>
            </div>
            <div className="hidden gap-3 text-[10px] sm:flex">
              <span className="flex items-center gap-1 text-muted-foreground"><span className="h-2 w-2 rounded-sm bg-violet-400" /> OEE</span>
              <span className="flex items-center gap-1 text-muted-foreground"><span className="h-2 w-2 rounded-sm bg-sky-400" /> Avail</span>
              <span className="flex items-center gap-1 text-muted-foreground"><span className="h-2 w-2 rounded-sm bg-amber-400" /> Perf</span>
              <span className="flex items-center gap-1 text-muted-foreground"><span className="h-2 w-2 rounded-sm bg-emerald-400" /> Qual</span>
            </div>
          </CardHeader>
          <CardContent>
            {machine ? (
              <MultiSeriesArea
                series={{
                  oee: machine.series.oee || [],
                  availability: machine.series.availability || [],
                  performance: machine.series.performance || [],
                  quality: machine.series.quality || [],
                }}
                unit="%"
                height={240}
                colors={['#a78bfa', '#38bdf8', '#fbbf24', '#34d399']}
              />
            ) : (
              <SkeletonBlock className="h-[240px]" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-emerald-400" /> Throughput by Hour
            </CardTitle>
            <CardDescription className="text-xs">Avg units/hour · last 24h</CardDescription>
          </CardHeader>
          <CardContent>
            {machine ? (
              <SimpleBar data={throughputHourly} height={200} color="#34d399" unit="u/h" />
            ) : (
              <SkeletonBlock className="h-[200px]" />
            )}
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md border border-border/60 bg-card/40 p-1.5">
                <p className="text-[10px] uppercase text-muted-foreground">Avg</p>
                <p className="text-xs font-semibold tnum">{mk?.throughputAvg ?? '—'}</p>
              </div>
              <div className="rounded-md border border-border/60 bg-card/40 p-1.5">
                <p className="text-[10px] uppercase text-muted-foreground">Downtime</p>
                <p className="text-xs font-semibold tnum">{mk?.downtimeMin ?? '—'}m</p>
              </div>
              <div className="rounded-md border border-border/60 bg-card/40 p-1.5">
                <p className="text-[10px] uppercase text-muted-foreground">OEE</p>
                <p className="text-xs font-semibold tnum text-violet-400">{mk?.oeeAvg ?? '—'}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quality & Defects */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Boxes className="h-4 w-4 text-emerald-400" /> Quality & Defects
              </CardTitle>
              <CardDescription className="text-xs">Units produced · defects · scrap (per 15-min interval)</CardDescription>
            </div>
            <div className="hidden gap-3 text-[10px] sm:flex">
              <span className="flex items-center gap-1 text-muted-foreground"><span className="h-2 w-2 rounded-sm bg-emerald-400" /> Units</span>
              <span className="flex items-center gap-1 text-muted-foreground"><span className="h-2 w-2 rounded-sm bg-amber-400" /> Defects</span>
              <span className="flex items-center gap-1 text-muted-foreground"><span className="h-2 w-2 rounded-sm bg-rose-400" /> Scrap</span>
            </div>
          </CardHeader>
          <CardContent>
            {production ? (
              <MultiSeriesArea
                series={{
                  units: production.series.units || [],
                  defects: production.series.defects || [],
                  scrap: production.series.scrap || [],
                }}
                unit=""
                height={220}
                colors={['#34d399', '#fbbf24', '#fb7185']}
              />
            ) : (
              <SkeletonBlock className="h-[220px]" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="h-4 w-4 text-emerald-400" /> Yield Breakdown
            </CardTitle>
            <CardDescription className="text-xs">Good · rework · scrap · {range}</CardDescription>
          </CardHeader>
          <CardContent>
            {pk ? (
              <Donut
                segments={[
                  { label: 'Good units', value: goodUnits, color: '#34d399' },
                  { label: 'Rework', value: reworkUnits, color: '#fbbf24' },
                  { label: 'Scrap', value: scrapUnits, color: '#fb7185' },
                ]}
              />
            ) : (
              <SkeletonBlock className="mx-auto h-[140px] w-[140px] rounded-full" />
            )}
            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2">
                <p className="text-[10px] uppercase text-amber-400">Defect rate</p>
                <p className="text-sm font-semibold tnum">{pk?.defectRate.toFixed(1) ?? '—'}%</p>
              </div>
              <div className="rounded-md border border-rose-500/20 bg-rose-500/5 p-2">
                <p className="text-[10px] uppercase text-rose-400">Scrap rate</p>
                <p className="text-sm font-semibold tnum">{pk?.scrapRate.toFixed(1) ?? '—'}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Distribution row: project / protocol / alarm */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Workflow className="h-4 w-4 text-sky-400" /> Project Distribution
            </CardTitle>
            <CardDescription className="text-xs">Active projects by category</CardDescription>
          </CardHeader>
          <CardContent>
            {overview ? (
              <SimpleBar data={projectDist} height={180} color="#38bdf8" />
            ) : (
              <SkeletonBlock className="h-[180px]" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Radio className="h-4 w-4 text-emerald-400" /> Protocol Mix
            </CardTitle>
            <CardDescription className="text-xs">Devices by industrial protocol</CardDescription>
          </CardHeader>
          <CardContent>
            {overview ? (
              <SimpleBar data={protocolMix} height={180} color="#34d399" />
            ) : (
              <SkeletonBlock className="h-[180px]" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-rose-400" /> Alarm Heat
            </CardTitle>
            <CardDescription className="text-xs">Active alarms by category</CardDescription>
          </CardHeader>
          <CardContent>
            {overview ? (
              alarmHeat.length > 0 ? (
                <SimpleBar data={alarmHeat} height={180} color="#fb7185" />
              ) : (
                <div className="flex h-[180px] flex-col items-center justify-center gap-2 text-center">
                  <ShieldCheck className="h-8 w-8 text-emerald-400" />
                  <p className="text-xs text-muted-foreground">No active alarms. System stable.</p>
                </div>
              )
            ) : (
              <SkeletonBlock className="h-[180px]" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top devices by activity table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Cpu className="h-4 w-4 text-amber-400" /> Top Devices by Activity
            </CardTitle>
            <CardDescription className="text-xs">Highest-volume telemetry sources · {range}</CardDescription>
          </div>
          <Badge variant="outline" className="text-[11px]">{topDevices.length} devices</Badge>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-border/60">
                <TableHead className="text-[11px] uppercase text-muted-foreground">Device</TableHead>
                <TableHead className="text-[11px] uppercase text-muted-foreground">Project</TableHead>
                <TableHead className="text-[11px] uppercase text-muted-foreground">Metric</TableHead>
                <TableHead className="text-right text-[11px] uppercase text-muted-foreground">Samples</TableHead>
                <TableHead className="text-right text-[11px] uppercase text-muted-foreground">Last Value</TableHead>
                <TableHead className="text-right text-[11px] uppercase text-muted-foreground">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topDevices.map((d) => (
                <TableRow key={d.name} className="border-border/40">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <CircuitBoard className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium">{d.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{d.project}</TableCell>
                  <TableCell>
                    <code className="rounded bg-muted/40 px-1.5 py-0.5 text-[10px] text-foreground/80">{d.metric}</code>
                  </TableCell>
                  <TableCell className="text-right font-medium tnum">{d.samples.toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <span className="font-medium tnum">{d.value}</span>
                    <span className="ml-1 text-[10px] text-muted-foreground">{d.unit}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant="outline"
                      className={cn(
                        'ring-1',
                        d.status === 'online' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
                        d.status === 'maintenance' && 'border-amber-500/30 bg-amber-500/10 text-amber-400',
                        d.status === 'offline' && 'border-rose-500/30 bg-rose-500/10 text-rose-400',
                      )}
                    >
                      <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-current" />
                      {d.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Footer insight strip */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="gap-0 p-4">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-400" />
            <p className="text-sm font-medium">Ingestion Rate</p>
          </div>
          <p className="mt-2 text-2xl font-bold tnum">2,840<span className="ml-1 text-xs font-normal text-muted-foreground">pts/sec</span></p>
          <p className="mt-1 text-[11px] text-muted-foreground">Peak 3,210 · 24h avg 2,840</p>
        </Card>
        <Card className="gap-0 p-4">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-sky-400" />
            <p className="text-sm font-medium">Stream Health</p>
          </div>
          <p className="mt-2 text-2xl font-bold tnum text-emerald-400">Healthy</p>
          <p className="mt-1 text-[11px] text-muted-foreground">0 backpressure events · 0 drops</p>
        </Card>
        <Card className="gap-0 p-4">
          <div className="flex items-center gap-2">
            <Timer className="h-4 w-4 text-violet-400" />
            <p className="text-sm font-medium">Storage</p>
          </div>
          <p className="mt-2 text-2xl font-bold tnum">142<span className="ml-1 text-xs font-normal text-muted-foreground">GB / 500GB</span></p>
          <p className="mt-1 text-[11px] text-muted-foreground">28-day retention · TimescaleDB</p>
        </Card>
      </div>
    </div>
  )
}
