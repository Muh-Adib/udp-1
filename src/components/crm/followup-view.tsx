/* ============ Follow-up View — task follow-up + template sequence ============ */
'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { crmApi } from './api-client'
import { useCrmStore } from './crm-store'
import { useToast } from '@/hooks/use-toast'
import { BrandChip, ChannelIcon, EmptyState, LoadingRows, PriorityBadge, SectionHeader, UserAvatar, RefreshButton } from './shared'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { channelMeta, formatDate, formatMoney as fm, TASK_TYPES, daysUntil, isOverdueNow } from '@/lib/crm-constants'
import type { TaskDTO, TemplateDTO, OpportunityDTO, UserDTO } from '@/lib/crm-types'
import { cn } from '@/lib/utils'
import { CalendarClock, CheckCheck, ChevronDown, Clock, ListTodo, Loader2, Plus, Repeat, Sparkles } from 'lucide-react'

const TEMPLATE_VARS = ['{{contact_name}}', '{{company_name}}', '{{brand_name}}', '{{service_name}}', '{{marketing_name}}', '{{estimated_timeline}}', '{{proposal_link}}', '{{meeting_link}}']

export default function FollowUpView() {
  const user = useCrmStore((s) => s.user)
  const brands = useCrmStore((s) => s.brands)
  const openOpportunity = useCrmStore((s) => s.openOpportunity)
  const { toast } = useToast()

  const [tab, setTab] = useState('tasks')
  const [tasks, setTasks] = useState<TaskDTO[]>([])
  const [templates, setTemplates] = useState<TemplateDTO[]>([])
  const [opps, setOpps] = useState<OpportunityDTO[]>([])
  const [users, setUsers] = useState<UserDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [tplBrand, setTplBrand] = useState('all')

  const [newTaskOpen, setNewTaskOpen] = useState(false)
  const [newTplOpen, setNewTplOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [t, tpl, o, u] = await Promise.all([
        crmApi.tasks('scope=upcoming'),
        crmApi.templates(),
        crmApi.opportunities(),
        crmApi.users(),
      ])
      setTasks(t); setTemplates(tpl); setOpps(o); setUsers(u)
    } catch (e) {
      toast({ title: 'Gagal memuat data follow-up', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally { setLoading(false) }
  }, [toast])

  useEffect(() => { load() }, [load])

  const completeTask = async (task: TaskDTO) => {
    try {
      await crmApi.updateTask(task.id, { status: 'DONE' })
      toast({ title: 'Task selesai ✓', description: task.title })
      load()
    } catch (e) {
      toast({ title: 'Gagal', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    }
  }

  const toggleTemplate = async (tpl: TemplateDTO) => {
    try {
      await crmApi.updateTemplate(tpl.id, { isActive: !tpl.isActive })
      setTemplates(prev => prev.map(t => t.id === tpl.id ? { ...t, isActive: !t.isActive } : t))
    } catch (e) {
      toast({ title: 'Gagal mengubah template', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    }
  }

  /* Group tasks — overdue berbasis timestamp agar task hari ini yg sudah lewat jam-nya masuk Terlambat */
  const grouped = useMemo(() => {
    const late = tasks.filter(t => t.dueDate && t.status !== 'DONE' && isOverdueNow(t.dueDate))
    const today = tasks.filter(t => t.dueDate && t.status !== 'DONE' && !isOverdueNow(t.dueDate) && daysUntil(t.dueDate) === 0)
    const upcoming = tasks.filter(t => !t.dueDate || (daysUntil(t.dueDate) ?? 0) > 0)
    return { late, today, upcoming }
  }, [tasks])

  const filteredTemplates = tplBrand === 'all' ? templates : templates.filter(t => t.brandId === tplBrand)
  const openFollowUps = useMemo(() =>
    opps.filter(o => !['WON', 'LOST'].includes(o.stage) && (o.nextActionDate || o.followUpDate)), [opps])

  const TaskRow = ({ task }: { task: TaskDTO }) => {
    const late = task.dueDate ? task.status !== 'DONE' && isOverdueNow(task.dueDate) : false
    return (
      <div className="flex items-start gap-3 rounded-lg border border-slate-100 bg-white p-3 transition hover:border-slate-300 hover:shadow-sm">
        <button
          onClick={() => completeTask(task)}
          title="Tandai selesai"
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-slate-300 text-transparent transition hover:border-emerald-500 hover:bg-emerald-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
        >
          <CheckCheck className="h-3.5 w-3.5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className={cn('text-[13px] font-medium text-slate-800', task.status === 'DONE' && 'line-through opacity-50')}>{task.title}</p>
            <PriorityBadge priority={task.priority} />
            <Badge variant="outline" className="px-1.5 py-0 text-[10px] text-slate-500">{TASK_TYPES.find(t => t.key === task.type)?.label ?? task.type}</Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
            {task.opportunityId && (
              <button className="inline-flex items-center gap-1 rounded font-medium text-teal-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400" onClick={() => openOpportunity(task.opportunityId!)}>
                {task.opportunityTitle} {task.companyName ? `· ${task.companyName}` : ''}
              </button>
            )}
            <span className={cn('inline-flex items-center gap-1', late && 'font-semibold text-rose-600')}>
              <CalendarClock className="h-3 w-3" /> {task.dueDate ? formatDate(task.dueDate, true) : 'Tanpa deadline'}{late ? ' · Terlambat' : ''}
            </span>
            <span className="inline-flex items-center gap-1">
              <UserAvatar name={task.assigneeName ?? '?'} color={task.assigneeColor} size={16} /> {task.assigneeName}
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className="grid w-full grid-cols-3 sm:inline-flex sm:w-auto">
            <TabsTrigger value="tasks" className="min-w-0 gap-1.5 px-2 sm:px-3"><ListTodo className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">Task Follow-up</span></TabsTrigger>
            <TabsTrigger value="templates" className="min-w-0 gap-1.5 px-2 sm:px-3"><Repeat className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">Template Sequence</span></TabsTrigger>
            <TabsTrigger value="due" className="min-w-0 gap-1.5 px-2 sm:px-3"><Clock className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">Jadwal Tenggat</span></TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <RefreshButton onClick={load} loading={loading} />
            {tab === 'tasks' && <Button size="sm" className="h-9 gap-1.5 bg-slate-900 hover:bg-slate-800" onClick={() => setNewTaskOpen(true)}><Plus className="h-3.5 w-3.5" /> Task Baru</Button>}
            {tab === 'templates' && user?.role === 'SUPER_ADMIN' && <Button size="sm" className="h-9 gap-1.5 bg-slate-900 hover:bg-slate-800" onClick={() => setNewTplOpen(true)}><Plus className="h-3.5 w-3.5" /> Template</Button>}
          </div>
        </div>

        {/* TASKS */}
        <TabsContent value="tasks" className="space-y-4 pt-4">
          {loading ? <LoadingRows rows={5} /> : (
            <>
              {grouped.late.length > 0 && (
                <div className="space-y-2">
                  <SectionHeader title={`Terlambat (${grouped.late.length})`} description="Segera eksekusi — SLA follow-up terlewat" />
                  {grouped.late.map(t => <TaskRow key={t.id} task={t} />)}
                </div>
              )}
              {grouped.today.length > 0 && (
                <div className="space-y-2">
                  <SectionHeader title={`Hari ini (${grouped.today.length})`} />
                  {grouped.today.map(t => <TaskRow key={t.id} task={t} />)}
                </div>
              )}
              <div className="space-y-2">
                <SectionHeader title={`Mendatang (${grouped.upcoming.length})`} description="Termasuk task tanpa deadline" />
                {grouped.upcoming.length === 0
                  ? <EmptyState icon={<CheckCheck className="h-5 w-5" />} title="Tidak ada task mendatang" description="Semua follow-up sudah tereksekusi. Kerja bagus!" />
                  : grouped.upcoming.map(t => <TaskRow key={t.id} task={t} />)}
              </div>
            </>
          )}
        </TabsContent>

        {/* TEMPLATES */}
        <TabsContent value="templates" className="space-y-4 pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={tplBrand} onValueChange={setTplBrand}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Brand</SelectItem>
                {brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">
              Sequence per brand: follow-up terjadwal otomatis membuat <b>task + draft</b> — marketing tetap review sebelum kirim.
            </p>
          </div>
          <Card className="border-teal-100 bg-teal-50/50">
            <CardContent className="flex flex-wrap items-center gap-2 p-4">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-800"><Sparkles className="h-3.5 w-3.5" /> Variabel template:</span>
              {TEMPLATE_VARS.map(v => (
                <code key={v} className="rounded bg-white px-1.5 py-0.5 text-[11px] text-teal-700 ring-1 ring-teal-200">{v}</code>
              ))}
            </CardContent>
          </Card>
          {filteredTemplates.length === 0 && !loading ? (
            <EmptyState icon={<Repeat className="h-5 w-5" />} title="Belum ada template" description="Buat sequence follow-up per brand, layanan, dan bahasa." />
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Daftar Template ({filteredTemplates.length})</p>
              <div className="grid gap-4 md:grid-cols-2">
                {filteredTemplates.map(tpl => {
                  const brand = brands.find(b => b.id === tpl.brandId)
                  const ch = channelMeta(tpl.channel)
                  return (
                    <Card key={tpl.id} className={cn('card-hover hover:border-slate-300', !tpl.isActive && 'opacity-60')}>
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <CardTitle className="flex items-center gap-2 text-sm">
                              <span className="flex h-5 w-5 items-center justify-center rounded bg-slate-900 text-[10px] font-bold tabular-nums text-white">{tpl.step}</span>
                              {tpl.name}
                            </CardTitle>
                            <CardDescription className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                              {brand && <BrandChip name={brand.name} color={brand.color} size="xs" />}
                              <span className={cn('inline-flex items-center gap-1 rounded px-1.5 py-0.5', ch.bg, ch.color)}><ChannelIcon channel={tpl.channel} /> {ch.label}</span>
                              <span className="inline-flex items-center gap-1 tabular-nums text-slate-500"><Clock className="h-3 w-3" /> +{tpl.delayDays} hari</span>
                              <Badge variant="outline" className="px-1 py-0 text-[10px] uppercase">{tpl.language}</Badge>
                            </CardDescription>
                          </div>
                          <Switch checked={tpl.isActive} onCheckedChange={() => toggleTemplate(tpl)} />
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {tpl.purpose && <p className="text-[11px] font-medium text-slate-500">Tujuan: {tpl.purpose}</p>}
                        {tpl.subject && <p className="text-xs"><span className="font-semibold text-slate-600">Subjek:</span> {tpl.subject}</p>}
                        <details className="group">
                          <summary className="cursor-pointer list-none rounded text-[11px] font-medium text-teal-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
                            Lihat isi template <ChevronDown className="inline h-3 w-3 transition-transform group-open:rotate-180" />
                          </summary>
                          <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">{tpl.body}</p>
                        </details>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          )}
        </TabsContent>

        {/* DUE SCHEDULE */}
        <TabsContent value="due" className="space-y-3 pt-4">
          <SectionHeader title="Opportunity dengan jadwal aksi" description="Next action & jadwal follow-up ulang (termasuk nurture)" />
          {loading ? <LoadingRows rows={4} /> : openFollowUps.length === 0 ? (
            <EmptyState icon={<CalendarClock className="h-5 w-5" />} title="Tidak ada jadwal terbuka" />
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="max-h-[60vh] overflow-y-auto scrollbar-slim">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Opportunity</th>
                      <th className="px-4 py-2.5 font-semibold">Next action</th>
                      <th className="px-4 py-2.5 font-semibold">Jadwal</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Nilai</th>
                      <th className="px-4 py-2.5 font-semibold">Nurture</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {openFollowUps.map(o => {
                      const due = o.nextActionDate ?? o.followUpDate
                      const late = due ? isOverdueNow(due) : false
                      return (
                        <tr key={o.id} className="cursor-pointer transition-colors hover:bg-slate-50/80" onClick={() => openOpportunity(o.id)}>
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-slate-800">{o.title}</p>
                            <p className="text-[11px] text-slate-500">{o.companyName}</p>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-600">{o.nextAction ?? '—'}</td>
                          <td className={cn('px-4 py-2.5 text-xs', late ? 'font-semibold text-rose-600' : 'text-slate-600')}>{formatDate(due, true)}{late && ' · Terlambat'}</td>
                          <td className="px-4 py-2.5 text-right text-xs font-semibold tabular-nums text-slate-700">{fm(o.estimatedValue, o.currency, true)}</td>
                          <td className="px-4 py-2.5 text-xs">{o.nurtureTrack ? <Badge className="border-0 bg-cyan-50 text-[10px] text-cyan-700" variant="secondary">Nurture</Badge> : <span className="text-slate-400">—</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <NewTaskDialog open={newTaskOpen} onOpenChange={setNewTaskOpen} onCreated={load} />
      <NewTemplateDialog open={newTplOpen} onOpenChange={setNewTplOpen} onCreated={load} />
    </div>
  )
}

/* ---------------- New Task Dialog ---------------- */
function NewTaskDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const { toast } = useToast()
  const [opps, setOpps] = useState<OpportunityDTO[]>([])
  const [users, setUsers] = useState<UserDTO[]>([])
  const [title, setTitle] = useState('')
  const [oppId, setOppId] = useState('')
  const [assignee, setAssignee] = useState('')
  const [due, setDue] = useState('')
  const [type, setType] = useState('FOLLOW_UP')
  const [priority, setPriority] = useState('MEDIUM')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    crmApi.opportunities().then(o => setOpps(o.filter(x => !['WON', 'LOST'].includes(x.stage)))).catch(() => {})
    crmApi.users().then(setUsers).catch(() => {})
  }, [open])

  const submit = async () => {
    if (!title || !assignee) { toast({ title: 'Judul & assignee wajib diisi', variant: 'destructive' }); return }
    setSaving(true)
    try {
      await crmApi.createTask({ title, opportunityId: oppId || undefined, assigneeId: assignee, dueDate: due || undefined, type, priority })
      toast({ title: 'Task dibuat ✓' })
      setTitle(''); setOppId(''); setDue('')
      onOpenChange(false); onCreated()
    } catch (e) {
      toast({ title: 'Gagal membuat task', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Task Follow-up Baru</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Judul *</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="cth: Follow-up penawaran via WA" /></div>
          <div className="space-y-1.5">
            <Label>Terkait opportunity</Label>
            <Select value={oppId} onValueChange={setOppId}>
              <SelectTrigger><SelectValue placeholder="— Tidak terkait —" /></SelectTrigger>
              <SelectContent className="max-h-60">
                {opps.map(o => <SelectItem key={o.id} value={o.id}>{o.code} · {o.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Assignee *</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger>
                <SelectContent className="max-h-60">{users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Deadline</Label><Input type="date" value={due} onChange={e => setDue(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Tipe</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TASK_TYPES.map(t => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Prioritas</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Low</SelectItem><SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem><SelectItem value="URGENT">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button onClick={submit} disabled={saving} className="gap-2 bg-slate-900 hover:bg-slate-800">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Simpan Task</Button></DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ---------------- New Template Dialog ---------------- */
function NewTemplateDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const brands = useCrmStore((s) => s.brands)
  const { toast } = useToast()
  const [brandId, setBrandId] = useState('')
  const [name, setName] = useState('')
  const [step, setStep] = useState('1')
  const [delayDays, setDelayDays] = useState('1')
  const [channel, setChannel] = useState('WHATSAPP')
  const [language, setLanguage] = useState('id')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [purpose, setPurpose] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!brandId || !name || !body) { toast({ title: 'Brand, nama, dan isi template wajib', variant: 'destructive' }); return }
    setSaving(true)
    try {
      await crmApi.createTemplate({ brandId, name, step: Number(step) || 1, delayDays: Number(delayDays) || 1, channel, language, subject: subject || undefined, body, purpose: purpose || undefined })
      toast({ title: 'Template dibuat ✓' })
      setName(''); setSubject(''); setBody(''); setPurpose('')
      onOpenChange(false); onCreated()
    } catch (e) {
      toast({ title: 'Gagal', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Template Follow-up Baru</DialogTitle>
          <DialogDescription>Gunakan variabel seperti {'{{contact_name}}'} — otomatis diganti saat draft dibuat.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1 scrollbar-slim">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Brand *</Label>
              <Select value={brandId} onValueChange={setBrandId}>
                <SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger>
                <SelectContent>{brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Nama *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="FU2 — Tawaran Konsultasi" /></div>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div className="space-y-1.5"><Label>Step</Label><Input type="number" value={step} onChange={e => setStep(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Jeda (hari)</Label><Input type="number" value={delayDays} onChange={e => setDelayDays(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Kanal</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="WHATSAPP">WhatsApp</SelectItem><SelectItem value="EMAIL">Email</SelectItem><SelectItem value="WHATSAPP_EMAIL">WA + Email</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Bahasa</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="id">ID</SelectItem><SelectItem value="en">EN</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label>Tujuan</Label><Input value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="cth: Tawarkan konsultasi singkat" /></div>
          <div className="space-y-1.5"><Label>Subjek (untuk email)</Label><Input value={subject} onChange={e => setSubject(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Isi template *</Label><Textarea rows={5} value={body} onChange={e => setBody(e.target.value)} placeholder="Halo {'{{contact_name}}'}, terima kasih telah menghubungi {'{{brand_name}}'}…" /></div>
          <DialogFooter><Button onClick={submit} disabled={saving} className="gap-2 bg-slate-900 hover:bg-slate-800">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Simpan Template</Button></DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
