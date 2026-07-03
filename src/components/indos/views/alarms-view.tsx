'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRealtime } from '@/lib/indos/realtime'
import { KpiCard } from '@/components/indos/shared/kpi-card'
import { ViewHeader } from '@/components/indos/shared/view-header'
import { StatusBadge, SeverityBadge } from '@/components/indos/shared/status-badge'
import { LiveDot, SimpleBar } from '@/components/indos/shared/charts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { toast } from 'sonner'
import {
  Bell, AlertTriangle, CheckCircle2, ShieldCheck, Filter, RefreshCw,
  Clock, Zap, Activity, Cpu, Leaf, Wrench, Server, Check, ArrowRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface DbAlarm {
  id: string
  severity: string
  category: string
  message: string
  state: string
  createdAt: string
  ackedBy: string | null
  ackedAt: string | null
  resolvedAt: string | null
  device?: { name: string } | null
  project?: { name: string; slug: string } | null
}

interface NormAlarm {
  id: string
  severity: string
  category: string
  message: string
  state: string
  ts: string
  device?: string
  project?: string
  isLive: boolean
  ackedBy?: string | null
}

const STATES = ['active', 'acknowledged', 'resolved']
const SEVERITIES = ['critical', 'warning', 'info']
const CATEGORIES = ['system', 'device', 'energy', 'environment', 'security', 'maintenance']

const CAT_ICON: Record<string, any> = {
  system: Server,
  device: Cpu,
  energy: Zap,
  environment: Leaf,
  security: ShieldCheck,
  maintenance: Wrench,
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    day: '2-digit', month: 'short',
    hour12: false,
  })
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

function dedupeKey(a: { message: string; ts: string }) {
  // round ts to nearest 5s for dedup
  const rounded = Math.floor(new Date(a.ts).getTime() / 5000) * 5000
  return `${a.message}::${rounded}`
}

