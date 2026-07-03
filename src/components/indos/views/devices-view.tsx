'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useIndOS } from '@/lib/indos/store'
import { useRealtime } from '@/lib/indos/realtime'
import { KpiCard } from '@/components/indos/shared/kpi-card'
import { ViewHeader } from '@/components/indos/shared/view-header'
import { StatusBadge } from '@/components/indos/shared/status-badge'
import { LiveDot } from '@/components/indos/shared/charts'
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
} from 'lucide-react'
import { cn } from '@/lib/utils'

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

const DEVICE_TYPES = ['sensor', 'meter', 'gateway', 'plc', 'relay', 'camera', 'inverter', 'controller']
const STATUSES = ['online', 'offline', 'fault', 'maintenance']

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

export function DevicesView() {
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

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <ViewHeader
        title="Devices"
        description="Edge devices, sensors, PLCs and controllers registered across the platform. Live vitals overlay when available."
        icon={<Cpu className="h-5 w-5" />}
        actions={
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={refresh}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
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
                    return (
                      <TableRow
                        key={d.id}
                        className="cursor-pointer border-border/40"
                        onClick={() => setSelected(d)}
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
                            {live && d.status === 'online' && <LiveDot color="bg-emerald-400" />}
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
                        <TableCell className="pr-4 text-[11px] text-muted-foreground">{relTime(d.lastSeen)}</TableCell>
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
        <DialogContent className="sm:max-w-2xl">
          {selected && (() => {
            const live = liveVitalFor(selected)
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
                      {live && selected.status === 'online' && (
                        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                          <LiveDot color="bg-emerald-400" /> LIVE
                        </Badge>
                      )}
                      <StatusBadge status={selected.status} />
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
                </div>
                <DialogFooter className="gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSelected(null)}>Close</Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => toast.info('Telemetry stream opened', { description: `Live metrics for ${selected.name}` })}>
                    <Activity className="h-3.5 w-3.5" /> View telemetry
                  </Button>
                  <Button size="sm" className="gap-1.5" onClick={() => toast.success('OTA job queued', { description: `${selected.name} scheduled for firmware update` })}>
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
