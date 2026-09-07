/* ============ Service Workflow Dialog — pengaturan layanan & workflow per brand (R28) ============
 * Kelola katalog layanan: nama, kategori, deskripsi, harga dasar, estimasi hari, aktif/nonaktif.
 * Kelola workflow tiap layanan: tahapan milestone template (nama + deskripsi + estimasi hari +
 * harga per tahap) — dipakai otomatis saat "Buat Project dari Brief" dan jadi acuan pricing.
 * Tulis: SUPER_ADMIN/DIREKTUR (server-enforced). Baca: semua tim internal.
 * ================================================================================================== */
'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { serviceApi } from './api-client'
import { useToast } from '@/hooks/use-toast'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { WORKFLOW_MILESTONES, formatMoney } from '@/lib/crm-constants'
import type { BrandDTO, ServiceDTO } from '@/lib/crm-types'
import { cn } from '@/lib/utils'
import {
  ArrowDown, ArrowUp, Copy, Loader2, Lock, Plus, Save, Tags, Trash2, Wallet, Workflow,
} from 'lucide-react'

const SCROLLBAR = '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300'

const TEMPLATE_LABELS: Record<string, string> = {
  website: 'Website', video: 'Video Produksi', animation: 'Animasi',
  livestream: 'Livestream', generic: 'Generik',
}

interface StepRow {
  key: string
  name: string
  description: string
  estimatedDays: number
  price: string
}

const uid = () => Math.random().toString(36).slice(2, 9)

const stepRowsFrom = (s: ServiceDTO | null): StepRow[] =>
  (s?.steps ?? []).map((st) => ({
    key: uid(), name: st.name, description: st.description ?? '',
    estimatedDays: st.estimatedDays, price: String(st.price ?? 0),
  }))

interface ServiceDraft {
  name: string
  category: string
  description: string
  basePrice: string
  estimatedDays: string
  isActive: boolean
}

const draftFrom = (s: ServiceDTO | null): ServiceDraft => ({
  name: s?.name ?? '',
  category: s?.category ?? 'Umum',
  description: s?.description ?? '',
  basePrice: s?.basePrice ? String(Math.round(s.basePrice)) : '',
  estimatedDays: s?.estimatedDays ? String(s.estimatedDays) : '',
  isActive: s?.isActive ?? true,
})

