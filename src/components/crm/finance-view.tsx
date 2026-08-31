/* ============ Finance View — Invoice, Pembayaran & Aging ============ */
'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { crmApi, financeApi } from './api-client'
import { useCrmStore } from './crm-store'
import { useToast } from '@/hooks/use-toast'
import { BrandChip, EmptyState, LoadingRows, RefreshButton, SectionHeader, downloadCsv } from './shared'
import { PrintOverlay, InvoicePrintBody } from './print-document'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { daysUntil, formatDate, formatMoney, timeAgo } from '@/lib/crm-constants'
import { exportExcel } from '@/lib/export-excel'
import type { FinanceSummaryDTO, InvoiceDTO, InvoiceStatus, OpportunityDTO, QuotationDTO } from '@/lib/crm-types'
import { cn } from '@/lib/utils'
import {
  AlarmClock, AlertCircle, ArrowUpRight, BarChart3, Ban, Building2, CalendarClock,
  CheckCircle2, Download, Eye, FileSpreadsheet, FileText, Loader2, Plus, Printer, ReceiptText, Search, TrendingUp, Wallet,
} from 'lucide-react'

/* ---------------- Local metadata ---------------- */
const INVOICE_STATUS_META: Record<InvoiceStatus, { label: string; cls: string }> = {
  UNPAID: { label: 'Belum Dibayar', cls: 'bg-amber-100 text-amber-700' },
  PARTIAL: { label: 'Sebagian', cls: 'bg-orange-100 text-orange-700' },
  PAID: { label: 'Lunas', cls: 'bg-emerald-100 text-emerald-700' },
  CANCELLED: { label: 'Dibatalkan', cls: 'bg-slate-100 text-slate-500 line-through' },
}
const statusLabel = (s: InvoiceStatus) => INVOICE_STATUS_META[s]?.label ?? s

const PAYMENT_METHODS: { key: string; label: string }[] = [
  { key: 'TRANSFER', label: 'Transfer Bank' },
  { key: 'CASH', label: 'Tunai' },
  { key: 'QRIS', label: 'QRIS' },
  { key: 'OTHER', label: 'Lainnya' },
]
const methodLabel = (key: string) => PAYMENT_METHODS.find(m => m.key === key)?.label ?? key

const AGING_ORDER = ['0-30', '31-60', '61-90', '>90']
const AGING_META: Record<string, { label: string; bar: string; text: string; tint: string }> = {
  '0-30': { label: '0–30 hari', bar: '[&>div]:bg-rose-300', text: 'text-rose-600', tint: 'bg-rose-50/60' },
  '31-60': { label: '31–60 hari', bar: '[&>div]:bg-rose-400', text: 'text-rose-600', tint: 'bg-rose-50' },
  '61-90': { label: '61–90 hari', bar: '[&>div]:bg-rose-500', text: 'text-rose-700', tint: 'bg-rose-100/70' },
  '>90': { label: '>90 hari', bar: '[&>div]:bg-rose-600', text: 'text-rose-700', tint: 'bg-rose-100' },
}

const localISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const todayISO = () => localISO(new Date())
const todayPlus30ISO = () => { const d = new Date(); d.setDate(d.getDate() + 30); return localISO(d) }

const isOverdue = (inv: InvoiceDTO) =>
  !!inv.dueDate && (daysUntil(inv.dueDate) ?? 0) < 0 && inv.total - inv.paidAmount > 0 && inv.status !== 'CANCELLED'

/* ---------------- Local atoms ---------------- */
function StatusBadge({ status }: { status: InvoiceStatus }) {
  const meta = INVOICE_STATUS_META[status]
  return <span className={cn('inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold', meta.cls)}>{meta.label}</span>
}

function MethodChip({ method }: { method: string }) {
  return <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{methodLabel(method)}</span>
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 break-words text-sm text-slate-800">{value ?? '—'}</p>
    </div>
  )
}

