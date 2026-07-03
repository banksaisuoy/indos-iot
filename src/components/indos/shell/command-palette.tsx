'use client'
import { useEffect } from 'react'
import { useIndOS } from '@/lib/indos/store'
import type { ViewId } from '@/lib/indos/types'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command'
import {
  LayoutDashboard, FolderKanban, Cpu, Radio, Zap, Leaf, Bell, Wrench,
  BarChart3, Network, MapPin, Camera, RefreshCw, Workflow, Bot, FileText,
  Puzzle, Building2, ScrollText, Settings,
} from 'lucide-react'

const ITEMS: { id: ViewId; label: string; icon: any; group: string }[] = [
  { id: 'dashboard', label: 'Executive Dashboard', icon: LayoutDashboard, group: 'Overview' },
  { id: 'projects', label: 'Projects', icon: FolderKanban, group: 'Operations' },
  { id: 'devices', label: 'Devices', icon: Cpu, group: 'Operations' },
  { id: 'gateways', label: 'Gateways', icon: Radio, group: 'Operations' },
  { id: 'alarms', label: 'Alarm Center', icon: Bell, group: 'Operations' },
  { id: 'maintenance', label: 'Maintenance', icon: Wrench, group: 'Operations' },
  { id: 'energy', label: 'Energy & Utilities', icon: Zap, group: 'Monitoring' },
  { id: 'environment', label: 'Environment Monitoring', icon: Leaf, group: 'Monitoring' },
  { id: 'analytics', label: 'Analytics', icon: BarChart3, group: 'Monitoring' },
  { id: 'digitaltwin', label: 'Digital Twin', icon: Network, group: 'Visualization' },
  { id: 'map', label: 'GIS Map', icon: MapPin, group: 'Visualization' },
  { id: 'cameras', label: 'Camera Center', icon: Camera, group: 'Visualization' },
  { id: 'automation', label: 'Automation Flows', icon: Workflow, group: 'Automation & Edge' },
  { id: 'ota', label: 'OTA Firmware', icon: RefreshCw, group: 'Automation & Edge' },
  { id: 'ai', label: 'AI Center', icon: Bot, group: 'Intelligence' },
  { id: 'reports', label: 'Reports', icon: FileText, group: 'Intelligence' },
  { id: 'plugins', label: 'Plugin Marketplace', icon: Puzzle, group: 'System' },
  { id: 'organizations', label: 'Organizations & Users', icon: Building2, group: 'System' },
  { id: 'audit', label: 'Audit Logs', icon: ScrollText, group: 'System' },
  { id: 'settings', label: 'System Settings', icon: Settings, group: 'System' },
]

export function CommandPalette() {
  const { commandOpen, setCommandOpen, setView } = useIndOS()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCommandOpen(!commandOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [commandOpen, setCommandOpen])

  const groups = Array.from(new Set(ITEMS.map((i) => i.group)))

  return (
    <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
      <CommandInput placeholder="Search modules, devices, projects…" />
      <CommandList className="indos-scroll">
        <CommandEmpty>No results found.</CommandEmpty>
        {groups.map((g, gi) => (
          <div key={g}>
            <CommandGroup heading={g}>
              {ITEMS.filter((i) => i.group === g).map((item) => (
                <CommandItem
                  key={item.id}
                  onSelect={() => { setView(item.id); setCommandOpen(false) }}
                  className="cursor-pointer"
                >
                  <item.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
            {gi < groups.length - 1 && <CommandSeparator />}
          </div>
        ))}
      </CommandList>
    </CommandDialog>
  )
}
