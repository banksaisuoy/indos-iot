'use client'
import { useEffect, useMemo, useState } from 'react'
import { useIndOS } from '@/lib/indos/store'
import { KpiCard } from '@/components/indos/shared/kpi-card'
import { ViewHeader } from '@/components/indos/shared/view-header'
import { StatusBadge } from '@/components/indos/shared/status-badge'
import { Sparkline, LiveDot } from '@/components/indos/shared/charts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import {
  MapPin, Satellite, Crosshair, Layers, Radio, Cpu, AlertTriangle, Building2,
  Navigation, ZoomIn, ZoomOut, Compass, Globe, Activity, Map as MapIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SiteProject {
  id: string
  name: string
  slug: string
  category: string
  status: string
  location: string | null
  lat: number | null
  lng: number | null
  _count: { devices: number; alarms: number; workOrders: number; factories: number }
}

// Category color map (no indigo/blue primary — use emerald/amber/sky/rose/violet)
const CAT_COLOR: Record<string, string> = {
  energy: '#fbbf24',      // amber
  solar: '#fbbf24',       // amber
  agriculture: '#34d399', // emerald
  greenhouse: '#34d399',  // emerald
  water: '#38bdf8',       // sky
  factory: '#a78bfa',     // violet
  coldstorage: '#38bdf8', // sky
  weather: '#38bdf8',     // sky
  smarthome: '#fb7185',   // rose
  general: '#94a3b8',     // slate
}
const catColor = (c: string) => CAT_COLOR[c] || CAT_COLOR.general
const catLabel = (c: string) => c.charAt(0).toUpperCase() + c.slice(1)

// Normalize Thailand region lat/lng to x/y percentages
// lat 6-20 (south→north), lng 97-105 (west→east)
const LAT_MIN = 6, LAT_MAX = 20, LNG_MIN = 97, LNG_MAX = 105
function project(lat: number, lng: number) {
  const x = ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * 100
  const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * 100
  return { x: Math.max(2, Math.min(98, x)), y: Math.max(2, Math.min(98, y)) }
}

// Generate a fake activity sparkline for a site
function activity(seed: string, n = 24): number[] {
  const out: number[] = []
  let h = seed.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 100
  for (let i = 0; i < n; i++) {
    h = (h * 9301 + 49297) % 233280
    out.push(40 + (h / 233280) * 60)
  }
  return out
}

