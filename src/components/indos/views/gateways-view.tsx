'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRealtime } from '@/lib/indos/realtime'
import { KpiCard } from '@/components/indos/shared/kpi-card'
import { ViewHeader } from '@/components/indos/shared/view-header'
import { StatusBadge } from '@/components/indos/shared/status-badge'
import { LiveDot } from '@/components/indos/shared/charts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import { toast } from 'sonner'
import {
  Radio, Network, Server, Activity, MapPin, Wifi, Cpu, HardDrive,
  RefreshCw, Globe, Router, Signal, Cable,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Gateway {
  id: string
  name: string
  mac: string
  model: string | null
  firmware: string | null
  ip: string | null
  status: string
  deviceCount: number
  uptime: number
  location: string | null
}

const MODEL_CLS: Record<string, string> = {
  'IG-9500': 'bg-violet-500/15 text-violet-400 ring-violet-500/30',
  'IG-7400': 'bg-sky-500/15 text-sky-400 ring-sky-500/30',
  'IG-5200': 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30',
  'EG-3100': 'bg-amber-500/15 text-amber-400 ring-amber-500/30',
  default: 'bg-slate-500/15 text-slate-400 ring-slate-500/30',
}

function uptimeColor(v: number) {
  if (v >= 99) return 'bg-emerald-500'
  if (v >= 95) return 'bg-amber-500'
  return 'bg-rose-500'
}

export function GatewaysView() {
  const rt = useRealtime()
  const [gateways, setGateways] = useState<Gateway[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const r = await fetch('/api/indos/gateways')
        const d = (await r.json()) as Gateway[]
        if (!cancelled) setGateways(d)
      } catch {
        if (!cancelled) setGateways([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const refresh = () => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const r = await fetch('/api/indos/gateways')
        const d = (await r.json()) as Gateway[]
        if (!cancelled) setGateways(d)
      } catch {
        if (!cancelled) setGateways([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    toast.success('Gateway fleet refreshed')
  }

  const stats = useMemo(() => {
    if (!gateways) return { total: 0, online: 0, offline: 0, devices: 0, avgUptime: 0 }
    const online = gateways.filter(g => g.status === 'online').length
    const offline = gateways.filter(g => g.status === 'offline').length
    const devices = gateways.reduce((s, g) => s + g.deviceCount, 0)
    const avgUptime = gateways.length ? gateways.reduce((s, g) => s + g.uptime, 0) / gateways.length : 0
    return { total: gateways.length, online, offline, devices, avgUptime }
  }, [gateways])

  // Infer project topology from location prefix
  const topology = useMemo(() => {
    if (!gateways) return []
    return gateways.map(g => {
      const loc = g.location || 'Unknown'
      // Simulate "serves" hint: split location by comma
      const sites = loc.split(',').map(s => s.trim()).filter(Boolean)
      return { gateway: g, sites }
    })
  }, [gateways])

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <ViewHeader
        title="Edge Gateways"
        description="Industrial gateway fleet managing field devices. Connection topology is inferred from location."
        icon={<Radio className="h-5 w-5" />}
        actions={
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={refresh}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
        <KpiCard label="Total Gateways" value={loading ? '—' : stats.total} icon={Radio} accent="emerald" hint="edge nodes" />
        <KpiCard label="Online" value={loading ? '—' : stats.online} icon={Activity} accent="emerald" hint={`${stats.total ? ((stats.online / stats.total) * 100).toFixed(0) : 0}% available`} />
        <KpiCard label="Offline" value={loading ? '—' : stats.offline} icon={Server} accent="slate" hint="unreachable" />
        <KpiCard label="Devices Managed" value={loading ? '—' : stats.devices} icon={Cpu} accent="sky" hint="across all gateways" />
        <KpiCard label="Avg Uptime" value={loading ? '—' : stats.avgUptime.toFixed(2)} unit="%" icon={HardDrive} accent="violet" className="col-span-2 lg:col-span-1" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        {/* Gateway cards grid */}
        <div>
          {loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 w-full" />)}
            </div>
          ) : (gateways || []).length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <Radio className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No gateways registered yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(gateways || []).map(g => <GatewayCard key={g.id} gateway={g} />)}
            </div>
          )}
        </div>

        {/* Connection topology table */}
        <Card className="h-fit">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Network className="h-4 w-4 text-sky-400" /> Connection Topology
            </CardTitle>
            <CardDescription className="text-xs">Gateways and the sites they serve</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
              </div>
            ) : (
              <ScrollArea className="indos-scroll max-h-[420px]">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow className="border-border/50 hover:bg-transparent">
                      <TableHead className="pl-4 text-xs uppercase text-muted-foreground">Gateway</TableHead>
                      <TableHead className="text-xs uppercase text-muted-foreground">Devices</TableHead>
                      <TableHead className="pr-4 text-xs uppercase text-muted-foreground">Sites served</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topology.map(({ gateway, sites }) => (
                      <TableRow key={gateway.id} className="border-border/40">
                        <TableCell className="pl-4">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/20">
                              <Router className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium">{gateway.name}</p>
                              <p className="text-[10px] text-muted-foreground">{gateway.ip || gateway.mac}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-semibold tnum">{gateway.deviceCount}</span>
                        </TableCell>
                        <TableCell className="pr-4">
                          <div className="flex flex-wrap gap-1">
                            {sites.length === 0 ? (
                              <span className="text-[10px] text-muted-foreground">—</span>
                            ) : sites.slice(0, 3).map((s, i) => (
                              <Badge key={i} variant="outline" className="bg-card/60 text-[10px] font-normal text-muted-foreground">
                                <MapPin className="h-2.5 w-2.5" /> {s}
                              </Badge>
                            ))}
                            {sites.length > 3 && <span className="text-[10px] text-muted-foreground">+{sites.length - 3}</span>}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function GatewayCard({ gateway }: { gateway: Gateway }) {
  const isOnline = gateway.status === 'online'
  const modelCls = gateway.model ? (MODEL_CLS[gateway.model] || MODEL_CLS.default) : MODEL_CLS.default
  const uColor = uptimeColor(gateway.uptime)
  return (
    <Card className="group p-4 transition-all hover:border-primary/40 hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {gateway.model && (
              <Badge variant="outline" className={cn('ring-1 font-mono', modelCls)}>{gateway.model}</Badge>
            )}
            <StatusBadge status={gateway.status} />
          </div>
          <h3 className="mt-2 truncate text-base font-semibold">{gateway.name}</h3>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" /> {gateway.location || 'Unknown location'}
          </p>
        </div>
        <div className="relative">
          <div className={cn('flex h-9 w-9 items-center justify-center rounded-md ring-1', isOnline ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20' : 'bg-slate-500/10 text-slate-400 ring-slate-500/20')}>
            <Radio className="h-4 w-4" />
          </div>
          {isOnline && <LiveDot color="bg-emerald-400" className="absolute -right-0.5 -top-0.5" />}
        </div>
      </div>

      {/* Uptime */}
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">Uptime (30d)</span>
          <span className="font-semibold tnum">{gateway.uptime.toFixed(2)}%</span>
        </div>
        <Progress value={gateway.uptime} className="h-1.5 bg-muted/40" indicatorClassName={uColor} />
      </div>

      {/* Stats row */}
      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/50 pt-3">
        <Stat icon={Cpu} label="Devices" value={String(gateway.deviceCount)} accent="text-sky-400" />
        <Stat icon={Wifi} label="IP" value={gateway.ip || '—'} accent="text-emerald-400" small />
        <Stat icon={Signal} label="Firmware" value={gateway.firmware || '—'} accent="text-violet-400" small />
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="font-mono text-[10px] text-muted-foreground">{gateway.mac}</span>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Cable className="h-3 w-3" /> {isOnline ? 'Bridge active' : 'Bridge down'}
        </span>
      </div>
    </Card>
  )
}

function Stat({ icon: Icon, label, value, accent, small }: { icon: any; label: string; value: string; accent: string; small?: boolean }) {
  return (
    <div className="text-center">
      <Icon className={cn('mx-auto h-3.5 w-3.5', accent)} />
      <p className={cn('mt-1 font-semibold tnum', small ? 'text-[10px]' : 'text-base')}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  )
}