export function ServiceWorkflowDialog({
  open, onOpenChange, brand, canManage, onChanged,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  brand: BrandDTO | null
  canManage: boolean
  onChanged?: () => void
}) {
  const { toast } = useToast()

  const [loading, setLoading] = useState(false)
  const [services, setServices] = useState<ServiceDTO[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<ServiceDraft>(draftFrom(null))
  const [steps, setSteps] = useState<StepRow[]>([])
  const [newName, setNewName] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [adding, setAdding] = useState(false)
  const [busyService, setBusyService] = useState(false)
  const [busySteps, setBusySteps] = useState(false)

  const selected = useMemo(
    () => services.find((s) => s.id === selectedId) ?? null,
    [services, selectedId]
  )

  /* Muat layanan brand saat dialog dibuka */
  const load = useCallback(async () => {
    if (!brand) return
    setLoading(true)
    try {
      const list = await serviceApi.list(`brandId=${brand.id}&includeInactive=1`)
      setServices(list)
      setSelectedId((cur) => (cur && list.some((s) => s.id === cur) ? cur : (list[0]?.id ?? null)))
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Gagal memuat layanan',
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setLoading(false)
    }
  }, [brand, toast])

  useEffect(() => {
    if (open && brand) void load()
    if (!open) {
      setSelectedId(null)
      setNewName('')
      setNewCategory('')
      setAdding(false)
    }
  }, [open, brand, load])

  /* Saat pilihan berubah → muat draft */
  useEffect(() => {
    setDraft(draftFrom(selected))
    setSteps(stepRowsFrom(selected))
  }, [selectedId, selected])

  const totals = useMemo(() => {
    const days = steps.reduce((a, s) => a + Math.max(1, s.estimatedDays || 1), 0)
    const price = steps.reduce((a, s) => a + (Number(s.price.replace(/[^\d]/g, '')) || 0), 0)
    return { days, price }
  }, [steps])

  const selectService = (id: string) => setSelectedId(id)

  const addService = async () => {
    if (!brand) return
    if (!newName.trim()) {
      toast({ title: 'Nama layanan wajib diisi', variant: 'destructive' })
      return
    }
    setAdding(true)
    try {
      const created = await serviceApi.create({
        brandId: brand.id,
        name: newName.trim(),
        category: newCategory.trim() || 'Umum',
      })
      await load()
      setSelectedId(created.id)
      setNewName('')
      setNewCategory('')
      toast({ title: 'Layanan ditambahkan ✓', description: `${created.name} — lengkapi workflow & pricing-nya.` })
      onChanged?.()
    } catch (err) {
      toast({ variant: 'destructive', title: 'Gagal menambah layanan', description: err instanceof Error ? err.message : undefined })
    } finally {
      setAdding(false)
    }
  }

  const saveService = async () => {
    if (!selected) return
    if (!draft.name.trim()) {
      toast({ title: 'Nama layanan wajib diisi', variant: 'destructive' })
      return
    }
    setBusyService(true)
    try {
      await serviceApi.update(selected.id, {
        name: draft.name.trim(),
        category: draft.category.trim() || 'Umum',
        description: draft.description.trim() || null,
        basePrice: draft.basePrice.trim() ? Number(draft.basePrice.replace(/[^\d]/g, '')) : null,
        estimatedDays: draft.estimatedDays.trim() ? Number(draft.estimatedDays.replace(/[^\d]/g, '')) : null,
        isActive: draft.isActive,
      })
      await load()
      toast({ title: 'Layanan tersimpan ✓', description: draft.name.trim() })
      onChanged?.()
    } catch (err) {
      toast({ variant: 'destructive', title: 'Gagal menyimpan layanan', description: err instanceof Error ? err.message : undefined })
    } finally {
      setBusyService(false)
    }
  }

  const toggleActive = async (s: ServiceDTO, isActive: boolean) => {
    try {
      await serviceApi.update(s.id, { isActive })
      await load()
      toast({ title: isActive ? `${s.name} diaktifkan` : `${s.name} dinonaktifkan` })
      onChanged?.()
    } catch (err) {
      toast({ variant: 'destructive', title: 'Gagal mengubah status', description: err instanceof Error ? err.message : undefined })
    }
  }

  const removeService = async (s: ServiceDTO) => {
    if (!window.confirm(`Hapus layanan "${s.name}"? Jika sudah dipakai opportunity, nonaktifkan saja.`)) return
    try {
      await serviceApi.remove(s.id)
      setSelectedId(null)
      await load()
      toast({ title: 'Layanan dihapus', description: s.name })
      onChanged?.()
    } catch (err) {
      toast({ variant: 'destructive', title: 'Tidak bisa dihapus', description: err instanceof Error ? err.message : undefined })
    }
  }

  const saveSteps = async () => {
    if (!selected) return
    if (steps.length === 0 || steps.some((s) => !s.name.trim())) {
      toast({ title: 'Semua tahap workflow harus punya nama', variant: 'destructive' })
      return
    }
    setBusySteps(true)
    try {
      await serviceApi.saveSteps(
        selected.id,
        steps.map((s) => ({
          name: s.name.trim(),
          description: s.description.trim() || null,
          estimatedDays: Math.max(1, s.estimatedDays || 1),
          price: Number(s.price.replace(/[^\d]/g, '')) || 0,
        }))
      )
      await load()
      toast({ title: 'Workflow tersimpan ✓', description: `${steps.length} tahap · total ${totals.days} hari · ${formatMoney(totals.price, 'IDR', true)}` })
      onChanged?.()
    } catch (err) {
      toast({ variant: 'destructive', title: 'Gagal menyimpan workflow', description: err instanceof Error ? err.message : undefined })
    } finally {
      setBusySteps(false)
    }
  }

  const applyTemplate = (tplKey: string) => {
    const names = WORKFLOW_MILESTONES[tplKey]
    if (!names) return
    const total = draft.estimatedDays.trim()
      ? Number(draft.estimatedDays.replace(/[^\d]/g, '')) || names.length * 7
      : names.length * 7
    const per = Math.max(1, Math.round(total / names.length))
    setSteps(
      names.map((n, i) => ({
        key: uid(), name: n, description: '',
        estimatedDays: i === names.length - 1 ? Math.max(1, total - per * (names.length - 1)) : per,
        price: '0',
      }))
    )
    toast({ title: `Template ${TEMPLATE_LABELS[tplKey] ?? tplKey} disalin`, description: `${names.length} tahap — sesuaikan estimasi & harga lalu simpan.` })
  }

  const moveStep = (idx: number, dir: -1 | 1) => {
    setSteps((rows) => {
      const next = [...rows]
      const j = idx + dir
      if (j < 0 || j >= next.length) return rows
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] flex-col overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-left">
            <Workflow className="h-5 w-5 text-teal-700" /> Layanan &amp; Workflow — {brand?.name}
          </DialogTitle>
          <DialogDescription className="text-left">
            Tentukan jenis layanan lengkap dengan workflow milestone, estimasi hari, dan pricing per tahap —
            otomatis dipakai saat membuat project dari brief.
            {!canManage && (
              <span className="mt-1 flex items-center gap-1 text-[11px] text-amber-700">
                <Lock className="h-3 w-3" /> Mode lihat saja — pengaturan hanya untuk Direktur/Super Admin.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-4 overflow-hidden md:grid-cols-[260px_1fr]">
          {/* ============ Kolom kiri — daftar layanan ============ */}
          <div className="flex min-h-0 flex-col gap-2">
            {canManage && (
              <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50/60 p-2">
                <Input
                  className="h-8 text-[12px]" placeholder="Nama layanan baru"
                  value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={120}
                />
                <div className="flex gap-1.5">
                  <Input
                    className="h-8 flex-1 text-[12px]" placeholder="Kategori (cth: Animation)"
                    value={newCategory} onChange={(e) => setNewCategory(e.target.value)} maxLength={60}
                  />
                  <Button size="sm" className="h-8 gap-1 bg-teal-700 px-2 text-[11px] hover:bg-teal-800" onClick={() => void addService()} disabled={adding}>
                    {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Tambah
                  </Button>
                </div>
              </div>
            )}
            <div className={cn('min-h-0 flex-1 space-y-1 overflow-y-auto pr-1', SCROLLBAR)}>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
                </div>
              ) : services.length === 0 ? (
                <p className="py-6 text-center text-[12px] text-slate-400">Belum ada layanan pada brand ini.</p>
              ) : (
                services.map((s) => {
                  const active = s.id === selectedId
                  return (
                    <button
                      key={s.id}
                      onClick={() => selectService(s.id)}
                      className={cn(
                        'w-full rounded-lg border p-2 text-left transition-colors',
                        active ? 'border-teal-300 bg-teal-50/70' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      )}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="truncate text-[12px] font-semibold text-slate-800">{s.name}</span>
                        {!s.isActive && (
                          <Badge variant="secondary" className="shrink-0 border-0 bg-slate-200 px-1.5 text-[9px] text-slate-500">Nonaktif</Badge>
                        )}
                      </div>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-400">
                        <Tags className="h-2.5 w-2.5" /> {s.category}
                        <span className="text-slate-300">·</span>
                        <Workflow className="h-2.5 w-2.5" /> {s.steps?.length ?? 0} tahap
                        {(s.basePrice ?? 0) > 0 && (
                          <>
                            <span className="text-slate-300">·</span>
                            <Wallet className="h-2.5 w-2.5" /> {formatMoney(s.basePrice ?? 0, 'IDR', true)}
                          </>
                        )}
                      </p>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {/* ============ Kolom kanan — detail & workflow ============ */}
          <div className="min-h-0 space-y-3 overflow-y-auto rounded-xl border border-slate-200 p-3 pr-1.5 md:pr-3 scrollbar-slim">
            {!selected ? (
              <div className="flex h-full min-h-40 flex-col items-center justify-center text-center">
                <Workflow className="mb-2 h-8 w-8 text-slate-200" />
                <p className="text-[13px] font-medium text-slate-500">Pilih layanan di kiri</p>
                <p className="mt-1 text-[11px] text-slate-400">Lalu atur workflow milestone, estimasi hari, dan pricing-nya.</p>
              </div>
            ) : (
              <>
                {/* ---- Info layanan ---- */}
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Nama layanan</Label>
                    <Input className="h-8 text-[12px]" value={draft.name} maxLength={120}
                      disabled={!canManage} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Kategori</Label>
                    <Input className="h-8 text-[12px]" value={draft.category} maxLength={60}
                      disabled={!canManage} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))} />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-[11px]">Deskripsi layanan</Label>
                    <Textarea className="min-h-[52px] text-[12px]" value={draft.description} maxLength={1000}
                      disabled={!canManage} placeholder="Ringkasan mekanisme layanan ini — apa yang didapat klien"
                      onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="flex items-center gap-1 text-[11px]"><Wallet className="h-3 w-3 text-slate-400" /> Harga dasar/paket (IDR)</Label>
                    <Input className="h-8 tabular-nums text-[12px]" inputMode="numeric" placeholder="0" value={draft.basePrice}
                      disabled={!canManage} onChange={(e) => setDraft((d) => ({ ...d, basePrice: e.target.value.replace(/[^\d]/g, '') }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Estimasi total (hari kerja)</Label>
                    <Input className="h-8 tabular-nums text-[12px]" inputMode="numeric" placeholder="cth: 30" value={draft.estimatedDays}
                      disabled={!canManage} onChange={(e) => setDraft((d) => ({ ...d, estimatedDays: e.target.value.replace(/[^\d]/g, '') }))} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Switch checked={draft.isActive} disabled={!canManage}
                      onCheckedChange={(v) => canManage ? void toggleActive(selected, v) : setDraft((d) => ({ ...d, isActive: v }))} />
                    <span className="text-[11px] text-slate-500">{draft.isActive ? 'Aktif — muncul di pipeline & project builder' : 'Nonaktif — disembunyikan dari pemilihan baru'}</span>
                  </div>
                  {canManage && (
                    <div className="flex gap-1.5">
                      <Button variant="outline" size="sm" className="h-8 gap-1 text-[11px] text-rose-600 hover:bg-rose-50" onClick={() => void removeService(selected)}>
                        <Trash2 className="h-3.5 w-3.5" /> Hapus
                      </Button>
                      <Button size="sm" className="h-8 gap-1 bg-slate-900 text-[11px] text-white hover:bg-slate-800" onClick={() => void saveService()} disabled={busyService}>
                        {busyService ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Simpan Layanan
                      </Button>
                    </div>
                  )}
                </div>

                {/* ---- Workflow steps ---- */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700">
                      <Workflow className="h-3.5 w-3.5 text-teal-700" /> Workflow Milestone ({steps.length})
                      <span className="font-normal text-slate-400">· total {totals.days} hari · {formatMoney(totals.price, 'IDR', true)}</span>
                    </p>
                    {canManage && (
                      <div className="flex items-center gap-1.5">
                        <select
                          aria-label="Salin dari template"
                          className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
                          value=""
                          onChange={(e) => { if (e.target.value) applyTemplate(e.target.value) }}
                        >
                          <option value="">Salin dari template…</option>
                          {Object.keys(WORKFLOW_MILESTONES).map((k) => (
                            <option key={k} value={k}>{TEMPLATE_LABELS[k] ?? k}</option>
                          ))}
                        </select>
                        <Button
                          variant="outline" size="sm" className="h-8 gap-1 text-[11px]"
                          onClick={() => setSteps((rows) => [...rows, { key: uid(), name: '', description: '', estimatedDays: 7, price: '0' }])}
                          disabled={steps.length >= 30}
                        >
                          <Plus className="h-3.5 w-3.5" /> Tahap
                        </Button>
                      </div>
                    )}
                  </div>

                  {steps.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-slate-200 py-4 text-center text-[11px] text-slate-400">
                      Belum ada workflow — salin dari template atau tambah tahap manual.
                    </p>
                  ) : (
                    <div className={cn('max-h-72 space-y-1.5 overflow-y-auto pr-1', SCROLLBAR)}>
                      {steps.map((s, i) => (
                        <div key={s.key} className="rounded-lg border border-slate-200 bg-white p-2">
                          <div className="flex items-center gap-1.5">
                            <span className="w-5 shrink-0 text-center text-[11px] font-bold text-slate-400">{i + 1}</span>
                            <Input
                              className="h-7 flex-1 border-0 bg-transparent p-0 text-[12px] shadow-none focus-visible:ring-1"
                              placeholder={`Nama tahap ${i + 1}`} value={s.name} maxLength={120} disabled={!canManage}
                              onChange={(e) => setSteps((rows) => rows.map((r) => r.key === s.key ? { ...r, name: e.target.value } : r))}
                            />
                            <div className="flex shrink-0 items-center gap-1 rounded-md bg-slate-50 px-1.5">
                              <Input
                                className="h-6 w-10 border-0 bg-transparent p-0 text-center text-[11px] tabular-nums shadow-none focus-visible:ring-0"
                                inputMode="numeric" value={String(s.estimatedDays)} disabled={!canManage}
                                onChange={(e) => {
                                  const v = Math.max(1, Math.min(365, Number(e.target.value.replace(/[^\d]/g, '')) || 1))
                                  setSteps((rows) => rows.map((r) => r.key === s.key ? { ...r, estimatedDays: v } : r))
                                }}
                              />
                              <span className="text-[9px] text-slate-400">hari</span>
                            </div>
                            <div className="flex shrink-0 items-center gap-1 rounded-md bg-emerald-50/60 px-1.5">
                              <span className="text-[9px] text-emerald-700">Rp</span>
                              <Input
                                className="h-6 w-20 border-0 bg-transparent p-0 text-right text-[11px] tabular-nums shadow-none focus-visible:ring-0"
                                inputMode="numeric" placeholder="0" value={s.price} disabled={!canManage}
                                onChange={(e) => setSteps((rows) => rows.map((r) => r.key === s.key ? { ...r, price: e.target.value.replace(/[^\d]/g, '') } : r))}
                              />
                            </div>
                            {canManage && (
                              <>
                                <div className="flex shrink-0 flex-col">
                                  <button aria-label="Naik" className="rounded p-0.5 text-slate-300 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30" disabled={i === 0} onClick={() => moveStep(i, -1)}>
                                    <ArrowUp className="h-3 w-3" />
                                  </button>
                                  <button aria-label="Turun" className="rounded p-0.5 text-slate-300 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30" disabled={i === steps.length - 1} onClick={() => moveStep(i, 1)}>
                                    <ArrowDown className="h-3 w-3" />
                                  </button>
                                </div>
                                <button
                                  aria-label="Hapus tahap"
                                  className="shrink-0 rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
                                  onClick={() => setSteps((rows) => rows.filter((r) => r.key !== s.key))}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                          <Input
                            className="mt-1 h-6 border-0 bg-transparent p-0 pl-7 text-[11px] text-slate-500 shadow-none focus-visible:ring-1"
                            placeholder="Deskripsi tahap (opsional — muncul di detail milestone)" value={s.description} maxLength={500} disabled={!canManage}
                            onChange={(e) => setSteps((rows) => rows.map((r) => r.key === s.key ? { ...r, description: e.target.value } : r))}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {canManage && steps.length > 0 && (
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] leading-relaxed text-slate-400">
                        Workflow ini otomatis jadi milestone saat klien memilih layanan ini di project builder —
                        harga tahap dipakai sebagai acuan nilai produksi.
                      </p>
                      <Button size="sm" className="h-8 shrink-0 gap-1 bg-teal-700 text-[11px] hover:bg-teal-800" onClick={() => void saveSteps()} disabled={busySteps}>
                        {busySteps ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />} Simpan Workflow
                      </Button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
