'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { KpiCard } from '@/components/indos/shared/kpi-card'
import { ViewHeader } from '@/components/indos/shared/view-header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  Settings, Sliders, Network, ShieldCheck, Activity, Bot, DatabaseBackup, KeySquare, Edit, ExternalLink, Cpu, Server, Boxes, Radio, HardDrive, Workflow, Lock, Fingerprint, Bug, Globe, FileBarChart, LineChart, Search, Camera, Sparkles, History, RotateCcw, CheckCircle2, CircuitBoard, Wifi, ShieldAlert, Gauge, BellRing, Volume2,
} from 'lucide-react'
import { isAlarmSoundEnabled, setAlarmSoundEnabled, playCriticalBeep } from '@/lib/indos/alarm-sound'

type Settings = Record<string, Record<string, string>>

type Section = 'general' | 'connectivity' | 'security' | 'observability' | 'ai' | 'backup' | 'license' | 'alerts'

const NAV: { id: Section; label: string; icon: any }[] = [
  { id: 'general', label: 'General', icon: Sliders },
  { id: 'connectivity', label: 'Connectivity', icon: Network },
  { id: 'security', label: 'Security', icon: ShieldCheck },
  { id: 'observability', label: 'Observability', icon: Activity },
  { id: 'alerts', label: 'Alerts', icon: BellRing },
  { id: 'ai', label: 'AI / ML', icon: Bot },
  { id: 'backup', label: 'Backup', icon: DatabaseBackup },
  { id: 'license', label: 'License', icon: KeySquare },
]

function val(s: Settings | null, cat: string, key: string, fallback = '—') {
  return s?.[cat]?.[key] || fallback
}

function ServiceCard({
  icon: Icon, name, status = 'healthy', endpoint, version, onConfigure, accent = 'emerald',
}: {
  icon: any; name: string; status?: 'healthy' | 'degraded' | 'down'; endpoint?: string; version?: string; onConfigure?: () => void; accent?: 'emerald' | 'sky' | 'amber' | 'violet' | 'rose'
}) {
  const dot = status === 'healthy' ? 'bg-emerald-400' : status === 'degraded' ? 'bg-amber-400' : 'bg-rose-400'
  const statusLabel = status === 'healthy' ? 'Healthy' : status === 'degraded' ? 'Degraded' : 'Down'
  const accentMap: Record<string, string> = {
    emerald: 'text-emerald-400 bg-emerald-500/10 ring-emerald-500/20',
    sky: 'text-sky-400 bg-sky-500/10 ring-sky-500/20',
    amber: 'text-amber-400 bg-amber-500/10 ring-amber-500/20',
    violet: 'text-violet-400 bg-violet-500/10 ring-violet-500/20',
    rose: 'text-rose-400 bg-rose-500/10 ring-rose-500/20',
  }
  return (
    <Card className="gap-0 p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <div className={cn('rounded-md p-2 ring-1', accentMap[accent])}>
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">{name}</p>
            <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className={cn('inline-block h-1.5 w-1.5 rounded-full', dot)} /> {statusLabel}
            </p>
          </div>
        </div>
        {version && <Badge variant="outline" className="h-5 px-1.5 text-[10px] text-muted-foreground">{version}</Badge>}
      </div>
      {endpoint && (
        <div className="mt-3 rounded-md border border-border/50 bg-card/40 p-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Endpoint</p>
          <p className="mt-0.5 truncate font-mono text-[11px] text-foreground/90">{endpoint}</p>
        </div>
      )}
      <div className="mt-3">
        <Button size="sm" variant="outline" className="h-7 w-full gap-1.5 text-xs" onClick={onConfigure}>
          <Settings className="h-3 w-3" /> Configure
        </Button>
      </div>
    </Card>
  )
}

function ToggleRow({
  icon: Icon, title, description, defaultOn = false, accent = 'emerald',
}: {
  icon: any; title: string; description: string; defaultOn?: boolean; accent?: 'emerald' | 'amber' | 'rose' | 'violet' | 'sky'
}) {
  const [on, setOn] = useState(defaultOn)
  const accentMap: Record<string, string> = {
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
    rose: 'text-rose-400',
    violet: 'text-violet-400',
    sky: 'text-sky-400',
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-card/40 p-3">
      <div className="flex items-start gap-2.5">
        <Icon className={cn('mt-0.5 h-4 w-4', accentMap[accent])} />
        <div>
          <p className="text-xs font-medium">{title}</p>
          <p className="text-[10px] text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {on && <Badge variant="outline" className="h-5 px-1.5 text-[10px] text-emerald-400 ring-emerald-500/30">Enabled</Badge>}
        <Switch checked={on} onCheckedChange={setOn} />
      </div>
    </div>
  )
}