export function AlarmsView() {
  const rt = useRealtime()
  const [dbAlarms, setDbAlarms] = useState<DbAlarm[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [stateF, setStateF] = useState<string>('all')
  const [sevF, setSevF] = useState<string>('all')
  const [catF, setCatF] = useState<string>('all')
  const [actioning, setActioning] = useState<Record<string, boolean>>({})

  const load = useCallback(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (stateF && stateF !== 'all') params.set('state', stateF)
        if (sevF && sevF !== 'all') params.set('severity', sevF)
        const r = await fetch(`/api/indos/alarms?${params.toString()}`)
        const d = (await r.json()) as DbAlarm[]
        if (!cancelled) setDbAlarms(d)
      } catch {
        if (!cancelled) setDbAlarms([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [stateF, sevF])

  useEffect(() => { load() }, [load])

  // Merge live + DB alarms
  const merged = useMemo(() => {
    const live: NormAlarm[] = rt.recentAlarms.map(a => ({
      id: a.id,
      severity: a.severity,
      category: a.category,
      message: a.message,
      state: a.state,
      ts: a.ts,
      device: undefined,
      project: a.project,
      isLive: true,
    }))
    const db: NormAlarm[] = (dbAlarms || []).map(a => ({
      id: a.id,
      severity: a.severity,
      category: a.category,
      message: a.message,
      state: a.state,
      ts: a.createdAt,
      device: a.device?.name,
      project: a.project?.name,
      isLive: false,
      ackedBy: a.ackedBy,
    }))
    // Combine, dedupe, sort desc
    const seen = new Set<string>()
    const combined = [...live, ...db]
      .filter(a => {
        const k = dedupeKey(a)
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
      .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    return combined
  }, [rt.recentAlarms, dbAlarms])

  const filtered = useMemo(() => {
    return merged.filter(a => {
      if (stateF !== 'all' && a.state !== stateF) return false
      if (sevF !== 'all' && a.severity !== sevF) return false
      if (catF !== 'all' && a.category !== catF) return false
      return true
    })
  }, [merged, stateF, sevF, catF])

  const stats = useMemo(() => {
    const all = merged
    const active = all.filter(a => a.state === 'active')
    return {
      total: all.length,
      active: active.length,
      critical: active.filter(a => a.severity === 'critical').length,
      acknowledged: all.filter(a => a.state === 'acknowledged').length,
      resolved: all.filter(a => a.state === 'resolved').length,
    }
  }, [merged])

  const byCategory = useMemo(() => {
    const m: Record<string, number> = {}
    for (const a of merged) m[a.category] = (m[a.category] || 0) + 1
    return Object.entries(m).map(([k, v]) => ({ label: k, v }))
  }, [merged])

  const bySeverity = useMemo(() => {
    const m: Record<string, number> = {}
    for (const a of merged) m[a.severity] = (m[a.severity] || 0) + 1
    return Object.entries(m).map(([k, v]) => ({ label: k, v }))
  }, [merged])

  const patchAlarm = async (alarm: NormAlarm, target: 'acknowledged' | 'resolved') => {
    setActioning(s => ({ ...s, [alarm.id]: true }))
    try {
      if (alarm.isLive) {
        rt.ackAlarm(alarm.id)
        toast.success(`Live alarm ${target}`, { description: alarm.message })
      } else {
        const res = await fetch('/api/indos/alarms', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: alarm.id, state: target, ackedBy: 'operator' }),
        })
        if (!res.ok) throw new Error('patch failed')
        toast.success(`Alarm ${target}`, { description: alarm.message })
        load()
      }
    } catch {
      toast.error(`Failed to ${target} alarm`)
    } finally {
      setActioning(s => ({ ...s, [alarm.id]: false }))
    }
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <ViewHeader
        title="Alarm Center"
        description="Real-time alarm feed merged with the historical incident log. Acknowledge and resolve in one click."
        icon={<Bell className="h-5 w-5" />}
        actions={
          <>
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <LiveDot color="bg-emerald-400" /> {rt.recentAlarms.filter(a => a.state === 'active').length} live
            </Badge>
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => { load(); toast.success('Alarm feed refreshed') }}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          </>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
        <KpiCard
          label="Active Alarms"
          value={loading ? '—' : stats.active}
          icon={AlertTriangle}
          accent="rose"
          hint={stats.critical > 0 ? `${stats.critical} critical · needs attention` : 'no critical alarms'}
        />
        <KpiCard
          label="Critical"
          value={loading ? '—' : stats.critical}
          icon={Zap}
          accent="rose"
          hint="in active state"
          className={cn(stats.critical > 0 && 'ring-1 ring-rose-500/40')}
        />
        <KpiCard label="Acknowledged" value={loading ? '—' : stats.acknowledged} icon={CheckCircle2} accent="amber" hint="awaiting resolution" />
        <KpiCard label="Resolved" value={loading ? '—' : stats.resolved} icon={ShieldCheck} accent="emerald" hint="closed incidents" />
        <KpiCard label="Total" value={loading ? '—' : stats.total} icon={Bell} accent="violet" hint="all states" className="col-span-2 lg:col-span-1" />
      </div>

      {/* Filters */}
      <Card className="p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Filter className="h-3.5 w-3.5" /> Filters
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:flex-1">
            <Select value={stateF} onValueChange={setStateF}>
              <SelectTrigger className="h-9 w-full"><SelectValue placeholder="State" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All states</SelectItem>
                {STATES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sevF} onValueChange={setSevF}>
              <SelectTrigger className="h-9 w-full"><SelectValue placeholder="Severity" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                {SEVERITIES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={catF} onValueChange={setCatF}>
              <SelectTrigger className="h-9 w-full"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Main: feed + side summary */}
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        {/* Alarm feed */}
        <Card className="gap-0 p-0">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border/50 px-4 py-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bell className="h-4 w-4 text-rose-400" /> Alarm Feed
                <Badge variant="outline" className="border-rose-500/30 bg-rose-500/10 text-rose-400">
                  {filtered.filter(a => a.state === 'active').length} active
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs">{loading ? 'Loading…' : `${filtered.length} alarms · sorted by most recent`}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <ShieldCheck className="h-8 w-8 text-emerald-400" />
                <p className="text-sm text-muted-foreground">No alarms match your filters. System stable.</p>
              </div>
            ) : (
              <ScrollArea className="indos-scroll max-h-[640px]">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow className="border-border/50 hover:bg-transparent">
                      <TableHead className="pl-4 text-xs uppercase text-muted-foreground">Severity</TableHead>
                      <TableHead className="text-xs uppercase text-muted-foreground">Alarm</TableHead>
                      <TableHead className="text-xs uppercase text-muted-foreground">Source</TableHead>
                      <TableHead className="text-xs uppercase text-muted-foreground">State</TableHead>
                      <TableHead className="pr-4 text-right text-xs uppercase text-muted-foreground">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(a => {
                      const CatIcon = CAT_ICON[a.category] || Activity
                      const busy = actioning[a.id]
                      return (
                        <TableRow key={a.id + a.ts} className={cn('border-border/40', a.severity === 'critical' && a.state === 'active' && 'bg-rose-500/[0.03]')}>
                          <TableCell className="pl-4 align-top">
                            <div className="flex flex-col items-start gap-1">
                              <SeverityBadge severity={a.severity} />
                              {a.isLive && <LiveDot color="bg-emerald-400" className="mt-0.5" />}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[320px] align-top">
                            <div className="flex items-start gap-2">
                              <CatIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <div className="min-w-0">
                                <p className="text-xs font-medium leading-snug">{a.message}</p>
                                <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                  <Badge variant="outline" className="bg-card/60 text-[10px] font-normal capitalize text-muted-foreground">{a.category}</Badge>
                                  <Clock className="h-2.5 w-2.5" /> {relTime(a.ts)} · {fmtTime(a.ts)}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="align-top text-[11px]">
                            <p className="font-medium">{a.device || 'System'}</p>
                            <p className="text-[10px] text-muted-foreground">{a.project || '—'}</p>
                            {a.ackedBy && <p className="mt-0.5 text-[10px] text-amber-400">by {a.ackedBy}</p>}
                          </TableCell>
                          <TableCell className="align-top">
                            <StatusBadge status={a.state} />
                          </TableCell>
                          <TableCell className="pr-4 align-top">
                            <div className="flex justify-end gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 gap-1 px-2 text-[11px]"
                                disabled={a.state !== 'active' || busy}
                                onClick={() => patchAlarm(a, 'acknowledged')}
                              >
                                {a.state === 'acknowledged' || a.state === 'resolved' ? <Check className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                                Ack
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 gap-1 px-2 text-[11px] text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-400"
                                disabled={a.state === 'resolved' || busy}
                                onClick={() => patchAlarm(a, 'resolved')}
                              >
                                <ArrowRight className="h-3 w-3" />
                                Resolve
                              </Button>
                            </div>
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

        {/* Side summary */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4 text-rose-400" /> By Category
              </CardTitle>
              <CardDescription className="text-xs">All states · current view</CardDescription>
            </CardHeader>
            <CardContent>
              {byCategory.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">No data</div>
              ) : (
                <SimpleBar data={byCategory} height={180} color="#fb7185" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Zap className="h-4 w-4 text-amber-400" /> By Severity
              </CardTitle>
              <CardDescription className="text-xs">Distribution across the feed</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {['critical', 'warning', 'info'].map(sev => {
                const v = bySeverity.find(b => b.label === sev)?.v || 0
                const total = bySeverity.reduce((s, b) => s + b.v, 0) || 1
                const pct = (v / total) * 100
                const color = sev === 'critical' ? 'bg-rose-500' : sev === 'warning' ? 'bg-amber-500' : 'bg-sky-500'
                const cls = sev === 'critical' ? 'text-rose-400' : sev === 'warning' ? 'text-amber-400' : 'text-sky-400'
                return (
                  <div key={sev}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className={cn('font-medium capitalize', cls)}>{sev}</span>
                      <span className="font-semibold tnum">{v}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                      <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/50 pt-3 text-center">
                <div>
                  <p className="text-lg font-bold tnum text-rose-400">{bySeverity.find(b => b.label === 'critical')?.v || 0}</p>
                  <p className="text-[10px] text-muted-foreground">Critical</p>
                </div>
                <div>
                  <p className="text-lg font-bold tnum text-amber-400">{bySeverity.find(b => b.label === 'warning')?.v || 0}</p>
                  <p className="text-[10px] text-muted-foreground">Warning</p>
                </div>
                <div>
                  <p className="text-lg font-bold tnum text-sky-400">{bySeverity.find(b => b.label === 'info')?.v || 0}</p>
                  <p className="text-[10px] text-muted-foreground">Info</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
