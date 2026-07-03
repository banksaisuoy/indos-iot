'use client'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

const map: Record<string, { cls: string; label: string }> = {
  online: { cls: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30', label: 'Online' },
  offline: { cls: 'bg-slate-500/15 text-slate-400 ring-slate-500/30', label: 'Offline' },
  fault: { cls: 'bg-rose-500/15 text-rose-400 ring-rose-500/30', label: 'Fault' },
  maintenance: { cls: 'bg-amber-500/15 text-amber-400 ring-amber-500/30', label: 'Maintenance' },
  running: { cls: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30', label: 'Running' },
  idle: { cls: 'bg-sky-500/15 text-sky-400 ring-sky-500/30', label: 'Idle' },
  active: { cls: 'bg-rose-500/15 text-rose-400 ring-rose-500/30', label: 'Active' },
  acknowledged: { cls: 'bg-amber-500/15 text-amber-400 ring-amber-500/30', label: 'Acknowledged' },
  resolved: { cls: 'bg-slate-500/15 text-slate-400 ring-slate-500/30', label: 'Resolved' },
  open: { cls: 'bg-sky-500/15 text-sky-400 ring-sky-500/30', label: 'Open' },
  inprogress: { cls: 'bg-amber-500/15 text-amber-400 ring-amber-500/30', label: 'In Progress' },
  completed: { cls: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30', label: 'Completed' },
  onhold: { cls: 'bg-slate-500/15 text-slate-400 ring-slate-500/30', label: 'On Hold' },
  cancelled: { cls: 'bg-slate-500/15 text-slate-400 ring-slate-500/30', label: 'Cancelled' },
  paused: { cls: 'bg-amber-500/15 text-amber-400 ring-amber-500/30', label: 'Paused' },
  recording: { cls: 'bg-violet-500/15 text-violet-400 ring-violet-500/30', label: 'Recording' },
  pending: { cls: 'bg-amber-500/15 text-amber-400 ring-amber-500/30', label: 'Pending' },
  completed_ota: { cls: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30', label: 'Completed' },
  failed: { cls: 'bg-rose-500/15 text-rose-400 ring-rose-500/30', label: 'Failed' },
  rollback: { cls: 'bg-violet-500/15 text-violet-400 ring-violet-500/30', label: 'Rollback' },
  stable: { cls: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30', label: 'Stable' },
  draft: { cls: 'bg-sky-500/15 text-sky-400 ring-sky-500/30', label: 'Draft' },
  deprecated: { cls: 'bg-slate-500/15 text-slate-400 ring-slate-500/30', label: 'Deprecated' },
}

const severityMap: Record<string, string> = {
  critical: 'bg-rose-500/15 text-rose-400 ring-rose-500/30',
  warning: 'bg-amber-500/15 text-amber-400 ring-amber-500/30',
  info: 'bg-sky-500/15 text-sky-400 ring-sky-500/30',
  high: 'bg-rose-500/15 text-rose-400 ring-rose-500/30',
  medium: 'bg-amber-500/15 text-amber-400 ring-amber-500/30',
  low: 'bg-sky-500/15 text-sky-400 ring-sky-500/30',
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const m = map[status] || { cls: 'bg-slate-500/15 text-slate-400 ring-slate-500/30', label: status }
  return (
    <Badge variant="outline" className={cn('font-medium ring-1 capitalize', m.cls, className)}>
      <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {m.label}
    </Badge>
  )
}

export function SeverityBadge({ severity }: { severity: string }) {
  const cls = severityMap[severity] || severityMap.info
  return (
    <Badge variant="outline" className={cn('font-medium ring-1 capitalize', cls)}>
      {severity}
    </Badge>
  )
}
