'use client'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { KpiCard } from '@/components/indos/shared/kpi-card'
import { ViewHeader } from '@/components/indos/shared/view-header'
import { SimpleBar } from '@/components/indos/shared/charts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  Wrench, ClipboardList, AlertOctagon, CheckCircle2, Clock, Plus, Play, Check, CalendarClock, Building2, Cpu, ListChecks,
} from 'lucide-react'

interface WorkOrder {
  id: string
  title: string
  description?: string | null
  type: string
  priority: string
  status: string
  assignee?: string | null
  machineName?: string | null
  dueDate?: string | null
  createdAt: string
  project?: { name: string; slug: string } | null
}

interface WorkOrdersResponse {
  workOrders: WorkOrder[]
  stats: { open: number; inProgress: number; completed: number; critical: number }
}

const TYPE_STYLE: Record<string, string> = {
  corrective: 'bg-rose-500/15 text-rose-400 ring-rose-500/30',
  preventive: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30',
  predictive: 'bg-violet-500/15 text-violet-400 ring-violet-500/30',
  inspection: 'bg-sky-500/15 text-sky-400 ring-sky-500/30',
}

const PRIORITY_STYLE: Record<string, string> = {
  critical: 'bg-rose-500/15 text-rose-400 ring-rose-500/30',
  high: 'bg-amber-500/15 text-amber-400 ring-amber-500/30',
  medium: 'bg-sky-500/15 text-sky-400 ring-sky-500/30',
  low: 'bg-slate-500/15 text-slate-300 ring-slate-500/30',
}

const COLUMNS: { key: string; title: string; accent: string }[] = [
  { key: 'open', title: 'Open', accent: 'bg-sky-500' },
  { key: 'inprogress', title: 'In Progress', accent: 'bg-amber-500' },
  { key: 'onhold', title: 'On Hold', accent: 'bg-slate-500' },
  { key: 'completed', title: 'Completed', accent: 'bg-emerald-500' },
]

