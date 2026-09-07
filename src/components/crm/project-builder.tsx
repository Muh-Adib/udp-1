/* ============ Project Builder — buat project dari opportunity Won sesuai brief ============
 * Alur: opportunity Won → tombol "Buat Project" → dialog ini (prefill dari brief +
 * milestone dari workflow layanan — nama/deskripsi/estimasi hari/harga per tahap) →
 * POST /api/projects (project + milestone sekaligus).
 * R28: milestone berasal dari ServiceStep (pengaturan Layanan & Workflow per brand);
 * tanpa layanan → fallback template WORKFLOW_MILESTONES.
 * ======================================================================================== */
'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { crmApi, estimationApi, serviceApi } from './api-client'
import { WORKFLOW_MILESTONES, formatMoney } from '@/lib/crm-constants'
import type { OpportunityDetailDTO, ProjectDTO, UserDTO, BriefDTO, ServiceDTO } from '@/lib/crm-types'
import { ArrowDown, ArrowUp, CalendarDays, ClipboardList, FileText, Loader2, Plus, Trash2, Wallet, Workflow } from 'lucide-react'

const WORKFLOW_OPTIONS: { key: string; label: string }[] = [
  { key: 'website', label: 'Website' },
  { key: 'video', label: 'Video Produksi' },
  { key: 'animation', label: 'Animasi' },
  { key: 'livestream', label: 'Livestream' },
  { key: 'generic', label: 'Generik' },
]

const NO_SERVICE = '__none__'

/** Heuristik workflowType dari nama/kategori layanan (utk metadata project). */
const detectWorkflow = (text: string): string => {
  const t = text.toLowerCase()
  if (/(website|landing page|web dev|maintenance|seo)/.test(t)) return 'website'
  if (/(video|drone|iklan|shooting|dokumentasi|film)/.test(t)) return 'video'
  if (/(anim|motion|3d|2d)/.test(t)) return 'animation'
  if (/(live|streaming|virtual|broadcast)/.test(t)) return 'livestream'
  return 'generic'
}

interface MilestoneRow {
  key: string
  name: string
  description: string
  estimatedDays: number
  price: string
}

function uid() { return Math.random().toString(36).slice(2, 9) }

const rowFromStep = (st: { name: string; description?: string | null; estimatedDays: number; price: number }): MilestoneRow => ({
  key: uid(),
  name: st.name,
  description: st.description ?? '',
  estimatedDays: Math.max(1, st.estimatedDays || 1),
  price: st.price > 0 ? String(Math.round(st.price)) : '0',
})

export interface ProjectBuilderProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  opportunity: OpportunityDetailDTO | null
  users: UserDTO[]
  onCreated?: (project: ProjectDTO) => void
}

