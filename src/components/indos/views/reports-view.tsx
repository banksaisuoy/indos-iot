'use client'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { KpiCard } from '@/components/indos/shared/kpi-card'
import { ViewHeader } from '@/components/indos/shared/view-header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  FileText, FileSpreadsheet, FileBarChart, Download, Plus, Calendar,
  Mail, Webhook, Database, Clock, Loader2, FileCheck2, History, CloudUpload,
  FileType2, Filter, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Project {
  id: string
  name: string
  slug: string
  status?: string
}

type ReportType = 'Energy' | 'OEE' | 'Alarm' | 'Maintenance' | 'Compliance' | 'Production'
type ReportFormat = 'PDF' | 'Excel' | 'CSV'
type ReportStatus = 'ready' | 'generating' | 'scheduled'

interface ReportRow {
  id: string
  name: string
  type: ReportType
  format: ReportFormat
  period: string
  generatedBy: string
  sizeKb: number
  status: ReportStatus
  createdAt: string
  scheduled?: boolean
}

const TYPE_STYLE: Record<ReportType, string> = {
  Energy: 'bg-amber-500/15 text-amber-400 ring-amber-500/30',
  OEE: 'bg-violet-500/15 text-violet-400 ring-violet-500/30',
  Alarm: 'bg-rose-500/15 text-rose-400 ring-rose-500/30',
  Maintenance: 'bg-sky-500/15 text-sky-400 ring-sky-500/30',
  Compliance: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30',
  Production: 'bg-slate-500/15 text-slate-300 ring-slate-500/30',
}

