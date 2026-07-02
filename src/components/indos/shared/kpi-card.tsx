'use client'
import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'

interface KpiCardProps {
  label: string
  value: string | number
  unit?: string
  icon?: LucideIcon
  delta?: number // percentage change
  hint?: string
  accent?: 'emerald' | 'amber' | 'sky' | 'rose' | 'violet' | 'slate'
  className?: string
}

const accentMap: Record<string, string> = {
  emerald: 'text-emerald-400 bg-emerald-500/10 ring-emerald-500/20',
  amber: 'text-amber-400 bg-amber-500/10 ring-amber-500/20',
  sky: 'text-sky-400 bg-sky-500/10 ring-sky-500/20',
  rose: 'text-rose-400 bg-rose-500/10 ring-rose-500/20',
  violet: 'text-violet-400 bg-violet-500/10 ring-violet-500/20',
  slate: 'text-slate-300 bg-slate-500/10 ring-slate-500/20',
}

export function KpiCard({ label, value, unit, icon: Icon, delta, hint, accent = 'emerald', className }: KpiCardProps) {
  return (
    <Card className={cn('relative overflow-hidden p-4 gap-0', className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-semibold tnum">{value}</span>
            {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
          </div>
          {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
        </div>
        {Icon && (
          <div className={cn('rounded-lg p-2 ring-1', accentMap[accent])}>
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
      {delta !== undefined && (
        <div className="mt-3 flex items-center gap-1 text-[11px]">
          <span className={cn('font-medium', delta >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
          </span>
          <span className="text-muted-foreground">vs last period</span>
        </div>
      )}
    </Card>
  )
}
