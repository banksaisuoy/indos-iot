'use client'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { KpiCard } from '@/components/indos/shared/kpi-card'
import { ViewHeader } from '@/components/indos/shared/view-header'
import { StatusBadge } from '@/components/indos/shared/status-badge'
import { LiveDot } from '@/components/indos/shared/charts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  RefreshCw, Package, Activity, CheckCircle2, Undo2, Rocket, Cpu,
  ShieldCheck, Fingerprint, Filter, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Firmware {
  id: string
  version: string
  deviceType: string
  checksum: string | null
  sizeKb: number
  notes: string | null
  status: string
  createdAt?: string
  _count?: { jobs: number }
}

interface OtaJob {
  id: string
  firmwareId: string
  scope: string
  target: string | null
  status: string
  progress: number
  total: number
  done: number
  createdAt: string
  firmware?: { version: string; deviceType: string }
}

const SCOPE_STYLE: Record<string, string> = {
  single: 'bg-sky-500/15 text-sky-400 ring-sky-500/30',
  group: 'bg-amber-500/15 text-amber-400 ring-amber-500/30',
  project: 'bg-violet-500/15 text-violet-400 ring-violet-500/30',
  global: 'bg-rose-500/15 text-rose-400 ring-rose-500/30',
}

const DEVICE_TYPE_STYLE: Record<string, string> = {
  gateway: 'bg-sky-500/15 text-sky-400 ring-sky-500/30',
  edge: 'bg-violet-500/15 text-violet-400 ring-violet-500/30',
  plc: 'bg-amber-500/15 text-amber-400 ring-amber-500/30',
  meter: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30',
  sensor: 'bg-rose-500/15 text-rose-400 ring-rose-500/30',
}