export function MapView() {
  const { setView } = useIndOS()
  const [sites, setSites] = useState<SiteProject[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const [hoverId, setHoverId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/indos/projects').then(r => r.json()).then((d: SiteProject[]) => {
      const withCoords = d.filter(p => p.lat != null && p.lng != null)
      setSites(withCoords.length > 0 ? withCoords : d)
      if (withCoords[0]) setSelectedId(withCoords[0].id)
    }).catch(() => {})
  }, [])

  const visible = useMemo(() => {
    if (!sites) return []
    if (filter === 'all') return sites
    return sites.filter(s => s.category === filter)
  }, [sites, filter])

  const mappable = useMemo(() => (sites || []).filter(s => s.lat != null && s.lng != null), [sites])

  const kpis = useMemo(() => {
    if (!sites) return null
    const online = sites.filter(s => s.status === 'active').length
    const devices = sites.reduce((a, s) => a + s._count.devices, 0)
    const regions = new Set(sites.map(s => s.location?.split(',')[0]?.trim() || 'Unknown')).size
    return { total: sites.length, online, devices, regions }
  }, [sites])

  const selected = (sites || []).find(s => s.id === selectedId) || null
  const categories = Array.from(new Set((sites || []).map(s => s.category)))

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <ViewHeader
        title="GIS Operations Map"
        description="Geographic distribution of all IndOS-managed sites, assets and live telemetry across the region."
        icon={<MapPin className="h-5 w-5" />}
        actions={
          <>
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <LiveDot color="bg-emerald-400" /> TELEMETRY LIVE
            </Badge>
            <Button size="sm" variant="outline" className="h-8 gap-1.5">
              <Satellite className="h-3.5 w-3.5" /> Satellite
            </Button>
          </>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard label="Total Sites" value={kpis?.total ?? '—'} icon={Building2} accent="emerald" hint="deployed projects" />
        <KpiCard label="Online Sites" value={kpis ? `${kpis.online}/${kpis.total}` : '—'} icon={Radio} accent="sky" hint="reporting telemetry" />
        <KpiCard label="Connected Devices" value={kpis?.devices ?? '—'} icon={Cpu} accent="violet" hint="across all sites" />
        <KpiCard label="Regions Covered" value={kpis?.regions ?? '—'} icon={Globe} accent="amber" hint="provinces / states" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        {/* Site list */}
        <Card className="flex h-[640px] flex-col overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border/60 px-4 py-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm"><MapPin className="h-4 w-4 text-primary" /> Sites</CardTitle>
              <CardDescription className="text-xs">{visible.length} of {sites?.length ?? 0} shown</CardDescription>
            </div>
            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setView('projects')}>All projects</Button>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0">
            {!sites ? (
              <div className="space-y-2 p-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : (
              <ScrollArea className="indos-scroll h-full">
                <div className="space-y-1 p-2">
                  {visible.map(s => {
                    const sel = s.id === selectedId
                    const color = catColor(s.category)
                    return (
                      <button
                        key={s.id}
                        onClick={() => setSelectedId(s.id)}
                        onMouseEnter={() => setHoverId(s.id)}
                        onMouseLeave={() => setHoverId(null)}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors',
                          sel ? 'border-primary/40 bg-primary/10' : 'border-border/40 bg-card/40 hover:bg-sidebar-accent/50'
                        )}
                      >
                        <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md ring-1" style={{ backgroundColor: `${color}1a`, borderColor: `${color}40` }}>
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                          {sel && <span className="absolute inset-0 rounded-md ring-2 ring-primary/40" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">{s.name}</p>
                          <p className="truncate text-[10px] text-muted-foreground">{s.location || 'No location'} · {catLabel(s.category)}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-0.5">
                          <Badge variant="outline" className="h-4 px-1.5 text-[9px] tnum">{s._count.devices} dev</Badge>
                          {s._count.alarms > 0 && <span className="text-[9px] text-rose-400 tnum">{s._count.alarms} alarms</span>}
                        </div>
                      </button>
                    )
                  })}
                  {visible.length === 0 && <div className="py-10 text-center text-xs text-muted-foreground">No sites for this filter.</div>}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Map + detail */}
        <div className="flex flex-col gap-4">
          {/* Map panel */}
          <Card className="relative overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border/60 px-4 py-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Globe className="h-4 w-4 text-primary" /> Operations Map · Thailand Region
                </CardTitle>
                <CardDescription className="text-xs">Lat 6°N–20°N · Lng 97°E–105°E · {mappable.length} plotted sites</CardDescription>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0"><ZoomIn className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0"><ZoomOut className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0"><Compass className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="ghost" className="h-7 gap-1 text-[11px]"><Layers className="h-3.5 w-3.5" /> Layers</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {/* Category filter chips */}
              <div className="flex flex-wrap items-center gap-1.5 border-b border-border/60 px-4 py-2">
                <button onClick={() => setFilter('all')} className={cn('rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition-colors', filter === 'all' ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border/60 bg-card/40 text-muted-foreground hover:text-foreground')}>
                  All
                </button>
                {categories.map(c => (
                  <button key={c} onClick={() => setFilter(c)} className={cn('flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition-colors', filter === c ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border/60 bg-card/40 text-muted-foreground hover:text-foreground')}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: catColor(c) }} />
                    {catLabel(c)}
                  </button>
                ))}
              </div>

              {/* The map */}
              <div className="indos-grid-bg relative h-[440px] w-full overflow-hidden bg-background/40">
                {/* Stylized region outline (rough Thailand-ish silhouette as decorative SVG) */}
                <svg className="absolute inset-0 h-full w-full opacity-[0.18]" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <path
                    d="M 38 4 L 50 6 L 56 14 L 60 22 L 58 30 L 64 38 L 70 44 L 72 52 L 68 60 L 62 68 L 56 76 L 50 84 L 48 92 L 44 96 L 40 92 L 42 84 L 38 76 L 36 68 L 34 60 L 36 52 L 32 44 L 34 36 L 30 28 L 32 20 L 36 12 Z"
                    fill="none"
                    stroke="oklch(0.7 0.05 200)"
                    strokeWidth="0.3"
                    strokeDasharray="1 1"
                  />
                  {/* Region labels */}
                  <text x="46" y="14" fill="oklch(0.6 0.02 240)" fontSize="2" fontFamily="monospace">NORTH</text>
                  <text x="44" y="44" fill="oklch(0.6 0.02 240)" fontSize="2" fontFamily="monospace">CENTRAL</text>
                  <text x="40" y="70" fill="oklch(0.6 0.02 240)" fontSize="2" fontFamily="monospace">SOUTH</text>
                  <text x="62" y="40" fill="oklch(0.6 0.02 240)" fontSize="2" fontFamily="monospace">NE</text>
                  {/* lat/lng grid lines */}
                  {[20, 40, 60, 80].map(p => (
                    <g key={p}>
                      <line x1="0" y1={p} x2="100" y2={p} stroke="oklch(0.7 0.01 250 / 0.08)" strokeWidth="0.2" />
                      <line x1={p} y1="0" x2={p} y2="100" stroke="oklch(0.7 0.01 250 / 0.08)" strokeWidth="0.2" />
                    </g>
                  ))}
                </svg>

                {/* Connection lines from selected to others */}
                {selected && selected.lat != null && selected.lng != null && (
                  <svg className="absolute inset-0 h-full w-full pointer-events-none">
                    {mappable.filter(s => s.id !== selected.id).map(s => {
                      const a = project(selected.lat!, selected.lng!)
                      const b = project(s.lat!, s.lng!)
                      return (
                        <line
                          key={s.id}
                          x1={`${a.x}%`} y1={`${a.y}%`} x2={`${b.x}%`} y2={`${b.y}%`}
                          stroke={s.id === hoverId ? 'oklch(0.72 0.17 160 / 0.6)' : 'oklch(0.72 0.17 160 / 0.15)'}
                          strokeWidth={s.id === hoverId ? 1.2 : 0.6}
                          strokeDasharray="2 3"
                        />
                      )
                    })}
                  </svg>
                )}

                {/* Markers */}
                <TooltipProvider delayDuration={120}>
                  {mappable.map(s => {
                    const { x, y } = project(s.lat!, s.lng!)
                    const color = catColor(s.category)
                    const isSel = s.id === selectedId
                    const isHover = s.id === hoverId
                    return (
                      <Tooltip key={s.id}>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => setSelectedId(s.id)}
                            onMouseEnter={() => setHoverId(s.id)}
                            onMouseLeave={() => setHoverId(null)}
                            className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer focus:outline-none"
                            style={{ left: `${x}%`, top: `${y}%`, color }}
                          >
                            {/* ping */}
                            <span className="pulse-dot relative flex h-3 w-3 items-center justify-center">
                              <span className="absolute h-3 w-3 rounded-full opacity-60" style={{ backgroundColor: color }} />
                            </span>
                            <span
                              className="relative block rounded-full ring-2 ring-offset-1 ring-offset-background transition-all"
                              style={{
                                width: isSel ? 14 : isHover ? 12 : 9,
                                height: isSel ? 14 : isHover ? 12 : 9,
                                backgroundColor: color,
                                boxShadow: `0 0 ${isSel ? 16 : 8}px ${color}`,
                                '--tw-ring-color': color,
                              } as React.CSSProperties}
                            />
                            {isSel && (
                              <span className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-background/90 px-1.5 py-0.5 text-[9px] font-medium ring-1 ring-border">
                                {s.name}
                              </span>
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="bg-popover/95 backdrop-blur">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 text-xs font-semibold">
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                              {s.name}
                            </div>
                            <div className="text-[10px] text-muted-foreground">{s.location || 'No location'}</div>
                            <div className="flex items-center gap-3 text-[10px]">
                              <span className="flex items-center gap-1"><Cpu className="h-2.5 w-2.5" /> {s._count.devices}</span>
                              <span className="flex items-center gap-1"><AlertTriangle className="h-2.5 w-2.5 text-rose-400" /> {s._count.alarms}</span>
                              <span className="flex items-center gap-1"><Building2 className="h-2.5 w-2.5" /> {s._count.factories}</span>
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    )
                  })}
                </TooltipProvider>

                {/* Crosshair overlay */}
                <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1 rounded bg-background/70 px-2 py-1 text-[9px] font-mono text-muted-foreground ring-1 ring-border/60">
                  <Crosshair className="h-2.5 w-2.5" /> 13.7563°N · 100.5018°E
                </div>
                <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 rounded bg-background/70 px-2 py-1 text-[9px] font-mono text-muted-foreground ring-1 ring-border/60">
                  <Navigation className="h-2.5 w-2.5" /> WGS84 · 1km grid
                </div>
                <div className="pointer-events-none absolute bottom-2 left-2 flex h-12 w-16 flex-col items-center justify-center rounded bg-background/70 ring-1 ring-border/60">
                  <div className="flex h-6 w-full items-end justify-center gap-px px-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex-1 bg-muted-foreground/60" style={{ height: `${20 + i * 16}%` }} />
                    ))}
                  </div>
                  <span className="text-[8px] text-muted-foreground">5km</span>
                </div>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center gap-3 border-t border-border/60 px-4 py-2.5">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Legend</span>
                {Object.entries(CAT_COLOR).map(([k, v]) => (
                  <span key={k} className="flex items-center gap-1.5 text-[10px]">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: v, boxShadow: `0 0 6px ${v}` }} />
                    {catLabel(k)}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Selected detail */}
          {selected && (
            <Card>
              <CardHeader className="flex flex-row items-start justify-between space-y-0 border-b border-border/60 px-4 py-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <MapPin className="h-4 w-4 text-primary" />
                    {selected.name}
                  </CardTitle>
                  <CardDescription className="text-xs">{selected.location || 'No location set'} · {catLabel(selected.category)}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={selected.status} />
                  <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={() => setView('digitaltwin')}>
                    <MapIcon className="h-3 w-3" /> Open in Twin
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 p-4 sm:grid-cols-[1.4fr_1fr]">
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Stat icon={Cpu} label="Devices" value={selected._count.devices} accent="text-sky-400" />
                    <Stat icon={AlertTriangle} label="Alarms" value={selected._count.alarms} accent="text-rose-400" />
                    <Stat icon={Building2} label="Factories" value={selected._count.factories} accent="text-emerald-400" />
                    <Stat icon={Activity} label="Work Orders" value={selected._count.workOrders} accent="text-amber-400" />
                  </div>
                  <Separator />
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Coordinates</p>
                      <p className="font-mono text-sm tnum">
                        {selected.lat != null ? `${selected.lat.toFixed(4)}°N` : '—'}
                        {' / '}
                        {selected.lng != null ? `${selected.lng.toFixed(4)}°E` : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Category / Status</p>
                      <p className="text-sm font-medium">{catLabel(selected.category)} · <span className="capitalize">{selected.status}</span></p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Project Slug</p>
                      <p className="font-mono text-xs">{selected.slug}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Project ID</p>
                      <p className="font-mono text-xs text-muted-foreground">{selected.id}</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-md border border-border/60 bg-card/40 p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      <Activity className="h-3 w-3" /> 24h Activity
                    </span>
                    <Badge variant="outline" className="text-[9px]">
                      <LiveDot color="bg-emerald-400" /> live
                    </Badge>
                  </div>
                  <Sparkline data={activity(selected.id)} color={catColor(selected.category)} height={70} />
                  <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>00:00</span><span>now</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ icon: Icon, label, value, accent }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; accent: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-card/40 p-2.5">
      <div className="flex items-center justify-between">
        <Icon className={cn('h-3.5 w-3.5', accent)} />
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <p className="mt-1 text-lg font-semibold tnum">{value}</p>
    </div>
  )
}
