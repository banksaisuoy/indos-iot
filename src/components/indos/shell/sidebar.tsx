'use client'
import { cn } from '@/lib/utils'
import { useIndOS } from '@/lib/indos/store'
import type { ViewId } from '@/lib/indos/types'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  LayoutDashboard, FolderKanban, Cpu, Radio, Zap, Leaf, Bell, Wrench,
  BarChart3, Network, MapPin, Camera, RefreshCw, Workflow, Bot, FileText,
  Puzzle, Building2, ScrollText, Settings, Activity, CircuitBoard, ShieldCheck,
  ChevronLeft, ChevronRight, Server,
} from 'lucide-react'
import { LiveDot } from '@/components/indos/shared/charts'

interface NavItem {
  id: ViewId
  label: string
  icon: React.ComponentType<{ className?: string }>
  badge?: 'alarms'
}
interface NavGroup {
  title: string
  items: NavItem[]
}

const NAV: NavGroup[] = [
  {
    title: 'Overview',
    items: [{ id: 'dashboard', label: 'Executive Dashboard', icon: LayoutDashboard }],
  },
  {
    title: 'Operations',
    items: [
      { id: 'projects', label: 'Projects', icon: FolderKanban },
      { id: 'devices', label: 'Devices', icon: Cpu },
      { id: 'gateways', label: 'Gateways', icon: Radio },
      { id: 'alarms', label: 'Alarm Center', icon: Bell, badge: 'alarms' },
      { id: 'maintenance', label: 'Maintenance', icon: Wrench },
    ],
  },
  {
    title: 'Monitoring',
    items: [
      { id: 'energy', label: 'Energy & Utilities', icon: Zap },
      { id: 'environment', label: 'Environment', icon: Leaf },
      { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
  {
    title: 'Visualization',
    items: [
      { id: 'digitaltwin', label: 'Digital Twin', icon: Network },
      { id: 'map', label: 'GIS Map', icon: MapPin },
      { id: 'cameras', label: 'Camera Center', icon: Camera },
    ],
  },
  {
    title: 'Automation & Edge',
    items: [
      { id: 'automation', label: 'Automation Flows', icon: Workflow },
      { id: 'ota', label: 'OTA Firmware', icon: RefreshCw },
    ],
  },
  {
    title: 'Intelligence',
    items: [
      { id: 'ai', label: 'AI Center', icon: Bot },
      { id: 'reports', label: 'Reports', icon: FileText },
    ],
  },
  {
    title: 'System',
    items: [
      { id: 'plugins', label: 'Plugin Marketplace', icon: Puzzle },
      { id: 'organizations', label: 'Organizations', icon: Building2 },
      { id: 'audit', label: 'Audit Logs', icon: ScrollText },
      { id: 'settings', label: 'System Settings', icon: Settings },
    ],
  },
]

export function Sidebar({
  activeAlarms = 0,
  variant = 'desktop',
  onNavigate,
}: {
  activeAlarms?: number
  variant?: 'desktop' | 'mobile'
  onNavigate?: () => void
}) {
  const { view, setView, sidebarCollapsed, toggleSidebar } = useIndOS()

  const go = (v: ViewId) => {
    setView(v)
    onNavigate?.()
  }

  const isMobile = variant === 'mobile'

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar',
        isMobile ? 'w-full' : 'sticky top-0 hidden h-screen lg:flex',
        !isMobile && (sidebarCollapsed ? 'w-[64px]' : 'w-[248px]')
      )}
    >
      {/* Brand */}
      <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4">
        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground ring-1 ring-primary/40 indos-glow">
          <CircuitBoard className="h-4.5 w-4.5" />
        </div>
        {!sidebarCollapsed && (
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold tracking-tight">IndOS</span>
              <span className="rounded bg-primary/15 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary">v1.0</span>
            </div>
            <p className="truncate text-[10px] text-muted-foreground">Industrial IoT OS</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <ScrollArea className="indos-scroll flex-1 px-2 py-3">
        <TooltipProvider delayDuration={200}>
          <nav className="space-y-4">
            {NAV.map((group) => (
              <div key={group.title}>
                {!sidebarCollapsed && (
                  <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {group.title}
                  </p>
                )}
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = view === item.id
                    const Icon = item.icon
                    const btn = (
                      <button
                        onClick={() => go(item.id)}
                        className={cn(
                          'group relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                          sidebarCollapsed && 'justify-center',
                          active
                            ? 'bg-primary/12 text-primary font-medium'
                            : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground'
                        )}
                      >
                        {active && <span className="absolute left-0 top-1/2 h-5 -translate-y-1/2 rounded-r-full bg-primary" style={{ width: 2 }} />}
                        <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-primary' : '')} />
                        {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                        {!sidebarCollapsed && item.badge === 'alarms' && activeAlarms > 0 && (
                          <span className="ml-auto rounded-full bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-rose-400 tnum">{activeAlarms}</span>
                        )}
                        {sidebarCollapsed && item.badge === 'alarms' && activeAlarms > 0 && (
                          <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-rose-500" />
                        )}
                      </button>
                    )
                    return sidebarCollapsed ? (
                      <Tooltip key={item.id}>
                        <TooltipTrigger asChild>{btn}</TooltipTrigger>
                        <TooltipContent side="right" className="font-medium">{item.label}</TooltipContent>
                      </Tooltip>
                    ) : (
                      <div key={item.id}>{btn}</div>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>
        </TooltipProvider>
      </ScrollArea>

      {/* Footer: status + collapse */}
      <div className="border-t border-sidebar-border p-2">
        <div className={cn('flex items-center gap-2 rounded-md px-2.5 py-2', !sidebarCollapsed && 'bg-sidebar-accent/50')}>
          <div className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 ring-1 ring-emerald-500/20">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          {!sidebarCollapsed && (
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <LiveDot color="bg-emerald-400" />
                <span className="text-[11px] font-medium">All systems operational</span>
              </div>
              <p className="truncate text-[10px] text-muted-foreground">Self-hosted · 7 services up</p>
            </div>
          )}
        </div>
        <button
          onClick={toggleSidebar}
          className="mt-1 flex w-full items-center justify-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          {sidebarCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <><ChevronLeft className="h-3.5 w-3.5" /> Collapse</>}
        </button>
      </div>
    </aside>
  )
}
