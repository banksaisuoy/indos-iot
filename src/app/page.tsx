'use client'
import { useEffect, useMemo, lazy, Suspense } from 'react'
import { Sidebar } from '@/components/indos/shell/sidebar'
import { Topbar } from '@/components/indos/shell/topbar'
import { CommandPalette } from '@/components/indos/shell/command-palette'
import { useRealtime } from '@/lib/indos/realtime'
import { useIndOS } from '@/lib/indos/store'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import type { ViewId } from '@/lib/indos/types'
import { Cpu, CircuitBoard, Github, Server, Shield, BookOpen } from 'lucide-react'

// Lazy-loaded views
const DashboardView = lazy(() => import('@/components/indos/views/dashboard-view').then(m => ({ default: m.DashboardView })))
const ProjectsView = lazy(() => import('@/components/indos/views/projects-view').then(m => ({ default: m.ProjectsView })))
const DevicesView = lazy(() => import('@/components/indos/views/devices-view').then(m => ({ default: m.DevicesView })))
const GatewaysView = lazy(() => import('@/components/indos/views/gateways-view').then(m => ({ default: m.GatewaysView })))
const AlarmsView = lazy(() => import('@/components/indos/views/alarms-view').then(m => ({ default: m.AlarmsView })))
const MaintenanceView = lazy(() => import('@/components/indos/views/maintenance-view').then(m => ({ default: m.MaintenanceView })))
const EnergyView = lazy(() => import('@/components/indos/views/energy-view').then(m => ({ default: m.EnergyView })))
const EnvironmentView = lazy(() => import('@/components/indos/views/environment-view').then(m => ({ default: m.EnvironmentView })))
const AnalyticsView = lazy(() => import('@/components/indos/views/analytics-view').then(m => ({ default: m.AnalyticsView })))
const DigitalTwinView = lazy(() => import('@/components/indos/views/digital-twin-view').then(m => ({ default: m.DigitalTwinView })))
const MapView = lazy(() => import('@/components/indos/views/map-view').then(m => ({ default: m.MapView })))
const CamerasView = lazy(() => import('@/components/indos/views/cameras-view').then(m => ({ default: m.CamerasView })))
const OtaView = lazy(() => import('@/components/indos/views/ota-view').then(m => ({ default: m.OtaView })))
const AutomationView = lazy(() => import('@/components/indos/views/automation-view').then(m => ({ default: m.AutomationView })))
const AiView = lazy(() => import('@/components/indos/views/ai-view').then(m => ({ default: m.AiView })))
const ReportsView = lazy(() => import('@/components/indos/views/reports-view').then(m => ({ default: m.ReportsView })))
const PluginsView = lazy(() => import('@/components/indos/views/plugins-view').then(m => ({ default: m.PluginsView })))
const OrganizationsView = lazy(() => import('@/components/indos/views/organizations-view').then(m => ({ default: m.OrganizationsView })))
const AuditView = lazy(() => import('@/components/indos/views/audit-view').then(m => ({ default: m.AuditView })))
const SettingsView = lazy(() => import('@/components/indos/views/settings-view').then(m => ({ default: m.SettingsView })))

const VIEW_MAP: Record<ViewId, React.LazyExoticComponent<React.ComponentType>> = {
  dashboard: DashboardView,
  projects: ProjectsView,
  devices: DevicesView,
  gateways: GatewaysView,
  alarms: AlarmsView,
  maintenance: MaintenanceView,
  energy: EnergyView,
  environment: EnvironmentView,
  analytics: AnalyticsView,
  digitaltwin: DigitalTwinView,
  map: MapView,
  cameras: CamerasView,
  ota: OtaView,
  automation: AutomationView,
  ai: AiView,
  reports: ReportsView,
  plugins: PluginsView,
  organizations: OrganizationsView,
  audit: AuditView,
  settings: SettingsView,
}

function ViewLoader() {
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  )
}

export default function Home() {
  const { view } = useIndOS()
  const rt = useRealtime()
  const activeAlarms = rt.recentAlarms.filter(a => a.state === 'active').length

  const View = useMemo(() => VIEW_MAP[view], [view])

  // Toast on new critical alarms
  useEffect(() => {
    if (rt.recentAlarms.length === 0) return
    const latest = rt.recentAlarms[0]
    if (Date.now() - new Date(latest.ts).getTime() > 5000) return
    if (latest.severity === 'critical') {
      toast.error(latest.message, { description: `${latest.category} · ${new Date(latest.ts).toLocaleTimeString('en-GB', { hour12: false })}` })
    } else if (latest.severity === 'warning') {
      toast.warning(latest.message, { description: latest.category })
    }
  }, [rt.recentAlarms])

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar activeAlarms={activeAlarms} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="indos-scroll flex-1 overflow-y-auto">
            <div className="indos-grid-bg min-h-full">
              <Suspense fallback={<ViewLoader />}>
                <View />
              </Suspense>
            </div>
          </main>
        </div>
      </div>
      <CommandPalette />
      <Footer />
    </div>
  )
}

function Footer() {
  return (
    <footer className="mt-auto shrink-0 border-t border-border bg-card/40 px-4 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 font-medium text-foreground/80">
            <CircuitBoard className="h-3.5 w-3.5 text-primary" /> IndOS
          </span>
          <span className="hidden sm:inline">v1.0.0 · self-hosted</span>
          <span className="hidden items-center gap-1 md:flex">
            <Server className="h-3 w-3" /> 7 services · <span className="text-emerald-400">all healthy</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-1 sm:flex"><Shield className="h-3 w-3" /> WireGuard · Keycloak OIDC · 2FA</span>
          <span className="hidden items-center gap-1 lg:flex"><Cpu className="h-3 w-3" /> ESP32 · PLC · Modbus · OPC-UA · LoRaWAN</span>
          <a className="flex items-center gap-1 hover:text-foreground" href="#" onClick={(e) => e.preventDefault()}><BookOpen className="h-3 w-3" /> Docs</a>
          <a className="flex items-center gap-1 hover:text-foreground" href="#" onClick={(e) => e.preventDefault()}><Github className="h-3 w-3" /> Source</a>
        </div>
      </div>
    </footer>
  )
}