function ReadOnlyField({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-md border border-border/50 bg-card/40 p-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground" onClick={() => toast.info(`Edit "${label}" is demo-only`)}>
          <Edit className="h-3 w-3" /> Edit
        </Button>
      </div>
      <p className={cn('mt-1 text-sm font-medium', accent)}>{value}</p>
    </div>
  )
}

/**
 * Operator-preference card for the critical-alarm audible beep. The setting
 * is stored per-browser in localStorage (no API, no sync) so each operator /
 * kiosk can choose independently.
 */
function AlarmSoundCard() {
  const [enabled, setEnabled] = useState<boolean>(true)

  // Hydrate from localStorage after mount (SSR-safe).
  useEffect(() => {
    setEnabled(isAlarmSoundEnabled())
  }, [])

  const handleToggle = (next: boolean) => {
    setEnabled(next)
    setAlarmSoundEnabled(next)
    if (next) {
      toast.success('Critical alarm sound enabled', {
        description: 'An audible 3-beep pattern will play when a critical alarm fires.',
      })
      // Preview the beep immediately so the operator can confirm their speakers work.
      // Note: this runs inside the click handler — satisfies the autoplay gesture.
      playCriticalBeep()
    } else {
      toast.info('Critical alarm sound muted', {
        description: 'Visual banners and toasts remain. Recommended only for mobile browsing.',
      })
    }
  }

  const handleTest = () => {
    playCriticalBeep()
    toast.info('Test beep played', { description: 'If you did not hear it, check browser audio output.' })
  }

  return (
    <div className="rounded-md border border-border/50 bg-card/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Volume2 className={cn('mt-0.5 h-4 w-4', enabled ? 'text-amber-400' : 'text-muted-foreground')} />
          <div className="min-w-0">
            <p className="text-xs font-medium">Alarm Sound</p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
              Play an audible beep when a critical alarm fires. Recommended for control rooms. Stored locally per browser.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {enabled && (
            <Badge variant="outline" className="h-5 px-1.5 text-[10px] text-amber-400 ring-amber-500/30">Enabled</Badge>
          )}
          <Switch checked={enabled} onCheckedChange={handleToggle} aria-label="Toggle critical alarm sound" />
        </div>
      </div>
      <div className="mt-3">
        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={handleTest}>
          <Volume2 className="h-3 w-3" /> Test Sound
        </Button>
      </div>
    </div>
  )
}