function KpiCard({ label, value, sub, icon: Icon, bgCls, iconCls, alertRing, accentCls = 'bg-slate-300' }: {
  label: string; value: string; sub?: string; icon: React.ElementType; bgCls: string; iconCls: string; alertRing?: boolean; accentCls?: string
}) {
  return (
    <Card className={cn('card-hover relative overflow-hidden rounded-xl border-slate-200 shadow-sm', alertRing && 'border-rose-200 ring-2 ring-rose-200')}>
      {/* Aksen strip tipis di sisi atas — warna semantik (amber/rose/emerald/slate) */}
      <span aria-hidden className={cn('absolute left-1/2 top-0 h-[2px] w-12 -translate-x-1/2 rounded-full', accentCls)} />
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', bgCls)}>
          <Icon className={cn('h-5 w-5', iconCls)} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[11px] text-slate-500">{label}</p>
          <p className="truncate text-lg font-bold leading-tight text-slate-900 tabular-nums">{value}</p>
          {sub && <p className={cn('truncate text-[11px]', alertRing ? 'font-medium text-rose-600' : 'text-slate-400')}>{sub}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

/* ---------------- Invoice row ---------------- */
function InvoiceRow({ inv, onPay, onDetail }: { inv: InvoiceDTO; onPay: (inv: InvoiceDTO) => void; onDetail: (inv: InvoiceDTO) => void }) {
  const overdue = isOverdue(inv)
  const pct = inv.total > 0 ? Math.min(100, Math.max(0, (inv.paidAmount / inv.total) * 100)) : 0
  const canPay = inv.status !== 'PAID' && inv.status !== 'CANCELLED'
  return (
    <div className="flex flex-col gap-3 p-4 transition-colors hover:bg-slate-50/70 md:flex-row md:items-center md:gap-5">
      {/* Kiri: identitas */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] text-slate-400">{inv.code}</span>
          <BrandChip name={inv.brandName} color={inv.brandColor} size="xs" />
          {overdue && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">Lewat jatuh tempo</span>}
        </div>
        <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">{inv.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{inv.companyName}</span>
          {inv.dueDate && (
            <span className={cn('inline-flex items-center gap-1', overdue ? 'font-semibold text-rose-600' : 'text-slate-500')}>
              <CalendarClock className="h-3 w-3" />
              Jatuh tempo {formatDate(inv.dueDate)}
            </span>
          )}
        </div>
      </div>

      {/* Tengah: progres pembayaran */}
      <div className="w-full shrink-0 md:w-60">
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="truncate text-slate-500 tabular-nums">
            Terbayar <span className="font-semibold text-slate-700">{formatMoney(inv.paidAmount, inv.currency, true)}</span>
            {' '}/ {formatMoney(inv.total, inv.currency, true)}
          </span>
          <Badge variant="outline" className="h-4 shrink-0 px-1.5 text-[10px] font-medium text-slate-500">{inv.payments.length}× bayar</Badge>
        </div>
        <Progress value={pct} className="mt-1.5 h-1.5 bg-slate-100 [&>div]:bg-emerald-500" />
      </div>

      {/* Kanan: status + aksi */}
      <div className="flex items-center gap-2 md:justify-end">
        <StatusBadge status={inv.status} />
        <Button
          size="sm"
          className="h-8 gap-1.5 bg-teal-600 text-white hover:bg-teal-700"
          disabled={!canPay}
          title={canPay ? 'Catat pembayaran untuk invoice ini' : 'Invoice lunas / dibatalkan'}
          onClick={() => onPay(inv)}
        >
          <Wallet className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Catat Pembayaran</span>
          <span className="sm:hidden">Bayar</span>
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-slate-400 hover:text-slate-700"
          aria-label={`Lihat detail invoice ${inv.code}`}
          title="Lihat detail"
          onClick={() => onDetail(inv)}
        >
          <Eye className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

/* ================================================================ */
export default function FinanceView() {
  const { toast } = useToast()
  const user = useCrmStore((s) => s.user)
  const brands = useCrmStore((s) => s.brands)
  const openOpportunity = useCrmStore((s) => s.openOpportunity)
  const canCreate = !!user && ['SUPER_ADMIN', 'KEUANGAN', 'DIREKTUR'].includes(user.role)

  /* ---- data ---- */
  const [summary, setSummary] = useState<FinanceSummaryDTO | null>(null)
  const [invoices, setInvoices] = useState<InvoiceDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /* ---- filter ---- */
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all')
  const [brandFilter, setBrandFilter] = useState<string>('all')

  /* ---- dialog: pembayaran ---- */
  const [payInv, setPayInv] = useState<InvoiceDTO | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('TRANSFER')
  const [payRef, setPayRef] = useState('')
  const [payDate, setPayDate] = useState(todayISO())
  const [payNote, setPayNote] = useState('')
  const [payError, setPayError] = useState<string | null>(null)
  const [paySubmitting, setPaySubmitting] = useState(false)

  /* ---- dialog: detail ---- */
  const [detailInv, setDetailInv] = useState<InvoiceDTO | null>(null)
  const [printInvOpen, setPrintInvOpen] = useState(false)
  const [cancelArmed, setCancelArmed] = useState(false)
  const [cancelSubmitting, setCancelSubmitting] = useState(false)

  /* ---- dialog: buat invoice ---- */
  const [createOpen, setCreateOpen] = useState(false)
  const [optsLoading, setOptsLoading] = useState(false)
  const [wonOpps, setWonOpps] = useState<OpportunityDTO[]>([])
  const [acceptedQuotes, setAcceptedQuotes] = useState<QuotationDTO[]>([])
  const [fOppId, setFOppId] = useState('none')
  const [fQuoteId, setFQuoteId] = useState('none')
  const [fTitle, setFTitle] = useState('')
  const [fAmount, setFAmount] = useState('')
  const [fTaxPct, setFTaxPct] = useState('0')
  const [fDueDate, setFDueDate] = useState('')
  const [fNotes, setFNotes] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [createSubmitting, setCreateSubmitting] = useState(false)

  /* ---------------- loaders ---------------- */
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const [sum, invs] = await Promise.all([financeApi.financeSummary(), financeApi.invoices()])
      setSummary(sum)
      setInvoices(invs)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data finance')
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const applyInvoice = useCallback((updated: InvoiceDTO) => {
    setInvoices(prev => prev.map(i => (i.id === updated.id ? updated : i)))
    setDetailInv(prev => (prev && prev.id === updated.id ? updated : prev))
    setPayInv(prev => (prev && prev.id === updated.id ? updated : prev))
  }, [])

  const refreshSummary = useCallback(() => {
    financeApi.financeSummary().then(setSummary).catch(() => { /* senyap — banner error utama sudah menangkap kegagalan load penuh */ })
  }, [])

  /* ---------------- filter memo ---------------- */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return invoices.filter(inv => {
      if (statusFilter !== 'all' && inv.status !== statusFilter) return false
      if (brandFilter !== 'all' && inv.brandId !== brandFilter) return false
      if (q && !`${inv.code} ${inv.title} ${inv.companyName}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [invoices, search, statusFilter, brandFilter])

  /* ---------------- pembayaran ---------------- */
  const openPay = useCallback((inv: InvoiceDTO) => {
    setPayInv(inv)
    setPayAmount(String(Math.max(0, inv.total - inv.paidAmount)))
    setPayMethod('TRANSFER')
    setPayRef('')
    setPayDate(todayISO())
    setPayNote('')
    setPayError(null)
  }, [])

  const submitPayment = useCallback(async () => {
    if (!payInv) return
    const sisa = payInv.total - payInv.paidAmount
    const amt = Number(payAmount)
    if (!Number.isFinite(amt) || amt <= 0) {
      setPayError('Nominal pembayaran harus lebih dari 0')
      return
    }
    if (amt > sisa + 0.001) {
      setPayError(`Nominal melebihi sisa tagihan (${formatMoney(sisa, payInv.currency)})`)
      return
    }
    setPaySubmitting(true)
    try {
      const updated = await financeApi.addPayment(payInv.id, {
        amount: amt,
        method: payMethod,
        reference: payRef.trim() || undefined,
        paidAt: payDate ? new Date(`${payDate}T00:00:00`).toISOString() : undefined,
        note: payNote.trim() || undefined,
      })
      applyInvoice(updated)
      refreshSummary()
      toast({ title: `Pembayaran ${formatMoney(amt, updated.currency, true)} tercatat — status invoice: ${statusLabel(updated.status)}` })
      setPayInv(null)
    } catch (e) {
      setPayError(e instanceof Error ? e.message : 'Gagal mencatat pembayaran')
    } finally {
      setPaySubmitting(false)
    }
  }, [payInv, payAmount, payMethod, payRef, payDate, payNote, applyInvoice, refreshSummary, toast])

  /* ---------------- detail & batal ---------------- */
  const openDetail = useCallback((inv: InvoiceDTO) => {
    setDetailInv(inv)
    setCancelArmed(false)
  }, [])

  const submitCancel = useCallback(async () => {
    if (!detailInv) return
    setCancelSubmitting(true)
    try {
      const updated = await financeApi.updateInvoice(detailInv.id, { status: 'CANCELLED' })
      applyInvoice(updated)
      refreshSummary()
      toast({ title: `Invoice ${updated.code} dibatalkan`, description: 'Status invoice kini Dibatalkan.' })
      setDetailInv(null)
    } catch (e) {
      toast({ title: 'Gagal membatalkan invoice', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally {
      setCancelSubmitting(false)
    }
  }, [detailInv, applyInvoice, refreshSummary, toast])

  /* ---------------- buat invoice ---------------- */
  const resetCreateForm = useCallback(() => {
    setFOppId('none')
    setFQuoteId('none')
    setFTitle('')
    setFAmount('')
    setFTaxPct('0')
    setFDueDate(todayPlus30ISO())
    setFNotes('')
    setCreateError(null)
  }, [])

  const openCreate = useCallback(() => {
    resetCreateForm()
    setWonOpps([])
    setAcceptedQuotes([])
    setCreateOpen(true)
    setOptsLoading(true)
    Promise.all([crmApi.opportunities('stage=WON'), financeApi.quotations('status=ACCEPTED')])
      .then(([opps, quotes]) => {
        setWonOpps(opps.filter(o => o.stage === 'WON'))
        setAcceptedQuotes(quotes)
      })
      .catch(e => toast({
        title: 'Gagal memuat data deal / quotation',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      }))
      .finally(() => setOptsLoading(false))
  }, [resetCreateForm, toast])

  const handleOppChange = (v: string) => {
    setFOppId(v)
    setCreateError(null)
    const opp = wonOpps.find(o => o.id === v)
    if (opp) {
      if (!fTitle.trim()) setFTitle(opp.title)
      if (!fAmount.trim() || Number(fAmount) === 0) setFAmount(opp.estimatedValue ? String(opp.estimatedValue) : '')
    }
  }

  const handleQuoteChange = (v: string) => {
    setFQuoteId(v)
    setCreateError(null)
    const q = acceptedQuotes.find(x => x.id === v)
    if (q) {
      setFAmount(String(q.total))
      setFTitle(q.title)
      setFNotes(`Dari quotation ${q.code}`)
      if (wonOpps.some(o => o.id === q.opportunityId)) setFOppId(q.opportunityId)
    }
  }

  const submitCreate = useCallback(async () => {
    if (fOppId === 'none') { setCreateError('Pilih opportunity (deal Won) terlebih dahulu'); return }
    if (!fTitle.trim()) { setCreateError('Judul invoice wajib diisi'); return }
    const amt = Number(fAmount)
    if (!Number.isFinite(amt) || amt <= 0) { setCreateError('Nominal invoice harus lebih dari 0'); return }
    setCreateSubmitting(true)
    try {
      const created = await financeApi.createInvoice({
        opportunityId: fOppId,
        quotationId: fQuoteId !== 'none' ? fQuoteId : undefined,
        title: fTitle.trim(),
        amount: amt,
        taxPct: Number(fTaxPct) || 0,
        dueDate: fDueDate ? new Date(`${fDueDate}T00:00:00`).toISOString() : undefined,
        notes: fNotes.trim() || undefined,
      })
      toast({ title: `Invoice ${created.code} dibuat`, description: `${created.title} — ${formatMoney(created.total, created.currency)}` })
      setCreateOpen(false)
      await load(true)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Gagal membuat invoice')
    } finally {
      setCreateSubmitting(false)
    }
  }, [fOppId, fQuoteId, fTitle, fAmount, fTaxPct, fDueDate, fNotes, load, toast])

  const totalPreview = useMemo(() => {
    const amt = Number(fAmount)
    if (!Number.isFinite(amt) || amt <= 0) return 0
    return amt * (1 + (Number(fTaxPct) || 0) / 100)
  }, [fAmount, fTaxPct])

  /* ---------------- export excel ---------------- */
  const exportExcelAll = useCallback(() => {
    if (!summary) return
    const stamp = new Date().toISOString().slice(0, 10)
    // Pembayaran di-flatten dari payments per-invoice (PaymentDTO hidup di dalam InvoiceDTO)
    const paymentRows = filtered.flatMap((inv) =>
      inv.payments.map((p) => [
        formatDate(p.paidAt, true),
        inv.code,
        inv.companyName,
        p.amount,
        methodLabel(p.method),
        p.reference ?? '',
      ]),
    )
    exportExcel(`keuangan-${stamp}.xlsx`, [
      {
        name: 'Ringkasan',
        rows: [
          ['Ringkasan Keuangan', 'Grupa Kreasi CRM'],
          [],
          ['Indikator', 'Nilai'],
          ['Total Terfaktur', summary.invoicedTotal],
          ['Outstanding', summary.outstandingTotal],
          ['Jatuh Tempo (terlambat)', summary.overdueTotal],
          ['Invoice Terlambat (jumlah)', summary.overdueCount],
          ['Diterima Bulan Ini', summary.paidThisMonth],
          ['Invoice Belum Lunas (jumlah)', summary.unpaidCount],
        ],
      },
      {
        name: 'Invoice',
        rows: [
          ['Kode', 'Judul', 'Perusahaan', 'Status', 'Terbit', 'Jatuh Tempo', 'Total', 'Dibayar', 'Sisa'],
          ...filtered.map((inv) => [
            inv.code,
            inv.title,
            inv.companyName,
            statusLabel(inv.status),
            formatDate(inv.issuedAt),
            inv.dueDate ? formatDate(inv.dueDate) : '—',
            inv.total,
            inv.paidAmount,
            inv.total - inv.paidAmount,
          ]),
        ],
      },
      {
        name: 'Pembayaran',
        rows: [
          ['Tanggal', 'Invoice', 'Perusahaan', 'Jumlah', 'Metode', 'Referensi'],
          ...paymentRows,
        ],
      },
    ])
    toast({
      title: 'Export Excel berhasil',
      description: `keuangan-${stamp}.xlsx · 3 sheet (Ringkasan, Invoice, Pembayaran) · ${filtered.length} invoice · ${paymentRows.length} pembayaran`,
    })
  }, [summary, filtered, toast])

  /* ---------------- aging memo ---------------- */
  const agingRows = useMemo(() => {
    if (!summary) return []
    return [...summary.aging].sort((a, b) => AGING_ORDER.indexOf(a.bucket) - AGING_ORDER.indexOf(b.bucket))
  }, [summary])
  const agingMax = Math.max(...agingRows.map(r => r.value), 1)
  const agingAllZero = agingRows.length > 0 && agingRows.every(r => r.count === 0)
  const brandMax = summary ? Math.max(...summary.byBrand.map(b => b.invoiced), 1) : 1
  const paySisa = payInv ? payInv.total - payInv.paidAmount : 0

  /* ================================================================ */
  return (
    <div className="space-y-5">
      <SectionHeader
        title="Finance"
        description="Invoice, pembayaran, dan analitik piutang lintas brand"
        action={
          <div className="flex items-center gap-2">
            <RefreshButton onClick={() => load()} loading={loading} />
            {canCreate && (
              <Button
                variant="outline"
                onClick={() => downloadCsv(
                  `invoices-${new Date().toISOString().slice(0, 10)}.csv`,
                  ['Kode', 'Judul', 'Perusahaan', 'Brand', 'Status', 'Amount', 'PPN %', 'Total', 'Terbayar', 'Sisa', 'Currency', 'Jatuh Tempo', 'Terbit'],
                  filtered.map((inv) => [inv.code, inv.title, inv.companyName, inv.brandName, inv.status, inv.amount, inv.taxPct, inv.total, inv.paidAmount, inv.total - inv.paidAmount, inv.currency, inv.dueDate ?? '', inv.issuedAt]),
                )}
                className="h-9 gap-1.5"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            )}
            {canCreate && (
              <Button
                variant="outline"
                size="sm"
                disabled={loading || !summary}
                onClick={exportExcelAll}
                className="h-9 gap-1.5"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Export Excel
              </Button>
            )}
            {canCreate && (
              <Button onClick={openCreate} className="h-9 gap-1.5 bg-teal-600 text-white hover:bg-teal-700">
                <Plus className="h-4 w-4" />
                Buat Invoice
              </Button>
            )}
          </div>
        }
      />

      {error && (
        <Alert variant="destructive" className="border-rose-200">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Gagal memuat data finance</AlertTitle>
          <AlertDescription>
            <p>{error}</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2 border-rose-200 text-rose-700 hover:bg-rose-50"
              onClick={() => load()}
            >
              Coba lagi
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="invoices" className="gap-4">
        <TabsList className="h-auto w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="invoices" className="gap-1.5 px-3 py-1.5">
            <ReceiptText className="h-3.5 w-3.5" />
            Invoice &amp; Pembayaran
          </TabsTrigger>
          <TabsTrigger value="aging" className="gap-1.5 px-3 py-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            Aging &amp; Analitik
          </TabsTrigger>
        </TabsList>

        {/* ================= TAB 1 — INVOICE & PEMBAYARAN ================= */}
        <TabsContent value="invoices" className="mt-2 space-y-4">
          {/* KPI row */}
          {loading && !summary ? (
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[86px] rounded-xl" />)}
            </div>
          ) : summary && (
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <KpiCard
                label="Outstanding"
                value={formatMoney(summary.outstandingTotal, 'IDR', true)}
                sub={`${summary.unpaidCount} invoice belum lunas`}
                icon={Wallet}
                bgCls="bg-amber-50"
                iconCls="text-amber-600"
                accentCls="bg-amber-400"
              />
              <KpiCard
                label="Jatuh Tempo"
                value={formatMoney(summary.overdueTotal, 'IDR', true)}
                sub={`${summary.overdueCount} invoice lewat jatuh tempo`}
                icon={AlarmClock}
                bgCls="bg-rose-50"
                iconCls="text-rose-600"
                alertRing={summary.overdueCount > 0}
                accentCls="bg-rose-500"
              />
              <KpiCard
                label="Diterima Bulan Ini"
                value={formatMoney(summary.paidThisMonth, 'IDR', true)}
                sub="Total pembayaran bulan berjalan"
                icon={TrendingUp}
                bgCls="bg-emerald-50"
                iconCls="text-emerald-600"
                accentCls="bg-emerald-500"
              />
              <KpiCard
                label="Total Terfaktur"
                value={formatMoney(summary.invoicedTotal, 'IDR', true)}
                sub="Seluruh invoice diterbitkan"
                icon={FileText}
                bgCls="bg-slate-100"
                iconCls="text-slate-600"
                accentCls="bg-slate-400"
              />
            </div>
          )}

          {/* Toolbar */}
          <Card className="rounded-xl border-slate-200 py-0 shadow-sm">
            <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
              <div className="relative flex-1 sm:min-w-[220px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari kode, judul, atau perusahaan…"
                  className="h-9 pl-9"
                  aria-label="Cari invoice"
                />
              </div>
              <div className="flex gap-2">
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as InvoiceStatus | 'all')}>
                  <SelectTrigger className="h-9 w-full sm:w-[150px]" aria-label="Filter status invoice">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Status</SelectItem>
                    <SelectItem value="UNPAID">Belum Dibayar</SelectItem>
                    <SelectItem value="PARTIAL">Sebagian</SelectItem>
                    <SelectItem value="PAID">Lunas</SelectItem>
                    <SelectItem value="CANCELLED">Dibatalkan</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={brandFilter} onValueChange={setBrandFilter}>
                  <SelectTrigger className="h-9 w-full sm:w-[160px]" aria-label="Filter brand">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Brand</SelectItem>
                    {brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <p className="whitespace-nowrap text-xs text-slate-500 sm:ml-auto">
                {filtered.length} dari {invoices.length} invoice
              </p>
            </CardContent>
          </Card>

          {/* Daftar invoice */}
          {loading && invoices.length === 0 ? (
            <Card className="rounded-xl border-slate-200 py-0 shadow-sm">
              <CardContent className="p-4"><LoadingRows rows={6} /></CardContent>
            </Card>
          ) : filtered.length === 0 ? (
            invoices.length === 0 ? (
              <EmptyState
                icon={<ReceiptText className="h-5 w-5" />}
                title="Belum ada invoice"
                description="Invoice dibuat dari deal berstatus Won atau quotation yang disetujui. Klik “Buat Invoice” untuk menerbitkan invoice pertama."
                action={canCreate ? (
                  <Button onClick={openCreate} className="gap-1.5 bg-teal-600 text-white hover:bg-teal-700">
                    <Plus className="h-4 w-4" /> Buat Invoice
                  </Button>
                ) : undefined}
              />
            ) : (
              <EmptyState
                icon={<Search className="h-5 w-5" />}
                title="Tidak ada invoice yang cocok"
                description="Coba ubah kata kunci pencarian atau reset filter status/brand."
              />
            )
          ) : (
            <Card className="rounded-xl border-slate-200 py-0 shadow-sm">
              <div className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto scrollbar-slim">
                {filtered.map(inv => (
                  <InvoiceRow key={inv.id} inv={inv} onPay={openPay} onDetail={openDetail} />
                ))}
              </div>
            </Card>
          )}
        </TabsContent>

        {/* ================= TAB 2 — AGING & ANALITIK ================= */}
        <TabsContent value="aging" className="mt-2 space-y-4">
          {!summary ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-64 rounded-xl" />
              <Skeleton className="h-64 rounded-xl" />
            </div>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                {/* Aging piutang */}
                <Card className="rounded-xl border-slate-200 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <AlarmClock className="h-4 w-4 text-rose-500" />
                      Aging Piutang
                    </CardTitle>
                    <CardDescription className="text-xs">Outstanding invoice berdasarkan umur keterlambatan</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {agingAllZero ? (
                      <div className="flex flex-col items-center gap-2 py-8 text-center">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50">
                          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        </div>
                        <p className="text-sm font-medium text-slate-700">Tidak ada piutang tertunggak</p>
                        <p className="text-xs text-slate-500">Semua invoice lunas atau belum jatuh tempo.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {agingRows.map(row => {
                          const meta = AGING_META[row.bucket] ?? AGING_META['>90']
                          const pct = Math.min(100, (row.value / agingMax) * 100)
                          return (
                            <div key={row.bucket} className={cn('rounded-lg p-3', meta.tint)}>
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className={cn('text-xs font-semibold', meta.text)}>{meta.label}</span>
                                  <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{row.count} invoice</span>
                                </div>
                                <span className={cn('text-sm font-bold tabular-nums', meta.text)}>{formatMoney(row.value, 'IDR', true)}</span>
                              </div>
                              <Progress value={pct} className={cn('mt-2 h-1.5 bg-white/70', meta.bar)} />
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Per brand */}
                <Card className="rounded-xl border-slate-200 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Building2 className="h-4 w-4 text-teal-600" />
                      Per Brand
                    </CardTitle>
                    <CardDescription className="text-xs">Perbandingan terfaktur, diterima, dan outstanding per brand</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {summary.byBrand.length === 0 ? (
                      <div className="flex flex-col items-center gap-2 py-8 text-center">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
                          <ReceiptText className="h-5 w-5 text-slate-400" />
                        </div>
                        <p className="text-sm font-medium text-slate-700">Belum ada data per brand</p>
                        <p className="text-xs text-slate-500">Data muncul setelah ada invoice yang diterbitkan.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {summary.byBrand.map(b => {
                          const paidW = Math.min(100, (b.paid / brandMax) * 100)
                          const outW = Math.min(100, (b.outstanding / brandMax) * 100)
                          return (
                            <div key={b.brandId}>
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <BrandChip name={b.name} color={b.color} size="sm" />
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] tabular-nums">
                                  <span className="text-slate-600">Terfaktur <b className="text-slate-800">{formatMoney(b.invoiced, 'IDR', true)}</b></span>
                                  <span className="text-emerald-700">Diterima <b>{formatMoney(b.paid, 'IDR', true)}</b></span>
                                  <span className="text-amber-700">Outstanding <b>{formatMoney(b.outstanding, 'IDR', true)}</b></span>
                                </div>
                              </div>
                              <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
                                <div className="bg-emerald-500 transition-all" style={{ width: `${paidW}%` }} />
                                <div className="bg-amber-400 transition-all" style={{ width: `${outW}%` }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Pembayaran terbaru */}
              <Card className="rounded-xl border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    Pembayaran Terbaru
                  </CardTitle>
                  <CardDescription className="text-xs">8 pembayaran terakhir yang tercatat</CardDescription>
                </CardHeader>
                <CardContent>
                  {summary.recentPayments.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                      Belum ada pembayaran tercatat — catat dari tombol “Catat Pembayaran” di tab Invoice &amp; Pembayaran.
                    </p>
                  ) : (
                    <div className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto pr-1 scrollbar-slim">
                      {summary.recentPayments.slice(0, 8).map(p => (
                        <div key={p.id} className="flex items-center gap-3 py-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm">
                              <span className="font-bold text-slate-900">{formatMoney(p.amount, 'IDR', true)}</span>
                              <span className="text-slate-400"> · {p.invoiceCode}</span>
                            </p>
                            <p className="truncate text-[11px] text-slate-500">{p.companyName} — {p.invoiceTitle}</p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-2">
                              <MethodChip method={p.method} />
                              {p.reference && <span className="font-mono text-[10px] text-slate-400">{p.reference}</span>}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-[11px] text-slate-500">{timeAgo(p.paidAt)}</p>
                            {p.recordedByName && <p className="text-[10px] text-slate-400">dicatat {p.recordedByName}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* ================= DIALOG: CATAT PEMBAYARAN ================= */}
      <Dialog open={!!payInv} onOpenChange={(o) => { if (!o) setPayInv(null) }}>
        <DialogContent className="max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-teal-600" />
              Catat Pembayaran
            </DialogTitle>
            <DialogDescription>{payInv?.code} · {payInv?.title}</DialogDescription>
          </DialogHeader>
          {payInv && (
            <div className="space-y-4">
              <div className="rounded-lg bg-slate-50 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Total tagihan</span>
                  <span className="font-semibold text-slate-900">{formatMoney(payInv.total, payInv.currency)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-slate-500">Sudah dibayar</span>
                  <span className="font-semibold text-emerald-700">{formatMoney(payInv.paidAmount, payInv.currency)}</span>
                </div>
                <Separator className="my-2" />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Sisa</span>
                  <span className="font-bold text-rose-600">{formatMoney(paySisa, payInv.currency)}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pay-amount">Nominal Pembayaran</Label>
                <Input
                  id="pay-amount"
                  type="number"
                  min={0}
                  value={payAmount}
                  onChange={(e) => { setPayAmount(e.target.value); setPayError(null) }}
                />
                {payError ? (
                  <p className="text-xs font-medium text-rose-600">{payError}</p>
                ) : (
                  <p className="text-xs text-slate-500">Maksimal {formatMoney(paySisa, payInv.currency)}</p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Metode</Label>
                  <Select value={payMethod} onValueChange={setPayMethod}>
                    <SelectTrigger aria-label="Metode pembayaran"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map(m => <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pay-date">Tanggal Bayar</Label>
                  <Input id="pay-date" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pay-ref">No. Referensi</Label>
                <Input id="pay-ref" value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="No. transfer/bukti" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pay-note">Catatan</Label>
                <Input id="pay-note" value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="Catatan (opsional)" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayInv(null)} disabled={paySubmitting}>Batal</Button>
            <Button
              onClick={submitPayment}
              disabled={paySubmitting || !payInv || !payAmount}
              className="bg-teal-600 text-white hover:bg-teal-700"
            >
              {paySubmitting && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              Simpan Pembayaran
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================= DIALOG: DETAIL INVOICE ================= */}
      <Dialog open={!!detailInv} onOpenChange={(o) => { if (!o) setDetailInv(null) }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-xl sm:max-w-2xl" onInteractOutside={(e) => { if (printInvOpen) e.preventDefault() }}>
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-semibold text-slate-400">{detailInv?.code}</span>
              {detailInv && <StatusBadge status={detailInv.status} />}
            </DialogTitle>
            <DialogDescription>{detailInv?.title}</DialogDescription>
          </DialogHeader>
          {detailInv && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-slate-50 p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">Total Tagihan</p>
                  <p className="mt-0.5 text-sm font-bold text-slate-900 tabular-nums">{formatMoney(detailInv.total, detailInv.currency)}</p>
                </div>
                <div className="rounded-lg bg-emerald-50 p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-emerald-600">Dibayar</p>
                  <p className="mt-0.5 text-sm font-bold text-emerald-700 tabular-nums">{formatMoney(detailInv.paidAmount, detailInv.currency)}</p>
                </div>
                <div className="rounded-lg bg-amber-50 p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-amber-600">Sisa</p>
                  <p className="mt-0.5 text-sm font-bold text-amber-700 tabular-nums">{formatMoney(detailInv.total - detailInv.paidAmount, detailInv.currency)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                <DetailField label="Perusahaan" value={detailInv.companyName} />
                <DetailField label="Brand" value={detailInv.brandName} />
                <DetailField label="Opportunity" value={`${detailInv.opportunityCode} · ${detailInv.opportunityTitle}`} />
                {detailInv.projectCode && <DetailField label="Project" value={detailInv.projectCode} />}
                <DetailField label="Nilai Dasar" value={formatMoney(detailInv.amount, detailInv.currency)} />
                <DetailField label="PPN" value={`${detailInv.taxPct}%`} />
                <DetailField label="Diterbitkan" value={formatDate(detailInv.issuedAt)} />
                <DetailField label="Jatuh Tempo" value={formatDate(detailInv.dueDate)} />
                <DetailField label="Dibuat" value={formatDate(detailInv.createdAt)} />
              </div>

              {detailInv.notes && (
                <div>
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">Catatan</p>
                  <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{detailInv.notes}</p>
                </div>
              )}

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Riwayat Pembayaran ({detailInv.payments.length})
                </p>
                {detailInv.payments.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">
                    Belum ada pembayaran tercatat
                  </p>
                ) : (
                  <div className="max-h-56 space-y-2 overflow-y-auto pr-1 scrollbar-slim">
                    {[...detailInv.payments]
                      .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())
                      .map(p => (
                        <div key={p.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 p-3">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900">{formatMoney(p.amount, detailInv.currency)}</p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-2">
                              <MethodChip method={p.method} />
                              {p.reference && <span className="font-mono text-[10px] text-slate-400">{p.reference}</span>}
                            </p>
                            {p.note && <p className="mt-1 text-xs italic text-slate-500">“{p.note}”</p>}
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-[11px] font-medium text-slate-700">{formatDate(p.paidAt, true)}</p>
                            {p.recordedByName && <p className="text-[10px] text-slate-400">dicatat {p.recordedByName}</p>}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {cancelArmed && (
                <Alert variant="destructive" className="border-rose-200">
                  <Ban className="h-4 w-4" />
                  <AlertTitle>Batalkan invoice {detailInv.code}?</AlertTitle>
                  <AlertDescription>
                    <p>Status akan berubah menjadi Dibatalkan dan invoice tidak dapat dibayar. Tindakan ini tidak dapat diurungkan.</p>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="destructive" onClick={submitCancel} disabled={cancelSubmitting}>
                        {cancelSubmitting && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                        Ya, Batalkan
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setCancelArmed(false)} disabled={cancelSubmitting}>
                        Tidak, Kembali
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
          <DialogFooter className="sm:justify-between">
            {detailInv?.opportunityId ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { const id = detailInv.opportunityId; setDetailInv(null); openOpportunity(id) }}
              >
                <ArrowUpRight className="mr-1 h-3.5 w-3.5" />
                Buka Opportunity {detailInv.opportunityCode}
              </Button>
            ) : <span />}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPrintInvOpen(true)}
              className="gap-1.5"
            >
              <Printer className="h-3.5 w-3.5" /> Cetak / PDF
            </Button>
            {detailInv && detailInv.paidAmount === 0 && detailInv.status !== 'CANCELLED' && !cancelArmed && (
              <Button
                variant="outline"
                size="sm"
                className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                onClick={() => setCancelArmed(true)}
              >
                <Ban className="mr-1 h-3.5 w-3.5" />
                Batalkan Invoice
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================= PRINT: INVOICE ================= */}
      {detailInv && (
        <PrintOverlay open={printInvOpen} docTitle={`${detailInv.code} — ${detailInv.title}`} onClose={() => setPrintInvOpen(false)}>
          <InvoicePrintBody inv={detailInv} />
        </PrintOverlay>
      )}

      {/* ================= DIALOG: BUAT INVOICE ================= */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ReceiptText className="h-4 w-4 text-teal-600" />
              Buat Invoice
            </DialogTitle>
            <DialogDescription>Buat invoice dari deal Won atau quotation yang disetujui.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {createError && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{createError}</p>
            )}

            <div className="space-y-1.5">
              <Label>Opportunity (Deal Won) *</Label>
              <Select value={fOppId} onValueChange={handleOppChange} disabled={optsLoading}>
                <SelectTrigger aria-label="Pilih opportunity">
                  <SelectValue placeholder={optsLoading ? 'Memuat deal…' : 'Pilih opportunity'} />
                </SelectTrigger>
                <SelectContent>
                  {wonOpps.length === 0 ? (
                    <p className="px-3 py-6 text-center text-xs text-slate-500">
                      {optsLoading ? 'Memuat daftar deal…' : 'Tidak ada opportunity berstatus Won'}
                    </p>
                  ) : wonOpps.map(o => (
                    <SelectItem key={o.id} value={o.id}>{o.code} · {o.title} — {o.companyName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-slate-500">Hanya opportunity berstatus Won yang dapat dibuatkan invoice.</p>
            </div>

            <div className="space-y-1.5">
              <Label>Quotation (opsional)</Label>
              <Select value={fQuoteId} onValueChange={handleQuoteChange} disabled={optsLoading}>
                <SelectTrigger aria-label="Pilih quotation">
                  <SelectValue placeholder={optsLoading ? 'Memuat quotation…' : 'Pilih quotation disetujui'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Tanpa quotation —</SelectItem>
                  {acceptedQuotes.map(q => (
                    <SelectItem key={q.id} value={q.id}>
                      {q.code} · {q.title} — {q.companyName} ({formatMoney(q.total, q.currency, true)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-slate-500">Memilih quotation otomatis mengisi judul, nominal, dan catatan dari quotation disetujui.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inv-title">Judul Invoice *</Label>
              <Input
                id="inv-title"
                value={fTitle}
                onChange={(e) => setFTitle(e.target.value)}
                placeholder="cth. Website Company Profile — Tahap 1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="inv-amount">Nominal *</Label>
                <Input
                  id="inv-amount"
                  type="number"
                  min={0}
                  value={fAmount}
                  onChange={(e) => { setFAmount(e.target.value); setCreateError(null) }}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-tax">PPN %</Label>
                <Input
                  id="inv-tax"
                  type="number"
                  min={0}
                  max={100}
                  value={fTaxPct}
                  onChange={(e) => setFTaxPct(e.target.value)}
                />
                <p className="text-[11px] text-slate-500">Persentase PPN (default 0)</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inv-due">Jatuh Tempo</Label>
              <Input id="inv-due" type="date" value={fDueDate} onChange={(e) => setFDueDate(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inv-notes">Catatan</Label>
              <Textarea
                id="inv-notes"
                rows={2}
                value={fNotes}
                onChange={(e) => setFNotes(e.target.value)}
                placeholder="Catatan invoice (opsional)"
              />
            </div>

            {totalPreview > 0 && (
              <div className="flex items-center justify-between rounded-lg bg-teal-50 px-3 py-2 text-sm">
                <span className="text-teal-800">Total tagihan (termasuk PPN)</span>
                <span className="font-bold text-teal-900">{formatMoney(totalPreview)}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createSubmitting}>Batal</Button>
            <Button
              onClick={submitCreate}
              disabled={createSubmitting || optsLoading}
              className="bg-teal-600 text-white hover:bg-teal-700"
            >
              {createSubmitting && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              Buat Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
