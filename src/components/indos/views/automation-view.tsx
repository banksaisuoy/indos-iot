'use client'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { KpiCard } from '@/components/indos/shared/kpi-card'
import { ViewHeader } from '@/components/indos/shared/view-header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
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
  Workflow, Zap, Gauge, Clock, Hand, Play, Pause, Plus,
  GitBranch, ArrowRight, Cpu, Activity, Timer, Layers,
  AlertTriangle, CheckCircle2, FileBarChart, Loader2,
  CalendarClock, Settings2, Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Flow {
  id: string
  name: string
  description: string | null
  trigger: string
  enabled: boolean
  nodes: number
  lastRun: string | null
  runCount: number
  createdAt: string
}

const TRIGGER_META: Record<string, { label: string; icon: any; cls: string }> = {
  schedule: { label: 'Schedule', icon: Clock, cls: 'bg-sky-500/15 text-sky-400 ring-sky-500/30' },
  'device-event': { label: 'Device Event', icon: Cpu, cls: 'bg-violet-500/15 text-violet-400 ring-violet-500/30' },
  alarm: { label: 'Alarm', icon: AlertTriangle, cls: 'bg-rose-500/15 text-rose-400 ring-rose-500/30' },
  threshold: { label: 'Threshold', icon: Gauge, cls: 'bg-amber-500/15 text-amber-400 ring-amber-500/30' },
  manual: { label: 'Manual', icon: Hand, cls: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30' },
}

type NodeType = 'trigger' | 'condition' | 'action' | 'output'

const NODE_STYLE: Record<NodeType, { cls: string; ring: string; icon: any }> = {
  trigger: { cls: 'bg-sky-500/10 text-sky-300', ring: 'ring-sky-500/40', icon: Zap },
  condition: { cls: 'bg-amber-500/10 text-amber-300', ring: 'ring-amber-500/40', icon: GitBranch },
  action: { cls: 'bg-emerald-500/10 text-emerald-300', ring: 'ring-emerald-500/40', icon: Cpu },
  output: { cls: 'bg-violet-500/10 text-violet-300', ring: 'ring-violet-500/40', icon: FileBarChart },
}

interface FlowNode {
  type: NodeType
  title: string
  sub: string
}

// Example visual pipelines (Node-RED-like) — invented from real industrial scenarios
const EXAMPLE_FLOWS: { id: string; name: string; description: string; trigger: string; nodes: FlowNode[] }[] = [
  {
    id: 'ex-peak',
    name: 'Peak Shaving',
    description: 'Shed non-critical loads when plant power demand crosses the demand-response threshold.',
    trigger: 'threshold',
    nodes: [
      { type: 'trigger', title: 'Threshold', sub: 'kW > 450' },
      { type: 'condition', title: 'Time Window', sub: 'peak 17:00–21:00' },
      { type: 'action', title: 'Shed Loads', sub: 'HVAC · lighting zone 3' },
      { type: 'action', title: 'Notify', sub: 'facilities + Slack' },
      { type: 'output', title: 'Log Event', sub: 'audit + timeseries' },
    ],
  },
  {
    id: 'ex-predictive',
    name: 'Predictive Maintenance',
    description: 'Trigger a work order when vibration RMS trend crosses the AI-scored anomaly band.',
    trigger: 'device-event',
    nodes: [
      { type: 'trigger', title: 'Device Event', sub: 'vibration RMS' },
      { type: 'condition', title: 'AI Score', sub: '> 0.82 anomaly' },
      { type: 'action', title: 'Create Work Order', sub: 'assign to maintenance' },
      { type: 'output', title: 'CMMS Sync', sub: 'SAP PM export' },
    ],
  },
  {
    id: 'ex-night',
    name: 'Night Setback',
    description: 'Schedule-driven setpoint adjustment across cooling & lighting outside production hours.',
    trigger: 'schedule',
    nodes: [
      { type: 'trigger', title: 'Schedule', sub: '22:00 daily' },
      { type: 'condition', title: 'Shift Active?', sub: 'invert: not running' },
      { type: 'action', title: 'Setback HVAC', sub: 'setpoint +3°C' },
      { type: 'action', title: 'Dim Lights', sub: 'zone 1–4 → 20%' },
      { type: 'output', title: 'Energy Log', sub: 'kWh savings' },
    ],
  },
]

export function AutomationView() {
  const [flows, setFlows] = useState<Flow[] | null>(null)
  const [selected, setSelected] = useState<Flow | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [nf, setNf] = useState({ name: '', trigger: 'threshold', description: '' })

  useEffect(() => {
    fetch('/api/indos/automation').then(r => r.json()).then(setFlows).catch(() => setFlows([]))
  }, [])

  const kpis = useMemo(() => {
    if (!flows) return null
    const enabled = flows.filter(f => f.enabled).length
    const disabled = flows.length - enabled
    const runs = flows.reduce((s, f) => s + f.runCount, 0)
    const byType: Record<string, number> = {}
    for (const f of flows) byType[f.trigger] = (byType[f.trigger] || 0) + 1
    return { total: flows.length, enabled, disabled, runs, byType }
  }, [flows])

  function toggleFlow(f: Flow) {
    setFlows(prev => prev ? prev.map(x => x.id === f.id ? { ...x, enabled: !x.enabled } : x) : prev)
    toast(f.enabled ? 'Flow disabled' : 'Flow enabled', { description: f.name })
  }

  function createFlow() {
    if (!nf.name.trim()) {
      toast.error('Flow name required')
      return
    }
    setCreating(true)
    setTimeout(() => {
      const flow: Flow = {
        id: 'local-' + Math.random().toString(36).slice(2, 9),
        name: nf.name.trim(),
        description: nf.description.trim() || null,
        trigger: nf.trigger,
        enabled: true,
        nodes: 3,
        lastRun: null,
        runCount: 0,
        createdAt: new Date().toISOString(),
      }
      setFlows(prev => [flow, ...(prev || [])])
      setCreating(false)
      setNewOpen(false)
      setNf({ name: '', trigger: 'threshold', description: '' })
      toast.success('Flow created', { description: `${flow.name} — draft pipeline ready to wire` })
    }, 600)
  }

  const scheduledFlows = useMemo(() => {
    // invented 24h schedule markers for visual scheduler
    const all = flows ?? []
    const seed = [
      { hour: 6, name: 'Morning warmup', trigger: 'schedule' },
      { hour: 8, name: 'Shift handover report', trigger: 'schedule' },
      { hour: 12, name: 'Midday OEE snapshot', trigger: 'schedule' },
      { hour: 17, name: 'Peak shaving arm', trigger: 'threshold' },
      { hour: 22, name: 'Night setback', trigger: 'schedule' },
    ]
    if (all.length === 0) return seed
    return seed.concat(
      all.filter(f => f.trigger === 'schedule' && f.enabled).slice(0, 4).map((f, i) => ({
        hour: (7 + i * 3) % 24,
        name: f.name,
        trigger: f.trigger,
      })),
    )
  }, [flows])

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <ViewHeader
        title="Automation & Rules Engine"
        description="Visual flow builder for industrial automations — triggers, conditions, actions & outputs wired across the fleet."
        icon={<Workflow className="h-5 w-5" />}
        actions={
          <Button size="sm" className="h-8 gap-1.5" onClick={() => setNewOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> New Flow
          </Button>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard label="Total Flows" value={kpis ? kpis.total : '—'} icon={Workflow} accent="sky" hint="across all projects" />
        <KpiCard label="Enabled" value={kpis ? kpis.enabled : '—'} icon={Play} accent="emerald" hint={kpis ? `${kpis.disabled} disabled` : ''} />
        <KpiCard label="Total Runs" value={kpis ? kpis.runs.toLocaleString() : '—'} icon={Activity} accent="amber" delta={4.1} hint="cumulative executions" />
        <KpiCard label="Trigger Types" value={kpis ? Object.keys(kpis.byType).length : '—'} icon={GitBranch} accent="violet" hint="rules engine sources" />
      </div>

      {/* Flow canvas (Node-RED style) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <GitBranch className="h-4 w-4 text-primary" /> Flow Canvas
            </CardTitle>
            <CardDescription className="text-xs">Visual pipelines · trigger → condition → action → output</CardDescription>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <LegendDot cls="bg-sky-500" label="Trigger" />
            <LegendDot cls="bg-amber-500" label="Condition" />
            <LegendDot cls="bg-emerald-500" label="Action" />
            <LegendDot cls="bg-violet-500" label="Output" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ScrollArea className="indos-scroll">
            <div className="space-y-3">
              {EXAMPLE_FLOWS.map(flow => (
                <FlowPipeline key={flow.id} flow={flow} />
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Bottom grid: flows list + rules engine + scheduler */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Flows list */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Layers className="h-4 w-4 text-amber-400" /> Active Flows
              </CardTitle>
              <CardDescription className="text-xs">{kpis ? `${kpis.enabled} of ${kpis.total} enabled` : 'loading…'}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {!flows ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-md" />)}
              </div>
            ) : flows.length === 0 ? (
              <div className="py-10 text-center text-xs text-muted-foreground">
                No flows yet. Create your first automation pipeline.
              </div>
            ) : (
              <ScrollArea className="indos-scroll max-h-[420px] pr-2">
                <div className="space-y-2">
                  {flows.map(f => (
                    <FlowRow key={f.id} flow={f} onToggle={toggleFlow} onOpen={setSelected} />
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Right column: rules engine + scheduler */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings2 className="h-4 w-4 text-violet-400" /> Rules Engine
              </CardTitle>
              <CardDescription className="text-xs">Triggers by source type</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {kpis ? (
                Object.entries(TRIGGER_META).map(([key, meta]) => {
                  const count = kpis.byType[key] || 0
                  const pct = kpis.total ? (count / kpis.total) * 100 : 0
                  return (
                    <div key={key} className="flex items-center gap-2.5 rounded-md border border-border/60 bg-card/40 p-2.5">
                      <div className={cn('rounded-md p-1.5 ring-1', meta.cls)}>
                        <meta.icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium">{meta.label}</span>
                          <span className="text-xs tnum text-muted-foreground">{count}</span>
                        </div>
                        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted/40">
                          <div className={cn('h-full rounded-full', meta.cls.split(' ')[0].replace('/15', '/60'))} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-12 w-full rounded-md" />)}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="h-4 w-4 text-sky-400" /> Scheduler
              </CardTitle>
              <CardDescription className="text-xs">24h strip · scheduled flows</CardDescription>
            </CardHeader>
            <CardContent>
              <SchedulerStrip items={scheduledFlows} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Flow detail dialog */}
      <Dialog open={!!selected} onOpenChange={o => setSelected(o ? selected : null)}>
        <DialogContent className="sm:max-w-[560px]">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Workflow className="h-4 w-4 text-primary" /> {selected.name}
                </DialogTitle>
                <DialogDescription>{selected.description || 'No description provided.'}</DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Trigger" value={TRIGGER_META[selected.trigger]?.label ?? selected.trigger} />
                <Stat label="Nodes" value={String(selected.nodes)} />
                <Stat label="Runs" value={selected.runCount.toLocaleString()} />
                <Stat label="Enabled" value={selected.enabled ? 'Yes' : 'No'} />
              </div>

              <div className="space-y-2 rounded-md border border-border/60 bg-card/40 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Last run</p>
                <p className="text-xs">{selected.lastRun ? new Date(selected.lastRun).toLocaleString('en-GB', { hour12: false }) : 'Never executed'}</p>
              </div>

              <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2.5 text-xs text-emerald-300">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Open in visual flow editor (drag nodes, wire triggers, simulate runs).</span>
              </div>
            </>
          )}
          <DialogFooter className="gap-2">
            <DialogClose asChild><Button variant="outline" size="sm">Close</Button></DialogClose>
            <Button size="sm" className="gap-1.5" onClick={() => { toast('Manual run queued', { description: selected?.name }); }}>
              <Play className="h-3.5 w-3.5" /> Run Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Flow dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-primary" /> New Automation Flow
            </DialogTitle>
            <DialogDescription>Define a new pipeline. You can wire nodes in the visual editor after creation.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Flow name</Label>
              <Input value={nf.name} onChange={e => setNf(s => ({ ...s, name: e.target.value }))} placeholder="e.g. Compressor surge protection" className="h-9" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Trigger type</Label>
              <Select value={nf.trigger} onValueChange={v => setNf(s => ({ ...s, trigger: v }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TRIGGER_META).map(([k, m]) => (
                    <SelectItem key={k} value={k}>
                      <span className="flex items-center gap-2"><m.icon className="h-3.5 w-3.5" /> {m.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Description</Label>
              <Textarea value={nf.description} onChange={e => setNf(s => ({ ...s, description: e.target.value }))} rows={3} placeholder="What does this automation do?" className="text-xs" />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <DialogClose asChild><Button variant="outline" size="sm" disabled={creating}>Cancel</Button></DialogClose>
            <Button size="sm" onClick={createFlow} disabled={creating}>
              {creating ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Creating…</> : <><Plus className="h-3.5 w-3.5" /> Create Flow</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FlowPipeline({ flow }: { flow: { id: string; name: string; description: string; trigger: string; nodes: FlowNode[] } }) {
  const meta = TRIGGER_META[flow.trigger]
  return (
    <div className="rounded-md border border-border/60 bg-card/30 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{flow.name}</span>
          {meta && (
            <Badge variant="outline" className={cn('ring-1', meta.cls)}>
              <meta.icon className="mr-1 h-3 w-3" /> {meta.label}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => toast('Simulating flow…', { description: flow.name })}>
            <Play className="h-3 w-3" /> Simulate
          </Button>
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs">
            <Settings2 className="h-3 w-3" /> Edit
          </Button>
        </div>
      </div>
      <p className="mb-3 text-[11px] text-muted-foreground">{flow.description}</p>
      <div className="flex items-stretch gap-0 overflow-x-auto pb-1">
        {flow.nodes.map((n, i) => {
          const st = NODE_STYLE[n.type]
          const Icon = st.icon
          return (
            <div key={i} className="flex items-stretch">
              <div className={cn('flex w-[140px] shrink-0 flex-col rounded-md border bg-background/60 p-2.5 ring-1', st.ring)}>
                <div className="mb-1 flex items-center justify-between">
                  <div className={cn('rounded p-1', st.cls)}><Icon className="h-3 w-3" /></div>
                  <span className={cn('text-[9px] font-semibold uppercase tracking-wide', st.cls)}>{n.type}</span>
                </div>
                <p className="text-xs font-medium leading-tight">{n.title}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{n.sub}</p>
              </div>
              {i < flow.nodes.length - 1 && (
                <div className="flex items-center px-1">
                  <ArrowRight className={cn('h-4 w-4', st.ring.replace('ring-', 'text-').replace('/40', '/60'))} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function FlowRow({ flow, onToggle, onOpen }: { flow: Flow; onToggle: (f: Flow) => void; onOpen: (f: Flow) => void }) {
  const meta = TRIGGER_META[flow.trigger]
  const Icon = meta?.icon ?? Zap
  return (
    <div className={cn('rounded-md border border-border/60 bg-card/40 p-3 transition-colors', !flow.enabled && 'opacity-60')}>
      <div className="flex items-start justify-between gap-2">
        <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(flow)}>
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{flow.name}</span>
            <Badge variant="outline" className={cn('shrink-0 ring-1', meta?.cls ?? 'bg-slate-500/15 text-slate-400 ring-slate-500/30')}>
              <Icon className="mr-1 h-3 w-3" /> {meta?.label ?? flow.trigger}
            </Badge>
          </div>
          <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{flow.description || 'No description'}</p>
        </button>
        <Switch checked={flow.enabled} onCheckedChange={() => onToggle(flow)} />
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Layers className="h-3 w-3" /> {flow.nodes} nodes</span>
        <span className="inline-flex items-center gap-1"><Activity className="h-3 w-3" /> {flow.runCount.toLocaleString()} runs</span>
        <span className="inline-flex items-center gap-1">
          <Timer className="h-3 w-3" /> {flow.lastRun ? new Date(flow.lastRun).toLocaleString('en-GB', { hour12: false, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never'}
        </span>
        {flow.enabled ? (
          <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-3 w-3" /> active</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-amber-400"><Pause className="h-3 w-3" /> paused</span>
        )}
      </div>
    </div>
  )
}

function SchedulerStrip({ items }: { items: { hour: number; name: string; trigger: string }[] }) {
  const hours = Array.from({ length: 24 }, (_, i) => i)
  return (
    <div>
      <div className="relative flex justify-between gap-0.5">
        {hours.map(h => {
          const hits = items.filter(it => it.hour === h)
          return (
            <div key={h} className="group relative flex-1">
              <div className={cn(
                'flex h-8 items-end justify-center rounded-sm border-b',
                h % 6 === 0 ? 'border-border/60 bg-muted/40' : 'border-border/30 bg-muted/20',
              )}>
                {hits.length > 0 && (
                  <div className="mb-0.5 h-1.5 w-1.5 rounded-full bg-sky-400 ring-2 ring-sky-400/30" />
                )}
              </div>
              {h % 6 === 0 && (
                <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] text-muted-foreground">{String(h).padStart(2, '0')}</span>
              )}
            </div>
          )
        })}
      </div>
      <div className="mt-6 space-y-1.5">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-2 text-[11px]">
            <span className="w-10 shrink-0 font-mono text-sky-400">{String(it.hour).padStart(2, '0')}:00</span>
            <span className="min-w-0 flex-1 truncate">{it.name}</span>
            <Badge variant="outline" className="shrink-0 bg-muted/40 text-[9px]">{TRIGGER_META[it.trigger]?.label ?? it.trigger}</Badge>
          </div>
        ))}
      </div>
    </div>
  )
}

function LegendDot({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
      <span className={cn('h-2 w-2 rounded-full', cls)} /> {label}
    </span>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-card/40 p-2.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  )
}