function initials(name?: string | null) {
  if (!name) return '—'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function isOverdue(wo: WorkOrder) {
  if (!wo.dueDate || wo.status === 'completed') return false
  return new Date(wo.dueDate).getTime() < Date.now()
}

function fmtDate(d?: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
}

export function MaintenanceView() {
  const [data, setData] = useState<WorkOrdersResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [newOpen, setNewOpen] = useState(false)
  const [detail, setDetail] = useState<WorkOrder | null>(null)
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])

  const refresh = () => {
    setLoading(true)
    fetch('/api/indos/workorders')
      .then(r => r.json())
      .then((d) => { setData(d); setLoading(false) })
      .catch(() => { setLoading(false); toast.error('Failed to load work orders') })
  }

  useEffect(() => {
    let cancelled = false
    fetch('/api/indos/workorders')
      .then(r => r.json())
      .then((d) => { if (!cancelled) { setData(d); setLoading(false) } })
      .catch(() => { if (!cancelled) { setLoading(false); toast.error('Failed to load work orders') } })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch('/api/indos/projects')
      .then(r => r.json())
      .then((p: any[]) => { if (!cancelled) setProjects(p.map(x => ({ id: x.id, name: x.name }))) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const overdue = useMemo(() => (data?.workOrders || []).filter(isOverdue).length, [data])

  const byType = useMemo(() => {
    const map: Record<string, number> = {}
    for (const wo of data?.workOrders || []) map[wo.type] = (map[wo.type] || 0) + 1
    return Object.entries(map).map(([label, v]) => ({ label, v }))
  }, [data])

  const byPriority = useMemo(() => {
    const order = ['critical', 'high', 'medium', 'low']
    const map: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 }
    for (const wo of data?.workOrders || []) map[wo.priority] = (map[wo.priority] || 0) + 1
    return order.map(label => ({ label, v: map[label] }))
  }, [data])

  const grouped = useMemo(() => {
    const g: Record<string, WorkOrder[]> = { open: [], inprogress: [], onhold: [], completed: [] }
    for (const wo of data?.workOrders || []) {
      const k = g[wo.status] ? wo.status : 'open'
      g[k].push(wo)
    }
    return g
  }, [data])

  const stats = data?.stats

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <ViewHeader
        title="Maintenance & Work Orders"
        description="Plan, dispatch and track corrective, preventive, predictive and inspection work across the fleet."
        icon={<Wrench className="h-5 w-5" />}
        actions={
          <Button size="sm" className="h-8 gap-1.5" onClick={() => setNewOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> New Work Order
          </Button>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        {loading || !stats ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)
        ) : (
          <>
            <KpiCard label="Open" value={stats.open} icon={ClipboardList} accent="sky" hint="awaiting dispatch" />
            <KpiCard label="In Progress" value={stats.inProgress} icon={Play} accent="amber" hint="technicians assigned" />
            <KpiCard label="Completed" value={stats.completed} icon={CheckCircle2} accent="emerald" delta={3.2} hint="last 30 days" />
            <KpiCard label="Critical" value={stats.critical} icon={AlertOctagon} accent="rose" hint="high-priority open" />
            <KpiCard label="Overdue" value={overdue} icon={CalendarClock} accent="rose" hint="past due date" />
          </>
        )}
      </div>

      {/* Kanban + summary */}
      <div className="grid gap-4 xl:grid-cols-4">
        <div className="xl:col-span-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {COLUMNS.map(col => (
              <Card key={col.key} className="gap-0 p-3">
                <div className="mb-2 flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className={cn('h-2 w-2 rounded-full', col.accent)} />
                    <span className="text-xs font-semibold uppercase tracking-wider text-foreground/90">{col.title}</span>
                  </div>
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px] tabular-nums text-muted-foreground">
                    {grouped[col.key]?.length || 0}
                  </Badge>
                </div>
                <ScrollArea className="indos-scroll h-[420px] pr-1">
                  <div className="space-y-2">
                    {(grouped[col.key] || []).map(wo => (
                      <button
                        key={wo.id}
                        onClick={() => setDetail(wo)}
                        className="w-full rounded-md border border-border/60 bg-card/60 p-2.5 text-left transition-colors hover:border-border hover:bg-card"
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <p className="line-clamp-2 text-xs font-medium leading-snug">{wo.title}</p>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1">
                          <Badge variant="outline" className={cn('h-5 px-1.5 text-[10px] capitalize ring-1', TYPE_STYLE[wo.type] || TYPE_STYLE.corrective)}>
                            {wo.type}
                          </Badge>
                          <Badge variant="outline" className={cn('h-5 px-1.5 text-[10px] capitalize ring-1', PRIORITY_STYLE[wo.priority] || PRIORITY_STYLE.medium)}>
                            {wo.priority}
                          </Badge>
                        </div>
                        {wo.machineName && (
                          <p className="mt-1.5 flex items-center gap-1 truncate text-[10px] text-muted-foreground">
                            <Cpu className="h-3 w-3" /> {wo.machineName}
                          </p>
                        )}
                        <div className="mt-2 flex items-center justify-between border-t border-border/40 pt-1.5">
                          <div className="flex items-center gap-1.5">
                            <Avatar className="h-5 w-5">
                              <AvatarFallback className="bg-primary/10 text-[9px] text-primary">{initials(wo.assignee)}</AvatarFallback>
                            </Avatar>
                            <span className="max-w-[64px] truncate text-[10px] text-muted-foreground">{wo.assignee || 'Unassigned'}</span>
                          </div>
                          <span className={cn('text-[10px] tabular-nums', isOverdue(wo) ? 'font-semibold text-rose-400' : 'text-muted-foreground')}>
                            {fmtDate(wo.dueDate)}
                          </span>
                        </div>
                        {wo.project?.name && (
                          <p className="mt-1.5 flex items-center gap-1 truncate text-[10px] text-muted-foreground/80">
                            <Building2 className="h-3 w-3" /> {wo.project.name}
                          </p>
                        )}
                      </button>
                    ))}
                    {(grouped[col.key] || []).length === 0 && (
                      <div className="rounded-md border border-dashed border-border/40 py-8 text-center text-[10px] text-muted-foreground">
                        No work orders
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </Card>
            ))}
          </div>
        </div>

        {/* Right summary */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <ListChecks className="h-4 w-4 text-sky-400" /> By Type
              </CardTitle>
              <CardDescription className="text-xs">Work order distribution</CardDescription>
            </CardHeader>
            <CardContent>
              {byType.length ? <SimpleBar data={byType} height={180} color="#38bdf8" /> : <Skeleton className="h-[180px] w-full" />}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertOctagon className="h-4 w-4 text-rose-400" /> By Priority
              </CardTitle>
              <CardDescription className="text-xs">Severity load</CardDescription>
            </CardHeader>
            <CardContent>
              {byPriority.length ? <SimpleBar data={byPriority} height={180} color="#fb7185" /> : <Skeleton className="h-[180px] w-full" />}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* New Work Order Dialog */}
      <NewWorkOrderDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        projects={projects}
        onCreated={() => { refresh(); setNewOpen(false) }}
      />

      {/* Detail Dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cn('capitalize ring-1', TYPE_STYLE[detail.type] || TYPE_STYLE.corrective)}>
                    {detail.type}
                  </Badge>
                  <Badge variant="outline" className={cn('capitalize ring-1', PRIORITY_STYLE[detail.priority] || PRIORITY_STYLE.medium)}>
                    {detail.priority}
                  </Badge>
                  {isOverdue(detail) && (
                    <Badge variant="outline" className="bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/30">
                      <Clock className="h-3 w-3" /> Overdue
                    </Badge>
                  )}
                </div>
                <DialogTitle className="text-lg">{detail.title}</DialogTitle>
                <DialogDescription>
                  {detail.project?.name ? `${detail.project.name} · ` : ''}WO-{detail.id.slice(-6).toUpperCase()}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 text-sm">
                {detail.description ? (
                  <div>
                    <p className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">Description</p>
                    <p className="text-foreground/90">{detail.description}</p>
                  </div>
                ) : (
                  <p className="text-xs italic text-muted-foreground">No description provided.</p>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <DetailItem label="Assignee" value={detail.assignee || 'Unassigned'} />
                  <DetailItem label="Machine" value={detail.machineName || '—'} />
                  <DetailItem label="Due Date" value={fmtDate(detail.dueDate)} accent={isOverdue(detail) ? 'text-rose-400' : undefined} />
                  <DetailItem label="Created" value={fmtDate(detail.createdAt)} />
                  <DetailItem label="Status" value={detail.status} />
                  <DetailItem label="Project" value={detail.project?.name || '—'} />
                </div>
              </div>

              <DialogFooter className="gap-2">
                {detail.status === 'open' && (
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={() => updateStatus(detail.id, 'inprogress', () => { setDetail(null); refresh() })}
                  >
                    <Play className="h-3.5 w-3.5" /> Start Work
                  </Button>
                )}
                {detail.status === 'inprogress' && (
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={() => updateStatus(detail.id, 'onhold', () => { setDetail(null); refresh() })}
                    variant="outline"
                  >
                    Pause
                  </Button>
                )}
                {detail.status !== 'completed' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => updateStatus(detail.id, 'completed', () => { setDetail(null); refresh() })}
                  >
                    <Check className="h-3.5 w-3.5" /> Mark Complete
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DetailItem({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-md border border-border/50 bg-card/40 p-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 text-xs font-medium capitalize', accent)}>{value}</p>
    </div>
  )
}

async function updateStatus(id: string, status: string, done: () => void) {
  try {
    const r = await fetch('/api/indos/workorders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    if (!r.ok) throw new Error()
    toast.success(`Work order moved to ${status}`, { description: `WO-${id.slice(-6).toUpperCase()}` })
    done()
  } catch {
    toast.error('Failed to update work order')
  }
}

function NewWorkOrderDialog({
  open, onOpenChange, projects, onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  projects: { id: string; name: string }[]
  onCreated: () => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState('corrective')
  const [priority, setPriority] = useState('medium')
  const [projectId, setProjectId] = useState('')
  const [assignee, setAssignee] = useState('')
  const [machineName, setMachineName] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)

  const reset = () => {
    setTitle(''); setDescription(''); setType('corrective'); setPriority('medium')
    setProjectId(''); setAssignee(''); setMachineName(''); setDueDate('')
  }

  const submit = async () => {
    if (!title.trim()) { toast.error('Title is required'); return }
    setSaving(true)
    try {
      const r = await fetch('/api/indos/workorders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, description, type, priority,
          projectId: projectId || null,
          assignee: assignee || null,
          machineName: machineName || null,
          dueDate: dueDate || null,
        }),
      })
      if (!r.ok) throw new Error()
      toast.success('Work order created', { description: title })
      reset()
      onCreated()
    } catch {
      toast.error('Failed to create work order')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Work Order</DialogTitle>
          <DialogDescription>Create a maintenance task. Fields marked with * are required.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="wo-title">Title *</Label>
            <Input id="wo-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Replace conveyor belt motor #3" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="wo-desc">Description</Label>
            <Textarea id="wo-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Steps, parts needed, safety notes…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="corrective">Corrective</SelectItem>
                  <SelectItem value="preventive">Preventive</SelectItem>
                  <SelectItem value="predictive">Predictive</SelectItem>
                  <SelectItem value="inspection">Inspection</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Project</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select project" /></SelectTrigger>
              <SelectContent>
                {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="wo-assignee">Assignee</Label>
              <Input id="wo-assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="e.g. Somchai P." />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="wo-machine">Machine</Label>
              <Input id="wo-machine" value={machineName} onChange={(e) => setMachineName(e.target.value)} placeholder="e.g. CNC-MILL-02" />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="wo-due">Due Date</Label>
            <Input id="wo-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" disabled={saving} onClick={submit}>
            {saving ? 'Creating…' : 'Create Work Order'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