export function ProjectBuilder({ open, onOpenChange, opportunity, users, onCreated }: ProjectBuilderProps) {
  const { toast } = useToast()

  const [name, setName] = useState('')
  const [serviceId, setServiceId] = useState<string>(NO_SERVICE)
  const [workflowType, setWorkflowType] = useState('generic')
  const [managerId, setManagerId] = useState('none')
  const [budget, setBudget] = useState('')
  const [startDate, setStartDate] = useState('')
  const [milestones, setMilestones] = useState<MilestoneRow[]>([])
  const [brief, setBrief] = useState<BriefDTO | null>(null)
  const [briefLoading, setBriefLoading] = useState(false)
  const [services, setServices] = useState<ServiceDTO[]>([])
  const [servicesLoading, setServicesLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const internalUsers = useMemo(
    () => users.filter((u) => u.isActive && u.role !== 'CLIENT'),
    [users]
  )

  const selectedService = useMemo(
    () => services.find((s) => s.id === serviceId) ?? null,
    [services, serviceId]
  )

  /* Prefill saat dialog dibuka */
  useEffect(() => {
    if (!open || !opportunity) return
    setName(opportunity.title)
    setBudget(String(Math.max(0, opportunity.lastOfferValue ?? opportunity.estimatedValue ?? 0)))
    const today = new Date()
    setStartDate(today.toISOString().slice(0, 10))
    setManagerId('none')

    /* Milestone default dari template generik — diganti saat layanan dipilih */
    setServiceId(opportunity.serviceId ?? NO_SERVICE)
    setMilestones(
      (WORKFLOW_MILESTONES.generic ?? ['Kick-off', 'Production', 'Review', 'Handover']).map((n) => ({
        key: uid(), name: n, description: '', estimatedDays: 7, price: '0',
      }))
    )

    /* Muat brief terakhir utk pratinjau */
    setBrief(null)
    setBriefLoading(true)
    estimationApi.brief(opportunity.id)
      .then((b) => setBrief(b))
      .catch(() => setBrief(null))
      .finally(() => setBriefLoading(false))

    /* Muat katalog layanan brand eksekutor (R28) — prefill milestone dari workflow layanan */
    setServices([])
    setServicesLoading(true)
    serviceApi.list(`brandId=${opportunity.executingBrandId}`)
      .then((list) => {
        setServices(list)
        const pre = opportunity.serviceId ? list.find((s) => s.id === opportunity.serviceId) : null
        if (pre && (pre.steps?.length ?? 0) > 0) {
          setMilestones(pre.steps!.map(rowFromStep))
          setWorkflowType(detectWorkflow(`${pre.name} ${pre.category}`))
          setBudget((b) => {
            const cur = Number(b) || 0
            if (cur > 0) return b
            const total = pre.steps!.reduce((a, st) => a + (st.price || 0), 0)
            return String(Math.round(pre.basePrice && pre.basePrice > 0 ? pre.basePrice : total))
          })
        }
      })
      .catch(() => setServices([]))
      .finally(() => setServicesLoading(false))
  }, [open, opportunity])

  const applyService = (id: string) => {
    setServiceId(id)
    if (id === NO_SERVICE) {
      setMilestones(
        (WORKFLOW_MILESTONES[workflowType] ?? WORKFLOW_MILESTONES.generic).map((n) => ({
          key: uid(), name: n, description: '', estimatedDays: 7, price: '0',
        }))
      )
      return
    }
    const svc = services.find((s) => s.id === id)
    if (!svc) return
    setWorkflowType(detectWorkflow(`${svc.name} ${svc.category}`))
    if ((svc.steps?.length ?? 0) > 0) {
      setMilestones(svc.steps!.map(rowFromStep))
    } else {
      /* Layanan belum punya workflow → pakai template generik (atur manual / isi di Layanan & Workflow) */
      setMilestones(
        (WORKFLOW_MILESTONES[workflowType] ?? WORKFLOW_MILESTONES.generic).map((n) => ({
          key: uid(), name: n, description: '', estimatedDays: 7, price: '0',
        }))
      )
      toast({
        title: `${svc.name} belum punya workflow`,
        description: 'Milestone pakai template umum — atur workflow-nya di menu Brand → Layanan.',
      })
    }
    /* Budget kosong → isi dari harga dasar layanan / total harga tahap */
    setBudget((b) => {
      if (Number(b) > 0) return b
      const totalSteps = svc.steps?.reduce((a, st) => a + (st.price || 0), 0) ?? 0
      return String(Math.round(svc.basePrice && svc.basePrice > 0 ? svc.basePrice : totalSteps))
    })
  }

  const applyWorkflow = (wf: string) => {
    setWorkflowType(wf)
    const names = WORKFLOW_MILESTONES[wf] ?? WORKFLOW_MILESTONES.generic
    setMilestones(names.map((n) => ({ key: uid(), name: n, description: '', estimatedDays: 7, price: '0' })))
  }

  /* Tanggal target tiap milestone = startDate + kumulatif estimatedDays */
  const milestoneDates = useMemo(() => {
    const base = startDate ? new Date(startDate + 'T00:00:00') : new Date()
    let acc = 0
    return milestones.map((m) => {
      acc += Math.max(1, m.estimatedDays || 1)
      const d = new Date(base.getTime() + acc * 86400000)
      return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
    })
  }, [milestones, startDate])

  const totalDays = milestones.reduce((a, m) => a + Math.max(1, m.estimatedDays || 1), 0)
  const totalPrice = milestones.reduce((a, m) => a + (Number(m.price.replace(/[^\d]/g, '')) || 0), 0)

  const move = (idx: number, dir: -1 | 1) => {
    setMilestones((rows) => {
      const next = [...rows]
      const j = idx + dir
      if (j < 0 || j >= next.length) return rows
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next
    })
  }

  const submit = async () => {
    if (!opportunity) return
    if (!name.trim()) { toast({ title: 'Nama project wajib diisi', variant: 'destructive' }); return }
    if (milestones.length === 0 || milestones.some((m) => !m.name.trim())) {
      toast({ title: 'Semua milestone harus punya nama', variant: 'destructive' }); return
    }
    setSubmitting(true)
    try {
      /* dueDate per milestone dari akumulasi estimasi */
      const base = startDate ? new Date(startDate + 'T00:00:00') : new Date()
      let acc = 0
      const ms = milestones.map((m) => {
        acc += Math.max(1, m.estimatedDays || 1)
        return {
          name: m.name.trim(),
          description: m.description.trim() || undefined,
          estimatedDays: Math.max(1, m.estimatedDays || 1),
          price: Number(m.price.replace(/[^\d]/g, '')) || 0,
          dueDate: new Date(base.getTime() + acc * 86400000).toISOString(),
        }
      })
      const project = await crmApi.createProject({
        opportunityId: opportunity.id,
        name: name.trim(),
        managerId: managerId === 'none' ? undefined : managerId,
        budget: Number(budget) || 0,
        startDate: startDate || undefined,
        endDate: ms.length ? ms[ms.length - 1].dueDate : undefined,
        workflowType,
        milestones: ms,
      })
      toast({ title: 'Project dibuat ✓', description: `${project.code} · ${project.milestones.length} milestone · estimasi ${totalDays} hari kerja` })
      onOpenChange(false)
      onCreated?.(project)
    } catch (e) {
      toast({ title: 'Gagal membuat project', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-left">
            <ClipboardList className="h-5 w-5 text-teal-700" /> Buat Project dari Brief
          </DialogTitle>
          <DialogDescription className="text-left">
            {opportunity?.code} · {opportunity?.brandName} — milestone mengikuti workflow layanan (estimasi &amp; harga per tahap), bisa disesuaikan.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 flex-1 space-y-4 overflow-y-auto px-1 py-1 scrollbar-slim">
          {/* Ringkasan brief */}
          <div className="rounded-xl border border-teal-100 bg-teal-50/50 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-teal-900">
                <FileText className="h-4 w-4" /> Brief Kreatif
                {brief && (
                  <Badge variant="secondary" className={cn('ml-1 border-0 text-[10px]', brief.status === 'FINAL' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
                    {brief.status === 'FINAL' ? 'Final' : 'Draft'}
                  </Badge>
                )}
              </p>
              {briefLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-600" />}
            </div>
            {brief ? (
              <div className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-slate-600">
                {brief.deliverables && <p><span className="font-semibold text-slate-700">Deliverables:</span> {brief.deliverables}</p>}
                {brief.objectives && <p className="line-clamp-2"><span className="font-semibold text-slate-700">Tujuan:</span> {brief.objectives}</p>}
                {brief.timeline && <p><span className="font-semibold text-slate-700">Timeline klien:</span> {brief.timeline}</p>}
                {!brief.deliverables && !brief.objectives && !brief.timeline && (
                  <p className="text-slate-400">Brief belum diisi detail — lengkapi di tab Brief &amp; Estimasi bila perlu.</p>
                )}
              </div>
            ) : opportunity?.brief ? (
              /* R28 — brief mentah dari Ringkasan tetap tampil walau brief terstruktur belum dibuat */
              <div className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-slate-600">
                <p className="line-clamp-3"><span className="font-semibold text-slate-700">Catatan brief (Ringkasan):</span> {opportunity.brief}</p>
                {opportunity.deliverables && <p><span className="font-semibold text-slate-700">Deliverables:</span> {opportunity.deliverables}</p>}
              </div>
            ) : (
              !briefLoading && <p className="mt-1.5 text-[12px] text-slate-400">Brief belum dibuat — project tetap bisa dibuat, milestone pakai template workflow.</p>
            )}
          </div>

          {/* Info dasar */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="pb-name">Nama project</Label>
              <Input id="pb-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={160} />
            </div>
            <div className="space-y-1.5">
              <Label>Penanggung jawab (PM)</Label>
              <Select value={managerId} onValueChange={setManagerId}>
                <SelectTrigger><SelectValue placeholder="Pilih PM" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Belum ditentukan —</SelectItem>
                  {internalUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name} · {u.role}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1"><Wallet className="h-3.5 w-3.5 text-slate-400" /> Budget (IDR)</Label>
              <Input inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d]/g, ''))} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5 text-slate-400" /> Tanggal mulai</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1">
                <Workflow className="h-3.5 w-3.5 text-slate-400" /> Layanan
                {servicesLoading && <Loader2 className="h-3 w-3 animate-spin text-slate-300" />}
              </Label>
              <Select value={serviceId} onValueChange={applyService} disabled={services.length === 0 && servicesLoading}>
                <SelectTrigger><SelectValue placeholder={services.length === 0 ? 'Memuat layanan…' : 'Pilih layanan'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SERVICE}>— Tanpa layanan (template umum) —</SelectItem>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} · {s.category}{(s.steps?.length ?? 0) > 0 ? ` (${s.steps!.length} tahap)` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {serviceId === NO_SERVICE && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Template workflow umum</Label>
                <Select value={workflowType} onValueChange={applyWorkflow}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WORKFLOW_OPTIONS.map((w) => <SelectItem key={w.key} value={w.key}>{w.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {selectedService && (selectedService.basePrice ?? 0) > 0 && (
              <p className="text-[11px] text-slate-400 sm:col-span-2">
                Harga dasar layanan <b>{selectedService.name}</b>: {formatMoney(selectedService.basePrice!, 'IDR')} — total nilai milestone di bawah {formatMoney(totalPrice, 'IDR', true)}.
              </p>
            )}
          </div>

          {/* Milestone editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>
                Milestone ({milestones.length}) · total {totalDays} hari kerja
                {totalPrice > 0 && <span className="font-normal text-slate-400"> · nilai {formatMoney(totalPrice, 'IDR', true)}</span>}
              </Label>
              <Button
                size="sm" variant="outline" className="h-8 gap-1 text-[11px]"
                onClick={() => setMilestones((rows) => [...rows, { key: uid(), name: '', description: '', estimatedDays: 7, price: '0' }])}
                disabled={milestones.length >= 20}
              >
                <Plus className="h-3.5 w-3.5" /> Tambah
              </Button>
            </div>
            <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1 scrollbar-slim">
              {milestones.map((m, i) => (
                <div key={m.key} className="rounded-lg border border-slate-200 bg-white p-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-5 shrink-0 text-center text-[11px] font-bold text-slate-400">{i + 1}</span>
                    <Input
                      className="h-8 flex-1 border-0 bg-transparent text-[13px] shadow-none focus-visible:ring-1"
                      value={m.name}
                      placeholder={`Nama milestone ${i + 1}`}
                      onChange={(e) => setMilestones((rows) => rows.map((r) => r.key === m.key ? { ...r, name: e.target.value } : r))}
                      maxLength={120}
                    />
                    <div className="flex shrink-0 items-center gap-1 rounded-md bg-slate-50 px-1.5">
                      <Input
                        className="h-7 w-11 border-0 bg-transparent p-0 text-center text-[12px] tabular-nums shadow-none focus-visible:ring-0"
                        inputMode="numeric"
                        value={String(m.estimatedDays)}
                        onChange={(e) => {
                          const v = Math.max(1, Math.min(365, Number(e.target.value.replace(/[^\d]/g, '')) || 1))
                          setMilestones((rows) => rows.map((r) => r.key === m.key ? { ...r, estimatedDays: v } : r))
                        }}
                      />
                      <span className="text-[10px] text-slate-400">hari</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 rounded-md bg-emerald-50/60 px-1.5">
                      <span className="text-[10px] text-emerald-700">Rp</span>
                      <Input
                        className="h-7 w-24 border-0 bg-transparent p-0 text-right text-[12px] tabular-nums shadow-none focus-visible:ring-0"
                        inputMode="numeric"
                        placeholder="0"
                        value={m.price}
                        onChange={(e) => setMilestones((rows) => rows.map((r) => r.key === m.key ? { ...r, price: e.target.value.replace(/[^\d]/g, '') } : r))}
                      />
                    </div>
                    <span className="hidden w-20 shrink-0 text-right text-[10px] text-slate-400 sm:block">{milestoneDates[i]}</span>
                    <div className="flex shrink-0 flex-col">
                      <button aria-label="Naik" className="rounded p-0.5 text-slate-300 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)}>
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button aria-label="Turun" className="rounded p-0.5 text-slate-300 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30" disabled={i === milestones.length - 1} onClick={() => move(i, 1)}>
                        <ArrowDown className="h-3 w-3" />
                      </button>
                    </div>
                    <button
                      aria-label="Hapus milestone"
                      className="shrink-0 rounded p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
                      onClick={() => setMilestones((rows) => rows.filter((r) => r.key !== m.key))}
                      disabled={milestones.length <= 1}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <Input
                    className="mt-1 h-6 border-0 bg-transparent p-0 pl-7 text-[11px] text-slate-500 shadow-none focus-visible:ring-1"
                    value={m.description}
                    placeholder="Deskripsi pekerjaan tahap ini (opsional — muncul di detail milestone)"
                    onChange={(e) => setMilestones((rows) => rows.map((r) => r.key === m.key ? { ...r, description: e.target.value } : r))}
                    maxLength={500}
                  />
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-400">
              Target tanggal tiap milestone dihitung otomatis dari tanggal mulai + estimasi hari (kumulatif). Harga tahap bisa disesuaikan — default dari workflow layanan.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Batal</Button>
          <Button onClick={submit} disabled={submitting} className="gap-1.5 bg-teal-700 hover:bg-teal-800">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Buat Project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
