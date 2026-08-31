/* ============ Brands View — konfigurasi multi-brand + pengaturan (R15) ============ */
'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { crmApi } from './api-client'
import { useCrmStore } from './crm-store'
import { useToast } from '@/hooks/use-toast'
import { LoadingRows, RefreshButton, SectionHeader, UserAvatar } from './shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { WORKFLOW_MILESTONES, formatMoney } from '@/lib/crm-constants'
import type { BrandDTO, OpportunityDTO, UserDTO } from '@/lib/crm-types'
import { cn } from '@/lib/utils'
import {
  Building2, Globe, ImagePlus, Info, Loader2, Mail, MapPin, Instagram, Phone, Save, Settings2,
  Timer, Trash2, Upload, Users2, Workflow,
} from 'lucide-react'

const WORKFLOW_LABELS: Record<string, string> = {
  website: 'Website', video: 'Video', animation: 'Animasi', livestream: 'Live Streaming', generic: 'Umum',
}

const CURRENCIES = ['IDR', 'SGD', 'USD'] as const
const WORKFLOWS = ['website', 'video', 'animation', 'livestream', 'generic'] as const

const COLOR_PRESETS = ['#10b981', '#0d9488', '#d97706', '#7c3aed', '#e11d48', '#0284c7', '#65a30d', '#57534e']

/* R19 — proses file logo di sisi client: validasi + kompres via canvas agar data-URL ringan.
   Persegi 1:1 → crop tengah jadi 256×256; lebar → diskalakan proporsional (lebar maks 960px).
   Aspect ratio TIDAK diubah utk logo lebar — penempatan memakai object-contain. */
async function processLogoFile(file: File, variant: 'square' | 'wide'): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('File harus berupa gambar (PNG, JPG, WebP, atau SVG)')
  }
  if (file.size > 2 * 1024 * 1024) {
    throw new Error('Ukuran file maksimal 2 MB')
  }
  const readAsDataUrl = () => new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Gagal membaca file'))
    reader.readAsDataURL(file)
  })
  /* SVG disimpan apa adanya — vektor & biasanya ringan, rasterisasi malah merusak kualitas */
  if (file.type === 'image/svg+xml') {
    const url = await readAsDataUrl()
    if (url.length > 900_000) throw new Error('SVG terlalu besar — gunakan maksimal ±600 KB')
    return url
  }
  const dataUrl = await readAsDataUrl()
  const img = document.createElement('img')
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Gambar tidak dapat dibaca'))
    img.src = dataUrl
  })
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Browser tidak mendukung pemrosesan gambar')
  if (variant === 'square') {
    const s = Math.min(img.naturalWidth, img.naturalHeight)
    if (s < 64) throw new Error('Logo persegi minimal 64×64 px')
    const sx = (img.naturalWidth - s) / 2
    const sy = (img.naturalHeight - s) / 2
    canvas.width = 256
    canvas.height = 256
    ctx.drawImage(img, sx, sy, s, s, 0, 0, 256, 256)
  } else {
    const scale = Math.min(1, 960 / img.naturalWidth)
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  }
  return canvas.toDataURL('image/png')
}

interface BrandFormState {
  logoSquare: string
  logoWide: string
  tagline: string
  description: string
  website: string
  email: string
  phone: string
  instagram: string
  address: string
  color: string
  slaHours: string
  primaryCurrency: string
  invoicePrefix: string
  quotationPrefix: string
  workflowType: string
  isActive: boolean
}

