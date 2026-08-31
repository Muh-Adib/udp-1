/* ============ Users & Access View (Super Admin) ============ */
'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { crmApi } from './api-client'
import { useCrmStore } from './crm-store'
import { useToast } from '@/hooks/use-toast'
import { LoadingRows, RefreshButton, SectionHeader, UserAvatar } from './shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ROLES, roleMeta } from '@/lib/crm-constants'
import type { UserDTO } from '@/lib/crm-types'
import { cn } from '@/lib/utils'
import { Loader2, Plus, ShieldCheck, UserRound } from 'lucide-react'

export default function UsersView() {
  const me = useCrmStore((s) => s.user)
  const brands = useCrmStore((s) => s.brands)
  const { toast } = useToast()
  const [users, setUsers] = useState<UserDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<UserDTO | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setUsers(await crmApi.users()) }
    catch (e) { toast({ title: 'Gagal memuat user', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }) }
    finally { setLoading(false) }
  }, [toast])

  useEffect(() => { load() }, [load])

  const toggleActive = async (u: UserDTO) => {
    try {
      await crmApi.updateUser(u.id, { isActive: !u.isActive })
      toast({ title: u.isActive ? `User ${u.name} dinonaktifkan` : `User ${u.name} diaktifkan` })
      load()
    } catch (e) {
      toast({ title: 'Gagal', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <SectionHeader title="User & Access" description="Role, permission, dan akses brand — perubahan tercatat di audit log" action={
          <div className="flex items-center gap-2">
            <RefreshButton onClick={load} loading={loading} />
            <Button size="sm" className="gap-1.5 bg-slate-900 hover:bg-slate-800" onClick={() => setCreating(true)}><Plus className="h-3.5 w-3.5" /> User Baru</Button>
          </div>
        } />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {ROLES.map(r => (
          <Card key={r.key} className="rounded-xl">
            <CardContent className="p-4">
              <Badge className={cn('mb-2 border-0', r.bg, r.color)} variant="secondary">{r.label}</Badge>
              <p className="text-[11px] leading-snug text-slate-500">{r.description}</p>
              <p className="mt-2 text-[11px] font-semibold text-slate-700">{users.filter(u => u.role === r.key).length} user</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {loading ? <LoadingRows rows={5} /> : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">User</th>
                  <th className="px-4 py-2.5 font-semibold">Role</th>
                  <th className="px-4 py-2.5 font-semibold">Akses Brand</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map(u => {
                  const role = roleMeta(u.role)
                  return (
                    <tr key={u.id} className={cn('transition hover:bg-slate-50', !u.isActive && 'opacity-50')}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <UserAvatar name={u.name} color={u.avatarColor} size={32} />
                          <div>
                            <p className="font-medium text-slate-800">{u.name}{u.id === me?.id && <span className="ml-1.5 text-[10px] font-normal text-teal-600">(Anda)</span>}</p>
                            <p className="text-[11px] text-slate-500">{u.email}{u.title ? ` · ${u.title}` : ''}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3"><Badge className={cn('border-0', role.bg, role.color)} variant="secondary">{role.label}</Badge></td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {u.brandIds.length === 0 && <span className="text-[11px] text-slate-400">Semua / tidak dibatasi</span>}
                          {brands.filter(b => u.brandIds.includes(b.id)).map(b => (
                            <span key={b.id} className="rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: `${b.color}12`, color: b.color }}>{b.name}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Switch checked={u.isActive} onCheckedChange={() => toggleActive(u)} disabled={u.id === me?.id} />
                          <span className="text-[11px] text-slate-500">{u.isActive ? 'Aktif' : 'Nonaktif'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setEditing(u)}>Kelola</Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <UserDialog open={creating} onOpenChange={setCreating} onSaved={load} />
      <UserDialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)} user={editing} onSaved={load} />
    </div>
  )
}

function UserDialog({ open, onOpenChange, user, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; user?: UserDTO | null; onSaved: () => void }) {
  const brands = useCrmStore((s) => s.brands)
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [title, setTitle] = useState('')
  const [role, setRole] = useState('MARKETING')
  const [brandIds, setBrandIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(user?.name ?? ''); setEmail(user?.email ?? ''); setTitle(user?.title ?? '')
    setRole(user?.role ?? 'MARKETING'); setBrandIds(user?.brandIds ?? [])
  }, [open, user])

  const submit = async () => {
    if (!name || !email) { toast({ title: 'Nama & email wajib', variant: 'destructive' }); return }
    setSaving(true)
    try {
      if (user) {
        await crmApi.updateUser(user.id, { name, title: title || undefined, role, brandIds })
        toast({ title: 'User diperbarui ✓', description: 'Perubahan tercatat di audit log.' })
      } else {
        await crmApi.createUser({ name, email, title: title || undefined, role, brandIds })
        toast({ title: 'User dibuat ✓' })
      }
      onOpenChange(false); onSaved()
    } catch (e) {
      toast({ title: 'Gagal menyimpan', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{user ? `Kelola — ${user.name}` : 'User Baru'}</DialogTitle>
          <DialogDescription>Role menentukan modul yang terlihat; akses brand membatasi scope data.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Nama *</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Email *</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} disabled={!!user} /></div>
          </div>
          <div className="space-y-1.5"><Label>Jabatan</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="cth: Marketing Lead" /></div>
          <div className="space-y-1.5">
            <Label>Role *</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map(r => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-slate-500">{roleMeta(role).description}</p>
          </div>
          <div className="space-y-1.5">
            <Label>Akses Brand</Label>
            <div className="grid grid-cols-2 gap-2">
              {brands.map(b => {
                const checked = brandIds.includes(b.id)
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setBrandIds(prev => checked ? prev.filter(x => x !== b.id) : [...prev, b.id])}
                    className={cn('flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition',
                      checked ? 'border-teal-400 bg-teal-50 font-medium text-teal-800' : 'border-slate-200 text-slate-600 hover:border-slate-300')}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: b.color }} />
                    {b.name}
                  </button>
                )
              })}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={submit} disabled={saving} className="gap-2 bg-slate-900 hover:bg-slate-800">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Simpan</Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
