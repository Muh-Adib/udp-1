/* ============ Brief & Estimation Tab — mounted as 5th tab in Opportunity Detail drawer ============ */
'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { estimationApi, financeApi } from '@/components/crm/api-client'
import { useCrmStore } from '@/components/crm/crm-store'
import { EmptyState, SectionHeader } from '@/components/crm/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { formatDate, formatMoney } from '@/lib/crm-constants'
import type {
  BriefDTO, EstimationCategory, EstimationDTO, EstimationSaveInput, OpportunityDetailDTO,
} from '@/lib/crm-types'
import { cn } from '@/lib/utils'
import {
  BadgeCheck, Calculator, ClipboardList, FileText, Loader2, Plus, Save, Trash2, TrendingUp, Undo2,
} from 'lucide-react'

/* ================= Constants & pure helpers ================= */

const SCROLLBAR = '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300'

const CATEGORIES: { key: EstimationCategory; label: string }[] = [
  { key: 'INTERNAL', label: 'Tenaga Internal' },
  { key: 'FREELANCE', label: 'Freelancer' },
  { key: 'EQUIPMENT', label: 'Peralatan / Sewa' },
  { key: 'TRANSPORT', label: 'Transportasi' },
  { key: 'ACCOMMODATION', label: 'Akomodasi' },
  { key: 'TALENT', label: 'Talent' },
  { key: 'LOCATION', label: 'Lokasi' },
  { key: 'SOFTWARE', label: 'Software / Lisensi' },
  { key: 'HOSTING', label: 'Hosting / Server' },
  { key: 'OTHER', label: 'Lainnya' },
]

/** Kategori yang lazim memakai durasi hari — kolom tetap selalu bisa diedit. */
const DAYS_RELEVANT = new Set<EstimationCategory>(['INTERNAL', 'EQUIPMENT', 'TALENT'])

const REF_META: Record<EstimationDTO['referenceSource'], { label: string; cls: string }> = {
  QUOTATION: { label: 'Dari Penawaran', cls: 'bg-amber-50 text-amber-700' },
  OPPORTUNITY: { label: 'Dari Nilai Opportunity', cls: 'bg-slate-100 text-slate-600' },
  NONE: { label: 'Tidak ada referensi', cls: 'bg-slate-100 text-slate-400' },
}

const TONE = {
  emerald: { card: 'border-emerald-200 bg-emerald-50/60', text: 'text-emerald-700', bar: '[&>div]:bg-emerald-500' },
  amber: { card: 'border-amber-200 bg-amber-50/60', text: 'text-amber-700', bar: '[&>div]:bg-amber-500' },
  rose: { card: 'border-rose-200 bg-rose-50/60', text: 'text-rose-700', bar: '[&>div]:bg-rose-500' },
  slate: { card: 'border-slate-200 bg-white', text: 'text-slate-900', bar: '[&>div]:bg-slate-500' },
} as const
type ToneKey = keyof typeof TONE

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Terjadi kesalahan')

const toNum = (v: string) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Persen rapi: integer tanpa desimal, selain itu 1 desimal. */
const fmtPct = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

const clampPct = (n: number) => Math.min(100, Math.max(0, n))

/** Uang bertanda untuk selisih (positif dapat prefix +, negatif dari formatMoney). */
const signedMoney = (n: number, currency: string) => `${n > 0 ? '+' : ''}${formatMoney(n, currency)}`

/* ---------- Brief form ---------- */

interface BriefFormState {
  serviceScope: string; objectives: string; targetAudience: string; keyMessages: string
  deliverables: string; timeline: string; references: string; budgetRange: string; constraints: string
}

const EMPTY_BRIEF: BriefFormState = {
  serviceScope: '', objectives: '', targetAudience: '', keyMessages: '',
  deliverables: '', timeline: '', references: '', budgetRange: '', constraints: '',
}

const fromBrief = (b: BriefDTO | null): BriefFormState => ({
  serviceScope: b?.serviceScope ?? '',
  objectives: b?.objectives ?? '',
  targetAudience: b?.targetAudience ?? '',
  keyMessages: b?.keyMessages ?? '',
  deliverables: b?.deliverables ?? '',
  timeline: b?.timeline ?? '',
  references: b?.references ?? '',
  budgetRange: b?.budgetRange ?? '',
  constraints: b?.constraints ?? '',
})

/* ---------- Estimation editor ---------- */

interface EditorItem {
  category: EstimationCategory
  description: string
  qty: string
  unit: string
  unitCost: string
  days: string
}

