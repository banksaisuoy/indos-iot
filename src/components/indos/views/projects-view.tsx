'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useIndOS } from '@/lib/indos/store'
import { KpiCard } from '@/components/indos/shared/kpi-card'
import { ViewHeader } from '@/components/indos/shared/view-header'
import { StatusBadge } from '@/components/indos/shared/status-badge'
import { SimpleBar } from '@/components/indos/shared/charts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { toast } from 'sonner'
import {
  FolderKanban, Plus, MapPin, Cpu, Bell, Wrench, Factory, Building2,
  Search, Layers, ArrowRight, Globe, Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Project {
  id: string
  name: string
  slug: string
  category: string
  status: string
  location: string | null
  lat: number | null
  lng: number | null
  description: string | null
  _count: { devices: number; alarms: number; workOrders: number; factories: number }
  customer?: { name: string } | null
  org?: { name: string } | null
}

const CATEGORIES = [
  'energy', 'agriculture', 'solar', 'water', 'factory',
  'greenhouse', 'weather', 'coldstorage', 'general',
]

const CAT_ACCENT: Record<string, 'amber' | 'emerald' | 'sky' | 'violet' | 'slate'> = {
  energy: 'amber',
  agriculture: 'emerald',
  solar: 'amber',
  water: 'sky',
  factory: 'violet',
  greenhouse: 'emerald',
  weather: 'sky',
  coldstorage: 'sky',
  general: 'slate',
}

const CAT_CLS: Record<string, string> = {
  energy: 'bg-amber-500/15 text-amber-400 ring-amber-500/30',
  agriculture: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30',
  solar: 'bg-amber-500/15 text-amber-400 ring-amber-500/30',
  water: 'bg-sky-500/15 text-sky-400 ring-sky-500/30',
  factory: 'bg-violet-500/15 text-violet-400 ring-violet-500/30',
  greenhouse: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30',
  weather: 'bg-sky-500/15 text-sky-400 ring-sky-500/30',
  coldstorage: 'bg-sky-500/15 text-sky-400 ring-sky-500/30',
  general: 'bg-slate-500/15 text-slate-400 ring-slate-500/30',
}

function CategoryBadge({ category }: { category: string }) {
  const cls = CAT_CLS[category] || CAT_CLS.general
  return (
    <Badge variant="outline" className={cn('ring-1 capitalize', cls)}>
      {category}
    </Badge>
  )
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

export function ProjectsView() {
  const { setView, setActiveProject } = useIndOS()
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState<string>('all')
  const [openNew, setOpenNew] = useState(false)
  const [openDetail, setOpenDetail] = useState<Project | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const r = await fetch('/api/indos/projects')
        const d = (await r.json()) as Project[]
        if (!cancelled) setProjects(d)
      } catch {
        if (!cancelled) setProjects([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => { load() }, [load])

  const stats = useMemo(() => {
    if (!projects) return { total: 0, active: 0, paused: 0, devices: 0, factories: 0 }
    return {
      total: projects.length,
      active: projects.filter(p => p.status === 'active').length,
      paused: projects.filter(p => p.status === 'paused').length,
      devices: projects.reduce((s, p) => s + p._count.devices, 0),
      factories: projects.reduce((s, p) => s + p._count.factories, 0),
    }
  }, [projects])

  const catDist = useMemo(() => {
    const m: Record<string, number> = {}
    for (const p of projects || []) m[p.category] = (m[p.category] || 0) + 1
    return Object.entries(m).map(([k, v]) => ({ label: k, v }))
  }, [projects])

  const filtered = useMemo(() => {
    if (!projects) return []
    return projects.filter(p => {
      if (cat !== 'all' && p.category !== cat) return false
      if (query) {
        const q = query.toLowerCase()
        if (!p.name.toLowerCase().includes(q) && !(p.location || '').toLowerCase().includes(q) && !(p.description || '').toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [projects, query, cat])

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <ViewHeader
        title="Projects"
        description="Industrial sites & deployments organized by category. Each project groups devices, alarms, work orders and factories."
        icon={<FolderKanban className="h-5 w-5" />}
        actions={
          <Button size="sm" className="h-8 gap-1.5" onClick={() => setOpenNew(true)}>
            <Plus className="h-3.5 w-3.5" /> New Project
          </Button>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
        <KpiCard label="Total Projects" value={loading ? '—' : stats.total} icon={FolderKanban} accent="emerald" hint={`${stats.factories} factories`} />
        <KpiCard label="Active" value={loading ? '—' : stats.active} icon={Sparkles} accent="emerald" hint="deployed" />
        <KpiCard label="Paused" value={loading ? '—' : stats.paused} icon={Layers} accent="amber" hint="temporarily idle" />
        <KpiCard label="Total Devices" value={loading ? '—' : stats.devices} icon={Cpu} accent="sky" hint="across all projects" />
        <KpiCard label="Categories" value={loading ? '—' : catDist.length} icon={Globe} accent="violet" hint="industry verticals" className="col-span-2 lg:col-span-1" />
      </div>

      {/* Filter + Grid + Chart */}
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search projects, location, description…"
                className="h-9 pl-8"
              />
            </div>
            <Select value={cat} onValueChange={setCat}>
              <SelectTrigger className="h-9 w-full sm:w-[180px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <FolderKanban className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No projects match your filters.</p>
                <Button variant="outline" size="sm" className="mt-1 h-8 gap-1.5" onClick={() => { setQuery(''); setCat('all') }}>
                  Reset filters
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map(p => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  onOpen={() => setOpenDetail(p)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Side: category distribution */}
        <Card className="h-fit">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="h-4 w-4 text-violet-400" /> Category Distribution
            </CardTitle>
            <CardDescription className="text-xs">Projects per industrial vertical</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-[260px] animate-pulse rounded-md bg-muted/30" />
            ) : catDist.length === 0 ? (
              <div className="py-10 text-center text-xs text-muted-foreground">No data</div>
            ) : (
              <SimpleBar data={catDist} height={240} color="#a78bfa" />
            )}
            <div className="mt-3 grid grid-cols-2 gap-1.5">
              {catDist.map(c => (
                <div key={c.label} className="flex items-center justify-between rounded-md border border-border/50 bg-card/40 px-2 py-1">
                  <span className="flex items-center gap-1.5 text-[11px] capitalize">
                    <span className={cn('inline-block h-2 w-2 rounded-full', (CAT_CLS[c.label] || CAT_CLS.general).split(' ')[0].replace('bg-', 'bg-'))} />
                    {c.label}
                  </span>
                  <span className="text-xs font-semibold tnum">{c.v}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* New Project Dialog */}
      <NewProjectDialog
        key={`new-proj-${openNew ? 'open' : 'closed'}`}
        open={openNew}
        onOpenChange={setOpenNew}
        submitting={submitting}
        onSubmit={async (data) => {
          setSubmitting(true)
          try {
            const res = await fetch('/api/indos/projects', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data),
            })
            if (!res.ok) throw new Error('Failed')
            toast.success('Project created', { description: `${data.name} is now deployed and active.` })
            setOpenNew(false)
            load()
          } catch {
            toast.error('Failed to create project', { description: 'Check network or permissions and try again.' })
          } finally {
            setSubmitting(false)
          }
        }}
      />

      {/* Project Detail Dialog */}
      <Dialog open={!!openDetail} onOpenChange={(o) => !o && setOpenDetail(null)}>
        <DialogContent className="sm:max-w-2xl">
          {openDetail && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <DialogTitle className="flex items-center gap-2 text-xl">
                      {openDetail.name}
                      <CategoryBadge category={openDetail.category} />
                    </DialogTitle>
                    <DialogDescription className="mt-1">
                      {openDetail.location || 'No location set'} · slug <code className="rounded bg-muted px-1 text-[10px]">{openDetail.slug}</code>
                    </DialogDescription>
                  </div>
                  <StatusBadge status={openDetail.status} />
                </div>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {openDetail.description || 'No description provided for this project. Add one via the API or dashboard settings.'}
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <DetailStat icon={Cpu} label="Devices" value={openDetail._count.devices} accent="text-sky-400" />
                  <DetailStat icon={Factory} label="Factories" value={openDetail._count.factories} accent="text-violet-400" />
                  <DetailStat icon={Bell} label="Alarms" value={openDetail._count.alarms} accent="text-rose-400" />
                  <DetailStat icon={Wrench} label="Work Orders" value={openDetail._count.workOrders} accent="text-amber-400" />
                </div>
                <div className="grid grid-cols-2 gap-3 rounded-md border border-border/60 bg-card/40 p-3 text-xs">
                  <Meta label="Customer" value={openDetail.customer?.name || '—'} />
                  <Meta label="Organization" value={openDetail.org?.name || '—'} />
                  <Meta label="Coordinates" value={openDetail.lat != null && openDetail.lng != null ? `${openDetail.lat.toFixed(4)}, ${openDetail.lng.toFixed(4)}` : '—'} />
                  <Meta label="Category" value={openDetail.category} />
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" size="sm" onClick={() => setOpenDetail(null)}>Close</Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    setActiveProject(openDetail.slug)
                    setOpenDetail(null)
                    setView('devices')
                  }}
                >
                  View devices <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ProjectCard({ project, onOpen }: { project: Project; onOpen: () => void }) {
  const accent = CAT_ACCENT[project.category] || 'slate'
  return (
    <Card
      className="group cursor-pointer overflow-hidden p-4 transition-all hover:border-primary/40 hover:shadow-md"
      onClick={onOpen}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CategoryBadge category={project.category} />
            <StatusBadge status={project.status} />
          </div>
          <h3 className="mt-2 truncate text-base font-semibold">{project.name}</h3>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" /> {project.location || 'Unknown location'}
          </p>
        </div>
        <FolderKanban className={cn('h-5 w-5 shrink-0 transition-colors', `text-${accent}-400`)} />
      </div>
      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
        {project.description || 'No description available.'}
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/50 pt-3">
        <MiniCount icon={Cpu} label="Devices" value={project._count.devices} accent="text-sky-400" />
        <MiniCount icon={Bell} label="Alarms" value={project._count.alarms} accent="text-rose-400" />
        <MiniCount icon={Wrench} label="Orders" value={project._count.workOrders} accent="text-amber-400" />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          {project.customer?.name || project.org?.name || 'Internal'}
        </span>
        <span className="flex items-center gap-1 text-[11px] font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
          Open <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </Card>
  )
}

function MiniCount({ icon: Icon, label, value, accent }: { icon: any; label: string; value: number; accent: string }) {
  return (
    <div className="text-center">
      <Icon className={cn('mx-auto h-3.5 w-3.5', accent)} />
      <p className="mt-1 text-base font-semibold tnum">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  )
}

function DetailStat({ icon: Icon, label, value, accent }: { icon: any; label: string; value: number; accent: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-card/40 p-3 text-center">
      <Icon className={cn('mx-auto h-4 w-4', accent)} />
      <p className="mt-1 text-xl font-bold tnum">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium capitalize">{value}</p>
    </div>
  )
}

interface NewProjectData {
  name: string
  description: string
  category: string
  location: string
}

function NewProjectDialog({
  open, onOpenChange, onSubmit, submitting,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onSubmit: (d: NewProjectData) => void
  submitting: boolean
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('energy')
  const [location, setLocation] = useState('')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Plus className="h-4 w-4 text-primary" /> Create New Project</DialogTitle>
          <DialogDescription>Register a new industrial site. You can edit details after creation.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="p-name">Project name</Label>
            <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. North Solar Farm Phase II" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-cat">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="p-cat" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-loc">Location</Label>
            <Input id="p-loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Rotterdam, NL" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-desc">Description</Label>
            <Textarea id="p-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short overview of scope, capacity, or stakeholder…" rows={3} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button
            size="sm"
            disabled={!name.trim() || submitting}
            onClick={() => onSubmit({ name: name.trim(), description: description.trim(), category, location: location.trim() })}
          >
            {submitting ? 'Creating…' : 'Create project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
