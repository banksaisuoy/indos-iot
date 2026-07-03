'use client'
import { useEffect, useMemo, useState } from 'react'
import { useIndOS } from '@/lib/indos/store'
import { KpiCard } from '@/components/indos/shared/kpi-card'
import { ViewHeader } from '@/components/indos/shared/view-header'
import { StatusBadge } from '@/components/indos/shared/status-badge'
import { LiveDot } from '@/components/indos/shared/charts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Camera, Video, Radio, ScanFace, Play, Pause, Circle, Maximize2, Volume2,
  Wifi, WifiOff, Cctv, AlertTriangle, Sparkles, Brain, Activity, MapPin, Network,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface CameraT {
  id: string
  name: string
  location: string | null
  ip: string | null
  status: string // online | offline | recording
  aiDetection: boolean
  motionDetect: boolean
  recording: boolean
  resolution: string
}

// Static noise background data-uri (SVG feTurbulence)
const STATIC_BG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E")`

// Invented recent AI detections (kept stable across renders)
const DETECTIONS: { time: string; camera: string; object: string; conf: number; severity: 'info' | 'warning' | 'critical' }[] = [
  { time: '14:32:08', camera: 'CAM-01 · Main Gate', object: 'Person', conf: 98, severity: 'info' },
  { time: '14:31:42', camera: 'CAM-04 · Loading Bay', object: 'Forklift', conf: 94, severity: 'info' },
  { time: '14:30:11', camera: 'CAM-02 · Assembly A', object: 'No Helmet', conf: 88, severity: 'warning' },
  { time: '14:29:33', camera: 'CAM-07 · Perimeter N', object: 'Intrusion', conf: 91, severity: 'critical' },
  { time: '14:28:50', camera: 'CAM-03 · Warehouse', object: 'Person', conf: 96, severity: 'info' },
  { time: '14:27:19', camera: 'CAM-05 · Roof', object: 'Motion', conf: 72, severity: 'info' },
  { time: '14:26:02', camera: 'CAM-01 · Main Gate', object: 'Vehicle', conf: 99, severity: 'info' },
  { time: '14:24:47', camera: 'CAM-06 · Server Room', object: 'No Vest', conf: 85, severity: 'warning' },
]

const sevColor: Record<string, string> = {
  info: 'text-sky-400 bg-sky-500/10 ring-sky-500/30',
  warning: 'text-amber-400 bg-amber-500/10 ring-amber-500/30',
  critical: 'text-rose-400 bg-rose-500/10 ring-rose-500/30',
}

