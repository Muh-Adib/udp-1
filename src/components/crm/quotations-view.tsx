/* ============ Quotations View — Penawaran resmi per brand ============ */
'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { crmApi, financeApi, portalApi } from '@/components/crm/api-client'
import { useCrmStore } from '@/components/crm/crm-store'
import { useToast } from '@/hooks/use-toast'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { BrandChip, EmptyState, RefreshButton, SectionHeader, downloadCsv } from '@/components/crm/shared'
import { exportExcel } from '@/lib/export-excel'
import { PrintOverlay, QuotationPrintBody } from '@/components/crm/print-document'
import {
  LOST_REASONS, REACTIVATION_OPTIONS, daysUntil, formatDate, formatMoney, lostReasonLabel, reactivationLabel, timeAgo,
} from '@/lib/crm-constants'
import type { OpportunityDTO, PortalCommentDTO, QuotationDTO, QuotationDetailDTO, QuotationStatus } from '@/lib/crm-types'
import { cn } from '@/lib/utils'
import {
  AlertCircle, BadgeCheck, CheckCircle2, Clock, Download, FileSpreadsheet, FileText, Loader2, MessageSquare, Pencil, Plus,
  Printer, Search, Send, Trash2, X, XCircle,
} from 'lucide-react'

/* ================= Local constants & helpers ================= */

const SCROLLBAR = '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300'

const MAX_COMMENT_LEN = 2000

/** Label role untuk bubble diskusi (Bahasa Indonesia) */
const ROLE_LABEL: Record<string, string> = {
  CLIENT: 'Client',
  MARKETING: 'Marketing',
  DIREKTUR: 'Direktur',
  KEUANGAN: 'Keuangan',
  PRODUKSI: 'Produksi',
  SUPER_ADMIN: 'Admin',
}

/** Stage opportunity yang boleh dibuatkan penawaran */
const CREATE_STAGES = new Set<string>(['ESTIMATION', 'PROPOSAL_SENT', 'NEGOTIATION', 'VERBAL_AGREEMENT', 'QUALIFIED', 'DISCOVERY'])