const emptyItem = (): EditorItem => ({ category: 'INTERNAL', description: '', qty: '1', unit: '', unitCost: '', days: '' })

const editorFromEstimation = (e: EstimationDTO): EditorItem[] =>
  (e.items.length > 0
    ? e.items.map((it) => ({
        category: it.category,
        description: it.description,
        qty: String(it.qty ?? 0),
        unit: it.unit ?? '',
        unitCost: String(it.unitCost ?? 0),
        days: it.days ? String(it.days) : '',
      }))
    : [emptyItem(), emptyItem(), emptyItem()])

/** Subtotal per baris = qty × harga satuan × durasi (bila durasi > 0). */
const lineTotalOf = (it: EditorItem): number => {
  const days = toNum(it.days)
  return Math.round(toNum(it.qty) * toNum(it.unitCost) * (days > 0 ? days : 1))
}

/** Kalkulasi live di klien — total final tetap dihitung ulang oleh server saat disimpan. */
function computeLive(items: EditorItem[], pct: { contingency: string; management: string; target: string; tax: string }) {
  const internal = items.filter((it) => it.category === 'INTERNAL').reduce((s, it) => s + lineTotalOf(it), 0)
  const external = items.filter((it) => it.category !== 'INTERNAL').reduce((s, it) => s + lineTotalOf(it), 0)
  const subtotal = internal + external
  const contingency = Math.round((subtotal * toNum(pct.contingency)) / 100)
  const managementFee = Math.round((subtotal * toNum(pct.management)) / 100)
  const totalCost = subtotal + contingency + managementFee
  const target = Math.max(0, toNum(pct.target))
  const sellingPrice = target >= 100 ? totalCost : Math.round(totalCost / (1 - target / 100))
  const tax = Math.round((sellingPrice * toNum(pct.tax)) / 100)
  const withTax = sellingPrice + tax
  return { internal, external, subtotal, contingency, managementFee, totalCost, sellingPrice, tax, withTax }
}

/* ================= Local atoms ================= */

function BriefStatusBadge({ status }: { status: 'DRAFT' | 'FINAL' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium',
        status === 'FINAL' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600',
      )}
    >
      {status === 'FINAL' ? 'Final' : 'Draft'}
    </span>
  )
}

function EstStatusBadge({ status }: { status: 'DRAFT' | 'FINAL' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium',
        status === 'FINAL' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600',
      )}
    >
      {status === 'FINAL' ? 'Final' : 'Draft'}
    </span>
  )
}

function BriefField({ id, label, value, onChange, textarea, full, placeholder }: {
  id: string; label: string; value: string; onChange: (v: string) => void
  textarea?: boolean; full?: boolean; placeholder?: string
}) {
  return (
    <div className={cn('space-y-1.5', (textarea || full) && 'sm:col-span-2')}>
      <Label htmlFor={id} className="text-xs font-medium text-slate-600">{label}</Label>
      {textarea ? (
        <Textarea
          id={id} value={value} rows={3} placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[72px] resize-y bg-white text-sm"
        />
      ) : (
        <Input
          id={id} value={value} placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="bg-white text-sm"
        />
      )}
    </div>
  )
}

function PctField({ id, label, value, onChange }: {
  id: string; label: string; value: string; onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-slate-600">{label}</Label>
      <div className="relative">
        <Input
          id={id} type="number" min={0} step="any" inputMode="decimal"
          value={value} onChange={(e) => onChange(e.target.value)}
          className="h-9 bg-white pr-7 text-sm"
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">%</span>
      </div>
    </div>
  )
}

function TotalRow({ label, value, strong, className }: {
  label: React.ReactNode; value: string; strong?: boolean; className?: string
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3', strong ? 'text-sm' : 'text-xs', className)}>
      <span className={cn(strong ? 'font-semibold text-slate-900' : 'text-slate-500')}>{label}</span>
      <span className={cn(strong ? 'font-bold text-slate-900' : 'font-medium text-slate-700')}>{value}</span>
    </div>
  )
}

function KpiMini({ label, value, sub, tone }: { label: string; value: string; sub?: React.ReactNode; tone: ToneKey }) {
  return (
    <Card className={cn('gap-0 rounded-xl border p-4', TONE[tone].card)}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={cn('mt-1 text-lg font-bold', TONE[tone].text)}>{value}</p>
      {sub && <p className="mt-1 text-[11px] leading-snug text-slate-500">{sub}</p>}
    </Card>
  )
}

/* ---------- Skeletons ---------- */

