'use client'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { KpiCard } from '@/components/indos/shared/kpi-card'
import { ViewHeader } from '@/components/indos/shared/view-header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  Building2, Users, ShieldCheck, KeyRound, Plus, UserPlus, MapPin, Factory, Briefcase, Check, Minus,
} from 'lucide-react'

interface Org {
  id: string
  name: string
  type: string
  industry?: string | null
  country?: string | null
  _count: { users: number; projects: number; customers: number }
}

interface User {
  id: string
  email: string
  name: string
  role: string
  status: string
  twoFA: boolean
  lastLogin?: string | null
  org?: { name: string } | null
}

const ORG_TYPE_STYLE: Record<string, string> = {
  operator: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30',
  customer: 'bg-sky-500/15 text-sky-400 ring-sky-500/30',
  integrator: 'bg-amber-500/15 text-amber-400 ring-amber-500/30',
}

const ROLE_STYLE: Record<string, string> = {
  admin: 'bg-rose-500/15 text-rose-400 ring-rose-500/30',
  engineer: 'bg-violet-500/15 text-violet-400 ring-violet-500/30',
  operator: 'bg-sky-500/15 text-sky-400 ring-sky-500/30',
  viewer: 'bg-slate-500/15 text-slate-300 ring-slate-500/30',
}

const ROLES = ['admin', 'engineer', 'operator', 'viewer']
const PERMISSIONS = ['View', 'Edit', 'Deploy OTA', 'Manage Users', 'Configure', 'Delete']
// Realistic role capability matrix
const MATRIX: Record<string, boolean[]> = {
  admin:    [true, true, true, true, true, true],
  engineer: [true, true, true, false, true, false],
  operator: [true, false, true, false, false, false],
  viewer:   [true, false, false, false, false, false],
}

function initials(name: string) {
  const p = name.trim().split(/\s+/)
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase()
  return (p[0][0] + p[p.length - 1][0]).toUpperCase()
}