const STATUS_META: Record<QuotationStatus, { label: string; cls: string }> = {
  DRAFT: { label: 'Draft', cls: 'bg-slate-100 text-slate-600' },
  SENT: { label: 'Terkirim', cls: 'bg-amber-50 text-amber-700' },
  ACCEPTED: { label: 'Disetujui', cls: 'bg-emerald-50 text-emerald-700' },
  REJECTED: { label: 'Ditolak', cls: 'bg-rose-50 text-rose-700' },
  EXPIRED: { label: 'Kedaluwarsa', cls: 'bg-slate-100 text-slate-400 line-through' },
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Terjadi kesalahan')

const toNum = (v: string) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

interface EditorItem { description: string; qty: string; unitPrice: string }

const emptyItem = (): EditorItem => ({ description: '', qty: '1', unitPrice: '' })

/** Tanggal hari ini +14 hari dalam format input date (YYYY-MM-DD, lokal) */
function defaultValidUntil(): string {
  const d = new Date(Date.now() + 14 * 86400000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Kalkulasi total live (rumus sama dengan server: semua dibulatkan) */
function computeTotals(items: EditorItem[], discountPct: string, taxPct: string) {
  const subtotal = items.reduce((sum, it) => sum + Math.round(toNum(it.qty) * toNum(it.unitPrice)), 0)
  const dp = Math.min(100, Math.max(0, toNum(discountPct)))
  const tp = Math.max(0, toNum(taxPct))
  const discountAmount = Math.round((subtotal * dp) / 100)
  const taxAmount = Math.round(((subtotal - discountAmount) * tp) / 100)
  return { subtotal, discountPct: dp, discountAmount, taxPct: tp, taxAmount, total: subtotal - discountAmount + taxAmount }
}

/** Mata uang yang paling banyak muncul (fallback IDR) — untuk KPI nilai gabungan */
function dominantCurrency(list: QuotationDTO[]): string {
  const counts = new Map<string, number>()
  list.forEach((q) => counts.set(q.currency, (counts.get(q.currency) ?? 0) + 1))
  let best = 'IDR'
  let bestN = 0
  counts.forEach((n, cur) => {
    if (n > bestN) { best = cur; bestN = n }
  })
  return best
}

/* ================= Local atoms ================= */

function StatusBadge({ status }: { status: QuotationStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.DRAFT
  return <span className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium', meta.cls)}>{meta.label}</span>
}

function VersionChip({ version }: { version: number }) {
  return <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">v{version}</span>
}

function KpiCard({ label, value, sub, icon: Icon, tone, ring }: {
  label: string; value: string; sub?: string; icon: React.ElementType; tone: string; ring?: boolean
}) {
  return (
    <Card className={cn('gap-0 rounded-xl p-4', ring && 'ring-2 ring-orange-400')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-1 text-lg font-bold text-slate-900 sm:text-xl">{value}</p>
          {sub && <p className="mt-0.5 truncate text-[11px] text-slate-400">{sub}</p>}
        </div>
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tone)}>
          <Icon className="h-4.5 w-4.5" />
        </div>
      </div>
    </Card>
  )
}

function QuotationCard({ q, onOpen, lostBridge, onLostAction }: {
  q: QuotationDTO; onOpen: () => void
  lostBridge?: { kind: 'action' | 'lost'; reasonLabel?: string | null }
  onLostAction?: () => void
}) {
  const dv = daysUntil(q.validUntil)
  const expired = dv !== null && dv < 0
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      aria-label={`Detail penawaran ${q.code}`}
      className="cursor-pointer gap-0 rounded-xl p-4 transition-all hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="font-mono text-xs text-slate-400">{q.code}</span>
          {q.version > 1 && <VersionChip version={q.version} />}
        </div>
        <StatusBadge status={q.status} />
      </div>

      <h3 className="mt-2 line-clamp-1 font-semibold text-slate-900">{q.title}</h3>
      <p className="mt-0.5 truncate text-xs text-slate-500">{q.companyName} · {q.opportunityCode}</p>

      <div className="mt-2.5"><BrandChip name={q.brandName} color={q.brandColor} size="xs" /></div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-lg font-bold text-slate-900">{formatMoney(q.total, q.currency, true)}</p>
          {q.discountPct > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Diskon {q.discountPct}%</span>
              {q.status === 'SENT' && !q.discountApprovedById && (
                <span className="rounded-md bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700 ring-1 ring-orange-200">Menunggu approval Direktur</span>
              )}
              {q.discountApprovedById && (
                <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                  Disetujui {q.discountApprovedByName}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="text-right">
          <p className={cn('text-[11px]', expired && q.status === 'SENT' ? 'font-semibold text-rose-600' : 'text-slate-400')}>
            Berlaku s.d. {formatDate(q.validUntil)}
          </p>
          <p className="text-[11px] text-slate-400">
            {q.decidedAt ? `Diputuskan ${timeAgo(q.decidedAt)}` : q.sentAt ? `Dikirim ${timeAgo(q.sentAt)}` : `Dibuat ${timeAgo(q.createdAt)}`}
          </p>
        </div>
      </div>

      {/* Bridge penolakan → lost reason (R12): strip aksi / chip status LOST */}
      {lostBridge?.kind === 'action' && (
        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
          <div className="flex flex-wrap items-start gap-2.5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <p className="min-w-0 flex-1 text-xs leading-snug text-rose-800">
              Penawaran ditolak client — tandai alasan lost agar pembelajaran tercatat
            </p>
            <Button
              size="sm"
              onClick={(e) => { e.stopPropagation(); onLostAction?.() }}
              className="h-8 shrink-0 gap-1.5 bg-rose-600 text-white hover:bg-rose-700"
            >
              Tandai Lost Reason
            </Button>
          </div>
        </div>
      )}
      {lostBridge?.kind === 'lost' && (
        <div className="mt-3">
          <span
            className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600"
            title="Opportunity terkait sudah ditandai Lost"
          >
            Opportunity LOST{lostBridge.reasonLabel ? ` · ${lostBridge.reasonLabel}` : ''}
          </span>
        </div>
      )}
    </Card>
  )
}

/** Editor item baris (dipakai dialog create & edit) */
function ItemsEditor({ items, onChange, currency, disabled }: {
  items: EditorItem[]; onChange: (next: EditorItem[]) => void; currency: string; disabled?: boolean
}) {
  const update = (idx: number, patch: Partial<EditorItem>) => onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  return (
    <div className="space-y-2">
      <Label>Item Penawaran</Label>
      {items.map((it, idx) => (
        <div key={idx} className="rounded-lg border border-slate-200 bg-slate-50/50 p-2.5">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Deskripsi layanan…"
              value={it.description}
              disabled={disabled}
              onChange={(e) => update(idx, { description: e.target.value })}
              className="h-8 flex-1 bg-white text-sm"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled || items.length <= 1}
              onClick={() => onChange(items.filter((_, i) => i !== idx))}
              className="h-8 w-8 shrink-0 text-slate-400 hover:text-rose-600"
              title="Hapus item"
              aria-label="Hapus item"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Input
              type="number" min={0} step="any" placeholder="Qty" aria-label="Qty"
              value={it.qty} disabled={disabled}
              onChange={(e) => update(idx, { qty: e.target.value })}
              className="h-8 w-20 bg-white text-sm"
            />
            <span className="text-xs text-slate-400">×</span>
            <Input
              type="number" min={0} step="any" placeholder="Harga satuan" aria-label="Harga satuan"
              value={it.unitPrice} disabled={disabled}
              onChange={(e) => update(idx, { unitPrice: e.target.value })}
              className="h-8 min-w-0 flex-1 bg-white text-sm"
            />
            <span className="w-28 shrink-0 text-right text-xs font-semibold text-slate-700">
              {formatMoney(Math.round(toNum(it.qty) * toNum(it.unitPrice)), currency, true)}
            </span>
          </div>
        </div>
      ))}
      <Button
        type="button" variant="outline" size="sm" disabled={disabled}
        onClick={() => onChange([...items, emptyItem()])} className="gap-1.5"
      >
        <Plus className="h-3.5 w-3.5" /> Tambah Item
      </Button>
    </div>
  )
}

/** Blok total live (dialog create/edit) */
function TotalsPreview({ totals, currency }: { totals: ReturnType<typeof computeTotals>; currency: string }) {
  return (
    <div className="ml-auto w-full max-w-[260px] space-y-1.5 rounded-xl bg-slate-50 p-3 text-sm">
      <div className="flex items-center justify-between gap-4">
        <span className="text-slate-500">Subtotal</span>
        <span className="font-medium text-slate-800">{formatMoney(totals.subtotal, currency)}</span>
      </div>
      {totals.discountPct > 0 && (
        <div className="flex items-center justify-between gap-4 text-amber-700">
          <span>Diskon ({totals.discountPct}%)</span>
          <span className="font-medium">-{formatMoney(totals.discountAmount, currency)}</span>
        </div>
      )}
      <div className="flex items-center justify-between gap-4">
        <span className="text-slate-500">PPN ({totals.taxPct}%)</span>
        <span className="font-medium text-slate-800">+{formatMoney(totals.taxAmount, currency)}</span>
      </div>
      <Separator className="bg-slate-200" />
      <div className="flex items-center justify-between gap-4">
        <span className="font-semibold text-slate-900">TOTAL</span>
        <span className="text-base font-bold text-slate-900">{formatMoney(totals.total, currency)}</span>
      </div>
    </div>
  )
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5">
      <span className="text-slate-400">{label}:</span>
      <span className="font-medium text-slate-600">{value}</span>
    </div>
  )
}

/* ================= Diskusi Client (thread komentar penawaran — R11) ================= */

/** Bubble komentar: staff kiri (putih), client kanan (teal agar mudah dibedakan staff) */
function CommentBubble({ c }: { c: PortalCommentDTO }) {
  return (
    <div className={cn('flex w-full', c.isClient ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-sm',
          c.isClient
            ? 'rounded-br-md bg-teal-600 text-white'
            : 'rounded-bl-md border border-slate-200 bg-white text-slate-800',
        )}
      >
        <p className={cn('text-[11px] font-semibold', c.isClient ? 'text-white/80' : 'text-slate-500')}>
          {c.userName} · {ROLE_LABEL[c.userRole] ?? c.userRole}
        </p>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">{c.body}</p>
        <p className={cn('mt-1 text-right text-[10px]', c.isClient ? 'text-white/60' : 'text-slate-400')}>
          {formatDate(c.createdAt, true)}
        </p>
      </div>
    </div>
  )
}

/** Seksi diskusi client di dialog detail penawaran — staff dapat membalas (identitas di-set server dari session) */
function DiscussionSection({ quotationId }: { quotationId: string }) {
  const { toast } = useToast()
  const [comments, setComments] = useState<PortalCommentDTO[] | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const listRef = React.useRef<HTMLDivElement>(null)

  const loadComments = React.useCallback(async () => {
    try {
      const list = await portalApi.comments('QUOTATION', quotationId)
      setComments(list)
      requestAnimationFrame(() => {
        const el = listRef.current
        if (el) el.scrollTop = el.scrollHeight
      })
    } catch (e) {
      toast({ variant: 'destructive', title: 'Gagal memuat diskusi', description: errMsg(e) })
      setComments([])
    }
  }, [quotationId, toast])

  React.useEffect(() => { void loadComments() }, [loadComments])

  const send = async () => {
    const body = draft.trim()
    if (!body || sending || body.length > MAX_COMMENT_LEN) return
    setSending(true)
    try {
      const created = await portalApi.addComment({ entityType: 'QUOTATION', entityId: quotationId, body })
      setComments((prev) => [...(prev ?? []), created])
      setDraft('')
      toast({ title: 'Balasan terkirim' })
    } catch (e) {
      toast({ variant: 'destructive', title: 'Gagal mengirim balasan', description: errMsg(e) })
    } finally {
      setSending(false)
    }
  }

  const canSend = draft.trim().length > 0 && draft.length <= MAX_COMMENT_LEN && !sending

  return (
    <section aria-label="Diskusi client" className="overflow-hidden rounded-xl border border-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
            <MessageSquare className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-sm font-semibold text-slate-900">Diskusi Client</h3>
        </div>
        {comments && comments.length > 0 && (
          <span className="inline-flex shrink-0 items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
            {comments.length} pesan
          </span>
        )}
      </div>

      {/* Daftar pesan */}
      <div ref={listRef} className={cn('max-h-64 space-y-3 overflow-y-auto bg-slate-50/60 px-4 py-3', SCROLLBAR)}>
        {comments === null ? (
          <div className="space-y-3 py-1">
            <Skeleton className="h-12 w-3/4 rounded-2xl" />
            <Skeleton className="ml-auto h-10 w-1/2 rounded-2xl" />
            <Skeleton className="h-12 w-2/3 rounded-2xl" />
          </div>
        ) : comments.length === 0 ? (
          <div className="py-6 text-center">
            <MessageSquare className="mx-auto h-5 w-5 text-slate-300" />
            <p className="mt-1.5 text-xs font-medium text-slate-500">Belum ada pesan dari client</p>
            <p className="mt-0.5 text-[11px] text-slate-400">Pertanyaan client tentang penawaran ini akan tampil di sini.</p>
          </div>
        ) : (
          comments.map((c) => <CommentBubble key={c.id} c={c} />)
        )}
      </div>

      {/* Input balasan */}
      <div className="border-t border-slate-100 bg-white px-4 py-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault()
                if (canSend) void send()
              }
            }}
            placeholder="Tulis balasan untuk client…"
            aria-label="Tulis balasan"
            rows={1}
            className="max-h-24 min-h-[2.5rem] resize-none"
          />
          <Button
            onClick={() => void send()}
            disabled={!canSend}
            className="h-10 shrink-0 gap-1.5 bg-slate-900 text-white hover:bg-slate-800"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Kirim
          </Button>
        </div>
        {draft.length > 1800 && (
          <p className={cn('mt-1 text-right text-[10px]', draft.length > MAX_COMMENT_LEN ? 'font-semibold text-rose-600' : 'text-slate-400')}>
            {draft.length}/{MAX_COMMENT_LEN}
          </p>
        )}
      </div>
    </section>
  )
}