export function SettingsView() {
  const [s, setS] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [section, setSection] = useState<Section>('general')

  useEffect(() => {
    fetch('/api/indos/settings')
      .then(r => r.json())
      .then((d) => { setS(d); setLoading(false) })
      .catch(() => { setLoading(false); toast.error('Failed to load settings') })
  }, [])

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <ViewHeader
        title="System Settings"
        description="Configuration hub for the entire self-hosted IndOS stack — services, security, observability, AI and backup."
        icon={<Settings className="h-5 w-5" />}
        actions={
          <Badge variant="outline" className="h-8 gap-1.5 px-3 text-xs">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> All services healthy
          </Badge>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)
        ) : (
          <>
            <KpiCard label="Stack Services" value="12" icon={Boxes} accent="emerald" hint="all running" />
            <KpiCard label="Platform Version" value={val(s, 'system', 'platform.version', '1.0.0')} icon={CircuitBoard} accent="sky" hint={val(s, 'system', 'platform.name', 'IndOS')} />
            <KpiCard label="Auth Provider" value="OIDC" icon={Fingerprint} accent="violet" hint={val(s, 'security', 'auth.provider', 'Keycloak')} />
            <KpiCard label="Backup Schedule" value="02:00" unit="ICT" icon={DatabaseBackup} accent="amber" hint="daily · last successful" />
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        {/* Left nav */}
        <Card className="h-fit p-2 lg:col-span-1">
          <nav className="space-y-0.5">
            {NAV.map(item => {
              const Icon = item.icon
              const active = section === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setSection(item.id)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-xs font-medium transition-colors',
                    active
                      ? 'bg-primary/10 text-primary ring-1 ring-primary/20'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" /> {item.label}
                </button>
              )
            })}
          </nav>
          <Separator className="my-2" />
          <div className="px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Build</p>
            <p className="mt-0.5 font-mono text-[11px] text-foreground/80">indos-{val(s, 'system', 'platform.version', '1.0.0')}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">Self-hosted · SQLite · ICT</p>
          </div>
        </Card>

        {/* Section content */}
        <div className="space-y-4 lg:col-span-3">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-48" />
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : (
            <>
              {/* GENERAL */}
              {section === 'general' && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Sliders className="h-4 w-4 text-emerald-400" /> General
                    </CardTitle>
                    <CardDescription className="text-xs">Platform identity, regional defaults and appearance</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 md:grid-cols-2">
                    <ReadOnlyField label="Platform Name" value={val(s, 'system', 'platform.name', 'IndOS')} />
                    <ReadOnlyField label="Version" value={val(s, 'system', 'platform.version', '1.0.0')} />
                    <ReadOnlyField label="Organization" value={val(s, 'system', 'platform.org', 'Northwind Industrial Group')} />
                    <ReadOnlyField label="Reverse Proxy" value={val(s, 'system', 'proxy', 'Nginx')} />
                    <ReadOnlyField label="DNS Resolver" value={val(s, 'system', 'dns', 'Pi-hole')} />
                    <div className="rounded-md border border-border/50 bg-card/40 p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Theme</p>
                        <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[10px] text-muted-foreground" onClick={() => toast.info('Theme is locked to dark')}>
                          <Edit className="h-3 w-3" /> Edit
                        </Button>
                      </div>
                      <Select defaultValue="dark">
                        <SelectTrigger className="mt-1 h-8 w-full text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="dark">Dark (industrial)</SelectItem>
                          <SelectItem value="midnight">Midnight</SelectItem>
                          <SelectItem value="slate">Slate</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="rounded-md border border-border/50 bg-card/40 p-3">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Default Timezone</p>
                      <p className="mt-1 text-sm font-medium">Asia/Bangkok (ICT, UTC+7)</p>
                    </div>
                    <div className="rounded-md border border-border/50 bg-card/40 p-3">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Language</p>
                      <p className="mt-1 text-sm font-medium">English (en-US)</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* CONNECTIVITY */}
              {section === 'connectivity' && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Network className="h-4 w-4 text-sky-400" /> Connectivity
                    </CardTitle>
                    <CardDescription className="text-xs">Core services forming the IndOS data plane</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <ServiceCard icon={Radio} name="MQTT Broker" version="Mosquitto 2.0" endpoint={val(s, 'connectivity', 'mqtt.broker', 'mosquitto.indos.local:1883')} accent="sky" onConfigure={() => toast.info('MQTT config is demo-only')} />
                      <ServiceCard icon={DatabaseBackup} name="Time-Series DB" version={val(s, 'connectivity', 'timeseries.backend', 'InfluxDB 2.7')} endpoint="influxdb.indos.local:8086" accent="violet" onConfigure={() => toast.info('InfluxDB config is demo-only')} />
                      <ServiceCard icon={HardDrive} name="Cache" version={val(s, 'connectivity', 'cache.backend', 'Redis 7.2')} endpoint="redis.indos.local:6379" accent="rose" onConfigure={() => toast.info('Redis config is demo-only')} />
                      <ServiceCard icon={Boxes} name="Object Storage" version={val(s, 'connectivity', 'storage.backend', 'MinIO')} endpoint="minio.indos.local:9000" accent="amber" onConfigure={() => toast.info('MinIO config is demo-only')} />
                      <ServiceCard icon={Globe} name="Reverse Proxy" version={val(s, 'system', 'proxy', 'Nginx')} endpoint=":443 TLS" accent="emerald" onConfigure={() => toast.info('Nginx config is demo-only')} />
                      <ServiceCard icon={Workflow} name="Node-RED" version="3.1" endpoint="nodered.indos.local:1880" accent="sky" onConfigure={() => toast.info('Node-RED config is demo-only')} />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* SECURITY */}
              {section === 'security' && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ShieldCheck className="h-4 w-4 text-emerald-400" /> Security
                    </CardTitle>
                    <CardDescription className="text-xs">Identity, network and application-layer hardening</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-md border border-border/50 bg-card/40 p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Fingerprint className="h-4 w-4 text-violet-400" />
                            <div>
                              <p className="text-xs font-medium">Identity Provider</p>
                              <p className="text-[10px] text-muted-foreground">{val(s, 'security', 'auth.provider', 'Keycloak (OIDC)')}</p>
                            </div>
                          </div>
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 ring-emerald-500/30">Connected</Badge>
                        </div>
                        <Button size="sm" variant="outline" className="mt-3 h-7 w-full gap-1.5 text-xs" onClick={() => toast.info('Keycloak admin is demo-only')}>
                          <ExternalLink className="h-3 w-3" /> Open Keycloak
                        </Button>
                      </div>
                      <div className="rounded-md border border-border/50 bg-card/40 p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Lock className="h-4 w-4 text-sky-400" />
                            <div>
                              <p className="text-xs font-medium">WireGuard VPN</p>
                              <p className="text-[10px] text-muted-foreground">{val(s, 'security', 'vpn', 'WireGuard')} · 5 peers</p>
                            </div>
                          </div>
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 ring-emerald-500/30">Up</Badge>
                        </div>
                        <Button size="sm" variant="outline" className="mt-3 h-7 w-full gap-1.5 text-xs" onClick={() => toast.info('WireGuard config is demo-only')}>
                          <Settings className="h-3 w-3" /> Manage Peers
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      <ToggleRow icon={ShieldCheck} title="Two-Factor Auth (2FA)" description={val(s, 'security', 'auth.2fa', 'enabled') + ' · TOTP via authenticator apps'} defaultOn accent="emerald" />
                      <ToggleRow icon={Globe} title="Pi-hole DNS" description="Network-wide ad & telemetry blocking" defaultOn accent="amber" />
                      <ToggleRow icon={Gauge} title="Rate Limiting" description="100 req/min per IP on auth endpoints" defaultOn accent="sky" />
                      <ToggleRow icon={Bug} title="CSRF / XSS Protection" description="Strict CSP, signed cookies, helmet middleware" defaultOn accent="violet" />
                      <ToggleRow icon={ShieldAlert} title="Modbus Write Guard" description="Block unauthorized Modbus write commands at gateway" defaultOn accent="rose" />
                      <ToggleRow icon={Lock} title="TLS Everywhere" description="Force HTTPS, mTLS for device brokers" defaultOn accent="emerald" />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* OBSERVABILITY */}
              {section === 'observability' && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Activity className="h-4 w-4 text-violet-400" /> Observability
                    </CardTitle>
                    <CardDescription className="text-xs">Metrics, logs and traces for the IndOS control plane</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 md:grid-cols-2">
                      <ServiceCard icon={Gauge} name="Prometheus" version={val(s, 'observability', 'monitoring.metrics', 'Prometheus')} endpoint="prometheus.indos.local:9090" accent="amber" onConfigure={() => toast.info('Prometheus is demo-only')} />
                      <ServiceCard icon={LineChart} name="Grafana" version="10.4" endpoint="grafana.indos.local:3001" accent="amber" onConfigure={() => toast.info('Grafana is demo-only')} />
                      <ServiceCard icon={FileBarChart} name="Loki" version={val(s, 'observability', 'monitoring.logs', 'Loki')} endpoint="loki.indos.local:3100" accent="violet" onConfigure={() => toast.info('Loki is demo-only')} />
                      <ServiceCard icon={Search} name="OpenTelemetry" version={val(s, 'observability', 'monitoring.tracing', 'OpenTelemetry')} endpoint="otel-collector:4317" accent="sky" onConfigure={() => toast.info('OTel is demo-only')} />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ALERTS */}
              {section === 'alerts' && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <BellRing className="h-4 w-4 text-amber-400" /> Alerts
                    </CardTitle>
                    <CardDescription className="text-xs">Operator-safety audible &amp; visual alarms — recommended for control rooms</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <AlarmSoundCard />
                    <div className="flex items-start gap-2.5 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                      <div>
                        <p className="text-xs font-medium text-foreground">Banners are always visible</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          Connection-loss and stale-data banners are always visible (cannot be disabled). They are part of the operator-safety surface, not a preference.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* AI / ML */}
              {section === 'ai' && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Bot className="h-4 w-4 text-violet-400" /> AI / ML
                    </CardTitle>
                    <CardDescription className="text-xs">On-prem inference, vector search and computer vision stack</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 md:grid-cols-2">
                      <ServiceCard icon={Sparkles} name="Ollama LLM" version={val(s, 'ai', 'ai.backend', 'Ollama (llama3.1:8b)')} endpoint="ollama.indos.local:11434" accent="violet" onConfigure={() => toast.info('Ollama is demo-only')} />
                      <ServiceCard icon={Boxes} name="Qdrant Vector DB" version={val(s, 'ai', 'ai.vector_db', 'Qdrant 1.8')} endpoint="qdrant.indos.local:6333" accent="sky" onConfigure={() => toast.info('Qdrant is demo-only')} />
                      <ServiceCard icon={Camera} name="Frigate NVR" version="0.13" endpoint="frigate.indos.local:5000" accent="rose" onConfigure={() => toast.info('Frigate is demo-only')} />
                      <ServiceCard icon={Cpu} name="YOLO Detector" version="yolov8n" endpoint="cuda:0 · GPU accelerated" accent="amber" onConfigure={() => toast.info('YOLO is demo-only')} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="default" className="h-8 gap-1.5" onClick={() => toast.info('Opening Ollama playground (demo)')}>
                        <ExternalLink className="h-3.5 w-3.5" /> Open Ollama
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => toast.info('Reindexing embeddings (demo)')}>
                        <Sparkles className="h-3.5 w-3.5" /> Reindex Embeddings
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => toast.info('Loading model (demo)')}>
                        <Cpu className="h-3.5 w-3.5" /> Pull Model
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* BACKUP */}
              {section === 'backup' && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <DatabaseBackup className="h-4 w-4 text-amber-400" /> Backup & Recovery
                    </CardTitle>
                    <CardDescription className="text-xs">Automated snapshots of the IndOS database, config and object storage</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <ReadOnlyField label="Schedule" value={val(s, 'system', 'backup.schedule', 'daily 02:00 ICT')} />
                      <ReadOnlyField label="Retention" value="30 days" />
                      <ReadOnlyField label="Last Backup" value="Today 02:00 · 412 MB" accent="text-emerald-400" />
                      <ReadOnlyField label="Destination" value="MinIO bucket: indos-backup" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" className="h-8 gap-1.5" onClick={() => toast.success('Backup started', { description: 'Snapshot queued for immediate execution' })}>
                        <DatabaseBackup className="h-3.5 w-3.5" /> Run Backup Now
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => toast.info('Restore wizard is demo-only')}>
                        <RotateCcw className="h-3.5 w-3.5" /> Restore
                      </Button>
                    </div>
                    <Separator />
                    <div>
                      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium">
                        <History className="h-3.5 w-3.5 text-muted-foreground" /> Version History
                      </p>
                      <ScrollArea className="indos-scroll max-h-48">
                        <div className="space-y-1.5">
                          {[
                            { ts: 'Today 02:00', size: '412 MB', status: 'success' },
                            { ts: 'Yesterday 02:00', size: '408 MB', status: 'success' },
                            { ts: '2 days ago 02:00', size: '405 MB', status: 'success' },
                            { ts: '3 days ago 02:00', size: '402 MB', status: 'success' },
                            { ts: '4 days ago 02:00', size: '399 MB', status: 'success' },
                          ].map(v => (
                            <div key={v.ts} className="flex items-center justify-between rounded-md border border-border/50 bg-card/40 p-2 text-xs">
                              <span className="flex items-center gap-2">
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> {v.ts}
                              </span>
                              <span className="font-mono text-[11px] text-muted-foreground">{v.size}</span>
                              <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground" onClick={() => toast.info(`Restoring ${v.ts} (demo)`)}>
                                Restore
                              </Button>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* LICENSE */}
              {section === 'license' && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <KeySquare className="h-4 w-4 text-emerald-400" /> License
                    </CardTitle>
                    <CardDescription className="text-xs">Self-hosted Community Edition — no subscription, no telemetry</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                        <div>
                          <p className="text-sm font-semibold">IndOS Community Edition</p>
                          <p className="text-xs text-muted-foreground">Self-hosted · No subscription required</p>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <div className="rounded-md border border-border/50 bg-card/40 p-2">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">License Key</p>
                          <p className="mt-0.5 font-mono text-[11px] text-foreground/90">INDOS-CE-OPEN-SELFHOST-NOLIMIT</p>
                        </div>
                        <div className="rounded-md border border-border/50 bg-card/40 p-2">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Seats / Devices</p>
                          <p className="mt-0.5 text-sm font-medium">Unlimited</p>
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-2 md:grid-cols-3">
                      <ReadOnlyField label="Edition" value="Community" />
                      <ReadOnlyField label="Issued" value="2024-01-01" />
                      <ReadOnlyField label="Support" value="Community + GitHub Issues" />
                    </div>
                    <div className="flex items-center gap-2 rounded-md border border-border/50 bg-card/40 p-3">
                      <Sparkles className="h-4 w-4 text-violet-400" />
                      <p className="text-xs text-muted-foreground">
                        You're running the full open-source stack. <span className="text-foreground">Upgrade not required</span> — all features are unlocked.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
