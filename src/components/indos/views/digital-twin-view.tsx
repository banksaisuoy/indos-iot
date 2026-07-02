'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRealtime } from '@/lib/indos/realtime'
import { KpiCard } from '@/components/indos/shared/kpi-card'
import { ViewHeader } from '@/components/indos/shared/view-header'
import { StatusBadge } from '@/components/indos/shared/status-badge'
import { LiveDot } from '@/components/indos/shared/charts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Network, Factory, Building2, Boxes, Cpu, CircuitBoard, ChevronRight, ChevronDown,
  Activity, Thermometer, Vibrate, Gauge, Power, ShieldAlert, Wifi, Settings2,
  Crosshair, Layers, Server, Radar,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types for /api/indos/topology ────────────────────────────────────────
interface TDevice { id: string; name: string; type: string; status: string; metric?: string | null }
interface TMachine { id: string; name: string; status: string; oee: number; availability?: number; performance?: number; quality?: number; model?: string | null; manufacturer?: string | null; serial?: string | null; devices: TDevice[] }
interface TLine { id: string; name: string; machines: TMachine[] }
interface TBuilding { id: string; name: string; lines: TLine[] }
interface TFactory { id: string; name: string; location?: string | null; buildings: TBuilding[] }
interface TProject { id: string; name: string; slug: string; category?: string; factories: TFactory[] }
interface FlatProject { id: string; name: string; slug: string; category?: string; _count: { devices: number } }
interface Topology { hierarchical: TProject[]; flat: FlatProject[] }

type NodeKind = 'project' | 'factory' | 'building' | 'line' | 'machine' | 'device'
interface Crumb { kind: NodeKind; name: string }
interface SelectedMachine {
  project: string
  factory: string
  building: string
  line: string
  machine: TMachine
  crumbs: Crumb[]
}

const STATUS_DOT: Record<string, string> = {
  running: 'bg-emerald-400', online: 'bg-emerald-400',
  idle: 'bg-sky-400', maintenance: 'bg-amber-400',
  fault: 'bg-rose-400', offline: 'bg-slate-500',
}

function statusDot(s: string) { return STATUS_DOT[s] || 'bg-slate-500' }

// ─── Counts (recursive) ──────────────────────────────────────────────────
function countAll(top: Topology) {
  let f = 0, b = 0, l = 0, m = 0, d = 0
  for (const p of top.hierarchical) {
    for (const fac of p.factories) {
      f++
      for (const bld of fac.buildings) {
        b++
        for (const ln of bld.lines) {
          l++
          for (const mac of ln.machines) {
            m++
            d += mac.devices.length
          }
        }
      }
    }
  }
  for (const fp of top.flat) d += fp._count.devices
  return { factories: f, buildings: b, lines: l, machines: m, devices: d }
}

