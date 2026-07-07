'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useIndOS } from '@/lib/indos/store'
import { useRealtime } from '@/lib/indos/realtime'
import { KpiCard } from '@/components/indos/shared/kpi-card'
import { ViewHeader } from '@/components/indos/shared/view-header'
import { StatusBadge } from '@/components/indos/shared/status-badge'
import { LiveDot, Sparkline } from '@/components/indos/shared/charts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { toast } from 'sonner'
import {
  Cpu, Search, Wifi, Battery, Thermometer, MemoryStick, Radio,
  RefreshCw, ArrowUpFromLine, Activity, MapPin, Server, HardDrive, Signal,
  Download, Clock, ChevronDown, ChevronUp, Loader2, AlertTriangle, RotateCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toCSV, downloadCSV, csvTimestamp } from '@/lib/csv'

interface Device {
  id: string
  name: string
  mac: string
  serial: string | null
  type: string
  protocol: string
  firmware: string | null
  ip: string | null
  status: string
  cpu: number
  memory: number
  temperature: number
  signal: number
  battery: number | null
  lastSeen: string
  project?: { name: string; slug: string } | null
  machine?: { name: string } | null
}

interface ProjectLite { slug: string; name: string }

// Telemetry point shape returned by GET /api/indos/telemetry/[deviceId].
// Influx path: { ts, value, metric, unit }. SQLite path: { id, deviceId, metric, value, ts }.
interface TelemetryPoint {
  ts: string
  value: number
  metric: string
  unit?: string | null
}

const DEVICE_TYPES = ['sensor', 'meter', 'gateway', 'plc', 'relay', 'camera', 'inverter', 'controller']
const STATUSES = ['online', 'offline', 'fault', 'maintenance']

// A device is "stale" if it claims to be online but hasn't reported in 10+ min.
// Threshold chosen to catch silent network drops without false-positiving on
// long-interval pollers (most IndOS devices report ≤ 5 min intervals).
const STALE_THRESHOLD_MS = 10 * 60 * 1000

function isStale(d: Device): boolean {
  if (d.status !== 'online') return false
  try {
    return Date.now() - new Date(d.lastSeen).getTime() > STALE_THRESHOLD_MS
  } catch {
    return false
  }
}

const TYPE_CLS: Record<string, string> = {
  sensor: 'bg-sky-500/15 text-sky-400 ring-sky-500/30',
  meter: 'bg-amber-500/15 text-amber-400 ring-amber-500/30',
  gateway: 'bg-violet-500/15 text-violet-400 ring-violet-500/30',
  plc: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30',
  relay: 'bg-rose-500/15 text-rose-400 ring-rose-500/30',
  camera: 'bg-violet-500/15 text-violet-400 ring-violet-500/30',
  inverter: 'bg-amber-500/15 text-amber-400 ring-amber-500/30',
  controller: 'bg-sky-500/15 text-sky-400 ring-sky-500/30',
}

const PROTO_CLS: Record<string, string> = {
  mqtt: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30',
  'modbus-rtu': 'bg-amber-500/15 text-amber-400 ring-amber-500/30',
  'modbus-tcp': 'bg-amber-500/15 text-amber-400 ring-amber-500/30',
  'opc-ua': 'bg-sky-500/15 text-sky-400 ring-sky-500/30',
  bacnet: 'bg-violet-500/15 text-violet-400 ring-violet-500/30',
  'ethernet-ip': 'bg-sky-500/15 text-sky-400 ring-sky-500/30',
  can: 'bg-rose-500/15 text-rose-400 ring-rose-500/30',
  lorawan: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30',
  http: 'bg-slate-500/15 text-slate-400 ring-slate-500/30',
  ble: 'bg-sky-500/15 text-sky-400 ring-sky-500/30',
  zigbee: 'bg-violet-500/15 text-violet-400 ring-violet-500/30',
}

