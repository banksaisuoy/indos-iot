'use client'
import { useEffect, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useIndOS } from '@/lib/indos/store'
import { useRealtime } from '@/lib/indos/realtime'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Sidebar } from './sidebar'
import { LiveDot } from '@/components/indos/shared/charts'
import {
  Menu, Search, Bell, Settings, User, LogOut, Activity, Cpu, CircuitBoard,
  ChevronLeft, ChevronRight, Server, Wifi, Zap, ShieldCheck,
} from 'lucide-react'
import type { ViewId } from '@/lib/indos/types'

const VIEW_TITLES: Record<ViewId, string> = {
  dashboard: 'Executive Dashboard',
  projects: 'Projects',
  devices: 'Device Manager',
  gateways: 'Gateway Manager',
  energy: 'Energy & Utilities',
  environment: 'Environment Monitoring',
  alarms: 'Alarm Center',
  maintenance: 'Maintenance',
  analytics: 'Analytics',
  digitaltwin: 'Digital Twin',
  map: 'GIS Map',
  cameras: 'Camera Center',
  ota: 'OTA Firmware',
  automation: 'Automation Flows',
  ai: 'AI Center',
  reports: 'Reports',
  plugins: 'Plugin Marketplace',
  organizations: 'Organizations & Users',
  settings: 'System Settings',
  audit: 'Audit Logs',
  deployment: 'Deployment Guide',
  duckfarm: 'Duck Farm Controller',
}

export function Topbar() {
  const { view, setView, sidebarCollapsed, toggleSidebar, setCommandOpen } = useIndOS()
  const rt = useRealtime()
  const [clock, setClock] = useState('')

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('en-GB', { hour12: false, timeZone: 'Asia/Bangkok' }))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  const sys = rt.system
  const alarmCount = rt.recentAlarms.filter(a => a.state === 'active').length

  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-3 backdrop-blur-md sm:px-4">
      {/* Mobile menu */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[280px] p-0">
          <Sidebar variant="mobile" onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Collapse toggle (desktop) */}
      <Button variant="ghost" size="icon" className="hidden lg:inline-flex" onClick={toggleSidebar}>
        {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </Button>

      {/* Breadcrumb / title */}
      <div className="flex min-w-0 items-center gap-2">
        <CircuitBoard className="h-4 w-4 text-primary lg:hidden" />
        <h2 className="truncate text-sm font-semibold sm:text-base">{VIEW_TITLES[view]}</h2>
        <Badge variant="outline" className="hidden items-center gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-400 sm:inline-flex">
          <LiveDot color="bg-emerald-400" /> LIVE
        </Badge>
      </div>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        {/* Search / command */}
        <Button variant="outline" size="sm" className="hidden h-9 gap-2 px-2.5 text-muted-foreground md:flex md:w-52 lg:w-64" onClick={() => setCommandOpen(true)}>
          <Search className="h-4 w-4" />
          <span className="text-xs">Search or jump to…</span>
          <kbd className="ml-auto rounded border border-border bg-muted px-1.5 py-0.5 text-[10px]">⌘K</kbd>
        </Button>
        <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setCommandOpen(true)}>
          <Search className="h-4 w-4" />
        </Button>

        {/* Live system mini-stats */}
        <TooltipProvider delayDuration={150}>
          <div className="hidden items-center gap-1 rounded-md border border-border bg-card/60 px-2 py-1 xl:flex">
            <MiniStat icon={Wifi} value={rt.connected ? 'LIVE' : 'CONN'} good={rt.connected} tip="Realtime telemetry stream" />
            <span className="h-3 w-px bg-border" />
            <MiniStat icon={Zap} value={sys ? `${sys.mqttThroughput}/s` : '—'} tip="MQTT throughput" />
            <span className="h-3 w-px bg-border" />
            <MiniStat icon={Server} value={sys ? `${sys.cpuPct}%` : '—'} tip="Platform CPU" />
            <span className="h-3 w-px bg-border" />
            <MiniStat icon={Activity} value={sys ? `${sys.apiLatencyMs}ms` : '—'} tip="API latency" />
          </div>
        </TooltipProvider>

        {/* Clock */}
        <div className="hidden items-center gap-1.5 rounded-md border border-border bg-card/60 px-2.5 py-1 font-mono text-xs sm:flex">
          <span className="text-muted-foreground">ICT</span>
          <span className="tnum">{clock}</span>
        </div>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-4.5 w-4.5" />
              {alarmCount > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white tnum">
                  {alarmCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 p-0">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Live Notifications</span>
              <Badge variant="outline" className="border-rose-500/30 bg-rose-500/10 text-rose-400">{alarmCount} active</Badge>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="indos-scroll max-h-80 overflow-y-auto">
              {rt.recentAlarms.length === 0 ? (
                <div className="px-3 py-8 text-center text-xs text-muted-foreground">No new notifications. System is stable.</div>
              ) : (
                rt.recentAlarms.slice(0, 12).map((a) => (
                  <button key={a.id} onClick={() => setView('alarms')} className="flex w-full items-start gap-2.5 border-b border-border/50 px-3 py-2.5 text-left hover:bg-accent/40">
                    <span className={cn('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', a.severity === 'critical' ? 'bg-rose-500' : a.severity === 'warning' ? 'bg-amber-500' : 'bg-sky-500')} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{a.message}</p>
                      <p className="text-[10px] text-muted-foreground">{a.category} · {new Date(a.ts).toLocaleTimeString('en-GB', { hour12: false })}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User menu */}
        <UserMenu />
      </div>
    </header>
  )
}

function UserMenu() {
  const { data: session } = useSession()
  const { setView } = useIndOS()
  const name = session?.user?.name || 'User'
  const email = session?.user?.email || ''
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-1.5 sm:px-2">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">{initials}</AvatarFallback>
          </Avatar>
          <div className="hidden text-left sm:block">
            <p className="text-xs font-medium leading-tight">{name}</p>
            <p className="text-[10px] leading-tight text-muted-foreground capitalize">{(session?.user as any)?.role || 'user'}</p>
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="text-sm font-medium">{name}</span>
            <span className="text-xs font-normal text-muted-foreground">{email}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setView('settings')}><Settings className="mr-2 h-4 w-4" /> System Settings</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setView('audit')}><ShieldCheck className="mr-2 h-4 w-4" /> Audit Logs</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setView('organizations')}><User className="mr-2 h-4 w-4" /> Profile & Access</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-rose-400 focus:text-rose-400" onClick={() => signOut({ callbackUrl: '/login' })}>
          <LogOut className="mr-2 h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MiniStat({ icon: Icon, value, good, tip }: { icon: any; value: string; good?: boolean; tip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1 px-1 text-[11px] font-medium">
          <Icon className={cn('h-3 w-3', good ? 'text-emerald-400' : 'text-muted-foreground')} />
          <span className="tnum text-foreground/80">{value}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">{tip}</TooltipContent>
    </Tooltip>
  )
}
