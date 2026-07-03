'use client'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { KpiCard } from '@/components/indos/shared/kpi-card'
import { ViewHeader } from '@/components/indos/shared/view-header'
import { SimpleBar } from '@/components/indos/shared/charts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  ScrollText, CalendarDays, Users, ShieldAlert, Search, Activity, Globe, Fingerprint, KeyRound, Cpu, PackagePlus, Siren, Wrench, Wifi,
} from 'lucide-react'

interface AuditEntry {
  id: string
  actor: string
  action: string
  target?: string | null
  ip?: string | null
  ts: string
}

const ACTION_META: Record<string, { label: string; cls: string; icon: any }> = {
  login: { label: 'Login', cls: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30', icon: KeyRound },
  logout: { label: 'Logout', cls: 'bg-slate-500/15 text-slate-300 ring-slate-500/30', icon: KeyRound },
  'plugin.install': { label: 'Plugin Install', cls: 'bg-violet-500/15 text-violet-400 ring-violet-500/30', icon: PackagePlus },
  'ota.deploy': { label: 'OTA Deploy', cls: 'bg-amber-500/15 text-amber-400 ring-amber-500/30', icon: Cpu },
  'alarm.ack': { label: 'Alarm Ack', cls: 'bg-sky-500/15 text-sky-400 ring-sky-500/30', icon: Siren },
  'device.autoregister': { label: 'Device Register', cls: 'bg-sky-500/15 text-sky-400 ring-sky-500/30', icon: Wifi },
  'workorder.create': { label: 'Work Order', cls: 'bg-rose-500/15 text-rose-400 ring-rose-500/30', icon: Wrench },
}

function actionMeta(action: string) {
  return ACTION_META[action] || { label: action, cls: 'bg-slate-500/15 text-slate-300 ring-slate-500/30', icon: Activity }
}

function initials(name: string) {
  const p = name.trim().split(/\s+/)
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase()
  return (p[0][0] + p[p.length - 1][0]).toUpperCase()
}

const ACTION_TYPES = Object.keys(ACTION_META)

function isSecurityEvent(action: string) {
  const a = action.toLowerCase()
  return a.includes('login') || a.includes('security') || a.includes('block')
}

export function AuditView() {
  const [logs, setLogs] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('all')

  useEffect(() => {
    fetch('/api/indos/audit')
      .then(r => r.json())
      .then((a: AuditEntry[]) => { setLogs(a); setLoading(false) })
      .catch(() => { setLoading(false); toast.error('Failed to load audit log') })
  }, [])

  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)
  const startOfWeek = new Date(); startOfWeek.setDate(startOfWeek.getDate() - 7)

  const eventsToday = useMemo(() => logs.filter(l => new Date(l.ts) >= startOfDay).length, [logs])
  const eventsThisWeek = useMemo(() => logs.filter(l => new Date(l.ts) >= startOfWeek).length, [logs])
  const uniqueActors = useMemo(() => new Set(logs.map(l => l.actor)).size, [logs])
  const securityEvents = useMemo(() => logs.filter(l => isSecurityEvent(l.action)).length, [logs])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return logs.filter(l => {
      if (actionFilter !== 'all' && l.action !== actionFilter) return false
      if (q && !(`${l.actor} ${l.action} ${l.target || ''} ${l.ip || ''}`.toLowerCase().includes(q))) return false
      return true
    })
  }, [logs, search, actionFilter])

  const actorActivity = useMemo(() => {
    const m: Record<string, number> = {}
    for (const l of logs) m[l.actor] = (m[l.actor] || 0) + 1
    return Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, v]) => ({ label: label.length > 14 ? label.slice(0, 13) + '…' : label, v }))
  }, [logs])

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <ViewHeader
        title="Audit Trail"
        description="Immutable, time-ordered log of every privileged action across the IndOS platform."
        icon={<ScrollText className="h-5 w-5" />}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)
        ) : (
          <>
            <KpiCard label="Events Today" value={eventsToday} icon={CalendarDays} accent="sky" hint={`${new Date().toLocaleDateString('en-GB')}`} />
            <KpiCard label="Events (7d)" value={eventsThisWeek} icon={Activity} accent="emerald" delta={eventsThisWeek ? 2.1 : undefined} hint="rolling week" />
            <KpiCard label="Unique Actors" value={uniqueActors} icon={Users} accent="violet" hint="distinct users" />
            <KpiCard label="Security Events" value={securityEvents} icon={ShieldAlert} accent="rose" hint="login / block / security" />
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        {/* Audit log table */}
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <ScrollText className="h-4 w-4 text-sky-400" /> Event Log
              </CardTitle>
              <CardDescription className="text-xs">{filtered.length} of {logs.length} events · newest first</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search actor, action, target, IP…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 w-56 pl-8 text-xs" />
              </div>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Action type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All actions</SelectItem>
                  {ACTION_TYPES.map(a => <SelectItem key={a} value={a}>{actionMeta(a).label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="indos-scroll max-h-[520px]">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/60">
                    <TableHead className="text-xs">Timestamp</TableHead>
                    <TableHead className="text-xs">Actor</TableHead>
                    <TableHead className="text-xs">Action</TableHead>
                    <TableHead className="hidden text-xs md:table-cell">Target</TableHead>
                    <TableHead className="hidden text-xs lg:table-cell">IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading
                    ? Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i} className="border-border/40">
                        <TableCell colSpan={5}><Skeleton className="h-7 w-full" /></TableCell>
                      </TableRow>
                    ))
                    : filtered.map(l => {
                      const meta = actionMeta(l.action)
                      const Icon = meta.icon
                      return (
                        <TableRow key={l.id} className="border-border/40">
                          <TableCell className="text-xs tabular-nums text-muted-foreground">
                            <div className="flex flex-col leading-tight">
                              <span>{new Date(l.ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                              <span className="font-mono text-[10px]">{new Date(l.ts).toLocaleTimeString('en-GB', { hour12: false })}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Avatar className="h-6 w-6">
                                <AvatarFallback className="bg-primary/10 text-[9px] font-semibold text-primary">{initials(l.actor)}</AvatarFallback>
                              </Avatar>
                              <span className="text-xs font-medium">{l.actor}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn('gap-1 ring-1', meta.cls)}>
                              <Icon className="h-3 w-3" /> {meta.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                            {l.target ? <span className="font-mono">{l.target}</span> : <span className="italic">—</span>}
                          </TableCell>
                          <TableCell className="hidden text-xs lg:table-cell">
                            {l.ip ? (
                              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                                <Globe className="h-3 w-3" /> {l.ip}
                              </span>
                            ) : '—'}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  {!loading && filtered.length === 0 && (
                    <TableRow className="border-border/40">
                      <TableCell colSpan={5} className="py-10 text-center text-xs text-muted-foreground">
                        No audit events match your filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Right column: actor activity */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Fingerprint className="h-4 w-4 text-violet-400" /> Top Actors
              </CardTitle>
              <CardDescription className="text-xs">By event count</CardDescription>
            </CardHeader>
            <CardContent>
              {actorActivity.length ? <SimpleBar data={actorActivity} height={200} color="#a78bfa" /> : <Skeleton className="h-[200px] w-full" />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldAlert className="h-4 w-4 text-rose-400" /> Security Highlights
              </CardTitle>
              <CardDescription className="text-xs">Login & blocked events</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="indos-scroll h-[200px] pr-2">
                <div className="space-y-2">
                  {logs.filter(l => isSecurityEvent(l.action)).slice(0, 10).map(l => {
                    const meta = actionMeta(l.action)
                    return (
                      <div key={l.id} className="rounded-md border border-border/50 bg-card/40 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="outline" className={cn('h-5 px-1.5 text-[10px] ring-1', meta.cls)}>{meta.label}</Badge>
                          <span className="text-[10px] tabular-nums text-muted-foreground">
                            {new Date(l.ts).toLocaleTimeString('en-GB', { hour12: false })}
                          </span>
                        </div>
                        <p className="mt-1 text-xs">{l.actor}</p>
                        {l.ip && <p className="text-[10px] text-muted-foreground">{l.ip}</p>}
                      </div>
                    )
                  })}
                  {logs.filter(l => isSecurityEvent(l.action)).length === 0 && (
                    <div className="py-6 text-center text-xs text-muted-foreground">No security events recorded.</div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
