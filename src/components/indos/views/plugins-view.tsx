'use client'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { KpiCard } from '@/components/indos/shared/kpi-card'
import { ViewHeader } from '@/components/indos/shared/view-header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  Puzzle, Download, CircleCheck, Store, Search, Star, Settings2, Power, Trash2, Loader2, Package,
} from 'lucide-react'

interface Plugin {
  id: string
  name: string
  slug: string
  description?: string | null
  version: string
  author?: string | null
  category: string
  installed: boolean
  enabled: boolean
  rating: number
  downloads: number
}

const CATEGORY_STYLE: Record<string, string> = {
  industry: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30',
  protocol: 'bg-sky-500/15 text-sky-400 ring-sky-500/30',
  analytics: 'bg-violet-500/15 text-violet-400 ring-violet-500/30',
  integration: 'bg-amber-500/15 text-amber-400 ring-amber-500/30',
  visualization: 'bg-rose-500/15 text-rose-400 ring-rose-500/30',
}

const CATEGORIES = ['industry', 'protocol', 'analytics', 'integration', 'visualization']

function fmtDownloads(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export function PluginsView() {
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [installedOnly, setInstalledOnly] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = () => {
    setLoading(true)
    fetch('/api/indos/plugins')
      .then(r => r.json())
      .then((p: Plugin[]) => { setPlugins(p); setLoading(false) })
      .catch(() => { setLoading(false); toast.error('Failed to load plugins') })
  }

  useEffect(() => {
    let cancelled = false
    fetch('/api/indos/plugins')
      .then(r => r.json())
      .then((p: Plugin[]) => { if (!cancelled) { setPlugins(p); setLoading(false) } })
      .catch(() => { if (!cancelled) { setLoading(false); toast.error('Failed to load plugins') } })
    return () => { cancelled = true }
  }, [])

  const installed = plugins.filter(p => p.installed)
  const enabled = plugins.filter(p => p.enabled)
  const available = plugins.filter(p => !p.installed)
  const totalDownloads = plugins.reduce((s, p) => s + p.downloads, 0)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return plugins.filter(p => {
      if (installedOnly && !p.installed) return false
      if (category !== 'all' && p.category !== category) return false
      if (q && !(`${p.name} ${p.description || ''} ${p.author || ''}`.toLowerCase().includes(q))) return false
      return true
    })
  }, [plugins, search, category, installedOnly])

  const act = async (id: string, action: 'install' | 'enable' | 'disable' | 'uninstall') => {
    setBusyId(id)
    try {
      const r = await fetch('/api/indos/plugins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      })
      if (!r.ok) throw new Error()
      toast.success(`Plugin ${action}d`, { description: `${action.charAt(0).toUpperCase() + action.slice(1)} successful` })
      refresh()
    } catch {
      toast.error(`Failed to ${action} plugin`)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <ViewHeader
        title="Plugin Marketplace"
        description="Extend IndOS with industry packs, protocol drivers, analytics, integrations and visualization layers."
        icon={<Store className="h-5 w-5" />}
        actions={
          <Badge variant="outline" className="h-8 gap-1.5 px-3 text-xs">
            <Package className="h-3.5 w-3.5" /> {plugins.length} plugins
          </Badge>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)
        ) : (
          <>
            <KpiCard label="Installed" value={installed.length} icon={Puzzle} accent="emerald" hint={`${enabled.length} enabled`} />
            <KpiCard label="Enabled" value={enabled.length} icon={CircleCheck} accent="sky" hint="running in runtime" />
            <KpiCard label="Available" value={available.length} icon={Store} accent="amber" hint="ready to install" />
            <KpiCard label="Total Downloads" value={fmtDownloads(totalDownloads)} icon={Download} accent="violet" delta={5.7} hint="all-time" />
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        {/* Installed summary panel */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Puzzle className="h-4 w-4 text-emerald-400" /> Installed Plugins
            </CardTitle>
            <CardDescription className="text-xs">Toggle runtime state per plugin</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="indos-scroll h-[420px] pr-2">
              <div className="space-y-2">
                {installed.length === 0 && (
                  <div className="rounded-md border border-dashed border-border/40 py-8 text-center text-xs text-muted-foreground">
                    No plugins installed yet.
                  </div>
                )}
                {installed.map(p => (
                  <div key={p.id} className="rounded-md border border-border/60 bg-card/40 p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">{p.name}</p>
                        <p className="text-[10px] text-muted-foreground">v{p.version} · {p.author || 'IndOS'}</p>
                      </div>
                      <Switch
                        checked={p.enabled}
                        disabled={busyId === p.id}
                        onCheckedChange={(v) => act(p.id, v ? 'enable' : 'disable')}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Marketplace grid */}
        <div className="space-y-3 lg:col-span-3">
          {/* Filter bar */}
          <Card className="p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search plugins, authors, descriptions…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 pl-8"
                />
              </div>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-9 w-full sm:w-44"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2 rounded-md border border-border bg-card/40 px-3 py-1.5">
                <Switch checked={installedOnly} onCheckedChange={setInstalledOnly} id="inst-only" />
                <label htmlFor="inst-only" className="cursor-pointer text-xs">Installed only</label>
              </div>
            </div>
          </Card>

          {/* Grid */}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {loading
              ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-52 w-full" />)
              : filtered.map(p => (
                <Card key={p.id} className="flex flex-col gap-0 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className={cn('rounded-md p-1.5 ring-1', CATEGORY_STYLE[p.category] || CATEGORY_STYLE.industry)}>
                        <Puzzle className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold leading-tight">{p.name}</p>
                        <p className="text-[10px] text-muted-foreground">v{p.version} · {p.author || 'IndOS'}</p>
                      </div>
                    </div>
                    {p.installed && (
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 ring-emerald-500/30">
                        <CircleCheck className="h-3 w-3" /> Installed
                      </Badge>
                    )}
                  </div>

                  <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{p.description || 'No description provided.'}</p>

                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant="outline" className={cn('h-5 px-1.5 text-[10px] capitalize ring-1', CATEGORY_STYLE[p.category] || CATEGORY_STYLE.industry)}>
                      {p.category}
                    </Badge>
                    <div className="flex items-center gap-0.5 text-amber-400">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={cn('h-3 w-3', i < Math.round(p.rating) ? 'fill-current' : 'opacity-30')} />
                      ))}
                      <span className="ml-1 text-[10px] text-muted-foreground">{p.rating.toFixed(1)}</span>
                    </div>
                  </div>

                  <Separator className="my-2.5" />

                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><Download className="h-3 w-3" /> {fmtDownloads(p.downloads)}</span>
                    <span className="font-mono">{p.slug}</span>
                  </div>

                  <div className="mt-3 flex items-center gap-1.5">
                    {!p.installed ? (
                      <Button size="sm" className="h-7 flex-1 gap-1.5 text-xs" disabled={busyId === p.id} onClick={() => act(p.id, 'install')}>
                        {busyId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                        Install
                      </Button>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant={p.enabled ? 'outline' : 'default'}
                          className="h-7 flex-1 gap-1.5 text-xs"
                          disabled={busyId === p.id}
                          onClick={() => act(p.id, p.enabled ? 'disable' : 'enable')}
                        >
                          {busyId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Power className="h-3 w-3" />}
                          {p.enabled ? 'Disable' : 'Enable'}
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" disabled>
                          <Settings2 className="h-3 w-3" /> Configure
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-rose-400 hover:bg-rose-500/10 hover:text-rose-400"
                          disabled={busyId === p.id}
                          onClick={() => act(p.id, 'uninstall')}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </Card>
              ))}
            {!loading && filtered.length === 0 && (
              <div className="col-span-full rounded-md border border-dashed border-border/40 py-12 text-center text-xs text-muted-foreground">
                No plugins match your filters.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
