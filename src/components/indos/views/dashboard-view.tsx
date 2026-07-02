'use client'
import { useEffect, useState } from 'react'
import { useRealtime } from '@/lib/indos/realtime'
import { useIndOS } from '@/lib/indos/store'
import { KpiCard } from '@/components/indos/shared/kpi-card'
import { ViewHeader } from '@/components/indos/shared/view-header'
import { MultiSeriesArea, SimpleBar, LiveDot } from '@/components/indos/shared/charts'
import { StatusBadge, SeverityBadge } from '@/components/indos/shared/status-badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Activity, Cpu, FolderKanban, AlertTriangle, Wrench, Camera, Radio, Zap,
  Gauge, TrendingUp, Server, Wifi, ShieldCheck, CircuitBoard, Boxes, ArrowRight, Bot,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Overview {
  counts: Record<string, number>
  avgOee: number
  availability: number
  performance: number
  quality: number
  projectByCat: Record<string, number>
  protocolDist: Record<string, number>
  alarmByCat: Record<string, number>
  gatewayUptime: number
}

export function DashboardView() {
  const rt = useRealtime()
  const { setView } = useIndOS()
  const [ov, setOv] = useState<Overview | null>(null)
  const [series, setSeries] = useState<any>(null)
  const [range, setRange] = useState<'1h' | '6h' | '24h'>('6h')

  useEffect(() => {
    fetch('/api/indos/overview').then(r => r.json()).then(setOv).catch(() => {})
  }, [])

  useEffect(() => {
    fetch(`/api/indos/series?kind=energy`).then(r => r.json()).then(setSeries).catch(() => {})
  }, [range])

  const sys = rt.system
  const telemetryValues = Object.values(rt.telemetry).slice(0, 8)

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <ViewHeader
        title="Executive Dashboard"
        description="Real-time view across all projects, devices and sites on the IndOS platform."
        icon={<Gauge className="h-5 w-5" />}
        actions={
          <>
            <Tabs value={range} onValueChange={(v) => setRange(v as any)}>
              <TabsList className="h-8">
                <TabsTrigger value="1h" className="text-xs">1H</TabsTrigger>
                <TabsTrigger value="6h" className="text-xs">6H</TabsTrigger>
                <TabsTrigger value="24h" className="text-xs">24H</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setView('ai')}>
              <Bot className="h-3.5 w-3.5" /> Ask IndOS AI
            </Button>
          </>
        }
      />

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
        <KpiCard label="Active Projects" value={ov?.counts.projects ?? '—'} icon={FolderKanban} accent="emerald" hint={`${ov?.counts.devices ?? 0} devices registered`} />
        <KpiCard label="Devices Online" value={ov ? `${ov.counts.onlineDevices}/${ov.counts.devices}` : '—'} icon={Cpu} accent="sky" delta={2.4} hint="across 8 sites" />
        <KpiCard label="Active Alarms" value={ov?.counts.activeAlarms ?? '—'} icon={AlertTriangle} accent="rose" hint={`${ov?.counts.ackAlarms ?? 0} acknowledged`} />
        <KpiCard label="Open Work Orders" value={ov?.counts.openWorkOrders ?? '—'} icon={Wrench} accent="amber" hint={`${ov?.counts.workOrders ?? 0} total`} />
        <KpiCard label="Avg OEE" value={ov?.avgOee ?? '—'} unit="%" icon={Gauge} accent="violet" delta={1.8} className="col-span-2 lg:col-span-1" />
      </div>

      {/* Main grid: live telemetry chart + system health */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Realtime power */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Zap className="h-4 w-4 text-amber-400" /> Realtime Power & Energy
                <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                  <LiveDot color="bg-emerald-400" /> LIVE
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs">Aggregated consumption, generation & grid draw · {range}</CardDescription>
            </div>
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setView('energy')}>
              Energy view <ArrowRight className="h-3 w-3" />
            </Button>
          </CardHeader>
          <CardContent>
            {series ? (
              <>
                <div className="mb-3 grid grid-cols-3 gap-3">
                  <MiniMetric label="Consumption" value={`${series.kpis.totalKwh.toLocaleString()}`} unit="kWh" color="text-amber-400" />
                  <MiniMetric label="Peak Demand" value={`${series.kpis.peakKw}`} unit="kW" color="text-rose-400" />
                  <MiniMetric label="Power Factor" value={`${series.kpis.powerFactor}`} unit="" color="text-emerald-400" />
                </div>
                <MultiSeriesArea series={series.series} unit="kW" height={200} />
              </>
            ) : (
              <div className="h-[240px] animate-pulse rounded-md bg-muted/30" />
            )}
          </CardContent>
        </Card>

        {/* System health */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Server className="h-4 w-4 text-sky-400" /> Platform Health</CardTitle>
            <CardDescription className="text-xs">Self-hosted stack · ICT</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <HealthRow icon={Cpu} label="Platform CPU" value={sys?.cpuPct ?? 0} unit="%" color="bg-sky-500" />
            <HealthRow icon={Boxes} label="Memory" value={sys?.memPct ?? 0} unit="%" color="bg-violet-500" />
            <HealthRow icon={Server} label="Disk" value={sys?.diskPct ?? 61} unit="%" color="bg-amber-500" />
            <HealthRow icon={Wifi} label="MQTT Throughput" value={Math.min(100, (sys?.mqttThroughput ?? 0) / 18)} unit={`${sys?.mqttThroughput ?? 0}/s`} color="bg-emerald-500" raw />
            <HealthRow icon={Activity} label="API Latency" value={Math.min(100, (sys?.apiLatencyMs ?? 0) * 1.5)} unit={`${sys?.apiLatencyMs ?? 0}ms`} color="bg-rose-500" raw />
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="rounded-md border border-border bg-card/50 p-2">
                <p className="text-[10px] uppercase text-muted-foreground">Connections</p>
                <p className="text-sm font-semibold tnum">{sys?.activeConnections ?? '—'}</p>
              </div>
              <div className="rounded-md border border-border bg-card/50 p-2">
                <p className="text-[10px] uppercase text-muted-foreground">DB Pool</p>
                <p className="text-sm font-semibold tnum">{sys?.dbPoolPct ?? '—'}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Live telemetry stream + active alarms */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-emerald-400" /> Live Telemetry Stream
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400"><LiveDot color="bg-emerald-400" /> {Object.keys(rt.telemetry).length}</Badge>
            </CardTitle>
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setView('devices')}>All devices <ArrowRight className="h-3 w-3" /></Button>
          </CardHeader>
          <CardContent>
            <ScrollArea className="indos-scroll h-[260px] pr-2">
              <div className="grid gap-2 sm:grid-cols-2">
                {telemetryValues.length === 0 ? (
                  <div className="col-span-2 py-10 text-center text-xs text-muted-foreground">Connecting to MQTT broker…</div>
                ) : (
                  telemetryValues.map((t) => <TelemetryRow key={t.deviceId} t={t} />)
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4 text-rose-400" /> Active Alarms</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setView('alarms')}>View all</Button>
          </CardHeader>
          <CardContent>
            <ScrollArea className="indos-scroll h-[260px] pr-2">
              <div className="space-y-2">
                {rt.recentAlarms.filter(a => a.state === 'active').slice(0, 8).map((a) => (
                  <div key={a.id} className="rounded-md border border-border/60 bg-card/40 p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <SeverityBadge severity={a.severity} />
                      <span className="text-[10px] text-muted-foreground">{new Date(a.ts).toLocaleTimeString('en-GB', { hour12: false })}</span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-xs">{a.message}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">{a.category} · {a.project}</p>
                  </div>
                ))}
                {rt.recentAlarms.filter(a => a.state === 'active').length === 0 && (
                  <div className="py-10 text-center text-xs text-muted-foreground">No active alarms. System stable.</div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Bottom row: OEE breakdown + protocol mix + fleet status */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Gauge className="h-4 w-4 text-violet-400" /> OEE Breakdown</CardTitle>
            <CardDescription className="text-xs">Overall Equipment Effectiveness</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-1">
            <OeeBar label="Availability" value={ov?.availability ?? 0} color="bg-sky-500" />
            <OeeBar label="Performance" value={ov?.performance ?? 0} color="bg-amber-500" />
            <OeeBar label="Quality" value={ov?.quality ?? 0} color="bg-emerald-500" />
            <div className="mt-2 flex items-center justify-between rounded-md bg-primary/10 p-3 ring-1 ring-primary/20">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Composite OEE</p>
                <p className="text-2xl font-bold tnum text-primary">{ov?.avgOee ?? '—'}%</p>
              </div>
              <TrendingUp className="h-6 w-6 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Radio className="h-4 w-4 text-sky-400" /> Protocol Distribution</CardTitle>
            <CardDescription className="text-xs">Devices by industrial protocol</CardDescription>
          </CardHeader>
          <CardContent>
            {ov ? (
              <SimpleBar
                data={Object.entries(ov.protocolDist).map(([k, v]) => ({ label: k.replace('-', '\n'), v }))}
                height={200}
                color="#38bdf8"
              />
            ) : <div className="h-[200px] animate-pulse rounded-md bg-muted/30" />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Boxes className="h-4 w-4 text-emerald-400" /> Fleet Status</CardTitle>
            <CardDescription className="text-xs">Edge & site infrastructure</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            <FleetStat icon={Radio} label="Gateways" value={ov ? `${ov.counts.onlineGateways}/${ov.counts.gateways}` : '—'} sub={`${ov?.gatewayUptime ?? 0}% uptime`} accent="text-sky-400" />
            <FleetStat icon={Camera} label="Cameras" value={ov ? `${ov.counts.onlineCameras}/${ov.counts.cameras}` : '—'} sub="AI + motion" accent="text-violet-400" />
            <FleetStat icon={CircuitBoard} label="Machines" value={ov ? `${ov.counts.runningMachines}/${ov.counts.machines}` : '—'} sub="running" accent="text-emerald-400" />
            <FleetStat icon={ShieldCheck} label="Plugins" value={ov ? `${ov.counts.enabledPlugins}/${ov.counts.plugins}` : '—'} sub="enabled" accent="text-amber-400" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function MiniMetric({ label, value, unit, color }: { label: string; value: string; unit: string; color: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-card/40 p-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('text-lg font-semibold tnum', color)}>{value} <span className="text-xs text-muted-foreground">{unit}</span></p>
    </div>
  )
}

function HealthRow({ icon: Icon, label, value, unit, color, raw }: { icon: any; label: string; value: number; unit: string; color: string; raw?: boolean }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground"><Icon className="h-3 w-3" /> {label}</span>
        <span className="font-medium tnum">{raw ? unit : `${value.toFixed(0)}${unit}`}</span>
      </div>
      {!raw && <Progress value={value} className="h-1.5 bg-muted/40" indicatorClassName={color} />}
    </div>
  )
}

function TelemetryRow({ t }: { t: any }) {
  const colorMap: Record<string, string> = {
    temperature: 'text-rose-400', power: 'text-amber-400', voltage: 'text-sky-400',
    humidity: 'text-emerald-400', pressure: 'text-violet-400', flow: 'text-sky-400',
    solar_yield: 'text-amber-400', co2: 'text-emerald-400', rpm: 'text-violet-400',
  }
  return (
    <div className="flex items-center justify-between rounded-md border border-border/50 bg-card/40 p-2.5">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium">{t.name}</p>
        <p className="text-[10px] text-muted-foreground">{t.project} · {t.metric}</p>
      </div>
      <div className="text-right">
        <p className={cn('text-sm font-semibold tnum', colorMap[t.metric] || 'text-foreground')}>
          {t.value.toFixed(1)} <span className="text-[10px] text-muted-foreground">{t.unit}</span>
        </p>
        <p className="text-[10px] text-muted-foreground">{new Date(t.ts).toLocaleTimeString('en-GB', { hour12: false })}</p>
      </div>
    </div>
  )
}

function OeeBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tnum">{value.toFixed(1)}%</span>
      </div>
      <Progress value={value} className="h-1.5 bg-muted/40" indicatorClassName={color} />
    </div>
  )
}

function FleetStat({ icon: Icon, label, value, sub, accent }: { icon: any; label: string; value: string; sub: string; accent: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-card/40 p-2.5">
      <div className="flex items-center justify-between">
        <Icon className={cn('h-4 w-4', accent)} />
        <span className="text-[10px] text-muted-foreground">{label}</span>
      </div>
      <p className="mt-1 text-lg font-semibold tnum">{value}</p>
      <p className="text-[10px] text-muted-foreground">{sub}</p>
    </div>
  )
}