const FORMAT_META: Record<ReportFormat, { cls: string; icon: any }> = {
  PDF: { cls: 'bg-rose-500/15 text-rose-400 ring-rose-500/30', icon: FileText },
  Excel: { cls: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30', icon: FileSpreadsheet },
  CSV: { cls: 'bg-slate-500/15 text-slate-300 ring-slate-500/30', icon: FileBarChart },
}

const STATUS_MAP: Record<ReportStatus, string> = {
  ready: 'completed',
  generating: 'inprogress',
  scheduled: 'pending',
}

const SCHEDULED: ReportRow[] = [
  { id: 's1', name: 'Weekly Energy Summary', type: 'Energy', format: 'PDF', period: 'last 7 days', generatedBy: 'scheduler', sizeKb: 0, status: 'scheduled', createdAt: new Date().toISOString(), scheduled: true },
  { id: 's2', name: 'Monthly Compliance Audit', type: 'Compliance', format: 'PDF', period: 'last 30 days', generatedBy: 'scheduler', sizeKb: 0, status: 'scheduled', createdAt: new Date().toISOString(), scheduled: true },
  { id: 's3', name: 'Daily OEE Digest', type: 'OEE', format: 'Excel', period: 'last 24h', generatedBy: 'scheduler', sizeKb: 0, status: 'scheduled', createdAt: new Date().toISOString(), scheduled: true },
]

const SEED_REPORTS: ReportRow[] = [
  { id: 'r1', name: 'Q3 Energy Consumption', type: 'Energy', format: 'PDF', period: 'Jul–Sep 2024', generatedBy: 'a.morales', sizeKb: 4820, status: 'ready', createdAt: '2024-10-01T08:12:00Z' },
  { id: 'r2', name: 'Plant A — OEE September', type: 'OEE', format: 'Excel', period: 'Sep 2024', generatedBy: 'k.chen', sizeKb: 1280, status: 'ready', createdAt: '2024-10-01T06:00:00Z' },
  { id: 'r3', name: 'Alarm Trend Analysis', type: 'Alarm', format: 'PDF', period: 'last 30 days', generatedBy: 'system', sizeKb: 3110, status: 'ready', createdAt: '2024-09-30T22:30:00Z' },
  { id: 'r4', name: 'Maintenance Backlog', type: 'Maintenance', format: 'CSV', period: 'last 90 days', generatedBy: 'j.singh', sizeKb: 640, status: 'ready', createdAt: '2024-09-30T15:45:00Z' },
  { id: 'r5', name: 'Production Throughput', type: 'Production', format: 'Excel', period: 'Sep 2024', generatedBy: 'a.morales', sizeKb: 2240, status: 'ready', createdAt: '2024-09-29T11:20:00Z' },
]

const DELIVERY_OPTIONS = [
  { id: 'email', name: 'Email', desc: 'SMTP relay to recipients list with PDF attachment.', icon: Mail, cls: 'bg-sky-500/15 text-sky-400 ring-sky-500/30', enabled: true },
  { id: 'webhook', name: 'Webhook', desc: 'POST JSON payload + signed download URL to your endpoint.', icon: Webhook, cls: 'bg-violet-500/15 text-violet-400 ring-violet-500/30', enabled: true },
  { id: 'minio', name: 'MinIO S3', desc: 'Push artifact to self-hosted object storage bucket.', icon: Database, cls: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30', enabled: false },
]

export function ReportsView() {
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [reports, setReports] = useState<ReportRow[]>(SEED_REPORTS)
  const [generating, setGenerating] = useState(false)
  const [form, setForm] = useState({
    type: 'Energy' as ReportType,
    format: 'PDF' as ReportFormat,
    period: 'last 30 days',
    projectId: '',
    recipients: '',
    scheduled: false,
    cron: '0 6 * * 1',
  })

  useEffect(() => {
    fetch('/api/indos/projects')
      .then(r => r.json())
      .then((p: Project[]) => setProjects(p))
      .catch(() => setProjects([]))
  }, [])

  const kpis = useMemo(() => {
    const thisMonth = reports.filter(r => new Date(r.createdAt).getMonth() === new Date().getMonth()).length
    return {
      thisMonth: thisMonth || reports.length,
      scheduled: SCHEDULED.length,
      formats: 3,
      lastBackup: '2h ago',
    }
  }, [reports])

  function generate() {
    if (!form.recipients.trim() && !form.scheduled) {
      toast.error('Add at least one recipient or enable scheduling')
      return
    }
    setGenerating(true)
    const proj = projects?.find(p => p.id === form.projectId)?.name ?? 'all projects'
    const id = 'r-' + Math.random().toString(36).slice(2, 9)
    const newReport: ReportRow = {
      id,
      name: `${form.type} Report · ${proj}`,
      type: form.type,
      format: form.format,
      period: form.period,
      generatedBy: 'you',
      sizeKb: 0,
      status: 'generating',
      createdAt: new Date().toISOString(),
      scheduled: form.scheduled,
    }
    setTimeout(() => {
      setReports(prev => [newReport, ...prev])
      setGenerating(false)
      toast('Generating report…', { description: `${form.type} · ${form.format} → ${proj}` })
      // flip to ready after 2s
      setTimeout(() => {
        setReports(prev => prev.map(r => r.id === id ? { ...r, status: 'ready', sizeKb: Math.round(800 + Math.random() * 4000) } : r))
        toast.success('Report ready', { description: newReport.name })
      }, 2000)
    }, 600)
  }

  function download(r: ReportRow) {
    toast('Generating download…', { description: `${r.name} (${r.format})` })
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <ViewHeader
        title="Reports & Compliance"
        description="Generate, schedule & deliver operational, energy and compliance reports across the platform."
        icon={<FileText className="h-5 w-5" />}
        actions={
          <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => toast('Backup queued', { description: 'Snapshot → MinIO S3 bucket://indos-reports' })}>
            <CloudUpload className="h-3.5 w-3.5" /> Backup now
          </Button>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard label="Reports This Month" value={kpis.thisMonth} icon={FileText} accent="sky" hint="generated artifacts" />
        <KpiCard label="Scheduled Reports" value={kpis.scheduled} icon={Calendar} accent="amber" hint="automated jobs" />
        <KpiCard label="Formats Supported" value={kpis.formats} icon={FileType2} accent="violet" hint="PDF · Excel · CSV" />
        <KpiCard label="Last Backup" value={kpis.lastBackup} icon={History} accent="emerald" hint="MinIO S3 snapshot" />
      </div>

      {/* Main grid: reports table + create form */}
      <div className="grid gap-4 xl:grid-cols-5">
        {/* Reports table */}
        <Card className="xl:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileBarChart className="h-4 w-4 text-sky-400" /> Generated Reports
              </CardTitle>
              <CardDescription className="text-xs">{reports.length} artifacts · click to download</CardDescription>
            </div>
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
              <Filter className="h-3 w-3" /> Filter
            </Button>
          </CardHeader>
          <CardContent>
            <ScrollArea className="indos-scroll max-h-[560px] pr-2">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/60 hover:bg-transparent">
                    <TableHead className="text-[11px] uppercase">Report</TableHead>
                    <TableHead className="text-[11px] uppercase">Type</TableHead>
                    <TableHead className="hidden text-[11px] uppercase sm:table-cell">Format</TableHead>
                    <TableHead className="hidden text-[11px] uppercase md:table-cell">Period</TableHead>
                    <TableHead className="hidden text-[11px] uppercase lg:table-cell">By</TableHead>
                    <TableHead className="hidden text-[11px] uppercase md:table-cell">Size</TableHead>
                    <TableHead className="text-[11px] uppercase">Status</TableHead>
                    <TableHead className="w-[60px] text-right text-[11px] uppercase">DL</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.map(r => {
                    const fmt = FORMAT_META[r.format]
                    const FmtIcon = fmt.icon
                    return (
                      <TableRow key={r.id} className="border-border/40 text-sm">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={cn('rounded-md p-1.5 ring-1', fmt.cls)}>
                              <FmtIcon className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium">{r.name}</p>
                              <p className="text-[10px] text-muted-foreground">{new Date(r.createdAt).toLocaleString('en-GB', { hour12: false, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('ring-1', TYPE_STYLE[r.type])}>{r.type}</Badge>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant="outline" className={cn('ring-1', fmt.cls)}>{r.format}</Badge>
                        </TableCell>
                        <TableCell className="hidden text-xs text-muted-foreground md:table-cell">{r.period}</TableCell>
                        <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">{r.generatedBy}</TableCell>
                        <TableCell className="hidden text-xs tnum text-muted-foreground md:table-cell">
                          {r.sizeKb === 0 ? '—' : r.sizeKb >= 1024 ? `${(r.sizeKb / 1024).toFixed(1)} MB` : `${r.sizeKb} KB`}
                        </TableCell>
                        <TableCell>
                          {r.status === 'generating' ? (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-400">
                              <Loader2 className="h-3 w-3 animate-spin" /> Generating
                            </span>
                          ) : r.status === 'scheduled' ? (
                            <span className="inline-flex items-center gap-1 text-xs text-sky-400">
                              <Calendar className="h-3 w-3" /> Scheduled
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                              <FileCheck2 className="h-3 w-3" /> Ready
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            disabled={r.status !== 'ready'}
                            onClick={() => download(r)}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Create Report form */}
        <Card className="xl:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="h-4 w-4 text-primary" /> Create Report
            </CardTitle>
            <CardDescription className="text-xs">Configure, schedule & dispatch a new report</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Report type</Label>
                <Select value={form.type} onValueChange={v => setForm(s => ({ ...s, type: v as ReportType }))}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.keys(TYPE_STYLE).map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Format</Label>
                <Select value={form.format} onValueChange={v => setForm(s => ({ ...s, format: v as ReportFormat }))}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.keys(FORMAT_META).map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Project</Label>
              {!projects ? (
                <Skeleton className="h-9 w-full rounded-md" />
              ) : (
                <Select value={form.projectId} onValueChange={v => setForm(s => ({ ...s, projectId: v }))}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="All projects" /></SelectTrigger>
                  <SelectContent>
                    {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">From</Label>
                <Input type="date" className="h-9 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">To</Label>
                <Input type="date" className="h-9 text-xs" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Recipients (one per line)</Label>
              <Textarea
                value={form.recipients}
                onChange={e => setForm(s => ({ ...s, recipients: e.target.value }))}
                rows={3}
                placeholder="ops@plant-a.com&#10;facilities@example.com"
                className="text-xs"
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between rounded-md border border-border/60 bg-card/40 p-3">
              <div>
                <p className="text-xs font-medium">Schedule recurring</p>
                <p className="text-[10px] text-muted-foreground">Cron expression · server timezone</p>
              </div>
              <Switch checked={form.scheduled} onCheckedChange={c => setForm(s => ({ ...s, scheduled: c }))} />
            </div>

            {form.scheduled && (
              <div className="space-y-1.5">
                <Label className="text-xs">Cron expression</Label>
                <Input
                  value={form.cron}
                  onChange={e => setForm(s => ({ ...s, cron: e.target.value }))}
                  className="h-9 font-mono text-xs"
                  placeholder="0 6 * * 1"
                />
                <p className="text-[10px] text-muted-foreground">Example: <span className="font-mono">0 6 * * 1</span> = every Monday 06:00</p>
              </div>
            )}

            <Button size="sm" className="w-full gap-1.5" onClick={generate} disabled={generating}>
              {generating ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</> : <><Plus className="h-3.5 w-3.5" /> Generate Report</>}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Bottom grid: scheduled + delivery */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Scheduled reports */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4 text-amber-400" /> Scheduled Reports
            </CardTitle>
            <CardDescription className="text-xs">Next-run jobs in queue</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {SCHEDULED.map(r => {
              const fmt = FORMAT_META[r.format]
              const FmtIcon = fmt.icon
              return (
                <div key={r.id} className="rounded-md border border-border/60 bg-card/40 p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">{r.name}</p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <Badge variant="outline" className={cn('ring-1', TYPE_STYLE[r.type])}>{r.type}</Badge>
                        <Badge variant="outline" className={cn('ring-1', fmt.cls)}><FmtIcon className="mr-1 h-2.5 w-2.5" />{r.format}</Badge>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> next run in 4h</span>
                    <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> 3 recipients</span>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        {/* Delivery channels */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Webhook className="h-4 w-4 text-violet-400" /> Delivery Channels
            </CardTitle>
            <CardDescription className="text-xs">Where reports are pushed once generated</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            {DELIVERY_OPTIONS.map(opt => {
              const Icon = opt.icon
              return (
                <div key={opt.id} className={cn('rounded-md border p-3 transition-colors', opt.enabled ? 'border-border/60 bg-card/40' : 'border-border/30 bg-muted/20 opacity-70')}>
                  <div className="flex items-start justify-between">
                    <div className={cn('rounded-md p-2 ring-1', opt.cls)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <Switch defaultChecked={opt.enabled} onCheckedChange={() => toast(opt.enabled ? 'Channel disabled' : 'Channel enabled', { description: opt.name })} />
                  </div>
                  <p className="mt-2 text-sm font-medium">{opt.name}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{opt.desc}</p>
                  {opt.enabled && (
                    <div className="mt-2">
                      <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>Health</span><span className="text-emerald-400">operational</span>
                      </div>
                      <Progress value={100} className="h-1 bg-muted/40" indicatorClassName="bg-emerald-500" />
                    </div>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
