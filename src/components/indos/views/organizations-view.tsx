'use client'
import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
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
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  Building2, Users, ShieldCheck, KeyRound, Plus, UserPlus, MapPin, Factory,
  Check, Minus, MoreVertical, Loader2, Power, KeySquare, PencilLine,
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

const ROLES = ['admin', 'engineer', 'operator', 'viewer'] as const
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

function friendlyError(err: unknown, fallback: string): string {
  let msg = fallback
  try {
    const r = err as { message?: string; error?: string }
    if (r?.message) msg = r.message
    else if (r?.error) msg = String(r.error).replace(/_/g, ' ').toLowerCase()
  } catch { /* noop */ }
  return msg
}

export function OrganizationsView() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'
  const currentUserId = session?.user?.id

  const [orgs, setOrgs] = useState<Org[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [roleFilter, setRoleFilter] = useState('all')
  const [search, setSearch] = useState('')

  // Dialog state — New Org
  const [newOrgOpen, setNewOrgOpen] = useState(false)
  const [newOrgForm, setNewOrgForm] = useState({ name: '', type: 'operator' as 'operator' | 'customer' | 'integrator', industry: '', country: '' })
  const [newOrgBusy, setNewOrgBusy] = useState(false)

  // Dialog state — Invite User
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteForm, setInviteForm] = useState({ name: '', email: '', password: '', role: 'engineer' as 'admin' | 'engineer' | 'operator' | 'viewer', orgId: '' })
  const [inviteBusy, setInviteBusy] = useState(false)

  // Dialog state — Reset Password (per-row)
  const [resetTarget, setResetTarget] = useState<User | null>(null)
  const [resetPw, setResetPw] = useState('')
  const [resetBusy, setResetBusy] = useState(false)

  // Dialog state — Change Role (per-row)
  const [roleTarget, setRoleTarget] = useState<User | null>(null)
  const [rolePick, setRolePick] = useState<'admin' | 'engineer' | 'operator' | 'viewer'>('viewer')
  const [roleBusy, setRoleBusy] = useState(false)

  const reload = async () => {
    try {
      const [o, u] = await Promise.all([
        fetch('/api/indos/orgs').then(r => r.json()),
        fetch('/api/indos/users').then(r => r.json()),
      ])
      setOrgs(Array.isArray(o) ? o : [])
      setUsers(Array.isArray(u) ? u : [])
    } catch {
      toast.error('Failed to load organizations')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void reload() }, [])

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

  // ── Action handlers ──────────────────────────────────────────────────
  async function submitNewOrg() {
    if (!newOrgForm.name.trim()) { toast.error('Organization name is required'); return }
    setNewOrgBusy(true)
    try {
      const res = await fetch('/api/indos/orgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newOrgForm.name.trim(),
          type: newOrgForm.type,
          industry: newOrgForm.industry.trim() || undefined,
          country: newOrgForm.country.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw data
      toast.success(`Organization "${data.name || newOrgForm.name}" created`)
      setNewOrgOpen(false)
      setNewOrgForm({ name: '', type: 'operator', industry: '', country: '' })
      await reload()
    } catch (e) {
      toast.error(friendlyError(e, 'Failed to create organization'))
    } finally {
      setNewOrgBusy(false)
    }
  }

  async function submitInvite() {
    if (!inviteForm.name.trim()) { toast.error('Full name is required'); return }
    if (!inviteForm.email.trim()) { toast.error('Email is required'); return }
    if (inviteForm.password.length < 8) { toast.error('Password must be at least 8 characters'); return }
    setInviteBusy(true)
    try {
      const res = await fetch('/api/indos/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: inviteForm.name.trim(),
          email: inviteForm.email.trim(),
          password: inviteForm.password,
          role: inviteForm.role,
          orgId: inviteForm.orgId || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw data
      toast.success(`User "${data.email || inviteForm.email}" created`)
      setInviteOpen(false)
      setInviteForm({ name: '', email: '', password: '', role: 'engineer', orgId: '' })
      await reload()
    } catch (e) {
      toast.error(friendlyError(e, 'Failed to create user'))
    } finally {
      setInviteBusy(false)
    }
  }

  async function toggleUserStatus(u: User) {
    const next = u.status === 'active' ? 'disabled' : 'active'
    try {
      const res = await fetch(`/api/indos/users/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw data
      toast.success(`${u.email} is now ${next}`)
      await reload()
    } catch (e) {
      toast.error(friendlyError(e, `Failed to ${next === 'disabled' ? 'disable' : 'enable'} user`))
    }
  }

  async function submitResetPassword() {
    if (!resetTarget) return
    if (resetPw.length < 8) { toast.error('Password must be at least 8 characters'); return }
    setResetBusy(true)
    try {
      const res = await fetch(`/api/indos/users/${resetTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPw }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw data
      toast.success(`Password reset for ${resetTarget.email}`)
      setResetTarget(null)
      setResetPw('')
      await reload()
    } catch (e) {
      toast.error(friendlyError(e, 'Failed to reset password'))
    } finally {
      setResetBusy(false)
    }
  }

  async function submitChangeRole() {
    if (!roleTarget) return
    setRoleBusy(true)
    try {
      const res = await fetch(`/api/indos/users/${roleTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: rolePick }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw data
      toast.success(`${roleTarget.email} is now ${rolePick}`)
      setRoleTarget(null)
      await reload()
    } catch (e) {
      toast.error(friendlyError(e, 'Failed to change role'))
    } finally {
      setRoleBusy(false)
    }
  }

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
            {isAdmin ? (
              <Button size="sm" className="h-8 gap-1.5" onClick={() => setNewOrgOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> New Organization
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground self-center">Contact an admin to provision new tenants.</span>
            )}
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
                {isAdmin && (
                  <Button size="sm" className="h-8 gap-1.5" onClick={() => setInviteOpen(true)}>
                    <UserPlus className="h-3.5 w-3.5" /> Invite
                  </Button>
                )}
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
                      <TableHead className="w-10 text-xs">{isAdmin ? <span className="sr-only">Actions</span> : null}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading
                      ? Array.from({ length: 6 }).map((_, i) => (
                        <TableRow key={i} className="border-border/40">
                          <TableCell colSpan={7}><Skeleton className="h-6 w-full" /></TableCell>
                        </TableRow>
                      ))
                      : filteredUsers.map(u => {
                        const isSelf = !!currentUserId && u.id === currentUserId
                        return (
                          <TableRow key={u.id} className="border-border/40">
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Avatar className="h-7 w-7">
                                  <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">{initials(u.name)}</AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="text-xs font-medium leading-tight">{u.name}{isSelf && <span className="ml-1 text-[10px] text-muted-foreground">(you)</span>}</p>
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
                            <TableCell>
                              {isAdmin && !isSelf && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Actions for ${u.email}`}>
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-48">
                                    <DropdownMenuLabel className="text-xs">{u.email}</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-xs"
                                      onSelect={(e) => { e.preventDefault(); void toggleUserStatus(u) }}
                                    >
                                      <Power className="h-3.5 w-3.5" />
                                      {u.status === 'active' ? 'Disable' : 'Enable'}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      className="text-xs"
                                      onSelect={(e) => { e.preventDefault(); setResetPw(''); setResetTarget(u) }}
                                    >
                                      <KeySquare className="h-3.5 w-3.5" /> Reset password…
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      className="text-xs"
                                      onSelect={(e) => { e.preventDefault(); setRolePick(u.role as typeof rolePick); setRoleTarget(u) }}
                                    >
                                      <PencilLine className="h-3.5 w-3.5" /> Change role…
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ───────── New Org dialog ───────── */}
      <Dialog open={newOrgOpen} onOpenChange={(o) => { setNewOrgOpen(o); if (!o) setNewOrgForm({ name: '', type: 'operator', industry: '', country: '' }) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Organization</DialogTitle>
            <DialogDescription>Provision a new tenant on the IndOS platform.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="org-name">Organization name</Label>
              <Input id="org-name" placeholder="e.g. Acme Industrial Co., Ltd." value={newOrgForm.name} onChange={(e) => setNewOrgForm({ ...newOrgForm, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Type</Label>
                <Select value={newOrgForm.type} onValueChange={(v) => setNewOrgForm({ ...newOrgForm, type: v as typeof newOrgForm.type })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operator">Operator</SelectItem>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="integrator">Integrator</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="org-industry">Industry</Label>
                <Input id="org-industry" placeholder="Manufacturing" value={newOrgForm.industry} onChange={(e) => setNewOrgForm({ ...newOrgForm, industry: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="org-country">Country</Label>
              <Input id="org-country" placeholder="Thailand" value={newOrgForm.country} onChange={(e) => setNewOrgForm({ ...newOrgForm, country: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setNewOrgOpen(false)} disabled={newOrgBusy}>Cancel</Button>
            <Button size="sm" onClick={submitNewOrg} disabled={newOrgBusy}>
              {newOrgBusy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Creating…</> : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───────── Invite User dialog ───────── */}
      <Dialog open={inviteOpen} onOpenChange={(o) => { setInviteOpen(o); if (!o) setInviteForm({ name: '', email: '', password: '', role: 'engineer', orgId: '' }) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite User</DialogTitle>
            <DialogDescription>Create a new account with role pre-assigned. The user can log in immediately with the initial password.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="inv-email">Email</Label>
              <Input id="inv-email" type="email" placeholder="engineer@acme.io" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="inv-name">Full name</Label>
              <Input id="inv-name" placeholder="Somchai Prasert" value={inviteForm.name} onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="inv-pw">Initial password</Label>
              <Input id="inv-pw" type="password" placeholder="min. 8 characters" value={inviteForm.password} onChange={(e) => setInviteForm({ ...inviteForm, password: e.target.value })} />
              <p className="text-[10px] text-muted-foreground">User can change after first login.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Role</Label>
                <Select value={inviteForm.role} onValueChange={(v) => setInviteForm({ ...inviteForm, role: v as typeof inviteForm.role })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map(r => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Organization</Label>
                <Select value={inviteForm.orgId || '__none__'} onValueChange={(v) => setInviteForm({ ...inviteForm, orgId: v === '__none__' ? '' : v })}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— No org (platform-level) —</SelectItem>
                    {orgs.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setInviteOpen(false)} disabled={inviteBusy}>Cancel</Button>
            <Button size="sm" onClick={submitInvite} disabled={inviteBusy}>
              {inviteBusy
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Creating…</>
                : <><UserPlus className="h-3.5 w-3.5" /> Send Invite</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───────── Reset Password dialog ───────── */}
      <Dialog open={!!resetTarget} onOpenChange={(o) => { if (!o) { setResetTarget(null); setResetPw('') } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              {resetTarget ? `Set a new password for ${resetTarget.email}. They will need to use it on next sign-in.` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="reset-pw">New password</Label>
            <Input id="reset-pw" type="password" placeholder="min. 8 characters" value={resetPw} onChange={(e) => setResetPw(e.target.value)} />
            <p className="text-[10px] text-muted-foreground">Password is hashed with bcrypt before storage.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setResetTarget(null); setResetPw('') }} disabled={resetBusy}>Cancel</Button>
            <Button size="sm" onClick={submitResetPassword} disabled={resetBusy}>
              {resetBusy
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</>
                : <><KeySquare className="h-3.5 w-3.5" /> Reset password</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───────── Change Role dialog ───────── */}
      <Dialog open={!!roleTarget} onOpenChange={(o) => { if (!o) setRoleTarget(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change role</DialogTitle>
            <DialogDescription>
              {roleTarget ? `Select a new role for ${roleTarget.email}.` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label>New role</Label>
            <Select value={rolePick} onValueChange={(v) => setRolePick(v as typeof rolePick)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map(r => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRoleTarget(null)} disabled={roleBusy}>Cancel</Button>
            <Button size="sm" onClick={submitChangeRole} disabled={roleBusy}>
              {roleBusy
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</>
                : 'Apply'}
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