function BriefSkeleton() {
  return (
    <Card className="gap-0 rounded-xl border-slate-200 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-6 w-16" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-8 w-28" />
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className={i % 4 === 1 ? 'h-[76px]' : 'h-9'} />
          </div>
        ))}
      </div>
    </Card>
  )
}

function EstSkeleton() {
  return (
    <div className="space-y-4">
      <Card className="gap-0 rounded-xl border-slate-200 p-4 sm:p-5">
        <Skeleton className="h-5 w-44" />
        <div className="mt-3 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  )
}

function MarginSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-28 rounded-xl" />
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <Skeleton className="h-24 rounded-xl" />
      <Skeleton className="h-44 rounded-xl" />
    </div>
  )
}

/* ================= Main component ================= */

export function BriefEstimationTab({ opportunity, onChanged }: { opportunity: OpportunityDetailDTO; onChanged?: () => void }) {
  const { toast } = useToast()
  const setView = useCrmStore((s) => s.setView)
  const currency = opportunity.currency

  /* ---------- Data ---------- */
  const [loading, setLoading] = useState(true)
  const [brief, setBrief] = useState<BriefDTO | null>(null)
  const [estimation, setEstimation] = useState<EstimationDTO | null>(null)

  /* ---------- Brief local state ---------- */
  const [briefForm, setBriefForm] = useState<BriefFormState>(EMPTY_BRIEF)
  const [briefStatus, setBriefStatus] = useState<'DRAFT' | 'FINAL'>('DRAFT')
  const [briefBusy, setBriefBusy] = useState(false)

  /* ---------- Estimation local state ---------- */
  const [items, setItems] = useState<EditorItem[]>(() => [emptyItem(), emptyItem(), emptyItem()])
  const [contingencyPct, setContingencyPct] = useState('5')
  const [managementFeePct, setManagementFeePct] = useState('10')
  const [targetMarginPct, setTargetMarginPct] = useState('20')
  const [taxPct, setTaxPct] = useState('11')
  const [estNotes, setEstNotes] = useState('')
  const [estBusy, setEstBusy] = useState(false)
  const [quoteBusy, setQuoteBusy] = useState(false)

  /* ---------- Load on mount ---------- */
  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([estimationApi.brief(opportunity.id), estimationApi.estimation(opportunity.id)])
      .then(([b, e]) => {
        if (!alive) return
        setBrief(b)
        if (b) {
          setBriefForm(fromBrief(b))
          setBriefStatus(b.status)
        }
        setEstimation(e)
        if (e) {
          setItems(editorFromEstimation(e))
          setContingencyPct(String(e.contingencyPct ?? 0))
          setManagementFeePct(String(e.managementFeePct ?? 0))
          setTargetMarginPct(String(e.targetMarginPct ?? 0))
          setTaxPct(String(e.taxPct ?? 0))
          setEstNotes(e.notes ?? '')
        }
      })
      .catch((err) => {
        if (alive) toast({ variant: 'destructive', title: 'Gagal memuat brief & estimasi', description: errMsg(err) })
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => { alive = false }
  }, [opportunity.id, toast])

  /* ---------- Brief actions ---------- */
  const saveBrief = async (nextStatus: 'DRAFT' | 'FINAL') => {
    setBriefBusy(true)
    try {
      const saved = await estimationApi.saveBrief(opportunity.id, { ...briefForm, status: nextStatus })
      setBrief(saved)
      setBriefStatus(saved.status)
      toast({
        title: 'Brief tersimpan',
        description: nextStatus === 'FINAL' ? 'Brief ditandai sebagai final.' : 'Perubahan brief berhasil disimpan.',
      })
      onChanged?.()
    } catch (err) {
      toast({ variant: 'destructive', title: 'Gagal menyimpan brief', description: errMsg(err) })
    } finally {
      setBriefBusy(false)
    }
  }

  /* ---------- Estimation editor helpers ---------- */
  const updateItem = (idx: number, patch: Partial<EditorItem>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))

  const addRow = () => setItems((prev) => [...prev, emptyItem()])

  const removeRow = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx))

  const saveEstimation = async () => {
    const valid = items.filter((it) => it.description.trim().length > 0)
    if (valid.length === 0) {
      toast({
        title: 'Lengkapi estimasi terlebih dahulu',
        description: 'Minimal satu baris biaya dengan deskripsi terisi.',
      })
      return
    }
    setEstBusy(true)
    try {
      const payload: EstimationSaveInput = {
        currency,
        status: estimation?.status ?? 'DRAFT',
        items: valid.map((it) => ({
          category: it.category,
          description: it.description.trim(),
          qty: toNum(it.qty),
          unit: it.unit.trim(),
          unitCost: toNum(it.unitCost),
          days: toNum(it.days) > 0 ? toNum(it.days) : null,
        })),
        contingencyPct: toNum(contingencyPct),
        managementFeePct: toNum(managementFeePct),
        taxPct: toNum(taxPct),
        targetMarginPct: toNum(targetMarginPct),
        notes: estNotes.trim() ? estNotes.trim() : null,
      }
      const saved = await estimationApi.saveEstimation(opportunity.id, payload)
      setEstimation(saved)
      setItems(editorFromEstimation(saved))
      setContingencyPct(String(saved.contingencyPct ?? 0))
      setManagementFeePct(String(saved.managementFeePct ?? 0))
      setTargetMarginPct(String(saved.targetMarginPct ?? 0))
      setTaxPct(String(saved.taxPct ?? 0))
      setEstNotes(saved.notes ?? '')
      toast({
        title: `Estimasi tersimpan — margin aktual ${fmtPct(saved.actualMarginPct)}%`,
        description: 'Total final dihitung ulang oleh server.',
      })
      onChanged?.()
    } catch (err) {
      toast({ variant: 'destructive', title: 'Gagal menyimpan estimasi', description: errMsg(err) })
    } finally {
      setEstBusy(false)
    }
  }

  /* ---------- Buat Penawaran dari Estimasi (estimation → quotation bridge) ----------
     Item penawaran berisi deskripsi client-safe (tanpa bocoran biaya internal);
     harga = sellingPrice estimasi, PPN mengikuti estimasi. */
  const createQuotationFromEstimation = async () => {
    if (!estimation || estimation.sellingPrice <= 0) return
    setQuoteBusy(true)
    try {
      const scopeLabel = opportunity.serviceName || opportunity.title
      const q = await financeApi.createQuotation({
        opportunityId: opportunity.id,
        title: opportunity.title,
        items: [{ description: `${scopeLabel} — paket lengkap sesuai lingkup & lampiran teknis`, qty: 1, unitPrice: Math.round(estimation.sellingPrice) }],
        taxPct: estimation.taxPct,
        notes: 'Harga mengacu pada estimasi biaya internal yang disepakati tim; rincian teknis terlampir pada dokumen penawaran.',
      })
      toast({
        title: `Penawaran ${q.code} dibuat dari estimasi`,
        description: `Draft penawaran ${formatMoney(q.total, q.currency)} siap dikirim — buka modul Quotations untuk mereview & mengirim.`,
      })
      onChanged?.()
      setView('quotations')
    } catch (err) {
      toast({ variant: 'destructive', title: 'Gagal membuat penawaran dari estimasi', description: errMsg(err) })
    } finally {
      setQuoteBusy(false)
    }
  }

  /* ---------- Live totals ---------- */
  const live = useMemo(
    () => computeLive(items, { contingency: contingencyPct, management: managementFeePct, target: targetMarginPct, tax: taxPct }),
    [items, contingencyPct, managementFeePct, targetMarginPct, taxPct],
  )
  const targetGuarded = Math.max(0, toNum(targetMarginPct)) >= 100

  /* ---------- Margin analysis derivations (Tab 3) ---------- */
  const refNone = estimation?.referenceSource === 'NONE'
  const marginTone: ToneKey = !estimation || refNone
    ? 'slate'
    : estimation.actualMarginPct >= estimation.targetMarginPct
      ? 'emerald'
      : estimation.actualMarginPct >= estimation.targetMarginPct - 15
        ? 'amber'
        : 'rose'
  const gapTone: ToneKey = !estimation || refNone
    ? 'slate'
    : estimation.priceGap > 0
      ? 'emerald'
      : estimation.priceGap < 0
        ? 'rose'
        : 'slate'
  const gapSub = !estimation || refNone
    ? 'Butuh nilai referensi (penawaran terkirim atau nilai opportunity).'
    : estimation.priceGap > 0
      ? 'Harga jual target di atas nilai referensi — tinjau kembali daya saing harga.'
      : estimation.priceGap < 0
        ? 'Harga jual di bawah nilai referensi.'
        : 'Sama dengan nilai referensi.'
  const refCaption = !estimation
    ? ''
    : estimation.referenceSource === 'QUOTATION'
      ? 'Mengacu pada total penawaran terakhir dengan status Terkirim / Disetujui.'
      : estimation.referenceSource === 'OPPORTUNITY'
        ? `Mengacu pada estimasi nilai opportunity ${opportunity.code}.`
        : 'Belum ada penawaran terkirim dan nilai opportunity masih nol.'

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Brief & Estimasi Biaya"
        description={`${opportunity.code} · ${opportunity.title}`}
      />

      <Tabs defaultValue="brief" className="flex flex-col">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="brief" className="gap-1.5"><ClipboardList className="h-3.5 w-3.5" /> Brief</TabsTrigger>
          <TabsTrigger value="estimasi" className="gap-1.5"><Calculator className="h-3.5 w-3.5" /> Estimasi Biaya</TabsTrigger>
          <TabsTrigger value="margin" className="gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> Analisis Margin</TabsTrigger>
        </TabsList>

        {/* ================= Tab 1 — Brief ================= */}
        <TabsContent value="brief" className="space-y-4 pt-4">
          {loading ? (
            <BriefSkeleton />
          ) : (
            <Card className="gap-0 rounded-xl border-slate-200 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <BriefStatusBadge status={briefStatus} />
                  {brief?.updatedAt && (
                    <span className="truncate text-xs text-slate-400">
                      Diperbarui {formatDate(brief.updatedAt, true)}{brief.preparedByName ? ` oleh ${brief.preparedByName}` : ''}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline" size="sm" disabled={briefBusy}
                    onClick={() => void saveBrief(briefStatus === 'DRAFT' ? 'FINAL' : 'DRAFT')}
                    className="gap-1.5"
                  >
                    {briefStatus === 'DRAFT'
                      ? <BadgeCheck className="h-3.5 w-3.5" />
                      : <Undo2 className="h-3.5 w-3.5" />}
                    {briefStatus === 'DRAFT' ? 'Tandai Final' : 'Kembalikan ke Draft'}
                  </Button>
                  <Button
                    size="sm" disabled={briefBusy}
                    onClick={() => void saveBrief(briefStatus)}
                    className="gap-1.5 bg-slate-900 text-white hover:bg-slate-800"
                  >
                    {briefBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Simpan Brief
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <BriefField
                  id="brief-scope" label="Lingkup Layanan" full
                  value={briefForm.serviceScope}
                  onChange={(v) => setBriefForm((f) => ({ ...f, serviceScope: v }))}
                  placeholder="cth: Produksi video profil perusahaan end-to-end"
                />
                <BriefField
                  id="brief-objectives" label="Tujuan & Sasaran" textarea
                  value={briefForm.objectives}
                  onChange={(v) => setBriefForm((f) => ({ ...f, objectives: v }))}
                  placeholder="Apa yang ingin dicapai klien dari proyek ini?"
                />
                <BriefField
                  id="brief-audience" label="Target Audiens"
                  value={briefForm.targetAudience}
                  onChange={(v) => setBriefForm((f) => ({ ...f, targetAudience: v }))}
                  placeholder="cth: HRD & manajemen perusahaan B2B"
                />
                <BriefField
                  id="brief-messages" label="Pesan Kunci" textarea
                  value={briefForm.keyMessages}
                  onChange={(v) => setBriefForm((f) => ({ ...f, keyMessages: v }))}
                  placeholder="Poin pesan utama yang harus tersampaikan"
                />
                <BriefField
                  id="brief-deliverables" label="Deliverables" textarea
                  value={briefForm.deliverables}
                  onChange={(v) => setBriefForm((f) => ({ ...f, deliverables: v }))}
                  placeholder="cth: 1 video utama (3 mnt), 3 reels, poster digital"
                />
                <BriefField
                  id="brief-timeline" label="Timeline / Durasi"
                  value={briefForm.timeline}
                  onChange={(v) => setBriefForm((f) => ({ ...f, timeline: v }))}
                  placeholder="cth: 6-8 minggu"
                />
                <BriefField
                  id="brief-references" label="Referensi Gaya"
                  value={briefForm.references}
                  onChange={(v) => setBriefForm((f) => ({ ...f, references: v }))}
                  placeholder="cth: gaya clean corporate, tautan moodboard"
                />
                <BriefField
                  id="brief-budget" label="Rentang Budget"
                  value={briefForm.budgetRange}
                  onChange={(v) => setBriefForm((f) => ({ ...f, budgetRange: v }))}
                  placeholder={`cth: ${formatMoney(150000000, currency, true)} - ${formatMoney(250000000, currency, true)}`}
                />
                <BriefField
                  id="brief-constraints" label="Kendala / Catatan" textarea
                  value={briefForm.constraints}
                  onChange={(v) => setBriefForm((f) => ({ ...f, constraints: v }))}
                  placeholder="Kendala teknis, kebijakan klien, atau catatan lain"
                />
              </div>
            </Card>
          )}
        </TabsContent>

        {/* ================= Tab 2 — Estimasi Biaya ================= */}
        <TabsContent value="estimasi" className="space-y-4 pt-4">
          {loading ? (
            <EstSkeleton />
          ) : (
            <>
              <Card className="gap-0 rounded-xl border-slate-200 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900">Item Biaya</h3>
                    <p className="text-xs text-slate-500">Subtotal per baris = qty × harga satuan × durasi (bila diisi).</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {estimation && <EstStatusBadge status={estimation.status} />}
                    <Badge variant="outline" className="font-mono text-[10px] text-slate-500">{currency}</Badge>
                  </div>
                </div>

                <div className={cn('mt-3 overflow-x-auto rounded-lg border border-slate-100', SCROLLBAR)}>
                  <Table className="min-w-[760px]">
                    <TableHeader>
                      <TableRow className="bg-slate-50 hover:bg-slate-50">
                        <TableHead className="h-9 text-xs">Kategori</TableHead>
                        <TableHead className="h-9 min-w-[180px] text-xs">Deskripsi</TableHead>
                        <TableHead className="h-9 text-xs">Qty</TableHead>
                        <TableHead className="h-9 text-xs">Satuan</TableHead>
                        <TableHead className="h-9 text-xs">Harga Satuan</TableHead>
                        <TableHead className="h-9 text-xs">Durasi (hari)</TableHead>
                        <TableHead className="h-9 text-right text-xs">Subtotal</TableHead>
                        <TableHead className="h-9 w-10"><span className="sr-only">Aksi</span></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((it, idx) => (
                        <TableRow key={idx} className="hover:bg-slate-50/50">
                          <TableCell className="p-1.5">
                            <Select
                              value={it.category}
                              onValueChange={(v) => updateItem(idx, { category: v as EstimationCategory })}
                            >
                              <SelectTrigger className="h-8 w-[150px] bg-white text-xs" aria-label={`Kategori baris ${idx + 1}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {CATEGORIES.map((c) => (
                                  <SelectItem key={c.key} value={c.key} className="text-xs">{c.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="p-1.5">
                            <Input
                              value={it.description}
                              onChange={(e) => updateItem(idx, { description: e.target.value })}
                              placeholder="Deskripsi biaya…"
                              aria-label={`Deskripsi baris ${idx + 1}`}
                              className="h-8 min-w-[160px] bg-white text-xs"
                            />
                          </TableCell>
                          <TableCell className="p-1.5">
                            <Input
                              type="number" min={0} step="any" inputMode="decimal"
                              value={it.qty}
                              onChange={(e) => updateItem(idx, { qty: e.target.value })}
                              aria-label={`Qty baris ${idx + 1}`}
                              className="h-8 w-16 bg-white text-xs"
                            />
                          </TableCell>
                          <TableCell className="p-1.5">
                            <Input
                              value={it.unit}
                              onChange={(e) => updateItem(idx, { unit: e.target.value })}
                              placeholder="hari/orang/unit"
                              aria-label={`Satuan baris ${idx + 1}`}
                              className="h-8 w-[110px] bg-white text-xs"
                            />
                          </TableCell>
                          <TableCell className="p-1.5">
                            <Input
                              type="number" min={0} step="any" inputMode="decimal"
                              value={it.unitCost}
                              onChange={(e) => updateItem(idx, { unitCost: e.target.value })}
                              aria-label={`Harga satuan baris ${idx + 1}`}
                              className="h-8 w-28 bg-white text-xs"
                            />
                          </TableCell>
                          <TableCell className="p-1.5">
                            <Input
                              type="number" min={0} step="any" inputMode="decimal"
                              value={it.days}
                              onChange={(e) => updateItem(idx, { days: e.target.value })}
                              placeholder="—"
                              aria-label={`Durasi hari baris ${idx + 1}`}
                              className={cn('h-8 w-16 bg-white text-xs', !DAYS_RELEVANT.has(it.category) && 'opacity-60')}
                            />
                          </TableCell>
                          <TableCell className="whitespace-nowrap p-1.5 text-right text-xs font-semibold text-slate-700">
                            {formatMoney(lineTotalOf(it), currency)}
                          </TableCell>
                          <TableCell className="p-1.5 text-right">
                            <Button
                              type="button" variant="ghost" size="icon"
                              onClick={() => removeRow(idx)}
                              className="h-8 w-8 text-slate-400 hover:text-rose-600"
                              title="Hapus baris"
                              aria-label={`Hapus baris ${idx + 1}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {items.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} className="py-6 text-center text-xs text-slate-400">
                            Belum ada baris — klik Tambah Baris untuk memulai.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div className="mt-3 flex justify-end">
                  <Button type="button" variant="outline" size="sm" onClick={addRow} className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> Tambah Baris
                  </Button>
                </div>
              </Card>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                <Card className="gap-0 rounded-xl border-slate-200 p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">Parameter Estimasi</h3>
                    <span className="text-xs text-slate-400">Mata uang: <span className="font-mono font-semibold text-slate-600">{currency}</span></span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <PctField
                      id="est-contingency" label="Kontingensi" value={contingencyPct}
                      onChange={setContingencyPct}
                    />
                    <PctField
                      id="est-management" label="Management Fee" value={managementFeePct}
                      onChange={setManagementFeePct}
                    />
                    <PctField
                      id="est-target" label="Target Margin" value={targetMarginPct}
                      onChange={setTargetMarginPct}
                    />
                    <PctField
                      id="est-tax" label="PPN" value={taxPct}
                      onChange={setTaxPct}
                    />
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <Label htmlFor="est-notes" className="text-xs font-medium text-slate-600">Catatan Estimasi</Label>
                    <Textarea
                      id="est-notes" rows={3} value={estNotes}
                      onChange={(e) => setEstNotes(e.target.value)}
                      placeholder="Asumsi, risiko, atau pengecualian yang menyertai estimasi ini…"
                      className="resize-y bg-white text-sm"
                    />
                  </div>
                </Card>

                <Card className="gap-0 rounded-xl border-slate-200 p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">Ringkasan Total</h3>
                    <Badge variant="outline" className="font-mono text-[10px] text-slate-500">{currency}</Badge>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <TotalRow label="Biaya Internal" value={formatMoney(live.internal, currency)} />
                    <TotalRow label="Biaya Eksternal" value={formatMoney(live.external, currency)} />
                    <Separator className="bg-slate-100" />
                    <TotalRow label="Subtotal Biaya" value={formatMoney(live.subtotal, currency)} />
                    <TotalRow label={`Kontingensi (${fmtPct(toNum(contingencyPct))}%)`} value={formatMoney(live.contingency, currency)} />
                    <TotalRow label={`Management Fee (${fmtPct(toNum(managementFeePct))}%)`} value={formatMoney(live.managementFee, currency)} />
                    <Separator className="bg-slate-100" />
                    <TotalRow label="Total Biaya" value={formatMoney(live.totalCost, currency)} strong />
                    <TotalRow label="Harga Jual Target" value={formatMoney(live.sellingPrice, currency)} />
                    {targetGuarded && (
                      <p className="text-[10px] leading-snug text-amber-600">
                        Target margin ≥ 100% — harga jual diset sama dengan total biaya.
                      </p>
                    )}
                    <TotalRow label={`PPN (${fmtPct(toNum(taxPct))}%)`} value={formatMoney(live.tax, currency)} />
                    <Separator className="bg-slate-100" />
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-semibold text-slate-900">Harga Jual + PPN</span>
                      <span className="font-bold text-emerald-700">{formatMoney(live.withTax, currency)}</span>
                    </div>
                  </div>
                  <p className="mt-2 text-[10px] text-slate-400">
                    Total final dihitung ulang oleh server saat disimpan.
                  </p>
                  <Button
                    disabled={estBusy}
                    onClick={() => void saveEstimation()}
                    className="mt-3 w-full gap-1.5 bg-slate-900 text-white hover:bg-slate-800"
                  >
                    {estBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Simpan Estimasi
                  </Button>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        {/* ================= Tab 3 — Analisis Margin ================= */}
        <TabsContent value="margin" className="space-y-4 pt-4">
          {loading ? (
            <MarginSkeleton />
          ) : !estimation ? (
            <EmptyState
              icon={<Calculator className="h-5 w-5" />}
              title="Belum ada estimasi tersimpan"
              description="Buka tab Estimasi Biaya untuk membuatnya."
            />
          ) : (
            <>
              <Card className="gap-0 rounded-xl border-slate-200 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">Nilai Referensi</h3>
                  <span className={cn('inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium', REF_META[estimation.referenceSource].cls)}>
                    {REF_META[estimation.referenceSource].label}
                  </span>
                </div>
                <p className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">
                  {formatMoney(estimation.referenceValue, currency)}
                </p>
                <p className="mt-1 text-xs text-slate-500">{refCaption}</p>
              </Card>

              <div className="grid gap-3 sm:grid-cols-3">
                <KpiMini
                  label="Total Biaya"
                  value={formatMoney(estimation.totalCost, currency)}
                  sub="HPP termasuk kontingensi & management fee"
                  tone="slate"
                />
                <KpiMini
                  label="Margin Aktual"
                  value={refNone ? '—' : formatMoney(estimation.actualMarginAmount, currency)}
                  sub={refNone
                    ? 'Belum ada nilai referensi untuk membandingkan margin.'
                    : `${fmtPct(estimation.actualMarginPct)}% dari nilai referensi · target ${fmtPct(estimation.targetMarginPct)}%`}
                  tone={marginTone}
                />
                <KpiMini
                  label="Selisih Harga"
                  value={refNone ? '—' : signedMoney(estimation.priceGap, currency)}
                  sub={gapSub}
                  tone={gapTone}
                />
              </div>

              {estimation.referenceSource !== 'NONE' && (
                <Card className="gap-0 rounded-xl border-slate-200 p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">Margin Aktual vs Target</h3>
                    <p className="text-xs text-slate-500">
                      Aktual <span className={cn('font-bold', TONE[marginTone].text)}>{fmtPct(estimation.actualMarginPct)}%</span>
                      {' '}· Target {fmtPct(estimation.targetMarginPct)}%
                    </p>
                  </div>
                  <div className="relative mt-4">
                    <Progress
                      value={clampPct(estimation.actualMarginPct)}
                      aria-label={`Margin aktual ${fmtPct(estimation.actualMarginPct)}% dari target ${fmtPct(estimation.targetMarginPct)}%`}
                      className={cn('h-2.5 bg-slate-100', TONE[marginTone].bar)}
                    />
                    <div
                      className="absolute -top-1.5 bottom-[-6px] w-0.5 -translate-x-1/2 rounded-full bg-slate-700"
                      style={{ left: `${clampPct(estimation.targetMarginPct)}%` }}
                      aria-hidden="true"
                    />
                  </div>
                  <div className="mt-2 flex justify-between text-[10px] text-slate-400">
                    <span>0%</span>
                    <span>Target {fmtPct(estimation.targetMarginPct)}%</span>
                    <span>100%</span>
                  </div>
                </Card>
              )}

              <Card className="gap-0 rounded-xl border-slate-200 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">Rincian Harga</h3>
                  <Badge variant="outline" className="font-mono text-[10px] text-slate-500">{currency}</Badge>
                </div>
                <div className={cn('mt-2 overflow-x-auto', SCROLLBAR)}>
                  <Table className="min-w-[420px]">
                    <TableHeader>
                      <TableRow className="bg-slate-50 hover:bg-slate-50">
                        <TableHead className="h-8 text-xs">Komponen</TableHead>
                        <TableHead className="h-8 text-right text-xs">Nilai</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="py-1.5 text-xs text-slate-600">HPP Total (termasuk kontingensi & management fee)</TableCell>
                        <TableCell className="py-1.5 text-right text-xs font-medium text-slate-800">{formatMoney(estimation.totalCost, currency)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="py-1.5 text-xs text-slate-600">Harga Jual (sebelum PPN)</TableCell>
                        <TableCell className="py-1.5 text-right text-xs font-medium text-slate-800">{formatMoney(estimation.sellingPrice, currency)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="py-1.5 text-xs text-slate-600">PPN ({fmtPct(estimation.taxPct)}%)</TableCell>
                        <TableCell className="py-1.5 text-right text-xs font-medium text-slate-800">{formatMoney(estimation.taxAmount, currency)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="py-1.5 text-xs font-semibold text-slate-900">Harga Jual + PPN</TableCell>
                        <TableCell className="py-1.5 text-right text-xs font-bold text-emerald-700">{formatMoney(estimation.priceWithTax, currency)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </Card>

              {/* Jembatan Estimasi → Penawaran */}
              {!['WON', 'LOST'].includes(opportunity.stage) && estimation.sellingPrice > 0 && (
                <Card className="gap-0 rounded-xl border-emerald-200 bg-emerald-50/60 p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                        <FileText className="h-4 w-4 text-emerald-700" /> Lanjut ke Penawaran
                      </h3>
                      <p className="mt-1 text-xs text-slate-600">
                        Buat draft penawaran <span className="font-semibold">{formatMoney(estimation.sellingPrice, currency)}</span> (sebelum PPN) langsung dari estimasi ini — numbering &amp; approval diskon mengikuti alur Quotations.
                      </p>
                    </div>
                    <Button
                      onClick={() => void createQuotationFromEstimation()}
                      disabled={quoteBusy}
                      className="gap-1.5 bg-emerald-700 text-white hover:bg-emerald-800"
                    >
                      {quoteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                      Buat Penawaran dari Estimasi
                    </Button>
                  </div>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