const toForm = (b: BrandDTO): BrandFormState => ({
  logoSquare: b.logoSquare ?? '',
  logoWide: b.logoWide ?? '',
  tagline: b.tagline ?? '',
  description: b.description ?? '',
  website: (b.website ?? '').replace(/^https?:\/\//, ''),
  email: b.email ?? '',
  phone: b.phone ?? '',
  instagram: b.instagram ?? '',
  address: b.address ?? '',
  color: b.color,
  slaHours: String(b.slaHours),
  primaryCurrency: b.primaryCurrency,
  invoicePrefix: b.invoicePrefix,
  quotationPrefix: b.quotationPrefix,
  workflowType: b.workflowType,
  isActive: true,
})

export default function BrandsView() {
  const brands = useCrmStore((s) => s.brands)
  const setBrands = useCrmStore((s) => s.setBrands)
  const user = useCrmStore((s) => s.user)
  const { toast } = useToast()
  const [users, setUsers] = useState<UserDTO[]>([])
  const [opps, setOpps] = useState<OpportunityDTO[]>([])
  const [loading, setLoading] = useState(true)

  /* Pengaturan brand — hanya SUPER_ADMIN & DIREKTUR (selaras gate API) */
  const canManage = user?.role === 'SUPER_ADMIN' || user?.role === 'DIREKTUR'
  const [editing, setEditing] = useState<BrandDTO | null>(null)
  const [form, setForm] = useState<BrandFormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [logoBusy, setLogoBusy] = useState<'square' | 'wide' | null>(null)
  const fileSquareRef = useRef<HTMLInputElement>(null)
  const fileWideRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [u, o] = await Promise.all([crmApi.users(), crmApi.opportunities()])
      setUsers(u); setOpps(o)
    } catch (e) {
      toast({ title: 'Gagal memuat konfigurasi', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally { setLoading(false) }
  }, [toast])

  useEffect(() => { load() }, [load])

  const openEdit = (b: BrandDTO) => {
    setEditing(b)
    setForm(toForm(b))
  }

  const set = <K extends keyof BrandFormState>(key: K, value: BrandFormState[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f))

  /* R19 — ambil file logo dari input, proses di client, lalu isi form (belum tersimpan
     sampai user menekan Simpan). Error divalidasi ramah (tipe/ukuran) via toast. */
  const pickLogo = async (variant: 'square' | 'wide', file: File | undefined) => {
    if (!file) return
    setLogoBusy(variant)
    try {
      const dataUrl = await processLogoFile(file, variant)
      set(variant === 'square' ? 'logoSquare' : 'logoWide', dataUrl)
    } catch (e) {
      toast({ title: 'Logo gagal diproses', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally {
      setLogoBusy(null)
      if (variant === 'square' && fileSquareRef.current) fileSquareRef.current.value = ''
      if (variant === 'wide' && fileWideRef.current) fileWideRef.current.value = ''
    }
  }

  /* Dirty check — bandingkan form dengan brand asal */
  const dirty = useMemo(() => {
    if (!editing || !form) return false
    const orig = toForm(editing)
    return (Object.keys(orig) as (keyof BrandFormState)[]).some((k) => orig[k] !== form[k])
  }, [editing, form])

  const formErrors = useMemo(() => {
    if (!form) return {} as Record<string, string>
    const e: Record<string, string> = {}
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Format email tidak valid'
    if (form.color && !/^#[0-9a-fA-F]{6}$/.test(form.color)) e.color = 'Gunakan kode hex #rrggbb'
    const sla = Number(form.slaHours)
    if (!Number.isFinite(sla) || sla < 1 || sla > 168) e.slaHours = 'SLA 1–168 jam'
    for (const k of ['invoicePrefix', 'quotationPrefix'] as const) {
      if (!/^[A-Z]{2,6}$/.test(form[k])) e[k] = '2–6 huruf kapital'
    }
    return e
  }, [form])

  const hasErrors = Object.keys(formErrors).length > 0

  const handleSave = async () => {
    if (!editing || !form || !dirty || hasErrors) return
    setSaving(true)
    try {
      const updated = await crmApi.updateBrand(editing.id, {
        logoSquare: form.logoSquare,
        logoWide: form.logoWide,
        tagline: form.tagline,
        description: form.description,
        website: form.website,
        email: form.email,
        phone: form.phone,
        instagram: form.instagram,
        address: form.address,
        color: form.color,
        slaHours: Number(form.slaHours),
        primaryCurrency: form.primaryCurrency,
        invoicePrefix: form.invoicePrefix,
        quotationPrefix: form.quotationPrefix,
        workflowType: form.workflowType,
        isActive: form.isActive,
      })
      setBrands(brands.map((b) => (b.id === updated.id ? updated : b)))
      toast({ title: 'Pengaturan brand tersimpan', description: `${updated.name} diperbarui — logo, kop dokumen, & identifikasi kanal ikut berubah.` })
      setEditing(null)
      setForm(null)
    } catch (e) {
      toast({ title: 'Gagal menyimpan pengaturan', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally { setSaving(false) }
  }

  const maxCount = Math.max(1, ...brands.map(b => opps.filter(o => o.executingBrandId === b.id && !['WON', 'LOST'].includes(o.stage)).length))

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <SectionHeader title="Struktur Multi-Brand" description="Satu database perusahaan — identitas, layanan, SLA, workflow, dan tim per brand" action={<RefreshButton onClick={load} loading={loading} />} />
      </div>

      <Card className="border-teal-100 bg-teal-50/60">
        <CardContent className="flex items-start gap-3 p-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
          <p className="text-xs leading-relaxed text-teal-900">
            <b>Architecture note:</b> keempat brand berbagi satu database company/contact. Menambah brand kelima cukup dengan konfigurasi baru (nama, warna, layanan, SLA, workflow, template) — tanpa mengubah source code maupun menduplikasi data klien.
            {canManage && <> Klik <b>Pengaturan</b> pada kartu brand untuk memperbarui logo (persegi 1:1 &amp; lebar), identitas kontak, warna, SLA, dan prefix dokumen.</>}
          </p>
        </CardContent>
      </Card>

      {loading ? <LoadingRows rows={4} /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {brands.map(b => {
            const brandOpps = opps.filter(o => o.executingBrandId === b.id)
            const open = brandOpps.filter(o => !['WON', 'LOST'].includes(o.stage))
            const openValue = open.reduce((a, o) => a + o.estimatedValue, 0)
            const wonValue = brandOpps.filter(o => o.stage === 'WON').reduce((a, o) => a + o.estimatedValue, 0)
            const team = users.filter(u => u.brandIds.includes(b.id))
            const byCategory = b.services.reduce<Record<string, string[]>>((acc, s) => {
              (acc[s.category] ??= []).push(s.name); return acc
            }, {})
            const contacts: { icon: React.ReactNode; text: string }[] = [
              ...(b.email ? [{ icon: <Mail className="h-3 w-3" />, text: b.email }] : []),
              ...(b.phone ? [{ icon: <Phone className="h-3 w-3" />, text: b.phone }] : []),
              ...(b.instagram ? [{ icon: <Instagram className="h-3 w-3" />, text: b.instagram }] : []),
              ...(b.address ? [{ icon: <MapPin className="h-3 w-3" />, text: b.address }] : []),
            ]

            return (
              <Card key={b.id} className="card-hover overflow-hidden rounded-xl hover:border-slate-300">
                <div className="h-1.5 w-full" style={{ backgroundColor: b.color }} />
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="flex items-center gap-2 text-base">
                        {b.logoSquare ? (
                          <img src={b.logoSquare} alt={`Logo ${b.name}`} className="h-8 w-8 shrink-0 rounded-lg object-contain" />
                        ) : (
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white shadow-sm" style={{ backgroundColor: b.color }}>
                            <Building2 className="h-4 w-4" />
                          </span>
                        )}
                        {b.name}
                      </CardTitle>
                      <p className="mt-1 text-xs text-slate-500">{b.tagline}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <a href={b.website ? (b.website.startsWith('http') ? b.website : `https://${b.website}`) : '#'} target="_blank" rel="noreferrer" className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium text-slate-400 transition-colors hover:bg-slate-100 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: b.color }} aria-hidden />
                        <Globe className="h-3.5 w-3.5" /> {b.website?.replace(/^https?:\/\//, '')}
                      </a>
                      {canManage && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEdit(b)}
                          className="h-8 gap-1.5 px-2.5 text-xs"
                          aria-label={`Pengaturan ${b.name}`}
                        >
                          <Settings2 className="h-3.5 w-3.5" /> Pengaturan
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="secondary" className="gap-1 border-0 bg-slate-100 text-[10px] text-slate-600"><Timer className="h-3 w-3" /> SLA {b.slaHours} jam</Badge>
                    <Badge variant="secondary" className="gap-1 border-0 bg-slate-100 text-[10px] tabular-nums text-slate-600">💰 {b.primaryCurrency}</Badge>
                    <Badge variant="secondary" className="gap-1 border-0 bg-slate-100 text-[10px] tabular-nums text-slate-600">Invoice: {b.invoicePrefix}-YYYY-####</Badge>
                    <Badge variant="secondary" className="gap-1 border-0 bg-slate-100 text-[10px] tabular-nums text-slate-600">Quotation: {b.quotationPrefix}-YYYY-####</Badge>
                    <Badge variant="secondary" className="gap-1 border-0 bg-slate-100 text-[10px] text-slate-600"><Workflow className="h-3 w-3" /> {WORKFLOW_LABELS[b.workflowType] ?? b.workflowType}</Badge>
                  </div>

                  {contacts.length > 0 && (
                    <div className="grid gap-x-4 gap-y-1.5 rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 sm:grid-cols-2">
                      {contacts.map((c, i) => (
                        <span key={i} className="flex min-w-0 items-center gap-1.5 text-[11px] text-slate-600">
                          <span className="shrink-0 text-slate-400">{c.icon}</span>
                          <span className="truncate" title={c.text}>{c.text}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  <div>
                    <div className="mb-1 flex items-center justify-between text-[11px]">
                      <span className="font-medium text-slate-600">Pipeline aktif · {open.length} opportunity</span>
                      <span className="font-bold tabular-nums text-slate-800">{formatMoney(openValue, 'IDR', true)}</span>
                    </div>
                    {/* Warna bar mengikuti brand via CSS var — indicator Progress memakai bg-[var(--brand-c)] */}
                    <Progress value={(open.length / maxCount) * 100} className="h-2 [&>div]:bg-[var(--brand-c)]" style={{ ['--brand-c' as string]: b.color }} />
                    <p className="mt-1 text-[11px] text-slate-500">Total Won: <span className="font-semibold tabular-nums text-emerald-700">{formatMoney(wonValue, 'IDR', true)}</span></p>
                  </div>

                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Layanan ({b.services.length})</p>
                    <div className="space-y-2">
                      {Object.entries(byCategory).map(([cat, list]) => (
                        <div key={cat}>
                          <p className="text-[11px] font-medium text-slate-500">{cat}</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {list.map(s => (
                              <span key={s} className="rounded-md px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: `${b.color}10`, color: b.color }}>{s}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400"><Users2 className="h-3 w-3" /> Tim ({team.length})</p>
                    <div className="flex flex-wrap gap-1.5">
                      {team.map(u => (
                        <span key={u.id} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-0.5 pl-0.5 pr-2 text-[11px] text-slate-600">
                          <UserAvatar name={u.name} color={u.avatarColor} size={18} /> {u.name}
                        </span>
                      ))}
                    </div>
                  </div>

                  <details className="rounded-lg bg-slate-50 p-2.5">
                    <summary className="flex min-h-[44px] cursor-pointer select-none items-center gap-1 rounded text-[11px] font-medium text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">Workflow produksi standar</summary>
                    <p className="mt-1.5 text-[11px] text-slate-500">{(WORKFLOW_MILESTONES[b.workflowType] ?? []).join(' → ')}</p>
                  </details>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ===== Dialog Pengaturan Brand (live preview kop dokumen) ===== */}
      <Dialog open={!!editing && !!form} onOpenChange={(v) => { if (!v) { setEditing(null); setForm(null) } }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {form?.logoSquare ? (
                <img src={form.logoSquare} alt={`Logo ${editing?.name}`} className="h-7 w-7 rounded-md object-contain" />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-md text-white" style={{ backgroundColor: editing?.color }}>
                  <Building2 className="h-3.5 w-3.5" />
                </span>
              )}
              Pengaturan · {editing?.name}
            </DialogTitle>
            <DialogDescription>
              Logo tampil di kartu brand &amp; kop dokumen (penawaran/invoice); kontak membantu identifikasi kanal masuk. Warna dipakai konsisten di seluruh aplikasi.
            </DialogDescription>
          </DialogHeader>

          {form && editing && (
            <div className="grid gap-5 md:grid-cols-[1fr_240px]">
              {/* Kolom form */}
              <div className="space-y-4">
                <div className="space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Logo</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {/* Logo persegi 1:1 — crop tengah otomatis saat diproses, tampil dalam kotak aspek 1:1 */}
                    <div className="rounded-lg border border-slate-200 p-3">
                      <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border border-dashed border-slate-200 bg-slate-50">
                        {form.logoSquare
                          ? <img src={form.logoSquare} alt={`Logo persegi ${editing.name}`} className="h-full w-full object-contain" />
                          : <ImagePlus className="h-6 w-6 text-slate-300" aria-hidden />}
                      </div>
                      <p className="mt-2 text-[11px] font-medium text-slate-700">Logo persegi (1:1)</p>
                      <p className="text-[10px] leading-snug text-slate-400">Avatar brand, ikon kartu, stempel dokumen. PNG/JPG/WebP/SVG, min. 64px.</p>
                      <div className="mt-2 flex gap-1.5">
                        <Button type="button" variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]" disabled={logoBusy !== null} onClick={() => fileSquareRef.current?.click()}>
                          {logoBusy === 'square' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />} Unggah
                        </Button>
                        {form.logoSquare && (
                          <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px] text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => set('logoSquare', '')}>
                            <Trash2 className="h-3 w-3" /> Hapus
                          </Button>
                        )}
                      </div>
                      <input ref={fileSquareRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" aria-label="Unggah logo persegi" onChange={(e) => void pickLogo('square', e.target.files?.[0])} />
                    </div>
                    {/* Logo lebar — rasio asli dipertahankan, tampil object-contain (tidak gepeng/tertarik) */}
                    <div className="rounded-lg border border-slate-200 p-3">
                      <div className="flex h-[104px] w-full items-center justify-center overflow-hidden rounded-md border border-dashed border-slate-200 bg-slate-50 p-2 sm:h-[128px]">
                        {form.logoWide
                          ? <img src={form.logoWide} alt={`Logo lebar ${editing.name}`} className="h-full w-full object-contain" />
                          : <ImagePlus className="h-6 w-6 text-slate-300" aria-hidden />}
                      </div>
                      <p className="mt-2 text-[11px] font-medium text-slate-700">Logo lebar (horizontal)</p>
                      <p className="text-[10px] leading-snug text-slate-400">Kop surat penawaran/invoice. Rasio asli dipertahankan — tampil proporsional.</p>
                      <div className="mt-2 flex gap-1.5">
                        <Button type="button" variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]" disabled={logoBusy !== null} onClick={() => fileWideRef.current?.click()}>
                          {logoBusy === 'wide' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />} Unggah
                        </Button>
                        {form.logoWide && (
                          <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px] text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => set('logoWide', '')}>
                            <Trash2 className="h-3 w-3" /> Hapus
                          </Button>
                        )}
                      </div>
                      <input ref={fileWideRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" aria-label="Unggah logo lebar" onChange={(e) => void pickLogo('wide', e.target.files?.[0])} />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Identitas</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="brand-tagline" className="text-xs">Tagline</Label>
                      <Input id="brand-tagline" value={form.tagline} onChange={(e) => set('tagline', e.target.value)} placeholder="mis. Video production house" className="h-9" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="brand-workflow" className="text-xs">Workflow produksi</Label>
                      <Select value={form.workflowType} onValueChange={(v) => set('workflowType', v)}>
                        <SelectTrigger id="brand-workflow" className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {WORKFLOWS.map((w) => <SelectItem key={w} value={w}>{WORKFLOW_LABELS[w]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="brand-desc" className="text-xs">Deskripsi</Label>
                    <Textarea id="brand-desc" value={form.description} onChange={(e) => set('description', e.target.value)} rows={2} placeholder="Deskripsi singkat brand untuk konteks tim" className="min-h-0 resize-none py-2" />
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Kontak & dokumen</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="brand-email" className="text-xs">Email</Label>
                      <Input id="brand-email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="hello@brand.co.id" className="h-9" aria-invalid={!!formErrors.email} />
                      {formErrors.email && <p className="text-[10px] text-rose-600">{formErrors.email}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="brand-phone" className="text-xs">Telepon / WA bisnis</Label>
                      <Input id="brand-phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+62 812 3456 7890" className="h-9" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="brand-ig" className="text-xs">Instagram</Label>
                      <Input id="brand-ig" value={form.instagram} onChange={(e) => set('instagram', e.target.value)} placeholder="@brand.official" className="h-9" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="brand-website" className="text-xs">Website</Label>
                      <Input id="brand-website" value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="www.brand.co.id" className="h-9" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="brand-address" className="text-xs">Alamat (untuk kop dokumen)</Label>
                    <Textarea id="brand-address" value={form.address} onChange={(e) => set('address', e.target.value)} rows={2} placeholder="Jl. … No. …, Kota" className="min-h-0 resize-none py-2" />
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Konfigurasi</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="brand-color" className="text-xs">Warna brand</Label>
                      <div className="flex items-center gap-2">
                        <input
                          id="brand-color"
                          type="color"
                          value={/^#[0-9a-fA-F]{6}$/.test(form.color) ? form.color : '#10b981'}
                          onChange={(e) => set('color', e.target.value)}
                          className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-slate-200 bg-white p-0.5"
                          aria-label="Pilih warna brand"
                        />
                        <Input value={form.color} onChange={(e) => set('color', e.target.value)} className="h-9 font-mono text-xs" aria-invalid={!!formErrors.color} />
                      </div>
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {COLOR_PRESETS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => set('color', c)}
                            aria-label={`Warna ${c}`}
                            className={cn('h-5 w-5 rounded-full border transition-transform hover:scale-110', form.color === c ? 'border-slate-900 ring-2 ring-slate-900/20' : 'border-slate-200')}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                      {formErrors.color && <p className="text-[10px] text-rose-600">{formErrors.color}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="brand-sla" className="text-xs">SLA balas pertama (jam)</Label>
                      <Input id="brand-sla" type="number" min={1} max={168} value={form.slaHours} onChange={(e) => set('slaHours', e.target.value)} className="h-9 tabular-nums" aria-invalid={!!formErrors.slaHours} />
                      {formErrors.slaHours && <p className="text-[10px] text-rose-600">{formErrors.slaHours}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Mata uang utama</Label>
                      <Select value={form.primaryCurrency} onValueChange={(v) => set('primaryCurrency', v)}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="brand-inv" className="text-xs">Prefix invoice</Label>
                        <Input id="brand-inv" value={form.invoicePrefix} onChange={(e) => set('invoicePrefix', e.target.value.toUpperCase())} className="h-9 font-mono uppercase" aria-invalid={!!formErrors.invoicePrefix} />
                        {formErrors.invoicePrefix && <p className="text-[10px] text-rose-600">{formErrors.invoicePrefix}</p>}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="brand-quo" className="text-xs">Prefix quotation</Label>
                        <Input id="brand-quo" value={form.quotationPrefix} onChange={(e) => set('quotationPrefix', e.target.value.toUpperCase())} className="h-9 font-mono uppercase" aria-invalid={!!formErrors.quotationPrefix} />
                        {formErrors.quotationPrefix && <p className="text-[10px] text-rose-600">{formErrors.quotationPrefix}</p>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5">
                    <div>
                      <Label htmlFor="brand-active" className="text-xs font-medium">Brand aktif</Label>
                      <p className="text-[10px] text-slate-500">Nonaktif = tidak muncul sebagai pilihan brand untuk lead baru</p>
                    </div>
                    <Switch id="brand-active" checked={form.isActive} onCheckedChange={(v) => set('isActive', v)} />
                  </div>
                </div>
              </div>

              {/* Kolom preview — kop dokumen live mengikuti form */}
              <div className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Pratinjau kop</p>
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="h-1 w-full" style={{ backgroundColor: form.color }} />
                  <div className="p-3">
                    {form.logoWide ? (
                      /* Logo lebar → dipakai di kop sesuai proporsi aslinya (object-contain, rata kiri) */
                      <img src={form.logoWide} alt="Logo lebar pada kop dokumen" className="h-10 w-auto max-w-full object-contain object-left" />
                    ) : (
                      <div className="flex items-center gap-2">
                        {form.logoSquare
                          ? <img src={form.logoSquare} alt="Logo pada kop dokumen" className="h-6 w-6 rounded object-contain" />
                          : <span className="flex h-6 w-6 items-center justify-center rounded text-white" style={{ backgroundColor: form.color }}><Building2 className="h-3 w-3" /></span>}
                        <p className="text-xs font-bold text-slate-900">{editing.name}</p>
                      </div>
                    )}
                    {form.tagline && <p className="mt-0.5 text-[9px] italic text-slate-500">{form.tagline}</p>}
                    <div className="mt-1.5 space-y-px border-t pt-1.5 text-[8.5px] leading-relaxed text-slate-500" style={{ borderColor: `${form.color}55` }}>
                      {[form.address, form.phone, form.email, form.instagram, form.website].filter(Boolean).map((line, i) => (
                        <p key={i} className="truncate">{line}</p>
                      ))}
                    </div>
                    <div className="mt-2 space-y-1">
                      <div className="h-1.5 w-3/4 rounded bg-slate-200" />
                      <div className="h-1.5 w-1/2 rounded bg-slate-100" />
                    </div>
                    <div className="mt-3 flex items-center justify-between rounded-md px-1.5 py-1 text-[8px] font-semibold text-white" style={{ backgroundColor: form.color }}>
                      <span>{form.invoicePrefix}-2025-0001</span>
                      <span>{form.primaryCurrency}</span>
                    </div>
                  </div>
                </div>
                <p className="text-[10px] leading-relaxed text-slate-400">
                  Pratinjau menunjukkan bagaimana identitas brand tampil di kepala dokumen penawaran/invoice.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setEditing(null); setForm(null) }} disabled={saving}>Batal</Button>
            <Button onClick={() => void handleSave()} disabled={!dirty || hasErrors || saving} className="gap-1.5 bg-teal-700 text-white hover:bg-teal-800">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Simpan Perubahan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
