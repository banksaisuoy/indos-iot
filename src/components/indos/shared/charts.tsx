'use client'
import { Area, AreaChart, ResponsiveContainer, YAxis, Tooltip, Line, LineChart, Bar, BarChart, XAxis, CartesianGrid } from 'recharts'
import { cn } from '@/lib/utils'

const palette = ['#34d399', '#fbbf24', '#38bdf8', '#f472b6', '#a78bfa', '#fb7185']

export function Sparkline({ data, color = '#34d399', height = 40 }: { data: number[]; color?: string; height?: number }) {
  const d = data.map((v, i) => ({ i, v }))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={d} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
        <defs>
          <linearGradient id={`spark-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#spark-${color})`} isAnimationActive={false} />
        <YAxis domain={['dataMin', 'dataMax']} hide />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function MultiSeriesArea({
  series,
  height = 220,
  colors,
  unit = '',
}: {
  series: Record<string, { t: string; v: number }[]>
  height?: number
  colors?: string[]
  unit?: string
}) {
  const keys = Object.keys(series)
  const cols = colors || palette.slice(0, keys.length)
  // merge by index
  const len = Math.max(...keys.map((k) => series[k].length))
  const merged = Array.from({ length: len }, (_, i) => {
    const row: any = { t: series[keys[0]]?.[i]?.t || '' }
    for (const k of keys) row[k] = series[k]?.[i]?.v ?? null
    return row
  })
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={merged} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <defs>
          {cols.map((c, i) => (
            <linearGradient key={i} id={`area-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c} stopOpacity={0.35} />
              <stop offset="100%" stopColor={c} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.06)" vertical={false} />
        <XAxis dataKey="t" tick={{ fontSize: 10, fill: 'oklch(0.7 0.01 250)' }} tickFormatter={(v) => fmtTime(v)} minTickGap={48} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: 'oklch(0.7 0.01 250)' }} axisLine={false} tickLine={false} width={44} />
        <Tooltip
          contentStyle={{ background: 'oklch(0.22 0.014 250)', border: '1px solid oklch(1 0 0 / 0.1)', borderRadius: 8, fontSize: 12 }}
          labelFormatter={(v) => new Date(v as string).toLocaleString()}
          formatter={(v: any, name) => [`${Number(v).toFixed(1)} ${unit}`, name]}
        />
        {keys.map((k, i) => (
          <Area key={k} type="monotone" dataKey={k} stroke={cols[i]} strokeWidth={1.8} fill={`url(#area-${i})`} isAnimationActive={false} dot={false} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function MultiSeriesLine({
  series,
  height = 220,
  colors,
  unit = '',
}: {
  series: Record<string, { t: string; v: number }[]>
  height?: number
  colors?: string[]
  unit?: string
}) {
  const keys = Object.keys(series)
  const cols = colors || palette.slice(0, keys.length)
  const len = Math.max(...keys.map((k) => series[k].length))
  const merged = Array.from({ length: len }, (_, i) => {
    const row: any = { t: series[keys[0]]?.[i]?.t || '' }
    for (const k of keys) row[k] = series[k]?.[i]?.v ?? null
    return row
  })
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={merged} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.06)" vertical={false} />
        <XAxis dataKey="t" tick={{ fontSize: 10, fill: 'oklch(0.7 0.01 250)' }} tickFormatter={(v) => fmtTime(v)} minTickGap={48} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: 'oklch(0.7 0.01 250)' }} axisLine={false} tickLine={false} width={44} />
        <Tooltip
          contentStyle={{ background: 'oklch(0.22 0.014 250)', border: '1px solid oklch(1 0 0 / 0.1)', borderRadius: 8, fontSize: 12 }}
          labelFormatter={(v) => new Date(v as string).toLocaleString()}
          formatter={(v: any, name) => [`${Number(v).toFixed(1)} ${unit}`, name]}
        />
        {keys.map((k, i) => (
          <Line key={k} type="monotone" dataKey={k} stroke={cols[i]} strokeWidth={1.8} isAnimationActive={false} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

export function SimpleBar({ data, height = 220, color = '#34d399', unit = '' }: { data: { label: string; v: number }[]; height?: number; color?: string; unit?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.06)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'oklch(0.7 0.01 250)' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: 'oklch(0.7 0.01 250)' }} axisLine={false} tickLine={false} width={44} />
        <Tooltip
          cursor={{ fill: 'oklch(1 0 0 / 0.04)' }}
          contentStyle={{ background: 'oklch(0.22 0.014 250)', border: '1px solid oklch(1 0 0 / 0.1)', borderRadius: 8, fontSize: 12 }}
          formatter={(v: any) => [`${v} ${unit}`, 'value']}
        />
        <Bar dataKey="v" fill={color} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function fmtTime(t: string) {
  const d = new Date(t)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function LiveDot({ className, color = 'bg-emerald-400' }: { className?: string; color?: string }) {
  return (
    <span className={cn('relative inline-flex h-2 w-2', className)}>
      <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', color)} />
      <span className={cn('relative inline-flex h-2 w-2 rounded-full', color)} />
    </span>
  )
}