export function CamerasView() {
  const { setView } = useIndOS()
  const [cams, setCams] = useState<CameraT[] | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterRes, setFilterRes] = useState<string>('all')
  const [aiOnly, setAiOnly] = useState(false)

  useEffect(() => {
    fetch('/api/indos/cameras').then(r => r.json()).then(setCams).catch(() => {})
  }, [])

  const resolutions = useMemo(() => {
    const s = new Set((cams || []).map(c => c.resolution))
    return Array.from(s)
  }, [cams])

  const visible = useMemo(() => {
    if (!cams) return []
    return cams.filter(c => {
      if (filterStatus !== 'all') {
        if (filterStatus === 'recording' && !c.recording) return false
        if (filterStatus === 'online' && c.status !== 'online') return false
        if (filterStatus === 'offline' && c.status !== 'offline') return false
      }
      if (filterRes !== 'all' && c.resolution !== filterRes) return false
      if (aiOnly && !c.aiDetection) return false
      return true
    })
  }, [cams, filterStatus, filterRes, aiOnly])

  const kpis = useMemo(() => {
    if (!cams) return null
    return {
      total: cams.length,
      online: cams.filter(c => c.status !== 'offline').length,
      recording: cams.filter(c => c.recording).length,
      ai: cams.filter(c => c.aiDetection).length,
    }
  }, [cams])

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <ViewHeader
        title="Camera Center"
        description="Centralized CCTV / NVR monitoring with edge AI object detection and motion analytics."
        icon={<Camera className="h-5 w-5" />}
        actions={
          <>
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <LiveDot color="bg-emerald-400" /> NVR ONLINE
            </Badge>
            <Button size="sm" variant="outline" className="h-8 gap-1.5">
              <Cctv className="h-3.5 w-3.5" /> Add Camera
            </Button>
          </>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard label="Total Cameras" value={kpis?.total ?? '—'} icon={Camera} accent="emerald" hint="registered feeds" />
        <KpiCard label="Online Feeds" value={kpis ? `${kpis.online}/${kpis.total}` : '—'} icon={Radio} accent="sky" hint="streaming now" />
        <KpiCard label="Recording Now" value={kpis?.recording ?? '—'} icon={Circle} accent="rose" hint="active write sessions" />
        <KpiCard label="AI Detection" value={kpis?.ai ?? '—'} icon={Brain} accent="violet" hint="edge inference enabled" />
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Status</span>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger size="sm" className="h-8 w-[130px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="offline">Offline</SelectItem>
                <SelectItem value="recording">Recording</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Resolution</span>
            <Select value={filterRes} onValueChange={setFilterRes}>
              <SelectTrigger size="sm" className="h-8 w-[120px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {resolutions.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 rounded-md border border-border/60 bg-card/40 px-2.5 py-1.5">
            <Switch checked={aiOnly} onCheckedChange={setAiOnly} className="scale-90" />
            <span className="flex items-center gap-1 text-[11px] font-medium">
              <Brain className="h-3 w-3 text-violet-400" /> AI only
            </span>
          </label>
          <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
            <Sparkles className="h-3 w-3 text-amber-400" />
            Showing <span className="font-semibold text-foreground tnum">{visible.length}</span> of <span className="font-semibold tnum">{cams?.length ?? 0}</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* Camera grid */}
        <div>
          {!cams ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="aspect-video w-full rounded-lg" />)}
            </div>
          ) : visible.length === 0 ? (
            <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">No cameras match the current filters.</CardContent></Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {visible.map(c => <CameraCard key={c.id} cam={c} />)}
            </div>
          )}
        </div>

        {/* AI detections panel */}
        <Card className="flex h-fit flex-col xl:sticky xl:top-4">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border/60 px-4 py-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm">
                <ScanFace className="h-4 w-4 text-violet-400" /> Recent AI Detections
              </CardTitle>
              <CardDescription className="text-xs">Edge inference · last 10 min</CardDescription>
            </div>
            <Badge variant="outline" className="border-violet-500/30 bg-violet-500/10 text-violet-400">
              <LiveDot color="bg-violet-400" /> LIVE
            </Badge>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="indos-scroll h-[520px]">
              <div className="divide-y divide-border/40">
                {DETECTIONS.map((d, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5 hover:bg-sidebar-accent/40">
                    <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md ring-1', sevColor[d.severity])}>
                      <ScanFace className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{d.object}</p>
                      <p className="truncate text-[10px] text-muted-foreground">{d.camera}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end">
                      <span className="text-[10px] font-mono text-muted-foreground tnum">{d.time}</span>
                      <span className={cn('text-[10px] font-semibold tnum', d.severity === 'critical' ? 'text-rose-400' : d.severity === 'warning' ? 'text-amber-400' : 'text-emerald-400')}>
                        {d.conf}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <Separator />
            <div className="flex items-center justify-between p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Activity className="h-3 w-3 text-violet-400" />
                Model: <span className="font-mono text-foreground">yolov8n · v3.2</span>
              </div>
              <Button size="sm" variant="ghost" className="h-7 text-[11px]">View all</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ─── Camera card ─────────────────────────────────────────────────────────
function CameraCard({ cam }: { cam: CameraT }) {
  const [now, setNow] = useState(() => new Date())
  const [playing, setPlaying] = useState(true)
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const offline = cam.status === 'offline'

  return (
    <Card className="overflow-hidden">
      {/* Feed */}
      <div className={cn('indos-scanline group relative aspect-video w-full overflow-hidden bg-black', offline && 'opacity-90')}>
        {/* Fake video gradient (different "scenes" per camera) */}
        {!offline ? (
          <div
            className="absolute inset-0"
            style={{
              background: `
                radial-gradient(ellipse at 30% 40%, oklch(0.32 0.04 200 / 0.6), transparent 60%),
                radial-gradient(ellipse at 70% 70%, oklch(0.28 0.03 180 / 0.5), transparent 55%),
                linear-gradient(120deg, oklch(0.22 0.015 250), oklch(0.16 0.01 250))
              `,
            }}
          />
        ) : (
          <div
            className="absolute inset-0 animate-pulse"
            style={{ backgroundImage: STATIC_BG, backgroundSize: '120px 120px' }}
          />
        )}

        {/* Faint vignette + grid overlay */}
        <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.5))' }} />
        <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

        {/* Top overlay: name + REC */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-1.5">
            <span className={cn('flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium backdrop-blur', offline ? 'text-rose-400' : 'text-emerald-400')}>
              <Cctv className="h-3 w-3" /> {cam.name}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {cam.recording && !offline && (
              <span className="flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-rose-400 backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" style={{ animation: 'indos-blink 1.2s steps(2) infinite' }} /> REC
              </span>
            )}
            <span className="rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-mono font-medium text-sky-300 backdrop-blur">{cam.resolution}</span>
          </div>
        </div>

        {/* Bottom overlay: timestamp + AI box */}
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-emerald-300/90 tnum">
              {now.toLocaleDateString('en-GB')} {now.toLocaleTimeString('en-GB', { hour12: false })}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {cam.aiDetection && !offline && (
              <span className="flex items-center gap-1 rounded bg-violet-500/20 px-1.5 py-0.5 text-[9px] font-medium text-violet-300 ring-1 ring-violet-500/40 backdrop-blur">
                <Brain className="h-2.5 w-2.5" /> AI
              </span>
            )}
            {cam.motionDetect && !offline && (
              <span className="flex items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-medium text-amber-300 ring-1 ring-amber-500/40 backdrop-blur">
                <Activity className="h-2.5 w-2.5" /> MOT
              </span>
            )}
          </div>
        </div>

        {/* AI bounding box (decorative, animated) — only for online + AI cams */}
        {cam.aiDetection && !offline && playing && (
          <div
            className="pointer-events-none absolute rounded ring-2 ring-violet-400/80"
            style={{
              left: '22%', top: '30%', width: '18%', height: '38%',
              animation: 'indos-bbox 6s ease-in-out infinite',
            }}
          >
            <span className="absolute -top-4 left-0 rounded bg-violet-500/80 px-1 text-[8px] font-mono font-bold text-white">person 0.94</span>
          </div>
        )}

        {/* Signal lost overlay */}
        {offline && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40">
            <WifiOff className="h-6 w-6 text-rose-400" />
            <span className="rounded bg-black/70 px-2 py-0.5 text-xs font-bold tracking-widest text-rose-400 ring-1 ring-rose-500/40">SIGNAL LOST</span>
            <span className="text-[10px] font-mono text-rose-300/70">reconnecting…</span>
          </div>
        )}

        {/* Controls */}
        <div className="absolute inset-x-0 bottom-0 flex translate-y-full items-center gap-1 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-8 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-white hover:bg-white/10" onClick={() => setPlaying(p => !p)}>
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-white hover:bg-white/10">
            <Volume2 className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className={cn('h-7 w-7 p-0 hover:bg-white/10', cam.recording ? 'text-rose-400' : 'text-white')}>
            <Circle className={cn('h-3.5 w-3.5', cam.recording && 'fill-current')} />
          </Button>
          <div className="ml-auto flex items-center gap-1">
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-mono text-white">{playing ? '● LIVE' : '❚❚ PAUSED'}</span>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-white hover:bg-white/10">
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Meta strip */}
      <div className="space-y-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{cam.name}</p>
            <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
              <MapPin className="h-3 w-3" /> {cam.location || 'No location'}
            </p>
          </div>
          <StatusBadge status={cam.status} className="h-5 shrink-0 text-[10px]" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
          <span className="flex items-center gap-1 rounded-md border border-border/60 bg-card/40 px-1.5 py-0.5 font-mono text-muted-foreground">
            <Network className="h-2.5 w-2.5" /> {cam.ip || '—'}
          </span>
          {cam.aiDetection && (
            <span className="flex items-center gap-1 rounded-md border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 font-medium text-violet-400">
              <Brain className="h-2.5 w-2.5" /> AI
            </span>
          )}
          {cam.motionDetect && (
            <span className="flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-400">
              <Activity className="h-2.5 w-2.5" /> Motion
            </span>
          )}
          {cam.recording && (
            <span className="flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 font-medium text-rose-400">
              <Circle className="h-2 w-2 fill-current" /> REC
            </span>
          )}
          <span className="ml-auto flex items-center gap-1 text-muted-foreground">
            <Wifi className={cn('h-2.5 w-2.5', offline ? 'text-slate-500' : 'text-emerald-400')} />
            {offline ? '—' : `${cam.resolution} · 30fps`}
          </span>
        </div>
      </div>

      <style>{`
        @keyframes indos-blink { 0%, 50% { opacity: 1; } 50.01%, 100% { opacity: 0.25; } }
        @keyframes indos-bbox {
          0%, 100% { left: 22%; top: 30%; width: 18%; height: 38%; }
          25% { left: 55%; top: 35%; width: 22%; height: 42%; }
          50% { left: 40%; top: 50%; width: 16%; height: 32%; }
          75% { left: 15%; top: 25%; width: 20%; height: 40%; }
        }
      `}</style>
    </Card>
  )
}