/* ================= Main view ================= */

export default function QuotationsView() {
  const { user, brands } = useCrmStore()
  const { toast } = useToast()

  /* ----- list state ----- */
  const [quotations, setQuotations] = useState<QuotationDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [brandFilter, setBrandFilter] = useState('ALL')

  /* ----- detail dialog state ----- */
  const [detailOpen, setDetailOpen] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detail, setDetail] = useState<QuotationDetailDTO | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  /* ----- edit form state ----- */
  const [editTitle, setEditTitle] = useState('')
  const [editItems, setEditItems] = useState<EditorItem[]>([emptyItem()])
  const [editDiscountPct, setEditDiscountPct] = useState('0')
  const [editTaxPct, setEditTaxPct] = useState('11')
  const [editValidUntil, setEditValidUntil] = useState('')
  const [editNotes, setEditNotes] = useState('')

  /* ----- create dialog state ----- */
  const [createOpen, setCreateOpen] = useState(false)
  const [opps, setOpps] = useState<OpportunityDTO[]>([])
  const [oppsLoading, setOppsLoading] = useState(false)
  const [oppId, setOppId] = useState('NONE')
  const [newTitle, setNewTitle] = useState('')
  const [newItems, setNewItems] = useState<EditorItem[]>([emptyItem()])
  const [newDiscountPct, setNewDiscountPct] = useState('0')
  const [newTaxPct, setNewTaxPct] = useState('11')
  const [newValidUntil, setNewValidUntil] = useState(defaultValidUntil())
  const [newNotes, setNewNotes] = useState('')

  /* ----- bridge penolakan → lost reason (R12) -----
     Alur: quotation REJECTED + opportunity-nya belum LOST/WON → strip aksi "Tandai Lost Reason"
     → dialog alasan lost → changeStage(LOST) → opportunity tersimpan + audit STAGE_CHANGE. */
  const [lostTarget, setLostTarget] = useState<QuotationDTO | null>(null)
  const [lostReason, setLostReason] = useState('')
  const [lostNotes, setLostNotes] = useState('')
  const [lostCompetitor, setLostCompetitor] = useState('')
  const [lostReactivation, setLostReactivation] = useState('')
  const [lostSaving, setLostSaving] = useState(false)
  /** opportunityId → lostReason (utk chip "Opportunity LOST · {alasan}"); stage live diambil dari q.opportunityStage */
  const [oppLostReasons, setOppLostReasons] = useState<Record<string, string | null>>({})

  /* ----- role helpers ----- */
  const role = user?.role
  const canCreate = !!role && role !== 'KEUANGAN'
  const canExport = !!role && role !== 'PRODUKSI'
  const canSend = role === 'MARKETING' || role === 'SUPER_ADMIN' || role === 'DIREKTUR'
  const canEdit = canSend
  const canApprove = role === 'DIREKTUR' || role === 'SUPER_ADMIN'
  const canInvoice = !!role && role !== 'PRODUKSI'

  /* ----- loaders ----- */
  const reload = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const data = await financeApi.quotations()
      setQuotations(data)
      setError(null)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => { void reload() }, [reload])

  /* ----- lazy fetch opportunities utk alasan lost (hanya bila ada quotation REJECTED) ----- */
  const rejectedSig = useMemo(
    () => quotations
      .filter((q) => q.status === 'REJECTED' && q.opportunityId)
      .map((q) => `${q.opportunityId}:${q.opportunityStage}`)
      .sort()
      .join('|'),
    [quotations],
  )

  useEffect(() => {
    if (!rejectedSig) return
    let cancelled = false
    crmApi.opportunities()
      .then((list) => {
        if (cancelled) return
        const wanted = new Set(rejectedSig.split('|').map((s) => s.split(':')[0]))
        const map: Record<string, string | null> = {}
        for (const o of list) if (wanted.has(o.id)) map[o.id] = o.lostReason ?? null
        setOppLostReasons(map)
      })
      .catch(() => { /* senyap — chip tampil tanpa alasan bila fetch gagal */ })
    return () => { cancelled = true }
  }, [rejectedSig])

  const loadDetail = useCallback(async (id: string, silent = false) => {
    if (!silent) setDetailLoading(true)
    try {
      const d = await financeApi.quotation(id)
      setDetail(d)
      setDetailError(null)
    } catch (e) {
      setDetailError(errMsg(e))
    } finally {
      if (!silent) setDetailLoading(false)
    }
  }, [])

  const openDetail = useCallback((id: string) => {
    setDetail(null)
    setDetailError(null)
    setDetailId(id)
    setDetailOpen(true)
    void loadDetail(id)
  }, [loadDetail])

  /* ----- derived data ----- */
  const sentList = useMemo(() => quotations.filter((q) => q.status === 'SENT'), [quotations])
  const acceptedList = useMemo(() => quotations.filter((q) => q.status === 'ACCEPTED'), [quotations])
  const discountPendingCount = useMemo(
    () => sentList.filter((q) => q.discountPct > 0 && !q.discountApprovedById).length,
    [sentList],
  )
  const sumOf = (list: QuotationDTO[]) => list.reduce((s, q) => s + q.total, 0)

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase()
    return quotations.filter((item) => {
      if (statusFilter !== 'ALL' && item.status !== statusFilter) return false
      if (brandFilter !== 'ALL' && item.brandId !== brandFilter) return false
      if (!kw) return true
      return [item.code, item.title, item.companyName, item.opportunityCode]
        .some((f) => f?.toLowerCase().includes(kw))
    })
  }, [quotations, search, statusFilter, brandFilter])

  const resetFilters = () => { setSearch(''); setStatusFilter('ALL'); setBrandFilter('ALL') }

  /* ----- detail actions ----- */
  const handleStatus = async (q: QuotationDetailDTO, next: Extract<QuotationStatus, 'SENT' | 'ACCEPTED' | 'REJECTED'>) => {
    setBusy(next)
    try {
      await financeApi.changeQuotationStatus(q.id, next)
      if (next === 'SENT') toast({ title: 'Penawaran terkirim ke client', description: `${q.code} kini berstatus Terkirim — menunggu keputusan client.` })
      if (next === 'ACCEPTED') toast({ title: 'Client menerima penawaran', description: `${q.code} disetujui — nilai opportunity diperbarui otomatis oleh sistem.` })
      if (next === 'REJECTED') toast({ title: 'Client menolak penawaran', description: `${q.code} ditandai Ditolak — evaluasi tawaran sebelum revisi berikutnya.` })
      await Promise.all([loadDetail(q.id, true), reload(true)])
    } catch (e) {
      toast({ variant: 'destructive', title: 'Gagal mengubah status penawaran', description: errMsg(e) })
    } finally {
      setBusy(null)
    }
  }

  const handleApproveDiscount = async (q: QuotationDetailDTO) => {
    setBusy('approve')
    try {
      await financeApi.approveDiscount(q.id)
      toast({
        title: 'Diskon disetujui — tercatat di audit log',
        description: `Diskon ${q.discountPct}% pada ${q.code} disetujui oleh ${user?.name ?? 'Direktur'}.`,
      })
      await Promise.all([loadDetail(q.id, true), reload(true)])
    } catch (e) {
      toast({ variant: 'destructive', title: 'Gagal menyetujui diskon', description: errMsg(e) })
    } finally {
      setBusy(null)
    }
  }

  const handleDeleteQuotation = async (q: QuotationDetailDTO) => {
    setBusy('delete')
    try {
      await financeApi.deleteQuotation(q.id)
      toast({ title: 'Penawaran draft dihapus', description: `${q.code} — ${q.title} telah dihapus dan tercatat di audit log.` })
      setDetail(null)
      setDetailOpen(false)
      reload(true)
    } catch (e) {
      toast({ variant: 'destructive', title: 'Gagal menghapus penawaran', description: errMsg(e) })
    } finally {
      setBusy(null)
    }
  }

  const handleCreateInvoice = async (q: QuotationDetailDTO) => {
    setBusy('invoice')
    try {
      const inv = await financeApi.createInvoice({
        opportunityId: q.opportunityId,
        quotationId: q.id,
        title: `${q.title} — Invoice`,
        amount: q.total,
        taxPct: 0,
        notes: `Dari ${q.code}`,
      })
      toast({
        title: `Invoice ${inv.code} dibuat — lanjut ke modul Finance`,
        description: `Nilai ${formatMoney(inv.total, inv.currency, true)} untuk ${q.companyName}.`,
      })
      await Promise.all([loadDetail(q.id, true), reload(true)])
    } catch (e) {
      toast({ variant: 'destructive', title: 'Gagal membuat invoice', description: errMsg(e) })
    } finally {
      setBusy(null)
    }
  }

  /* ----- edit dialog ----- */
  const openEdit = () => {
    if (!detail) return
    setEditTitle(detail.title)
    setEditItems(
      detail.items.length
        ? detail.items.map((it) => ({ description: it.description, qty: String(it.qty), unitPrice: String(it.unitPrice) }))
        : [emptyItem()],
    )
    setEditDiscountPct(String(detail.discountPct))
    setEditTaxPct(String(detail.taxPct))
    setEditValidUntil(detail.validUntil ? detail.validUntil.slice(0, 10) : '')
    setEditNotes(detail.notes ?? '')
    setEditOpen(true)
  }

  const submitEdit = async () => {
    if (!detail) return
    const clean = editItems.map((it) => ({ description: it.description.trim(), qty: toNum(it.qty), unitPrice: toNum(it.unitPrice) }))
    if (clean.some((it) => !it.description || it.qty <= 0)) {
      toast({ variant: 'destructive', title: 'Item belum lengkap', description: 'Setiap item wajib punya deskripsi dan qty lebih dari 0.' })
      return
    }
    const totals = computeTotals(editItems, editDiscountPct, editTaxPct)
    setBusy('edit')
    try {
      const saved = await financeApi.updateQuotation(detail.id, {
        title: editTitle.trim() || undefined,
        items: clean,
        discountPct: totals.discountPct,
        taxPct: totals.taxPct,
        validUntil: editValidUntil || null,
        notes: editNotes.trim() || undefined,
      })
      setDetail(saved)
      setEditOpen(false)
      toast({
        title: `Penawaran ${saved.code} disimpan`,
        description: saved.version > detail.version ? `Mengubah penawaran terkirim menaikkan versi otomatis ke v${saved.version}.` : 'Perubahan penawaran tersimpan.',
      })
      await reload(true)
    } catch (e) {
      toast({ variant: 'destructive', title: 'Gagal menyimpan penawaran', description: errMsg(e) })
    } finally {
      setBusy(null)
    }
  }

  /* ----- create dialog ----- */
  const openCreate = useCallback(async () => {
    setCreateOpen(true)
    setOppId('NONE')
    setNewTitle('')
    setNewItems([emptyItem()])
    setNewDiscountPct('0')
    setNewTaxPct('11')
    setNewValidUntil(defaultValidUntil())
    setNewNotes('')
    setOppsLoading(true)
    try {
      const data = await crmApi.opportunities()
      setOpps(data.filter((o) => CREATE_STAGES.has(o.stage)))
    } catch (e) {
      toast({ variant: 'destructive', title: 'Gagal memuat daftar opportunity', description: errMsg(e) })
      setOpps([])
    } finally {
      setOppsLoading(false)
    }
  }, [toast])

  const handleSelectOpp = (id: string) => {
    setOppId(id)
    const opp = opps.find((o) => o.id === id)
    if (opp) {
      setNewTitle(`${opp.title} — Penawaran`)
      setNewItems([{
        description: opp.serviceName || 'Layanan utama',
        qty: '1',
        unitPrice: String(opp.estimatedValue > 0 ? opp.estimatedValue : 0),
      }])
    }
  }

  const submitCreate = async () => {
    if (oppId === 'NONE') {
      toast({ variant: 'destructive', title: 'Opportunity belum dipilih', description: 'Pilih opportunity sumber untuk penawaran ini.' })
      return
    }
    const clean = newItems.map((it) => ({ description: it.description.trim(), qty: toNum(it.qty), unitPrice: toNum(it.unitPrice) }))
    if (clean.some((it) => !it.description || it.qty <= 0)) {
      toast({ variant: 'destructive', title: 'Item belum lengkap', description: 'Setiap item wajib punya deskripsi dan qty lebih dari 0.' })
      return
    }
    const totals = computeTotals(newItems, newDiscountPct, newTaxPct)
    setBusy('create')
    try {
      const created = await financeApi.createQuotation({
        opportunityId: oppId,
        title: newTitle.trim() || undefined,
        items: clean,
        discountPct: totals.discountPct,
        taxPct: totals.taxPct,
        validUntil: newValidUntil || undefined,
        notes: newNotes.trim() || undefined,
      })
      toast({ title: `Penawaran ${created.code} dibuat`, description: 'Status Draft — kirim ke client saat sudah siap.' })
      setCreateOpen(false)
      await reload(true)
    } catch (e) {
      toast({ variant: 'destructive', title: 'Gagal membuat penawaran', description: errMsg(e) })
    } finally {
      setBusy(null)
    }
  }

  const selectedOpp = opps.find((o) => o.id === oppId) ?? null
  const createCurrency = selectedOpp?.currency ?? 'IDR'
  const editCurrency = detail?.currency ?? 'IDR'

  /* ----- bridge penolakan → lost (R12) ----- */
  /** REJECTED quotation → 'action' (opp belum LOST/WON) | 'lost' (opp sudah LOST) | null (selain itu) */
  const bridgeFor = (q: QuotationDTO): 'action' | 'lost' | null => {
    if (q.status !== 'REJECTED' || !q.opportunityId) return null
    if (q.opportunityStage === 'LOST') return 'lost'
    if (q.opportunityStage === 'WON') return null
    return 'action'
  }

  const openLostBridge = (q: QuotationDTO) => {
    setLostReason(''); setLostNotes(''); setLostCompetitor(''); setLostReactivation('')
    setLostTarget(q)
  }

  const submitLostBridge = async () => {
    if (!lostTarget || !lostReason) return
    const target = lostTarget
    const chosenReason = lostReason
    setLostSaving(true)
    try {
      await crmApi.changeStage(target.opportunityId, {
        stage: 'LOST',
        lostReason: chosenReason,
        ...(lostNotes.trim() ? { lostNotes: lostNotes.trim() } : {}),
        ...(lostCompetitor.trim() ? { competitorName: lostCompetitor.trim() } : {}),
        ...(lostReactivation ? { reactivation: lostReactivation } : {}),
      })
      setLostTarget(null)
      setLostReason(''); setLostNotes(''); setLostCompetitor(''); setLostReactivation('')
      toast({
        title: `Opportunity ditandai LOST — alasan: ${lostReasonLabel(chosenReason)}`,
        description: `${target.opportunityCode} diperbarui dari penolakan ${target.code} — alasan lost tercatat untuk analitik funnel.`,
      })
      await reload(true)
    } catch (e) {
      toast({ variant: 'destructive', title: 'Gagal menandai opportunity lost', description: errMsg(e) })
    } finally {
      setLostSaving(false)
    }
  }

  /* ================= export excel ================= */
  const handleExportExcel = () => {
    const stamp = new Date().toISOString().slice(0, 10)
    exportExcel(`penawaran-${stamp}.xlsx`, [
      {
        name: 'Quotations',
        rows: [
          ['Kode', 'Judul', 'Perusahaan', 'Brand', 'Status', 'Subtotal', 'Diskon %', 'Pajak %', 'Total', 'Berlaku Sampai', 'Dibuat'],
          ...filtered.map((q) => [
            q.code,
            q.title,
            q.companyName,
            q.brandName,
            STATUS_META[q.status]?.label ?? q.status,
            q.subtotal,
            q.discountPct,
            q.taxPct,
            q.total,
            q.validUntil ? formatDate(q.validUntil) : '—',
            formatDate(q.createdAt),
          ]),
        ],
      },
    ])
    toast({
      title: 'Export Excel berhasil',
      description: `penawaran-${stamp}.xlsx · sheet Quotations · ${filtered.length} penawaran`,
    })
  }

  /* ================= render ================= */
  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Header */}
      <SectionHeader
        title="Quotations"
        description="Penawaran resmi per brand — numbering otomatis QUO-YYYY-####, versioning, dan approval diskon Direktur"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <RefreshButton onClick={() => void reload()} loading={loading} />
            {canExport && (
              <Button
                variant="outline"
                onClick={() => downloadCsv(
                  `quotations-${new Date().toISOString().slice(0, 10)}.csv`,
                  ['Kode', 'Judul', 'Perusahaan', 'Brand', 'Status', 'Versi', 'Subtotal', 'Diskon %', 'PPN %', 'Total', 'Currency', 'Valid Until', 'Dibuat'],
                  filtered.map((q) => [q.code, q.title, q.companyName, q.brandName, q.status, q.version, q.subtotal, q.discountPct, q.taxPct, q.total, q.currency, q.validUntil ?? '', q.createdAt]),
                )}
                className="gap-1.5"
              >
                <Download className="h-4 w-4" /> Export CSV
              </Button>
            )}
            {canExport && (
              <Button
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={handleExportExcel}
                className="h-9 gap-1.5"
              >
                <FileSpreadsheet className="h-4 w-4" /> Export Excel
              </Button>
            )}
            {canCreate && (
              <Button onClick={() => void openCreate()} className="gap-1.5 bg-slate-900 text-white hover:bg-slate-800">
                <Plus className="h-4 w-4" /> Buat Penawaran
              </Button>
            )}
          </div>
        }
      />

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Gagal memuat penawaran</AlertTitle>
          <AlertDescription>
            <p>{error}</p>
            <Button size="sm" variant="outline" className="mt-1" onClick={() => void reload()}>Coba lagi</Button>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {/* KPI mini-row */}
          {loading ? (
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[76px] rounded-xl" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              <KpiCard
                label="Nilai Terkirim"
                value={formatMoney(sumOf(sentList), dominantCurrency(sentList), true)}
                sub={`${sentList.length} penawaran berstatus terkirim`}
                icon={Send}
                tone="bg-teal-50 text-teal-700"
              />
              <KpiCard
                label="Nilai Disetujui"
                value={formatMoney(sumOf(acceptedList), dominantCurrency(acceptedList), true)}
                sub={`${acceptedList.length} penawaran diterima client`}
                icon={CheckCircle2}
                tone="bg-emerald-50 text-emerald-700"
              />
              <KpiCard
                label="Menunggu Keputusan"
                value={String(sentList.length)}
                sub="penawaran menunggu balasan client"
                icon={Clock}
                tone="bg-amber-50 text-amber-700"
              />
              <KpiCard
                label="Menunggu Approval Diskon"
                value={String(discountPendingCount)}
                sub="diskon > 0 belum disetujui Direktur"
                icon={BadgeCheck}
                tone="bg-orange-50 text-orange-700"
                ring={discountPendingCount > 0}
              />
            </div>
          )}

          {/* Toolbar */}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative flex-1 sm:min-w-[220px] sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari kode, judul, perusahaan…"
                aria-label="Cari penawaran"
                className="pl-8"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[160px]" aria-label="Filter status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Status</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="SENT">Terkirim</SelectItem>
                <SelectItem value="ACCEPTED">Disetujui</SelectItem>
                <SelectItem value="REJECTED">Ditolak</SelectItem>
                <SelectItem value="EXPIRED">Kedaluwarsa</SelectItem>
              </SelectContent>
            </Select>
            <Select value={brandFilter} onValueChange={setBrandFilter}>
              <SelectTrigger className="w-full sm:w-[170px]" aria-label="Filter brand">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Brand</SelectItem>
                {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <RefreshButton onClick={() => void reload()} loading={loading} />
          </div>

          {/* List */}
          {loading ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
            </div>
          ) : quotations.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-6 w-6" />}
              title="Belum ada penawaran"
              description="Buat penawaran resmi dari opportunity yang sudah masuk tahap estimasi — numbering, versi, dan approval diskon dikelola otomatis."
              action={canCreate ? (
                <Button onClick={() => void openCreate()} className="gap-1.5 bg-slate-900 text-white hover:bg-slate-800">
                  <Plus className="h-4 w-4" /> Buat penawaran pertama
                </Button>
              ) : undefined}
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Search className="h-6 w-6" />}
              title="Tidak ada penawaran sesuai filter"
              description="Coba ubah kata kunci pencarian atau reset filter status dan brand."
              action={<Button variant="outline" size="sm" onClick={resetFilters}>Reset filter</Button>}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {filtered.map((q) => {
                const kind = bridgeFor(q)
                return (
                  <QuotationCard
                    key={q.id}
                    q={q}
                    onOpen={() => openDetail(q.id)}
                    lostBridge={
                      kind === 'action'
                        ? { kind: 'action' }
                        : kind === 'lost'
                          ? { kind: 'lost', reasonLabel: lostReasonLabel(oppLostReasons[q.opportunityId] ?? null) }
                          : undefined
                    }
                    onLostAction={kind === 'action' ? () => openLostBridge(q) : undefined}
                  />
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ================= Detail Dialog ================= */}
      <Dialog
        open={detailOpen}
        onOpenChange={(o) => { setDetailOpen(o); if (!o) { setDetail(null); setDetailError(null); setDetailId(null); setEditOpen(false) } }}
      >
        <DialogContent className={cn('max-h-[90vh] max-w-2xl overflow-y-auto', SCROLLBAR)} onInteractOutside={(e) => { if (printOpen) e.preventDefault() }}>
          <DialogHeader className="text-left">
            <div className="flex flex-wrap items-center gap-2">
              {detail && <span className="font-mono text-xs text-slate-400">{detail.code}</span>}
              {detail && detail.version > 1 && <VersionChip version={detail.version} />}
              {detail && <StatusBadge status={detail.status} />}
            </div>
            <DialogTitle className="text-left text-base leading-snug">
              {detail?.title ?? 'Memuat penawaran…'}
            </DialogTitle>
            <DialogDescription className="text-left">
              {detail ? `${detail.companyName} · ${detail.opportunityCode}` : 'Mengambil detail dari server…'}
            </DialogDescription>
            {detail && <div className="mt-0.5"><BrandChip name={detail.brandName} color={detail.brandColor} size="xs" /></div>}
          </DialogHeader>

          {detailLoading && (
            <div className="space-y-3">
              <Skeleton className="h-8 w-full rounded-lg" />
              <Skeleton className="h-8 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-16 w-2/3 rounded-lg" />
            </div>
          )}

          {detailError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Gagal memuat detail penawaran</AlertTitle>
              <AlertDescription>
                <p>{detailError}</p>
                <Button size="sm" variant="outline" className="mt-1" onClick={() => detailId && void loadDetail(detailId)}>Coba lagi</Button>
              </AlertDescription>
            </Alert>
          )}

          {detail && (
            <div className="space-y-4">
              {/* Line items */}
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className={cn('max-h-64 overflow-y-auto', SCROLLBAR)}>
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead>Deskripsi</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Harga Satuan</TableHead>
                        <TableHead className="text-right">Jumlah</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.items.map((it) => (
                        <TableRow key={it.id}>
                          <TableCell className="max-w-[240px] font-medium text-slate-700">{it.description}</TableCell>
                          <TableCell className="text-right text-slate-600">{it.qty}</TableCell>
                          <TableCell className="text-right text-slate-600">{formatMoney(it.unitPrice, detail.currency)}</TableCell>
                          <TableCell className="text-right font-semibold text-slate-800">{formatMoney(it.lineTotal, detail.currency)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Totals */}
              <div className="ml-auto w-full max-w-[280px] space-y-1.5 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="font-medium text-slate-800">{formatMoney(detail.subtotal, detail.currency)}</span>
                </div>
                {detail.discountPct > 0 && (
                  <div className="flex items-center justify-between gap-4 text-amber-700">
                    <span>Diskon ({detail.discountPct}%)</span>
                    <span className="font-medium">-{formatMoney(detail.discountAmount, detail.currency)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">PPN ({detail.taxPct}%)</span>
                  <span className="font-medium text-slate-800">+{formatMoney(detail.taxAmount, detail.currency)}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between gap-4">
                  <span className="font-semibold text-slate-900">TOTAL</span>
                  <span className="text-lg font-bold text-slate-900">{formatMoney(detail.total, detail.currency)}</span>
                </div>
              </div>

              {/* Validity + notes */}
              <div className="space-y-2 text-xs">
                <p className={cn(
                  (daysUntil(detail.validUntil) ?? 1) < 0 && detail.status === 'SENT' ? 'font-semibold text-rose-600' : 'text-slate-500',
                )}>
                  Berlaku s.d. {formatDate(detail.validUntil)}
                </p>
                {detail.notes && (
                  <div className="rounded-lg bg-slate-50 p-2.5">
                    <p className="font-medium text-slate-500">Catatan</p>
                    <p className="mt-0.5 whitespace-pre-wrap text-slate-600">{detail.notes}</p>
                  </div>
                )}
              </div>

              {/* Audit-ish info */}
              <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 rounded-xl bg-slate-50 p-3 text-xs sm:grid-cols-2">
                <InfoLine label="Dibuat oleh" value={`${detail.createdByName ?? '—'} · ${formatDate(detail.createdAt)}`} />
                <InfoLine label="Dikirim" value={detail.sentAt ? formatDate(detail.sentAt, true) : '—'} />
                <InfoLine label="Keputusan client" value={detail.decidedAt ? formatDate(detail.decidedAt, true) : '—'} />
                <InfoLine
                  label="Approval diskon"
                  value={detail.discountApprovedByName ? `${detail.discountApprovedByName} · ${formatDate(detail.discountApprovedAt)}` : '—'}
                />
              </div>
            </div>
          )}

          {/* Diskusi Client (thread komentar — R11) */}
          {detail && <DiscussionSection quotationId={detail.id} />}

          {/* Action bar (role-aware) */}
          {detail && (
            <DialogFooter className="flex-row flex-wrap gap-2 border-t border-slate-100 pt-3 sm:justify-end">
              <Button
                variant="outline"
                onClick={() => setPrintOpen(true)}
                disabled={busy !== null}
                className="gap-1.5"
              >
                <Printer className="h-4 w-4" /> Cetak / PDF
              </Button>
              {detail.status === 'DRAFT' && canSend && (
                <>
                  <Button
                    onClick={() => void handleStatus(detail, 'SENT')}
                    disabled={busy !== null}
                    className="gap-1.5 bg-slate-900 text-white hover:bg-slate-800"
                  >
                    {busy === 'SENT' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Kirim Penawaran
                  </Button>
                  <Button variant="ghost" onClick={openEdit} disabled={busy !== null} className="gap-1.5">
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => void handleDeleteQuotation(detail)}
                    disabled={busy !== null}
                    className="gap-1.5 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                  >
                    {busy === 'delete' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Hapus
                  </Button>
                </>
              )}

              {detail.status === 'SENT' && canEdit && (
                <Button variant="ghost" onClick={openEdit} disabled={busy !== null} className="gap-1.5">
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
              )}

              {detail.status === 'SENT' && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => void handleStatus(detail, 'ACCEPTED')}
                    disabled={busy !== null}
                    className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                  >
                    {busy === 'ACCEPTED' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Client Menerima
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void handleStatus(detail, 'REJECTED')}
                    disabled={busy !== null}
                    className="gap-1.5 border-rose-300 text-rose-700 hover:bg-rose-50"
                  >
                    {busy === 'REJECTED' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                    Client Menolak
                  </Button>
                </>
              )}

              {detail.status === 'SENT' && detail.discountPct > 0 && !detail.discountApprovedById && canApprove && (
                <Button
                  onClick={() => void handleApproveDiscount(detail)}
                  disabled={busy !== null}
                  className="gap-1.5 bg-amber-500 text-white transition-colors hover:bg-emerald-600"
                >
                  {busy === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
                  Setujui Diskon {detail.discountPct}%
                </Button>
              )}

              {detail.status === 'ACCEPTED' && canInvoice && (
                <Button onClick={() => void handleCreateInvoice(detail)} disabled={busy !== null} className="gap-1.5">
                  {busy === 'invoice' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  Buat Invoice
                </Button>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* ================= Print Overlay ================= */}
      {detail && (
        <PrintOverlay open={printOpen} docTitle={`${detail.code} — ${detail.title}`} onClose={() => setPrintOpen(false)}>
          <QuotationPrintBody q={detail} />
        </PrintOverlay>
      )}

      {/* ================= Edit Dialog ================= */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className={cn('max-h-[90vh] max-w-2xl overflow-y-auto', SCROLLBAR)}>
          <DialogHeader className="text-left">
            <DialogTitle className="text-left">Edit Penawaran</DialogTitle>
            <DialogDescription className="text-left">
              {detail?.code} — {detail?.status === 'SENT'
                ? 'Mengubah penawaran terkirim menaikkan versi otomatis.'
                : 'Perbarui judul, item, diskon, dan masa berlaku penawaran.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="quo-edit-title">Judul Penawaran</Label>
              <Input
                id="quo-edit-title"
                value={editTitle}
                disabled={busy !== null}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Judul penawaran"
              />
            </div>

            <ItemsEditor items={editItems} onChange={setEditItems} currency={editCurrency} disabled={busy !== null} />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="quo-edit-disc">Diskon (%)</Label>
                <Input
                  id="quo-edit-disc" type="number" min={0} max={100} step="any"
                  value={editDiscountPct} disabled={busy !== null}
                  onChange={(e) => setEditDiscountPct(e.target.value)}
                />
                <p className="text-[11px] text-amber-600">Diskon &gt; 0 memerlukan approval Direktur.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quo-edit-tax">PPN (%)</Label>
                <Input
                  id="quo-edit-tax" type="number" min={0} step="any"
                  value={editTaxPct} disabled={busy !== null}
                  onChange={(e) => setEditTaxPct(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="quo-edit-valid">Berlaku Hingga</Label>
              <Input
                id="quo-edit-valid" type="date"
                value={editValidUntil} disabled={busy !== null}
                onChange={(e) => setEditValidUntil(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="quo-edit-notes">Catatan</Label>
              <Textarea
                id="quo-edit-notes" rows={2}
                value={editNotes} disabled={busy !== null}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Catatan untuk client (opsional)"
              />
            </div>

            <TotalsPreview totals={computeTotals(editItems, editDiscountPct, editTaxPct)} currency={editCurrency} />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={busy !== null}>Batal</Button>
            <Button onClick={() => void submitEdit()} disabled={busy !== null} className="gap-1.5">
              {busy === 'edit' && <Loader2 className="h-4 w-4 animate-spin" />}
              Simpan Perubahan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================= Create Dialog ================= */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className={cn('max-h-[90vh] max-w-2xl overflow-y-auto', SCROLLBAR)}>
          <DialogHeader className="text-left">
            <DialogTitle className="text-left">Buat Penawaran</DialogTitle>
            <DialogDescription className="text-left">
              Pilih opportunity, susun item, dan atur diskon — numbering QUO-YYYY-#### dibuat otomatis per brand.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Opportunity</Label>
              {oppsLoading ? (
                <div className="flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> Memuat opportunity…
                </div>
              ) : opps.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                  Belum ada opportunity pada tahap layak penawaran (Discovery s.d. Verbal Agreement). Dorong lead lewat pipeline terlebih dahulu.
                </div>
              ) : (
                <Select value={oppId} onValueChange={handleSelectOpp}>
                  <SelectTrigger aria-label="Pilih opportunity">
                    <SelectValue placeholder="Pilih opportunity…" />
                  </SelectTrigger>
                  <SelectContent className={cn('max-h-64', SCROLLBAR)}>
                    <SelectItem value="NONE" disabled>Pilih opportunity…</SelectItem>
                    {opps.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.code} · {o.title} — {o.companyName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="quo-new-title">Judul Penawaran</Label>
              <Input
                id="quo-new-title"
                value={newTitle}
                disabled={busy !== null}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Otterisasi dari judul opportunity"
              />
            </div>

            <ItemsEditor items={newItems} onChange={setNewItems} currency={createCurrency} disabled={busy !== null} />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="quo-new-disc">Diskon (%)</Label>
                <Input
                  id="quo-new-disc" type="number" min={0} max={100} step="any"
                  value={newDiscountPct} disabled={busy !== null}
                  onChange={(e) => setNewDiscountPct(e.target.value)}
                />
                <p className="text-[11px] text-amber-600">Diskon &gt; 0 memerlukan approval Direktur.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quo-new-tax">PPN (%)</Label>
                <Input
                  id="quo-new-tax" type="number" min={0} step="any"
                  value={newTaxPct} disabled={busy !== null}
                  onChange={(e) => setNewTaxPct(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="quo-new-valid">Berlaku Hingga</Label>
              <Input
                id="quo-new-valid" type="date"
                value={newValidUntil} disabled={busy !== null}
                onChange={(e) => setNewValidUntil(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="quo-new-notes">Catatan</Label>
              <Textarea
                id="quo-new-notes" rows={2}
                value={newNotes} disabled={busy !== null}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Catatan untuk client (opsional)"
              />
            </div>

            <TotalsPreview totals={computeTotals(newItems, newDiscountPct, newTaxPct)} currency={createCurrency} />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={busy !== null}>Batal</Button>
            <Button onClick={() => void submitCreate()} disabled={busy !== null || oppsLoading} className="gap-1.5">
              {busy === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Buat Penawaran
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================= Dialog Lost Reason (bridge penolakan → LOST, R12) ================= */}
      <Dialog open={!!lostTarget} onOpenChange={(o) => { if (!o) setLostTarget(null) }}>
        <DialogContent className={cn('max-h-[85vh] overflow-y-auto sm:max-w-md', SCROLLBAR)}>
          <DialogHeader className="text-left">
            <DialogTitle className="text-left">Tandai Lost — {lostTarget?.title}</DialogTitle>
            <DialogDescription className="text-left">
              Penawaran {lostTarget?.code} ditolak client. Pilih alasan utama kenapa deal ini lost —
              tercatat di opportunity {lostTarget?.opportunityCode} untuk analitik funnel.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="quo-lost-reason">Alasan Lost *</Label>
              <Select value={lostReason || undefined} onValueChange={setLostReason}>
                <SelectTrigger id="quo-lost-reason" className="w-full">
                  <SelectValue placeholder="Pilih alasan lost *" />
                </SelectTrigger>
                <SelectContent>
                  {LOST_REASONS.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="quo-lost-notes">Catatan</Label>
              <Textarea
                id="quo-lost-notes"
                rows={3}
                value={lostNotes}
                onChange={(e) => setLostNotes(e.target.value)}
                placeholder="Catatan tambahan (opsional)…"
                className="min-h-[64px] resize-none text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="quo-lost-competitor">Nama Kompetitor</Label>
              <Input
                id="quo-lost-competitor"
                value={lostCompetitor}
                onChange={(e) => setLostCompetitor(e.target.value)}
                placeholder="Kompetitor (opsional)"
                className="text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="quo-lost-reactivation">Rencana reaktivasi</Label>
              <Select value={lostReactivation || 'none'} onValueChange={(v) => setLostReactivation(v === 'none' ? '' : v)}>
                <SelectTrigger id="quo-lost-reactivation" className="w-full">
                  <SelectValue placeholder="Rencana reaktivasi" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Tidak ada rencana —</SelectItem>
                  {REACTIVATION_OPTIONS.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {lostReactivation && (
                <p className="text-[11px] text-slate-400">{reactivationLabel(lostReactivation)}</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setLostTarget(null)} disabled={lostSaving}>Batal</Button>
            <Button
              onClick={() => void submitLostBridge()}
              disabled={!lostReason || lostSaving}
              className="gap-1.5 bg-rose-600 text-white hover:bg-rose-700"
            >
              {lostSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Simpan &amp; Tandai Lost
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