export function OtaView() {
  const [firmware, setFirmware] = useState<Firmware[] | null>(null)
  const [jobs, setJobs] = useState<OtaJob[] | null>(null)
  const [tab, setTab] = useState<'all' | 'inprogress' | 'completed'>('all')
  const [deployFw, setDeployFw] = useState<Firmware | null>(null)
  const [scope, setScope] = useState<string>('single')
  const [target, setTarget] = useState('')
  const [notes, setNotes] = useState('')
  const [opening, setOpening] = useState(false)

  useEffect(() => {
    fetch('/api/indos/firmware').then(r => r.json()).then(setFirmware).catch(() => setFirmware([]))
    fetch('/api/indos/ota').then(r => r.json()).then(setJobs).catch(() => setJobs([]))
  }, [])

  // Animate in-progress jobs subtly (real progress comes from device reporting via PATCH /api/indos/ota)
  useEffect(() => {
    if (!jobs) return
    const active = jobs.some(j => j.status === 'inprogress')
    if (!active) return
    // Poll for real status updates every 5 seconds instead of faking progress
    const t = setInterval(() => {
      fetch('/api/indos/ota').then(r => r.json()).then((data: OtaJob[]) => {
        if (Array.isArray(data)) setJobs(data)
      }).catch(() => {})
    }, 5000)
    return () => clearInterval(t)
  }, [jobs])

  const kpis = useMemo(() => {
    if (!firmware || !jobs) return null
    const published = firmware.filter(f => f.status === 'stable' || f.status === 'draft').length
    const active = jobs.filter(j => j.status === 'inprogress' || j.status === 'pending').length
    const updated = jobs.reduce((s, j) => s + (j.done || 0), 0)
    const rollbacks = jobs.filter(j => j.status === 'rollback').length
    return { published, active, updated, rollbacks }
  }, [firmware, jobs])

  const filteredJobs = useMemo(() => {
    if (!jobs) return null
    if (tab === 'inprogress') return jobs.filter(j => j.status === 'inprogress' || j.status === 'pending')
    if (tab === 'completed') return jobs.filter(j => j.status === 'completed' || j.status === 'rollback')
    return jobs
  }, [jobs, tab])

  function openDeploy(fw: Firmware) {
    setDeployFw(fw)
    setScope('single')
    setTarget('')
    setNotes('')
    setOpening(false)
  }

  function confirmDeploy() {
    if (!deployFw) return
    setOpening(true)
    // Call the real OTA deploy API — creates a signed, audit-logged job
    fetch('/api/indos/ota', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firmwareId: deployFw.id, scope, target: target || null }),
    })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((newJob: OtaJob) => {
        setJobs(prev => [newJob, ...(prev || [])])
        setOpening(false)
        setDeployFw(null)
        toast.success('OTA job dispatched (signed)', {
          description: `${deployFw.version} → ${scope} · ${target || 'all'} · manifest signed + audit logged`,
        })
        // Refresh firmware list to show updated job count
        fetch('/api/indos/firmware').then(r => r.json()).then(setFirmware).catch(() => {})
      })
      .catch(err => {
        setOpening(false)
        toast.error('Failed to dispatch OTA job', { description: err.message })
      })
  }

  function rollback(job: OtaJob) {
    // Call the real PATCH API to mark job as rollback
    fetch('/api/indos/ota', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: job.id, status: 'rollback', progress: 100 }),
    })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(() => {
        toast.success('Rollback initiated', {
          description: `Reverting ${job.firmware?.version} on ${job.target} → previous stable build`,
        })
        setJobs(prev =>
          prev ? prev.map(j => (j.id === job.id ? { ...j, status: 'rollback', progress: 100 } : j)) : prev,
        )
      })
      .catch(err => toast.error('Rollback failed', { description: err.message }))
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <ViewHeader
        title="OTA Firmware Management"
        description="Sign, publish & deploy firmware artifacts across the entire device fleet with staged rollouts."
        icon={<RefreshCw className="h-5 w-5" />}
        actions={
          <>
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <LiveDot color="bg-emerald-400" /> OTA service online
            </Badge>
            <Button size="sm" className="h-8 gap-1.5" onClick={() => firmware && firmware[0] && openDeploy(firmware[0])}>
              <Rocket className="h-3.5 w-3.5" /> New Deployment
            </Button>
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard label="Firmware Versions" value={kpis ? kpis.published : '—'} icon={Package} accent="sky" hint="published in catalog" />
        <KpiCard label="Active OTA Jobs" value={kpis ? kpis.active : '—'} icon={Activity} accent="amber" hint="in progress + queued" />
        <KpiCard label="Devices Updated" value={kpis ? kpis.updated.toLocaleString() : '—'} icon={CheckCircle2} accent="emerald" delta={3.2} hint="cumulative successful" />
        <KpiCard label="Rollbacks" value={kpis ? kpis.rollbacks : '—'} icon={Undo2} accent="violet" hint="last 30 days" />
      </div>

      {/* Main grid: catalog + jobs */}
      <div className="grid gap-4 xl:grid-cols-5">
        {/* Firmware Catalog */}
        <Card className="xl:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="h-4 w-4 text-sky-400" /> Firmware Catalog
              </CardTitle>
              <CardDescription className="text-xs">Signed artifacts ready for staged rollout</CardDescription>
            </div>
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
              <Filter className="h-3 w-3" /> Filter
            </Button>
          </CardHeader>
          <CardContent>
            {!firmware ? (
              <CatalogSkeleton />
            ) : firmware.length === 0 ? (
              <div className="py-10 text-center text-xs text-muted-foreground">No firmware published yet.</div>
            ) : (
              <ScrollArea className="indos-scroll max-h-[460px] pr-2">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/60 hover:bg-transparent">
                      <TableHead className="text-[11px] uppercase">Version</TableHead>
                      <TableHead className="text-[11px] uppercase">Type</TableHead>
                      <TableHead className="text-[11px] uppercase">Status</TableHead>
                      <TableHead className="text-[11px] uppercase">Size</TableHead>
                      <TableHead className="hidden text-[11px] uppercase md:table-cell">Checksum</TableHead>
                      <TableHead className="hidden text-[11px] uppercase lg:table-cell">Jobs</TableHead>
                      <TableHead className="w-[80px] text-right text-[11px] uppercase">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {firmware.map(fw => (
                      <TableRow key={fw.id} className="border-border/40 text-sm">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="rounded-md bg-primary/10 p-1.5 ring-1 ring-primary/20">
                              <Cpu className="h-3.5 w-3.5 text-primary" />
                            </div>
                            <div>
                              <p className="font-mono text-xs font-semibold">{fw.version}</p>
                              {fw.notes && (
                                <p className="max-w-[180px] truncate text-[10px] text-muted-foreground">{fw.notes}</p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('ring-1', DEVICE_TYPE_STYLE[fw.deviceType] || 'bg-slate-500/15 text-slate-400 ring-slate-500/30')}>
                            {fw.deviceType}
                          </Badge>
                        </TableCell>
                        <TableCell><StatusBadge status={fw.status} /></TableCell>
                        <TableCell className="text-xs tnum text-muted-foreground">
                          {fw.sizeKb >= 1024 ? `${(fw.sizeKb / 1024).toFixed(1)} MB` : `${fw.sizeKb} KB`}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                            <Fingerprint className="h-3 w-3" />
                            {fw.checksum ? fw.checksum.slice(0, 12) : '—'}
                          </span>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <Badge variant="outline" className="bg-muted/40 text-xs tnum">{fw._count?.jobs ?? 0}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 text-xs"
                            disabled={fw.status === 'deprecated'}
                            onClick={() => openDeploy(fw)}
                          >
                            <Rocket className="h-3 w-3" /> Deploy
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Active & Recent OTA Jobs */}
        <Card className="xl:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="h-4 w-4 text-amber-400" /> Active & Recent OTA Jobs
                </CardTitle>
                <CardDescription className="text-xs">Staged rollout progress</CardDescription>
              </div>
            </div>
            <Tabs value={tab} onValueChange={v => setTab(v as any)} className="mt-2">
              <TabsList className="h-8 w-full">
                <TabsTrigger value="all" className="flex-1 text-xs">All</TabsTrigger>
                <TabsTrigger value="inprogress" className="flex-1 text-xs">In Progress</TabsTrigger>
                <TabsTrigger value="completed" className="flex-1 text-xs">Completed</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
            {!filteredJobs ? (
              <div className="space-y-2">
                {[0, 1, 2].map(i => <Skeleton key={i} className="h-[88px] w-full rounded-md" />)}
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="py-10 text-center text-xs text-muted-foreground">No jobs in this filter.</div>
            ) : (
              <ScrollArea className="indos-scroll max-h-[460px] pr-2">
                <div className="space-y-2">
                  {filteredJobs.map(job => (
                    <JobRow key={job.id} job={job} onRollback={rollback} />
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Deploy Dialog */}
      <Dialog open={!!deployFw} onOpenChange={o => !opening && setDeployFw(o ? deployFw : null)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="h-4 w-4 text-primary" /> New OTA Job
            </DialogTitle>
            <DialogDescription>
              Deploy <span className="font-mono font-semibold text-foreground">{deployFw?.version}</span> to the selected device scope.
            </DialogDescription>
          </DialogHeader>

          {deployFw && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 rounded-md border border-border/60 bg-card/40 p-3 text-xs">
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">Type</p>
                  <Badge variant="outline" className={cn('mt-1 ring-1', DEVICE_TYPE_STYLE[deployFw.deviceType] || 'bg-slate-500/15 text-slate-400 ring-slate-500/30')}>
                    {deployFw.deviceType}
                  </Badge>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">Size</p>
                  <p className="mt-1 tnum">{deployFw.sizeKb >= 1024 ? `${(deployFw.sizeKb / 1024).toFixed(1)} MB` : `${deployFw.sizeKb} KB`}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">Checksum</p>
                  <p className="mt-1 truncate font-mono text-[10px]">{deployFw.checksum?.slice(0, 12) ?? '—'}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Deployment scope</Label>
                <Select value={scope} onValueChange={setScope}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Single device</SelectItem>
                    <SelectItem value="group">Device group (canary)</SelectItem>
                    <SelectItem value="project">Project / plant</SelectItem>
                    <SelectItem value="global">Global fleet rollout</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">
                  Target {scope === 'global' ? '(all devices will be targeted)' : scope === 'project' ? '(project id / plant)' : '(device id or group name)'}
                </Label>
                <Input
                  value={target}
                  onChange={e => setTarget(e.target.value)}
                  placeholder={scope === 'global' ? 'all-fleet' : scope === 'project' ? 'plant-a' : 'gateway-001'}
                  className="h-9 font-mono text-xs"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Rollout notes (optional)</Label>
                <Textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Canary stage — monitor for 1h before promoting…"
                  rows={2}
                  className="text-xs"
                />
              </div>

              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-amber-300">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <p>Firmware signature will be verified on each device before flash. Failed verification aborts the rollout automatically.</p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline" size="sm" disabled={opening}>Cancel</Button>
            </DialogClose>
            <Button size="sm" onClick={confirmDeploy} disabled={opening || !deployFw}>
              {opening ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Dispatching…</> : <><Rocket className="h-3.5 w-3.5" /> Dispatch Job</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function JobRow({ job, onRollback }: { job: OtaJob; onRollback: (j: OtaJob) => void }) {
  const animated = job.status === 'inprogress'
  return (
    <div className="rounded-md border border-border/60 bg-card/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold">{job.firmware?.version ?? 'unknown'}</span>
            <Badge variant="outline" className={cn('ring-1', SCOPE_STYLE[job.scope] || 'bg-slate-500/15 text-slate-400 ring-slate-500/30')}>
              {job.scope}
            </Badge>
          </div>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
            target: <span className="font-mono">{job.target ?? '—'}</span> · {job.firmware?.deviceType}
          </p>
        </div>
        <StatusBadge status={job.status} />
      </div>

      <div className="mt-2">
        <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="tnum">{job.done}/{job.total} devices</span>
          <span className="tnum">{Math.round(job.progress)}%</span>
        </div>
        <Progress
          value={job.progress}
          className={cn('h-1.5', animated && 'animate-pulse')}
          indicatorClassName={cn(
            job.status === 'completed' && 'bg-emerald-500',
            job.status === 'inprogress' && 'bg-amber-500',
            job.status === 'failed' && 'bg-rose-500',
            job.status === 'rollback' && 'bg-violet-500',
            job.status === 'pending' && 'bg-sky-500',
          )}
        />
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          {new Date(job.createdAt).toLocaleString('en-GB', { hour12: false, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </span>
        {(job.status === 'completed' || job.status === 'rollback') && (
          <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-[11px] text-violet-400 hover:text-violet-300" onClick={() => onRollback(job)}>
            <Undo2 className="h-3 w-3" /> Rollback
          </Button>
        )}
      </div>
    </div>
  )
}

function CatalogSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 w-full rounded-md" />)}
    </div>
  )
}