// Sparkline palette — one color per metric, max 6 metrics shown.
const SPARK_COLORS = ['#34d399', '#fbbf24', '#38bdf8', '#f472b6', '#a78bfa', '#fb7185']

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function StaleBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'bg-amber-500/10 text-amber-400 ring-amber-500/30',
        'inline-flex items-center gap-1 px-1.5 py-0 text-[10px] font-medium uppercase',
        className,
      )}
      title="Device claims online but has not reported in over 10 minutes — investigate."
    >
      <Clock className="h-2.5 w-2.5" /> stale
    </Badge>
  )
}

export function DevicesView() {
  const { setView, setPrefillDevice } = useIndOS()
  const { activeProject } = useIndOS()
  const rt = useRealtime()
  const [devices, setDevices] = useState<Device[] | null>(null)
  const [projects, setProjects] = useState<ProjectLite[]>([])
  const [loading, setLoading] = useState(true)
  const [project, setProject] = useState<string>(activeProject || 'all')
  const [type, setType] = useState<string>('all')
  const [status, setStatus] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Device | null>(null)
  const [telemetryOpen, setTelemetryOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const r = await fetch('/api/indos/projects')
        const d = (await r.json()) as any[]
        if (!cancelled) setProjects(d.map(p => ({ slug: p.slug, name: p.name })))
      } catch {
        if (!cancelled) setProjects([])
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Fetch devices whenever filters change.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (project && project !== 'all') params.set('project', project)
        if (type && type !== 'all') params.set('type', type)
        if (status && status !== 'all') params.set('status', status)
        const r = await fetch(`/api/indos/devices?${params.toString()}`)
        const d = (await r.json()) as Device[]
        if (!cancelled) setDevices(d)
      } catch {
        if (!cancelled) setDevices([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [project, type, status])

  const refresh = () => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (project && project !== 'all') params.set('project', project)
        if (type && type !== 'all') params.set('type', type)
        if (status && status !== 'all') params.set('status', status)
        const r = await fetch(`/api/indos/devices?${params.toString()}`)
        const d = (await r.json()) as Device[]
        if (!cancelled) setDevices(d)
      } catch {
        if (!cancelled) setDevices([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    toast.success('Device list refreshed')
  }

  const stats = useMemo(() => {
    if (!devices) return { total: 0, online: 0, offline: 0, fault: 0, avgSignal: 0 }
    const online = devices.filter(d => d.status === 'online').length
    const offline = devices.filter(d => d.status === 'offline').length
    const fault = devices.filter(d => d.status === 'fault').length
    const avgSignal = devices.length ? devices.reduce((s, d) => s + (d.signal || 0), 0) / devices.length : 0
    return { total: devices.length, online, offline, fault, avgSignal }
  }, [devices])

  // Live vital lookup by device id and name
  const liveVitalFor = useCallback((d: Device) => {
    if (rt.vitals[d.id]) return rt.vitals[d.id]
    const byName = Object.values(rt.vitals).find(v => v.name && d.name.toLowerCase().includes(v.name.toLowerCase()))
    return byName || null
  }, [rt.vitals])

  const filtered = useMemo(() => {
    if (!devices) return []
    if (!query) return devices
    const q = query.toLowerCase()
    return devices.filter(d => d.name.toLowerCase().includes(q) || d.mac.toLowerCase().includes(q) || (d.ip || '').toLowerCase().includes(q))
  }, [devices, query])

  // CSV export — exports the CURRENT filtered list (respects search + filter bar).
  function exportCSV() {
    if (!filtered.length) {
      toast.info('No devices to export', { description: 'Adjust your filters and try again.' })
      return
    }
    const headers = [
      'Name', 'MAC', 'Serial', 'Type', 'Protocol', 'Project', 'Machine',
      'Status', 'Stale', 'Firmware', 'IP', 'CPU%', 'Memory%', 'Temperature',
      'Signal', 'Battery%', 'LastSeen(ISO)', 'LastSeen(Local)',
    ]
    const rows = filtered.map(d => [
      d.name,
      d.mac,
      d.serial || '',
      d.type,
      d.protocol,
      d.project?.name || '',
      d.machine?.name || '',
      d.status,
      isStale(d) ? 'yes' : 'no',
      d.firmware || '',
      d.ip || '',
      d.cpu.toFixed(1),
      d.memory.toFixed(1),
      d.temperature.toFixed(1),
      d.signal.toFixed(0),
      d.battery != null ? d.battery.toFixed(0) : '',
      new Date(d.lastSeen).toISOString(),
      new Date(d.lastSeen).toLocaleString(),
    ])
    const csv = toCSV(headers, rows)
    downloadCSV(`indos-devices-${csvTimestamp()}.csv`, csv)
    toast.success(`Exported ${filtered.length} device${filtered.length === 1 ? '' : 's'} to CSV`, {
      description: `indos-devices-${csvTimestamp()}.csv`,
    })
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <ViewHeader
        title="Devices"
        description="Edge devices, sensors, PLCs and controllers registered across the platform. Live vitals overlay when available."
        icon={<Cpu className="h-5 w-5" />}
        actions={
          <>
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={exportCSV} disabled={loading || !filtered.length}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={refresh}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          </>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
        <KpiCard label="Total Devices" value={loading ? '—' : stats.total} icon={Cpu} accent="emerald" hint="registered fleet" />
        <KpiCard label="Online" value={loading ? '—' : stats.online} icon={Activity} accent="emerald" hint={`${stats.total ? ((stats.online / stats.total) * 100).toFixed(0) : 0}% available`} />
        <KpiCard label="Offline" value={loading ? '—' : stats.offline} icon={Server} accent="slate" hint="awaiting heartbeat" />
        <KpiCard label="Fault" value={loading ? '—' : stats.fault} icon={Radio} accent="rose" hint="requires attention" />
        <KpiCard label="Avg Signal" value={loading ? '—' : stats.avgSignal.toFixed(0)} unit="dBm" icon={Signal} accent="sky" className="col-span-2 lg:col-span-1" />
      </div>

      {/* Filter bar */}
      <Card className="p-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, MAC or IP…"
              className="h-9 pl-8"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex">
            <Select value={project} onValueChange={setProject}>
              <SelectTrigger className="h-9 w-full lg:w-[180px]">
                <SelectValue placeholder="Project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All projects</SelectItem>
                {projects.map(p => <SelectItem key={p.slug} value={p.slug}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-9 w-full lg:w-[140px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {DEVICE_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9 w-full lg:w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Devices table */}
      <Card className="gap-0 p-0">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border/50 px-4 py-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Cpu className="h-4 w-4 text-sky-400" /> Device Registry
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                <LiveDot color="bg-emerald-400" /> {Object.keys(rt.vitals).length} live
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs">{loading ? 'Loading…' : `${filtered.length} of ${devices?.length ?? 0} devices shown`}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <Cpu className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No devices match your filters.</p>
            </div>
          ) : (
            <ScrollArea className="indos-scroll max-h-[560px]">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead className="pl-4 text-xs uppercase text-muted-foreground">Device</TableHead>
                    <TableHead className="text-xs uppercase text-muted-foreground">Type / Protocol</TableHead>
                    <TableHead className="text-xs uppercase text-muted-foreground">Project</TableHead>
                    <TableHead className="text-xs uppercase text-muted-foreground">Status</TableHead>
                    <TableHead className="text-xs uppercase text-muted-foreground">Vitals</TableHead>
                    <TableHead className="text-xs uppercase text-muted-foreground">Firmware</TableHead>
                    <TableHead className="pr-4 text-xs uppercase text-muted-foreground">Last Seen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(d => {
                    const live = liveVitalFor(d)
                    const stale = isStale(d)
                    return (
                      <TableRow
                        key={d.id}
                        className="cursor-pointer border-border/40"
                        onClick={() => { setSelected(d); setTelemetryOpen(false) }}
                      >
                        <TableCell className="pl-4">
                          <div className="flex items-center gap-2">
                            <div className={cn('flex h-7 w-7 items-center justify-center rounded-md ring-1', TYPE_CLS[d.type] || TYPE_CLS.sensor)}>
                              <Cpu className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium">{d.name}</p>
                              <p className="text-[10px] text-muted-foreground">{d.mac}{d.ip ? ` · ${d.ip}` : ''}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <Badge variant="outline" className={cn('ring-1 capitalize', TYPE_CLS[d.type] || TYPE_CLS.sensor)}>{d.type}</Badge>
                            <Badge variant="outline" className={cn('ring-1 uppercase', PROTO_CLS[d.protocol] || PROTO_CLS.http)}>{d.protocol}</Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          <p className="truncate">{d.project?.name || 'Unassigned'}</p>
                          {d.machine?.name && <p className="text-[10px] text-muted-foreground">{d.machine.name}</p>}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <StatusBadge status={d.status} />
                            {stale && <StaleBadge />}
                            {live && d.status === 'online' && !stale && <LiveDot color="bg-emerald-400" />}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="grid w-[140px] grid-cols-2 gap-x-2 gap-y-1">
                            <VitalMini icon={Cpu} label="CPU" value={live?.cpu ?? d.cpu} unit="%" />
                            <VitalMini icon={MemoryStick} label="Mem" value={live?.memory ?? d.memory} unit="%" />
                            <VitalMini icon={Thermometer} label="Temp" value={live?.temperature ?? d.temperature} unit="°" />
                            <VitalMini icon={Signal} label="Sig" value={live?.signal ?? d.signal} unit="" raw />
                          </div>
                        </TableCell>
                        <TableCell className="text-[11px] text-muted-foreground">{d.firmware || '—'}</TableCell>
                        <TableCell className="pr-4 text-[11px] text-muted-foreground">
                          <span className={cn(stale && 'font-medium text-amber-400')}>{relTime(d.lastSeen)}</span>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="sm:max-w-3xl">
          {selected && (() => {
            const live = liveVitalFor(selected)
            const stale = isStale(selected)
            return (
              <>
                <DialogHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <DialogTitle className="flex items-center gap-2 text-xl">
                        <div className={cn('flex h-8 w-8 items-center justify-center rounded-md ring-1', TYPE_CLS[selected.type] || TYPE_CLS.sensor)}>
                          <Cpu className="h-4 w-4" />
                        </div>
                        {selected.name}
                      </DialogTitle>
                      <DialogDescription className="mt-1.5">
                        {selected.project?.name || 'Unassigned'}{selected.machine?.name ? ` · ${selected.machine.name}` : ''}
                      </DialogDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {live && selected.status === 'online' && !stale && (
                        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                          <LiveDot color="bg-emerald-400" /> LIVE
                        </Badge>
                      )}
                      <StatusBadge status={selected.status} />
                      {stale && <StaleBadge />}
                    </div>
                  </div>
                </DialogHeader>
                <div className="space-y-4">
                  {/* Vitals grid */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <VitalCard icon={Cpu} label="CPU" value={live?.cpu ?? selected.cpu} unit="%" color="bg-sky-500" />
                    <VitalCard icon={MemoryStick} label="Memory" value={live?.memory ?? selected.memory} unit="%" color="bg-violet-500" />
                    <VitalCard icon={Thermometer} label="Temperature" value={live?.temperature ?? selected.temperature} unit="°C" color="bg-rose-500" />
                    <VitalCard icon={Signal} label="Signal" value={live?.signal ?? selected.signal} unit="dBm" color="bg-emerald-500" />
                  </div>
                  {selected.battery != null && (
                    <div className="flex items-center gap-3 rounded-md border border-border/60 bg-card/40 p-3">
                      <Battery className="h-4 w-4 text-amber-400" />
                      <span className="text-xs text-muted-foreground">Battery</span>
                      <Progress value={selected.battery} className="h-2 flex-1" indicatorClassName="bg-amber-500" />
                      <span className="text-xs font-semibold tnum">{selected.battery.toFixed(0)}%</span>
                    </div>
                  )}
                  {/* Metadata */}
                  <div className="grid grid-cols-2 gap-3 rounded-md border border-border/60 bg-card/40 p-3 text-xs sm:grid-cols-3">
                    <Meta label="MAC Address" value={selected.mac} mono />
                    <Meta label="Serial" value={selected.serial || '—'} mono />
                    <Meta label="IP Address" value={selected.ip || '—'} mono />
                    <Meta label="Type" value={selected.type} />
                    <Meta label="Protocol" value={selected.protocol} />
                    <Meta label="Firmware" value={selected.firmware || '—'} mono />
                  </div>

                  {/* Telemetry history section — fetches on first expand */}
                  <TelemetrySection
                    deviceId={selected.id}
                    deviceName={selected.name}
                    open={telemetryOpen}
                    onToggle={() => setTelemetryOpen(o => !o)}
                  />
                </div>
                <DialogFooter className="gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSelected(null)}>Close</Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setTelemetryOpen(o => !o)}
                  >
                    <Activity className="h-3.5 w-3.5" />
                    {telemetryOpen ? 'Hide telemetry' : 'View telemetry'}
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      // Hand off to OTA view — it reads prefillDeviceId on mount
                      // and pre-selects this device in the deploy form.
                      setPrefillDevice(selected.id, selected.name)
                      setSelected(null)
                      setView('ota')
                      toast.info('Opened OTA deployment', {
                        description: `Pre-selected ${selected.name} — choose a firmware to deploy.`,
                      })
                    }}
                  >
                    <ArrowUpFromLine className="h-3.5 w-3.5" /> Send OTA
                  </Button>
                </DialogFooter>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Telemetry section (real fetch + chart) ──────────────────────────────────
function TelemetrySection({
  deviceId, deviceName, open, onToggle,
}: {
  deviceId: string
  deviceName: string
  open: boolean
  onToggle: () => void
}) {
  const [points, setPoints] = useState<TelemetryPoint[] | null>(null)
  const [loadingT, setLoadingT] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetchedFor, setFetchedFor] = useState<string | null>(null)

  const fetchTelemetry = useCallback(() => {
    setLoadingT(true)
    setError(null)
    fetch(`/api/indos/telemetry/${encodeURIComponent(deviceId)}?range=24h`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<TelemetryPoint[]>
      })
      .then(data => {
        if (!Array.isArray(data)) {
          setPoints([])
        } else {
          // Sort chronologically (some backends return desc — normalize).
          setPoints([...data].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()))
        }
        setFetchedFor(deviceId)
        setLoadingT(false)
      })
      .catch(err => {
        setError(err?.message || 'Failed to load telemetry')
        setLoadingT(false)
      })
  }, [deviceId])

  // Fetch on first open (and when device changes while open).
  useEffect(() => {
    if (!open) return
    if (fetchedFor === deviceId && points !== null) return
    fetchTelemetry()
  }, [open, deviceId, fetchedFor, points, fetchTelemetry])

  if (!open) return null

  return (
    <div className="rounded-md border border-border/60 bg-card/40">
      <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-sky-400" />
          <span className="text-xs font-medium">Telemetry history · 24h</span>
          <Badge variant="outline" className="bg-muted/40 text-[10px] text-muted-foreground">
            {deviceName}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-[11px]"
            onClick={fetchTelemetry}
            disabled={loadingT}
            title="Re-fetch telemetry from server"
          >
            {loadingT
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <RotateCw className="h-3 w-3" />} Refresh
          </Button>
          <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[11px]" onClick={onToggle}>
            Collapse <ChevronUp className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <div className="p-3">
        {loadingT ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading telemetry…
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
            <AlertTriangle className="h-5 w-5 text-rose-400" />
            <p className="text-xs text-muted-foreground">Failed to load telemetry — {error}</p>
            <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={fetchTelemetry}>
              <RotateCw className="h-3 w-3" /> Retry
            </Button>
          </div>
        ) : !points || points.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
            <Activity className="h-5 w-5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">No telemetry history for this device in the last 24h.</p>
          </div>
        ) : (
          <TelemetryMetrics points={points} />
        )}
      </div>
    </div>
  )
}

function TelemetryMetrics({ points }: { points: TelemetryPoint[] }) {
  // Group points by metric, then take the top 6 metrics by point count.
  const metrics = useMemo(() => {
    const byMetric = new Map<string, TelemetryPoint[]>()
    for (const p of points) {
      const arr = byMetric.get(p.metric) || []
      arr.push(p)
      byMetric.set(p.metric, arr)
    }
    const entries = Array.from(byMetric.entries())
      .map(([metric, pts]) => {
        const values = pts.map(p => p.value).filter(v => Number.isFinite(v))
        const latest = values.length ? values[values.length - 1] : NaN
        const min = values.length ? Math.min(...values) : NaN
        const max = values.length ? Math.max(...values) : NaN
        const unit = pts.find(p => p.unit)?.unit || ''
        return { metric, pts, values, latest, min, max, unit }
      })
      .sort((a, b) => b.pts.length - a.pts.length)
      .slice(0, 6)
    return entries
  }, [points])

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {metrics.map((m, i) => {
        const color = SPARK_COLORS[i % SPARK_COLORS.length]
        const rangeText = Number.isFinite(m.min) && Number.isFinite(m.max)
          ? `${m.min.toFixed(1)} – ${m.max.toFixed(1)}`
          : '—'
        return (
          <div key={m.metric} className="rounded-md border border-border/50 bg-background/40 p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium capitalize text-foreground">{m.metric}</span>
              <span className="text-[10px] text-muted-foreground">
                {m.pts.length} pts · {rangeText} {m.unit}
              </span>
            </div>
            <div className="mt-1 flex items-end justify-between gap-2">
              <div>
                <p className="text-lg font-bold tnum">
                  {Number.isFinite(m.latest) ? m.latest.toFixed(1) : '—'}
                  <span className="ml-1 text-[10px] font-normal text-muted-foreground">{m.unit}</span>
                </p>
                <p className="text-[10px] text-muted-foreground">latest value</p>
              </div>
              <div className="h-9 w-28">
                <Sparkline data={m.values.length ? m.values : [0, 0]} color={color} height={36} />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function VitalMini({ icon: Icon, label, value, unit, raw }: { icon: any; label: string; value: number; unit: string; raw?: boolean }) {
  const pct = raw ? Math.max(0, Math.min(100, (value + 120) / 1.2)) : Math.max(0, Math.min(100, value))
  const colorCls = pct > 80 ? 'bg-rose-500' : pct > 60 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="flex items-center gap-0.5"><Icon className="h-2.5 w-2.5" />{label}</span>
        <span className="font-medium tnum">{value.toFixed(0)}{unit}</span>
      </div>
      <Progress value={pct} className="h-1 bg-muted/40" indicatorClassName={colorCls} />
    </div>
  )
}

function VitalCard({ icon: Icon, label, value, unit, color }: { icon: any; label: string; value: number; unit: string; color: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-card/40 p-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground"><Icon className="h-3 w-3" />{label}</span>
      </div>
      <p className="mt-1 text-xl font-bold tnum">{value.toFixed(0)}<span className="text-xs text-muted-foreground"> {unit}</span></p>
      <Progress value={Math.min(100, value)} className="mt-1.5 h-1 bg-muted/40" indicatorClassName={color} />
    </div>
  )
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 font-medium capitalize', mono && 'font-mono text-[11px] normal-case')}>{value}</p>
    </div>
  )
}