// ─── Main component ──────────────────────────────────────────────────────
export function DigitalTwinView() {
  const rt = useRealtime()
  const [top, setTop] = useState<Topology | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<SelectedMachine | null>(null)

  useEffect(() => {
    fetch('/api/indos/topology').then(r => r.json()).then((d: Topology) => {
      setTop(d)
      // expand the first project + first factory by default
      const first = d.hierarchical[0]
      if (first) {
        const s = new Set<string>([first.id])
        if (first.factories[0]) {
          s.add(first.factories[0].id)
          if (first.factories[0].buildings[0]) {
            s.add(first.factories[0].buildings[0].id)
            const ln = first.factories[0].buildings[0].lines[0]
            if (ln) {
              s.add(ln.id)
              const mac = ln.machines[0]
              if (mac) {
                s.add(mac.id)
                setSelected({
                  project: first.name, factory: first.factories[0].name,
                  building: first.factories[0].buildings[0].name, line: ln.name,
                  machine: mac,
                  crumbs: [
                    { kind: 'project', name: first.name },
                    { kind: 'factory', name: first.factories[0].name },
                    { kind: 'building', name: first.factories[0].buildings[0].name },
                    { kind: 'line', name: ln.name },
                    { kind: 'machine', name: mac.name },
                  ],
                })
              }
            }
          }
        }
        setExpanded(s)
      }
    }).catch(() => {})
  }, [])

  const counts = useMemo(() => top ? countAll(top) : null, [top])

  const toggle = (id: string) => {
    setExpanded(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  const selectMachine = (crumbs: Crumb[], machine: TMachine) => {
    setSelected({
      project: crumbs[0].name, factory: crumbs[1].name,
      building: crumbs[2].name, line: crumbs[3].name,
      machine, crumbs: [...crumbs, { kind: 'machine', name: machine.name }],
    })
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <ViewHeader
        title="Digital Twin"
        description="Live spatial hierarchy of organizations, sites, lines and machines with SCADA-grade inspection."
        icon={<Network className="h-5 w-5" />}
        actions={
          <>
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <LiveDot color="bg-emerald-400" /> LIVE TWIN
            </Badge>
            <Button size="sm" variant="outline" className="h-8 gap-1.5">
              <Layers className="h-3.5 w-3.5" /> 3D View
            </Button>
          </>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <KpiCard label="Factories" value={counts?.factories ?? '—'} icon={Factory} accent="emerald" hint="across all projects" />
        <KpiCard label="Buildings" value={counts?.buildings ?? '—'} icon={Building2} accent="sky" hint="monitored structures" />
        <KpiCard label="Production Lines" value={counts?.lines ?? '—'} icon={Boxes} accent="violet" hint="active assemblies" />
        <KpiCard label="Machines" value={counts?.machines ?? '—'} icon={Cpu} accent="amber" hint="twin-enabled assets" />
        <KpiCard label="Devices" value={counts?.devices ?? '—'} icon={CircuitBoard} accent="rose" hint="sensors & controllers" />
      </div>

      {/* Main grid: tree + detail */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {/* Tree panel */}
        <Card className="flex h-[640px] flex-col overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border/60 px-4 py-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Network className="h-4 w-4 text-primary" /> Asset Hierarchy
              </CardTitle>
              <CardDescription className="text-xs">Project → Factory → Building → Line → Machine → Device</CardDescription>
            </div>
            <Badge variant="outline" className="text-[10px]">{top?.hierarchical.length ?? 0} roots</Badge>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0">
            {!top ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}
              </div>
            ) : (
              <ScrollArea className="indos-scroll h-full">
                <div className="p-2">
                  {top.hierarchical.map(p => (
                    <ProjectNode
                      key={p.id}
                      project={p}
                      expanded={expanded}
                      toggle={toggle}
                      selected={selected?.machine.id ?? null}
                      onSelect={selectMachine}
                    />
                  ))}
                  {top.flat.length > 0 && (
                    <>
                      <div className="mt-3 flex items-center gap-2 px-2 py-1.5">
                        <Separator className="flex-1" />
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Flat Projects</span>
                        <Separator className="flex-1" />
                      </div>
                      <div className="space-y-1 px-1">
                        {top.flat.map(fp => (
                          <div key={fp.id} className="flex items-center gap-2 rounded-md border border-border/40 bg-card/40 px-2.5 py-2">
                            <Factory className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="flex-1 truncate text-xs font-medium">{fp.name}</span>
                            <Badge variant="outline" className="text-[10px]">{fp._count.devices} devices</Badge>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Detail panel */}
        <Card className="flex h-[640px] flex-col overflow-hidden">
          {selected ? (
            <ScadaPanel sel={selected} telemetry={rt.telemetry} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {top ? 'Select a machine from the hierarchy to inspect its digital twin.' : 'Loading topology…'}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

// ─── Tree nodes ──────────────────────────────────────────────────────────
function ProjectNode({ project, expanded, toggle, selected, onSelect }: {
  project: TProject
  expanded: Set<string>
  toggle: (id: string) => void
  selected: string | null
  onSelect: (crumbs: Crumb[], machine: TMachine) => void
}) {
  const open = expanded.has(project.id)
  const deviceCount = project.factories.reduce((a, f) => a + f.buildings.reduce((b, bld) => b + bld.lines.reduce((c, l) => c + l.machines.reduce((d, m) => d + m.devices.length, 0), 0), 0), 0)
  return (
    <div className="space-y-0.5">
      <Row
        depth={0}
        icon={Factory}
        iconColor="text-emerald-400"
        name={project.name}
        sub={project.category}
        count={project.factories.length}
        countLabel="factories"
        open={open}
        hasChildren={project.factories.length > 0}
        onToggle={() => toggle(project.id)}
        dotColor="bg-emerald-400"
      />
      {open && (
        <div>
          {project.factories.map(f => (
            <FactoryNode key={f.id} factory={f} expanded={expanded} toggle={toggle} selected={selected}
              onSelect={(c, m) => onSelect([{ kind: 'project', name: project.name }, ...c], m)}
              crumbs={[{ kind: 'project', name: project.name }]} />
          ))}
          {project.factories.length === 0 && (
            <div className="py-1 pl-7 text-[11px] text-muted-foreground">No factories</div>
          )}
        </div>
      )}
      {deviceCount > 0 && (
        <div className="pb-1 pl-7 text-[10px] text-muted-foreground/60">{deviceCount} devices linked</div>
      )}
    </div>
  )
}

function FactoryNode({ factory, expanded, toggle, selected, onSelect, crumbs }: {
  factory: TFactory
  expanded: Set<string>
  toggle: (id: string) => void
  selected: string | null
  onSelect: (c: Crumb[], m: TMachine) => void
  crumbs: Crumb[]
}) {
  const open = expanded.has(factory.id)
  const bcount = factory.buildings.length
  return (
    <div>
      <Row
        depth={1}
        icon={Building2}
        iconColor="text-sky-400"
        name={factory.name}
        sub={factory.location ?? undefined}
        count={bcount}
        countLabel="bldgs"
        open={open}
        hasChildren={bcount > 0}
        onToggle={() => toggle(factory.id)}
        dotColor="bg-sky-400"
      />
      {open && factory.buildings.map(b => (
        <BuildingNode key={b.id} building={b} expanded={expanded} toggle={toggle} selected={selected}
          onSelect={(c, m) => onSelect([...crumbs, { kind: 'factory', name: factory.name }], m)}
          crumbs={[...crumbs, { kind: 'factory', name: factory.name }]} />
      ))}
    </div>
  )
}

function BuildingNode({ building, expanded, toggle, selected, onSelect, crumbs }: {
  building: TBuilding
  expanded: Set<string>
  toggle: (id: string) => void
  selected: string | null
  onSelect: (c: Crumb[], m: TMachine) => void
  crumbs: Crumb[]
}) {
  const open = expanded.has(building.id)
  return (
    <div>
      <Row
        depth={2}
        icon={Building2}
        iconColor="text-violet-400"
        name={building.name}
        count={building.lines.length}
        countLabel="lines"
        open={open}
        hasChildren={building.lines.length > 0}
        onToggle={() => toggle(building.id)}
        dotColor="bg-violet-400"
      />
      {open && building.lines.map(l => (
        <LineNode key={l.id} line={l} expanded={expanded} toggle={toggle} selected={selected}
          onSelect={(c, m) => onSelect([...crumbs, { kind: 'building', name: building.name }], m)}
          crumbs={[...crumbs, { kind: 'building', name: building.name }]} />
      ))}
    </div>
  )
}

function LineNode({ line, expanded, toggle, selected, onSelect, crumbs }: {
  line: TLine
  expanded: Set<string>
  toggle: (id: string) => void
  selected: string | null
  onSelect: (c: Crumb[], m: TMachine) => void
  crumbs: Crumb[]
}) {
  const open = expanded.has(line.id)
  return (
    <div>
      <Row
        depth={3}
        icon={Boxes}
        iconColor="text-amber-400"
        name={line.name}
        count={line.machines.length}
        countLabel="machines"
        open={open}
        hasChildren={line.machines.length > 0}
        onToggle={() => toggle(line.id)}
        dotColor="bg-amber-400"
      />
      {open && line.machines.map(m => (
        <MachineNode key={m.id} machine={m} expanded={expanded} toggle={toggle} selected={selected}
          onSelect={() => onSelect([...crumbs, { kind: 'line', name: line.name }], m)}
          isExpanded={expanded.has(m.id)} />
      ))}
    </div>
  )
}

function MachineNode({ machine, expanded, toggle, selected, onSelect, isExpanded }: {
  machine: TMachine
  expanded: Set<string>
  toggle: (id: string) => void
  selected: string | null
  onSelect: () => void
  isExpanded: boolean
}) {
  const isSel = selected === machine.id
  return (
    <div>
      <button
        onClick={onSelect}
        className={cn(
          'group flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-xs transition-colors',
          isSel ? 'bg-primary/12 ring-1 ring-primary/30' : 'hover:bg-sidebar-accent/50'
        )}
        style={{ paddingLeft: 4 + 4 * 14 }}
      >
        <span onClick={(e) => { e.stopPropagation(); toggle(machine.id) }} className="flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-sidebar-accent">
          {machine.devices.length > 0 ? (isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />) : null}
        </span>
        <Cpu className={cn('h-3.5 w-3.5 shrink-0', isSel ? 'text-primary' : 'text-rose-400')} />
        <span className={cn('truncate flex-1', isSel && 'font-medium text-primary')}>{machine.name}</span>
        <Badge variant="outline" className="ml-1 h-4 gap-1 px-1 text-[9px] tnum" >
          <Gauge className="h-2.5 w-2.5" /> {machine.oee.toFixed(0)}%
        </Badge>
        <StatusBadge status={machine.status} className="h-4 px-1.5 text-[9px]" />
      </button>
      {isExpanded && machine.devices.length > 0 && (
        <div className="space-y-0.5 pb-1">
          {machine.devices.map(d => (
            <div key={d.id} className="flex items-center gap-2 rounded px-2 py-1 text-[11px] hover:bg-sidebar-accent/40"
              style={{ marginLeft: 4 + 5 * 14 + 8 }}>
              <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', statusDot(d.status))} />
              <span className="truncate flex-1 text-muted-foreground">{d.name}</span>
              <span className="text-[10px] uppercase text-muted-foreground/70">{d.type}</span>
              <span className={cn('text-[9px] font-medium uppercase', statusDot(d.status).replace('bg-', 'text-'))}>{d.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Row({ depth, icon: Icon, iconColor, name, sub, count, countLabel, open, hasChildren, onToggle, dotColor }: {
  depth: number
  icon: React.ComponentType<{ className?: string }>
  iconColor: string
  name: string
  sub?: string
  count: number
  countLabel: string
  open: boolean
  hasChildren: boolean
  onToggle: () => void
  dotColor: string
}) {
  return (
    <button
      onClick={onToggle}
      disabled={!hasChildren}
      className={cn(
        'group flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-xs transition-colors',
        hasChildren ? 'hover:bg-sidebar-accent/50 cursor-pointer' : 'cursor-default'
      )}
      style={{ paddingLeft: 4 + depth * 14 }}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
        {hasChildren ? (open ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />) : null}
      </span>
      <Icon className={cn('h-3.5 w-3.5 shrink-0', iconColor)} />
      <span className="truncate flex-1 font-medium">{name}</span>
      {sub && <span className="hidden truncate text-[10px] text-muted-foreground/70 sm:inline">{sub}</span>}
      <span className={cn('h-1.5 w-1.5 rounded-full', dotColor)} />
      <Badge variant="outline" className="h-4 px-1.5 text-[9px] tnum">{count} {countLabel}</Badge>
    </button>
  )
}

// ─── SCADA detail panel ──────────────────────────────────────────────────
function ScadaPanel({ sel, telemetry }: { sel: SelectedMachine; telemetry: Record<string, any> }) {
  const { machine, crumbs } = sel
  // Tick live values
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1400)
    return () => clearInterval(id)
  }, [])

  // Pick a base from OEE / status, then add small jitter
  const baseRpm = machine.status === 'running' ? 2400 : machine.status === 'idle' ? 600 : 0
  const rpm = baseRpm + (tick * 7 + 13) % 90 - 45
  const temp = (machine.status === 'running' ? 68 : 38) + ((tick * 3) % 9) - 4 + Math.sin(tick / 3) * 2
  const vib = (machine.status === 'running' ? 4.2 : 1.1) + Math.sin(tick / 2) * 0.6 + ((tick * 5) % 7) / 10
  const output = machine.status === 'running' ? 120 + (tick * 11) % 18 : machine.status === 'idle' ? 12 : 0
  const power = machine.status === 'running' ? 8.4 + Math.sin(tick / 4) * 0.5 : machine.status === 'idle' ? 1.2 : 0

  // try to use a real telemetry value if available
  const realTel = Object.values(telemetry).find((t: any) => machine.devices.some(d => d.id === t.deviceId)) as any | undefined

  const LIGHT_HEX: Record<string, string> = {
    'bg-emerald-400': '#34d399',
    'bg-amber-400': '#fbbf24',
    'bg-rose-400': '#fb7185',
    'bg-sky-400': '#38bdf8',
  }
  const statusLight = (label: string, on: boolean, color: string) => (
    <div className="flex flex-col items-center gap-1">
      <span
        className={cn('h-2.5 w-2.5 rounded-full ring-2 ring-offset-1 ring-offset-card', on ? color : 'bg-slate-700 ring-slate-700/40', on && 'pulse-dot')}
        style={on ? { color: LIGHT_HEX[color] || '#34d399' } : undefined}
      />
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  )

  return (
    <div className="flex h-full flex-col">
      {/* Header with breadcrumbs */}
      <div className="border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground overflow-x-auto indos-scroll pb-1">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1.5 whitespace-nowrap">
              {i > 0 && <ChevronRight className="h-3 w-3" />}
              <span className={cn(i === crumbs.length - 1 ? 'font-medium text-foreground' : '')}>{c.name}</span>
            </span>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Cpu className="h-4 w-4 text-primary" />
              <span className="truncate">{machine.name}</span>
            </CardTitle>
            <CardDescription className="text-xs">
              {[machine.manufacturer, machine.model, machine.serial && `SN: ${machine.serial}`].filter(Boolean).join(' · ') || 'Industrial asset'}
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StatusBadge status={machine.status} />
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <LiveDot color="bg-emerald-400" /> TWIN SYNC
            </Badge>
          </div>
        </div>
      </div>

      {/* OEE strip */}
      <div className="grid grid-cols-4 gap-px border-b border-border/60 bg-border/40">
        {[
          { label: 'OEE', val: machine.oee, color: 'text-primary' },
          { label: 'Avail.', val: machine.availability ?? machine.oee * 0.95, color: 'text-sky-400' },
          { label: 'Perf.', val: machine.performance ?? machine.oee * 1.02, color: 'text-amber-400' },
          { label: 'Quality', val: machine.quality ?? 99.1, color: 'text-emerald-400' },
        ].map(s => (
          <div key={s.label} className="bg-card px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
            <p className={cn('text-lg font-semibold tnum', s.color)}>{s.val.toFixed(1)}%</p>
          </div>
        ))}
      </div>

      {/* Schematic */}
      <div className="flex-1 overflow-y-auto indos-scroll p-4">
        <div className="relative overflow-hidden rounded-lg border border-border/60 bg-background/60 p-4">
          {/* corner labels */}
          <div className="pointer-events-none absolute left-2 top-2 text-[9px] font-mono uppercase tracking-widest text-muted-foreground/50">SCADA · HMI</div>
          <div className="pointer-events-none absolute right-2 top-2 flex items-center gap-1 text-[9px] font-mono text-muted-foreground/50">
            <Radar className="h-2.5 w-2.5" /> {new Date().toLocaleTimeString('en-GB', { hour12: false })}
          </div>

          {/* The machine schematic */}
          <div className="mt-5 grid grid-cols-12 gap-3">
            {/* Motor block */}
            <div className="col-span-12 sm:col-span-5 rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-amber-400">
                  <Activity className="h-3 w-3" /> Drive Motor
                </span>
                <span className="text-[9px] font-mono text-muted-foreground">M-01</span>
              </div>
              <div className="flex items-center justify-center py-3">
                <div className="relative h-24 w-24">
                  {/* stator ring */}
                  <div className="absolute inset-0 rounded-full border-4 border-amber-500/30" />
                  <div className="absolute inset-2 rounded-full border-2 border-amber-500/20" />
                  {/* rotor */}
                  <div
                    className="absolute inset-3 rounded-full border-2 border-dashed border-amber-400/60"
                    style={{ animation: machine.status === 'running' ? 'spin 1.2s linear infinite' : machine.status === 'idle' ? 'spin 4s linear infinite' : 'none' }}
                  >
                    <div className="absolute left-1/2 top-0 h-3 w-1 -translate-x-1/2 rounded-full bg-amber-400" />
                  </div>
                  {/* center */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10 ring-1 ring-amber-500/40">
                      <span className="text-[10px] font-mono font-semibold text-amber-400 tnum">{Math.max(0, rpm)}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">RPM</span>
                <span className="font-mono font-semibold text-amber-400 tnum">{rpm.toFixed(0)}</span>
              </div>
            </div>

            {/* Temperature gauge */}
            <div className="col-span-6 sm:col-span-3 rounded-md border border-rose-500/20 bg-rose-500/5 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-rose-400">
                <Thermometer className="h-3 w-3" /> Temp
              </div>
              <div className="flex flex-col items-center gap-1 py-2">
                <div className="relative h-20 w-6 rounded-full bg-rose-500/10 ring-1 ring-rose-500/20">
                  <div
                    className="absolute bottom-0 left-0 right-0 rounded-full bg-gradient-to-t from-rose-500 to-rose-300 transition-all"
                    style={{ height: `${Math.min(100, Math.max(0, (temp - 20) / 60 * 100))}%` }}
                  />
                  {/* tick marks */}
                  {[25, 50, 75].map(p => (
                    <div key={p} className="absolute left-full ml-0.5 text-[7px] text-muted-foreground" style={{ bottom: `${p}%` }}>—</div>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">°C</span>
                <span className="font-mono font-semibold text-rose-400 tnum">{temp.toFixed(1)}</span>
              </div>
            </div>

            {/* Vibration bars */}
            <div className="col-span-6 sm:col-span-4 rounded-md border border-sky-500/20 bg-sky-500/5 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-sky-400">
                <Vibrate className="h-3 w-3" /> Vibration
              </div>
              <div className="flex h-20 items-end justify-around gap-1 py-2">
                {Array.from({ length: 12 }).map((_, i) => {
                  const h = machine.status === 'running'
                    ? 30 + Math.abs(Math.sin((tick + i) / 2)) * 60 + (i % 3) * 5
                    : machine.status === 'idle' ? 15 + Math.abs(Math.sin((tick + i) / 3)) * 20 : 4
                  return (
                    <div key={i} className="flex-1 rounded-t bg-gradient-to-t from-sky-500/40 to-sky-300 transition-all" style={{ height: `${Math.min(100, h)}%` }} />
                  )
                })}
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">mm/s RMS</span>
                <span className="font-mono font-semibold text-sky-400 tnum">{vib.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Conveyor + output */}
          <div className="mt-3 rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-emerald-400">
                <Crosshair className="h-3 w-3" /> Production Output
              </span>
              <span className="font-mono text-xs font-semibold text-emerald-400 tnum">{output} <span className="text-[9px] text-muted-foreground">units/min</span></span>
            </div>
            <div className="relative h-8 overflow-hidden rounded bg-emerald-500/5 ring-1 ring-emerald-500/15">
              <div className="absolute inset-0 flex items-center" style={{ animation: machine.status === 'running' ? 'indos-conveyor 4s linear infinite' : 'none' }}>
                {Array.from({ length: 16 }).map((_, i) => (
                  <div key={i} className="mx-1 h-5 w-5 shrink-0 rounded-sm bg-emerald-500/30 ring-1 ring-emerald-500/40" />
                ))}
              </div>
              <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-emerald-500/10 to-transparent" />
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Power Draw: <span className="font-mono font-semibold text-amber-400 tnum">{power.toFixed(1)} kW</span></span>
              {realTel && <span>Probe: <span className="font-mono text-emerald-400">{realTel.value.toFixed(1)} {realTel.unit}</span></span>}
            </div>
          </div>

          {/* Status lights */}
          <div className="mt-3 flex items-center justify-around rounded-md border border-border/60 bg-card/60 px-3 py-3">
            {statusLight('POWER', machine.status !== 'offline', 'bg-emerald-400')}
            {statusLight('RUN', machine.status === 'running', 'bg-emerald-400')}
            {statusLight('IDLE', machine.status === 'idle', 'bg-sky-400')}
            {statusLight('MAINT', machine.status === 'maintenance', 'bg-amber-400')}
            {statusLight('FAULT', machine.status === 'fault', 'bg-rose-400')}
            {statusLight('NET', true, 'bg-emerald-400')}
          </div>
        </div>

        {/* Device tags */}
        <div className="mt-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs font-medium"><CircuitBoard className="h-3.5 w-3.5 text-primary" /> Attached Devices <Badge variant="outline" className="text-[9px]">{machine.devices.length}</Badge></p>
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-[11px]"><Settings2 className="h-3 w-3" /> Configure</Button>
          </div>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {machine.devices.length === 0 ? (
              <div className="col-span-2 rounded-md border border-dashed border-border/60 py-4 text-center text-[11px] text-muted-foreground">No devices linked to this machine.</div>
            ) : machine.devices.map(d => (
              <div key={d.id} className="flex items-center gap-2 rounded-md border border-border/50 bg-card/40 px-2.5 py-1.5">
                <span className={cn('h-1.5 w-1.5 rounded-full', statusDot(d.status))} />
                <span className="truncate text-xs flex-1">{d.name}</span>
                <Badge variant="outline" className="text-[9px]">{d.type}</Badge>
                <span className="text-[9px] uppercase text-muted-foreground">{d.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`@keyframes indos-conveyor { from { transform: translateX(0); } to { transform: translateX(-96px); } }`}</style>
    </div>
  )
}