function fmtLast(d?: string | null) {
  if (!d) return 'never'
  const date = new Date(d)
  const diff = Date.now() - date.getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

export function OrganizationsView() {
  const [orgs, setOrgs] = useState<Org[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [roleFilter, setRoleFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [newOrgOpen, setNewOrgOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/indos/orgs').then(r => r.json()),
      fetch('/api/indos/users').then(r => r.json()),
    ])
      .then(([o, u]) => { setOrgs(o); setUsers(u); setLoading(false) })
      .catch(() => { setLoading(false); toast.error('Failed to load organizations') })
  }, [])

  const admins = users.filter(u => u.role === 'admin').length
  const twoFAOn = users.filter(u => u.twoFA).length
  const twoFAPct = users.length ? Math.round((twoFAOn / users.length) * 100) : 0

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter(u => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false
      if (q && !(`${u.name} ${u.email} ${u.org?.name || ''}`.toLowerCase().includes(q))) return false
      return true
    })
  }, [users, roleFilter, search])

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <ViewHeader
        title="Organizations & Access"
        description="Manage tenants, members, role-based access and 2FA adoption across the IndOS deployment."
        icon={<Building2 className="h-5 w-5" />}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)
        ) : (
          <>
            <KpiCard label="Organizations" value={orgs.length} icon={Building2} accent="emerald" hint="tenants on platform" />
            <KpiCard label="Users" value={users.length} icon={Users} accent="sky" hint={`${users.filter(u => u.status === 'active').length} active`} />
            <KpiCard label="Administrators" value={admins} icon={KeyRound} accent="rose" hint="full platform access" />
            <KpiCard label="2FA Adoption" value={twoFAPct} unit="%" icon={ShieldCheck} accent="amber" hint={`${twoFAOn}/${users.length} enrolled`} />
          </>
        )}
      </div>

      <Tabs defaultValue="orgs" className="gap-3">
        <TabsList className="h-9">
          <TabsTrigger value="orgs" className="text-xs"><Building2 className="h-3.5 w-3.5" /> Organizations</TabsTrigger>
          <TabsTrigger value="users" className="text-xs"><Users className="h-3.5 w-3.5" /> Users & Roles</TabsTrigger>
        </TabsList>

        {/* Organizations tab */}
        <TabsContent value="orgs" className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" className="h-8 gap-1.5" onClick={() => setNewOrgOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> New Organization
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {loading
              ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 w-full" />)
              : orgs.map(o => (
                <Card key={o.id} className="gap-0 p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <Avatar className="h-9 w-9 rounded-md">
                        <AvatarFallback className="rounded-md bg-primary/10 text-xs font-semibold text-primary">
                          {o.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-semibold leading-tight">{o.name}</p>
                        <p className="text-[10px] text-muted-foreground">{o.id.slice(-8)}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className={cn('capitalize ring-1', ORG_TYPE_STYLE[o.type] || ORG_TYPE_STYLE.operator)}>
                      {o.type}
                    </Badge>
                  </div>

                  <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                    {o.industry && <p className="flex items-center gap-1.5"><Factory className="h-3 w-3" /> {o.industry}</p>}
                    {o.country && <p className="flex items-center gap-1.5"><MapPin className="h-3 w-3" /> {o.country}</p>}
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/50 pt-3">
                    <Stat label="Users" value={o._count.users} accent="text-sky-400" />
                    <Stat label="Projects" value={o._count.projects} accent="text-emerald-400" />
                    <Stat label="Customers" value={o._count.customers} accent="text-amber-400" />
                  </div>
                </Card>
              ))}
          </div>
        </TabsContent>

        {/* Users tab */}
        <TabsContent value="users" className="space-y-4">
          {/* Roles & Permissions matrix */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4 text-emerald-400" /> Roles & Permissions
              </CardTitle>
              <CardDescription className="text-xs">Capability matrix per role (system-enforced)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/60">
                      <TableHead className="text-xs">Role</TableHead>
                      {PERMISSIONS.map(p => <TableHead key={p} className="text-center text-xs">{p}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ROLES.map(r => (
                      <TableRow key={r} className="border-border/40">
                        <TableCell>
                          <Badge variant="outline" className={cn('capitalize ring-1', ROLE_STYLE[r])}>{r}</Badge>
                        </TableCell>
                        {MATRIX[r].map((ok, i) => (
                          <TableCell key={i} className="text-center">
                            {ok
                              ? <Check className="mx-auto h-4 w-4 text-emerald-400" />
                              : <Minus className="mx-auto h-4 w-4 text-muted-foreground/40" />}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Users table */}
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3 space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4 text-sky-400" /> Platform Users
                </CardTitle>
                <CardDescription className="text-xs">{filteredUsers.length} of {users.length} shown</CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 w-44 pl-7 text-xs" />
                </div>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Role" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All roles</SelectItem>
                    {ROLES.map(r => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" className="h-8 gap-1.5" onClick={() => setInviteOpen(true)}>
                  <UserPlus className="h-3.5 w-3.5" /> Invite
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="indos-scroll max-h-[480px]">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/60">
                      <TableHead className="text-xs">User</TableHead>
                      <TableHead className="text-xs">Role</TableHead>
                      <TableHead className="hidden text-xs md:table-cell">Organization</TableHead>
                      <TableHead className="hidden text-xs sm:table-cell">2FA</TableHead>
                      <TableHead className="hidden text-xs lg:table-cell">Last login</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading
                      ? Array.from({ length: 6 }).map((_, i) => (
                        <TableRow key={i} className="border-border/40">
                          <TableCell colSpan={6}><Skeleton className="h-6 w-full" /></TableCell>
                        </TableRow>
                      ))
                      : filteredUsers.map(u => (
                        <TableRow key={u.id} className="border-border/40">
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Avatar className="h-7 w-7">
                                <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">{initials(u.name)}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="text-xs font-medium leading-tight">{u.name}</p>
                                <p className="text-[10px] text-muted-foreground">{u.email}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn('capitalize ring-1', ROLE_STYLE[u.role] || ROLE_STYLE.viewer)}>{u.role}</Badge>
                          </TableCell>
                          <TableCell className="hidden text-xs md:table-cell">{u.org?.name || '—'}</TableCell>
                          <TableCell className="hidden sm:table-cell">
                            {u.twoFA
                              ? <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 ring-emerald-500/30"><ShieldCheck className="h-3 w-3" /> On</Badge>
                              : <Badge variant="outline" className="bg-slate-500/10 text-slate-400 ring-slate-500/30">Off</Badge>}
                          </TableCell>
                          <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">{fmtLast(u.lastLogin)}</TableCell>
                          <TableCell>
                            {u.status === 'active'
                              ? <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 ring-emerald-500/30">Active</Badge>
                              : <Badge variant="outline" className="bg-slate-500/10 text-slate-400 ring-slate-500/30">Disabled</Badge>}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* New Org dialog (cosmetic) */}
      <Dialog open={newOrgOpen} onOpenChange={setNewOrgOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Organization</DialogTitle>
            <DialogDescription>Provision a new tenant on the IndOS platform.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Organization name</Label>
              <Input placeholder="e.g. Acme Industrial Co., Ltd." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Type</Label>
                <Select defaultValue="operator">
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operator">Operator</SelectItem>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="integrator">Integrator</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Industry</Label>
                <Input placeholder="Manufacturing" />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Country</Label>
              <Input placeholder="Thailand" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setNewOrgOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={() => { toast.info('Organization creation is demo-only'); setNewOrgOpen(false) }}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite User dialog (cosmetic) */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite User</DialogTitle>
            <DialogDescription>Send an invitation email with role pre-assigned.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Email</Label>
              <Input type="email" placeholder="engineer@acme.io" />
            </div>
            <div className="grid gap-1.5">
              <Label>Full name</Label>
              <Input placeholder="Somchai Prasert" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Role</Label>
                <Select defaultValue="engineer">
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map(r => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Organization</Label>
                <Select defaultValue="">
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {orgs.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={() => { toast.info('User invitation is demo-only'); setInviteOpen(false) }}>
              <UserPlus className="h-3.5 w-3.5" /> Send Invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-md border border-border/40 bg-card/40 p-2 text-center">
      <p className={cn('text-lg font-semibold tabular-nums', accent)}>{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  )
}
