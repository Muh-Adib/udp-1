/* ============ Client Portal — read-only per company (role CLIENT) ============ */
'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { portalApi } from './api-client'
import { useCrmStore } from './crm-store'
import { BrandChip, EmptyState, RefreshButton } from './shared'
import { daysUntil, formatDate, formatMoney, projectStatusMeta } from '@/lib/crm-constants'
import type {
  PortalCommentDTO, PortalCommentEntity, PortalDTO, PortalInvoiceDTO, PortalQuotationDTO,
  QuotationDetailDTO, InvoiceDTO,
} from '@/lib/crm-types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Textarea } from '@/components/ui/textarea'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { PrintOverlay, QuotationPrintBody, InvoicePrintBody } from './print-document'
import {
  Building2, CalendarClock, CheckCircle2, Circle, FileText, FolderKanban,
  Info, Loader2, Mail, MessageSquare, Phone, Printer, Send, Wallet, XCircle,
} from 'lucide-react'

const SCROLLBAR = '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300'
const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Terjadi kesalahan')

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

const QUO_STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Draft', cls: 'bg-slate-100 text-slate-600' },
  SENT: { label: 'Terkirim', cls: 'bg-amber-50 text-amber-700' },
  ACCEPTED: { label: 'Disetujui', cls: 'bg-emerald-50 text-emerald-700' },
  REJECTED: { label: 'Ditolak', cls: 'bg-rose-50 text-rose-700' },
  EXPIRED: { label: 'Kadaluarsa', cls: 'bg-slate-100 text-slate-500' },
}

const INV_STATUS: Record<string, { label: string; cls: string }> = {
  UNPAID: { label: 'Belum Dibayar', cls: 'bg-rose-50 text-rose-700' },
  PARTIAL: { label: 'Terbayar Sebagian', cls: 'bg-amber-50 text-amber-700' },
  PAID: { label: 'Lunas', cls: 'bg-emerald-50 text-emerald-700' },
  CANCELLED: { label: 'Dibatalkan', cls: 'bg-slate-100 text-slate-500' },
}

function StatusBadge({ meta }: { meta: { label: string; cls: string } }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold', meta.cls)}>
      {meta.label}
    </span>
  )
}

type Tone = 'default' | 'amber' | 'rose' | 'emerald'
const TONE_ICON: Record<Tone, string> = {
  default: 'bg-slate-100 text-slate-600',
  amber: 'bg-amber-100 text-amber-700',
  rose: 'bg-rose-100 text-rose-700',
  emerald: 'bg-emerald-100 text-emerald-700',
}

function KpiCard({ icon, label, value, hint, tone = 'default', valueClass }: {
  icon: React.ReactNode; label: string; value: string; hint: string
  tone?: Tone; valueClass?: string
}) {
  return (
    <Card className="rounded-xl border-slate-200 shadow-sm transition-shadow hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', TONE_ICON[tone])}>{icon}</div>
        </div>
        <p className={cn('mt-2 truncate text-xl font-bold tracking-tight text-slate-900', valueClass)}>{value}</p>
        <p className="mt-1 text-[11px] leading-snug text-slate-400">{hint}</p>
      </CardContent>
    </Card>
  )
}

/* ---------- Bubble komentar diskusi (client kanan, staff kiri) ---------- */
function CommentBubble({ c, clientSolid = false }: { c: PortalCommentDTO; clientSolid?: boolean }) {
  return (
    <div className={cn('flex w-full', c.isClient ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-sm',
          c.isClient
            ? clientSolid
              ? 'rounded-br-md bg-teal-600 text-white'
              : 'rounded-br-md bg-slate-900 text-white'
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

/* ---------- Chip "Diskusi" dgn badge jumlah komentar (+ indikator balasan staff, R12) ---------- */
function DiskusiChip({ count, staffReplied, onClick }: { count: number; staffReplied?: boolean; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      aria-label={`Buka diskusi (${count} pesan)${staffReplied ? ' — balasan baru dari tim' : ''}`}
      title={staffReplied ? 'Balasan baru dari tim' : `Diskusi (${count} pesan)`}
      className="relative h-8 shrink-0 gap-1.5 rounded-full px-2.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
    >
      {staffReplied && (
        <span aria-hidden className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white" />
      )}
      <MessageSquare className="h-3.5 w-3.5" />
      <span className="text-xs font-medium">Diskusi</span>
      {count > 0 && (
        <span className="ml-0.5 inline-flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-slate-900 px-1 text-[10px] font-bold text-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Button>
  )
}

/* ---------- Dialog thread diskusi per dokumen (quotation/invoice/project) ---------- */
function CommentThreadDialog({ entityType, entityId, title, open, onOpenChange, onCountChange }: {
  entityType: PortalCommentEntity
  entityId: string
  title: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCountChange?: (entityId: string, delta: number) => void
}) {
  const { toast } = useToast()
  const [comments, setComments] = useState<PortalCommentDTO[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const loadComments = useCallback(async () => {
    if (!entityId) return
    setLoading(true)
    try {
      setComments(await portalApi.comments(entityType, entityId))
    } catch (e) {
      toast({ variant: 'destructive', title: 'Gagal memuat diskusi', description: errMsg(e) })
      setComments([])
    } finally {
      setLoading(false)
    }
  }, [entityType, entityId, toast])

  useEffect(() => {
    if (open && entityId) {
      setComments(null)
      setDraft('')
      void loadComments()
    }
  }, [open, entityId, loadComments])

  /* Auto-scroll ke pesan terbaru saat daftar berubah */
  useEffect(() => {
    if (comments && comments.length > 0) {
      requestAnimationFrame(() => {
        const el = listRef.current
        if (el) el.scrollTop = el.scrollHeight
      })
    }
  }, [comments])

  const send = async () => {
    const body = draft.trim()
    if (!body || sending || body.length > MAX_COMMENT_LEN || !entityId) return
    setSending(true)
    try {
      const created = await portalApi.addComment({ entityType, entityId, body })
      setComments((prev) => [...(prev ?? []), created])
      setDraft('')
      onCountChange?.(entityId, 1)
      toast({ title: 'Pesan terkirim' })
    } catch (e) {
      toast({ variant: 'destructive', title: 'Gagal mengirim pesan', description: errMsg(e) })
    } finally {
      setSending(false)
    }
  }

  const canSend = draft.trim().length > 0 && draft.length <= MAX_COMMENT_LEN && !sending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[70vh] w-full max-w-lg flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-slate-100 py-4 pl-5 pr-12 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
              <MessageSquare className="h-3.5 w-3.5" />
            </span>
            Diskusi
          </DialogTitle>
          <DialogDescription className="truncate text-left">{title || 'Thread komentar dokumen'}</DialogDescription>
        </DialogHeader>

        {/* Daftar pesan */}
        <div ref={listRef} className={cn('flex-1 space-y-3 overflow-y-auto bg-slate-50/60 px-5 py-4', SCROLLBAR)}>
          {comments === null ? (
            <div className="space-y-3 py-1" aria-hidden>
              <Skeleton className="h-14 w-3/4 rounded-2xl" />
              <Skeleton className="ml-auto h-11 w-1/2 rounded-2xl" />
              <Skeleton className="h-14 w-2/3 rounded-2xl" />
            </div>
          ) : comments.length === 0 ? (
            <div className="flex h-full min-h-32 flex-col items-center justify-center py-8 text-center">
              <MessageSquare className="h-6 w-6 text-slate-300" />
              <p className="mt-2 text-sm font-medium text-slate-500">Belum ada diskusi</p>
              <p className="mt-1 text-xs text-slate-400">Mulai percakapan dengan tim kami di sini.</p>
            </div>
          ) : (
            comments.map((c) => <CommentBubble key={c.id} c={c} />)
          )}
        </div>

        {/* Input pesan */}
        <div className="border-t border-slate-100 px-5 py-3">
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
              placeholder="Tulis pesan…"
              aria-label="Tulis pesan diskusi"
              rows={1}
              className="max-h-24 min-h-[2.5rem] resize-none"
            />
            <Button
              size="icon"
              onClick={() => void send()}
              disabled={!canSend}
              aria-label="Kirim pesan"
              title="Kirim (Ctrl+Enter)"
              className="h-10 w-10 shrink-0 rounded-xl bg-slate-900 text-white hover:bg-slate-800"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          {draft.length > 1800 && (
            <p className={cn('mt-1 text-right text-[10px]', draft.length > MAX_COMMENT_LEN ? 'font-semibold text-rose-600' : 'text-slate-400')}>
              {draft.length}/{MAX_COMMENT_LEN}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function validUntilText(q: PortalQuotationDTO): { text: string; urgent: boolean } {
  if (!q.validUntil) return { text: 'Tanpa masa berlaku', urgent: false }
  const d = daysUntil(q.validUntil)
  if (d === null) return { text: `Berlaku hingga ${formatDate(q.validUntil)}`, urgent: false }
  if (d < 0) return { text: `Berlaku hingga ${formatDate(q.validUntil)} · masa berlaku lewat`, urgent: q.status === 'SENT' }
  if (d === 0) return { text: `Berlaku hingga ${formatDate(q.validUntil)} · berakhir hari ini`, urgent: true }
  return { text: `Berlaku hingga ${formatDate(q.validUntil)} · ${d} hari lagi`, urgent: q.status === 'SENT' && d <= 7 }
}

function dueInfoOf(inv: PortalInvoiceDTO): { text: string; overdue: boolean } {
  if (!inv.dueDate) return { text: 'Tanpa jatuh tempo', overdue: false }
  const remaining = Math.max(0, inv.total - inv.paidAmount)
  const d = daysUntil(inv.dueDate)
  if (d === null) return { text: `Jatuh tempo ${formatDate(inv.dueDate)}`, overdue: false }
  if (d < 0) {
    const overdue = remaining > 0 && inv.status !== 'CANCELLED'
    return {
      text: `Jatuh tempo ${formatDate(inv.dueDate)}${overdue ? ` · terlambat ${Math.abs(d)} hari` : ''}`,
      overdue,
    }
  }
  if (d === 0) return { text: `Jatuh tempo ${formatDate(inv.dueDate)} · hari ini`, overdue: false }
  return { text: `Jatuh tempo ${formatDate(inv.dueDate)} · ${d} hari lagi`, overdue: false }
}

export default function ClientPortalView() {
  const user = useCrmStore((s) => s.user)
  const { toast } = useToast()

  const [data, setData] = useState<PortalDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [quoDetail, setQuoDetail] = useState<PortalQuotationDTO | null>(null)
  const [invDetail, setInvDetail] = useState<PortalInvoiceDTO | null>(null)
  const [printTarget, setPrintTarget] = useState<'quotation' | 'invoice' | null>(null)

  /* ----- R11: keputusan penawaran + thread diskusi ----- */
  const [approveTarget, setApproveTarget] = useState<PortalQuotationDTO | null>(null)
  const [rejectTarget, setRejectTarget] = useState<PortalQuotationDTO | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [deciding, setDeciding] = useState<'ACCEPTED' | 'REJECTED' | null>(null)
  const [discussion, setDiscussion] = useState<{ entityType: PortalCommentEntity; entityId: string; title: string } | null>(null)
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({})
  /** entityId → true bila komentar TERAKHIR di thread ditulis staff (isClient = false) — indikator dot emerald */
  const [staffRepliedMap, setStaffRepliedMap] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await portalApi.get())
    } catch (e) {
      const msg = errMsg(e)
      setError(msg)
      toast({ variant: 'destructive', title: 'Gagal memuat portal', description: msg })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { void load() }, [load])

  /* ---------- R11: keputusan penawaran (Setujui / Tolak) ---------- */
  const handleDecision = async (decision: 'ACCEPTED' | 'REJECTED') => {
    const target = decision === 'ACCEPTED' ? approveTarget : rejectTarget
    if (!target || deciding) return
    setDeciding(decision)
    try {
      const res = await portalApi.decide(target.id, {
        decision,
        note: decision === 'REJECTED' ? (rejectNote.trim() || undefined) : undefined,
      })
      toast({ title: decision === 'ACCEPTED' ? 'Penawaran disetujui' : 'Penawaran ditolak', description: res.message })
      if (decision === 'ACCEPTED') setApproveTarget(null)
      else { setRejectTarget(null); setRejectNote('') }
      await load() // muat ulang list + KPI "Penawaran Menunggu Keputusan"
    } catch (e) {
      toast({
        variant: 'destructive',
        title: decision === 'ACCEPTED' ? 'Gagal menyetujui penawaran' : 'Gagal menolak penawaran',
        description: errMsg(e),
      })
    } finally {
      setDeciding(null)
    }
  }

  /* ---------- R11: badge jumlah komentar per dokumen (+ R12: flag balasan staff) ---------- */
  const bumpCommentCount = useCallback((entityId: string, delta: number) => {
    setCommentCounts((prev) => ({ ...prev, [entityId]: Math.max(0, (prev[entityId] ?? 0) + delta) }))
    /* Komentar terbaru kini milik client → indikator "balasan staff" hilang */
    if (delta > 0) setStaffRepliedMap((prev) => ({ ...prev, [entityId]: false }))
  }, [])

  useEffect(() => {
    if (!data) return
    let cancelled = false
    const targets: { entityType: PortalCommentEntity; id: string }[] = [
      ...data.quotations.map((q) => ({ entityType: 'QUOTATION' as const, id: q.id })),
      ...data.invoices.map((inv) => ({ entityType: 'INVOICE' as const, id: inv.id })),
      ...data.projects.map((p) => ({ entityType: 'PROJECT' as const, id: p.id })),
    ]
    void Promise.all(
      targets.map(async (t): Promise<[string, number, boolean]> => {
        try {
          const list = await portalApi.comments(t.entityType, t.id)
          const latest = list[list.length - 1]
          return [t.id, list.length, !!latest && !latest.isClient]
        } catch {
          return [t.id, 0, false]
        }
      }),
    ).then((entries) => {
      if (!cancelled) {
        setCommentCounts(Object.fromEntries(entries.map(([id, count]) => [id, count])))
        setStaffRepliedMap(Object.fromEntries(entries.map(([id, , replied]) => [id, replied])))
      }
    })
    return () => { cancelled = true }
  }, [data])

  /* ---------- Build print-ready DTOs (semua field required diisi dari data portal) ---------- */
  const buildQuotationDetail = (q: PortalQuotationDTO): QuotationDetailDTO => ({
    id: q.id,
    code: q.code,
    title: q.title,
    status: q.status,
    version: q.version,
    currency: q.currency,
    subtotal: q.subtotal,
    discountPct: q.discountPct,
    discountAmount: q.discountAmount,
    taxPct: q.taxPct,
    taxAmount: q.taxAmount,
    total: q.total,
    validUntil: q.validUntil,
    notes: null,
    discountApprovedById: null,
    discountApprovedByName: null,
    discountApprovedAt: null,
    sentAt: q.sentAt,
    decidedAt: q.decidedAt,
    createdById: '',
    createdByName: null,
    createdAt: q.createdAt,
    opportunityId: '',
    opportunityCode: '',
    opportunityTitle: '',
    opportunityStage: '',
    brandId: '',
    brandName: q.brandName,
    brandColor: q.brandColor,
    companyId: data?.company.id ?? '',
    companyName: data?.company.name ?? '',
    itemsCount: q.items.length,
    items: q.items.map((it, i) => ({
      id: it.id,
      description: it.description,
      qty: it.qty,
      unitPrice: it.unitPrice,
      sortOrder: i,
      lineTotal: it.lineTotal,
    })),
  })

  const buildInvoiceDetail = (inv: PortalInvoiceDTO): InvoiceDTO => ({
    id: inv.id,
    code: inv.code,
    title: inv.title,
    status: inv.status,
    currency: inv.currency,
    amount: inv.amount,
    taxPct: inv.taxPct,
    total: inv.total,
    paidAmount: inv.paidAmount,
    dueDate: inv.dueDate,
    issuedAt: inv.issuedAt,
    notes: null,
    opportunityId: '',
    opportunityCode: '',
    opportunityTitle: '',
    projectId: null,
    projectCode: inv.projectCode,
    brandId: '',
    brandName: inv.brandName,
    brandColor: inv.brandColor,
    companyId: data?.company.id ?? '',
    companyName: data?.company.name ?? '',
    payments: inv.payments.map((p) => ({
      id: p.id,
      amount: p.amount,
      method: p.method,
      reference: p.reference,
      paidAt: p.paidAt,
      note: null,
      recordedByName: null,
    })),
    createdAt: inv.issuedAt,
  })

  /* ---------- Error state ---------- */
  if (error && !data) {
    return (
      <EmptyState
        icon={<Info className="h-5 w-5" />}
        title="Gagal memuat portal"
        description={error}
        action={<Button variant="outline" size="sm" onClick={() => void load()}>Coba lagi</Button>}
      />
    )
  }

  /* ---------- Loading skeleton ---------- */
  if (!data) {
    return (
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-80" />
          </div>
          <Skeleton className="h-9 w-24 rounded-md" />
        </div>
        <Skeleton className="h-36 w-full rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-9 w-72 rounded-md" />
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      </div>
    )
  }

  const { company, projects, quotations, invoices, summary } = data
  const outstanding = summary.outstandingTotal

  return (
    <div className="space-y-5">
      {/* ================= Header ================= */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold tracking-tight text-slate-900">
              Selamat datang, {user?.name ?? 'Klien'}
            </h2>
            <p className="truncate text-sm text-slate-500">
              {company.name} · {company.industry ?? '—'} · {company.city ?? '—'}, {company.country}
            </p>
          </div>
        </div>
        <RefreshButton onClick={() => void load()} loading={loading} />
      </div>

      {/* ================= Banner kontak ================= */}
      <section aria-label="Kontak Anda di Grupa Kreasi" className="rounded-2xl bg-slate-900 p-5 text-white shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Kontak Anda di Grupa Kreasi</p>
        <p className="mt-1 text-sm text-slate-300">Tim pendamping account untuk {company.name}.</p>
        {company.contacts.length > 0 ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {company.contacts.map((c) => (
              <div key={c.id} className="rounded-xl border border-white/10 bg-white/5 p-3.5">
                <p className="truncate text-sm font-semibold text-white">{c.name}</p>
                {c.position && <p className="truncate text-xs text-slate-400">{c.position}</p>}
                <div className="mt-2 space-y-1 text-xs text-slate-300">
                  {c.email && (
                    <p className="flex items-center gap-1.5 truncate">
                      <Mail className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                      <span className="truncate">{c.email}</span>
                    </p>
                  )}
                  {c.phone && (
                    <p className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                      {c.phone}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-400">Belum ada kontak yang terdaftar untuk perusahaan Anda.</p>
        )}
      </section>

      {/* ================= KPI ================= */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<FolderKanban className="h-4 w-4" />}
          label="Proyek Aktif"
          value={String(summary.activeProjects)}
          hint="Proyek yang sedang berjalan di brand kami"
        />
        <KpiCard
          icon={<FileText className="h-4 w-4" />}
          label="Penawaran Menunggu Keputusan"
          value={String(summary.openQuotations)}
          hint="Penawaran berstatus Terkirim"
          tone="amber"
        />
        <KpiCard
          icon={<Wallet className="h-4 w-4" />}
          label="Outstanding Tagihan"
          value={outstanding > 0 ? formatMoney(outstanding) : 'Lunas'}
          hint={outstanding > 0 ? 'Total sisa tagihan belum dibayar' : 'Semua tagihan sudah dibayar'}
          tone={outstanding > 0 ? 'rose' : 'emerald'}
          valueClass={outstanding > 0 ? 'text-rose-700' : 'text-emerald-700'}
        />
        <KpiCard
          icon={<CalendarClock className="h-4 w-4" />}
          label="Jatuh Tempo Terdekat"
          value={summary.nextDueDate ? formatDate(summary.nextDueDate) : '—'}
          hint="Jatuh tempo invoice dengan sisa tagihan"
        />
      </div>

      {/* ================= Tabs ================= */}
      <Tabs defaultValue="proyek">
        <TabsList className="bg-slate-100">
          <TabsTrigger value="proyek" className="gap-1.5">Proyek</TabsTrigger>
          <TabsTrigger value="penawaran" className="gap-1.5">Penawaran</TabsTrigger>
          <TabsTrigger value="invoice" className="gap-1.5">Invoice</TabsTrigger>
        </TabsList>

        {/* ---------- Proyek ---------- */}
        <TabsContent value="proyek" className="mt-4">
          {projects.length === 0 ? (
            <EmptyState icon={<FolderKanban className="h-5 w-5" />} title="Belum ada proyek berjalan" description="Proyek akan tampil di sini setelah kesepakatan kerja dimulai." />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {projects.map((p) => {
                const pMeta = projectStatusMeta(p.status)
                return (
                  <Card key={p.id} className="rounded-xl border-slate-200 shadow-sm">
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <BrandChip name={p.brandName} color={p.brandColor} />
                            <span className="font-mono text-[11px] text-slate-400">{p.code}</span>
                          </div>
                          <p className="mt-1.5 text-sm font-semibold leading-snug text-slate-900">{p.name}</p>
                        </div>
                        <span className={cn('inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-[11px] font-semibold', pMeta.bg, pMeta.color)}>
                          {pMeta.label}
                        </span>
                      </div>

                      <div>
                        <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                          <span>Progress</span>
                          <span className="font-semibold text-slate-700">{p.progress}%</span>
                        </div>
                        <Progress value={p.progress} className="h-2" />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                        <span>{p.managerName ? `Project Manager: ${p.managerName}` : 'Project Manager: —'}</span>
                        <span>
                          {p.startDate ? `Mulai ${formatDate(p.startDate)}` : 'Belum mulai'}
                          {p.endDate ? ` · Target ${formatDate(p.endDate)}` : ''}
                        </span>
                      </div>

                      {p.milestones.length > 0 && (
                        <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Milestone</p>
                          <ul className="space-y-1.5">
                            {p.milestones.map((m) => (
                              <li key={m.id} className="flex items-center gap-2 text-xs">
                                {m.status === 'DONE'
                                  ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                  : <Circle className="h-3.5 w-3.5 shrink-0 text-slate-300" />}
                                <span className={cn('flex-1', m.status === 'DONE' ? 'text-slate-600 line-through decoration-slate-300' : 'text-slate-700')}>
                                  {m.name}
                                </span>
                                {m.dueDate && <span className="shrink-0 text-[11px] text-slate-400">{formatDate(m.dueDate)}</span>}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="flex items-center justify-end pt-1">
                        <DiskusiChip
                          count={commentCounts[p.id] ?? 0}
                          staffReplied={staffRepliedMap[p.id]}
                          onClick={() => setDiscussion({ entityType: 'PROJECT', entityId: p.id, title: `${p.code} — ${p.name}` })}
                        />
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* ---------- Penawaran ---------- */}
        <TabsContent value="penawaran" className="mt-4">
          {quotations.length === 0 ? (
            <EmptyState icon={<FileText className="h-5 w-5" />} title="Belum ada penawaran" description="Penawaran resmi yang telah dikirim akan tampil di sini." />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {quotations.map((q) => {
                const vu = validUntilText(q)
                return (
                  <Card key={q.id} className="rounded-xl border-slate-200 shadow-sm">
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <BrandChip name={q.brandName} color={q.brandColor} />
                            <span className="font-mono text-[11px] text-slate-400">{q.code}</span>
                          </div>
                          <p className="mt-1.5 line-clamp-2 text-sm font-semibold leading-snug text-slate-900">{q.title}</p>
                        </div>
                        <StatusBadge meta={QUO_STATUS[q.status] ?? QUO_STATUS.DRAFT} />
                      </div>

                      <p className="text-xl font-bold tracking-tight text-slate-900">{formatMoney(q.total, q.currency)}</p>
                      <p className={cn('text-xs', vu.urgent ? 'font-medium text-amber-700' : 'text-slate-500')}>{vu.text}</p>

                      {q.status !== 'SENT' && q.decidedAt && (
                        <p className="text-[11px] text-slate-400">Diputuskan {formatDate(q.decidedAt)}</p>
                      )}

                      {q.status === 'SENT' && (
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Button
                            onClick={() => setApproveTarget(q)}
                            disabled={deciding !== null}
                            className="h-9 flex-1 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Setujui Penawaran
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => { setRejectTarget(q); setRejectNote('') }}
                            disabled={deciding !== null}
                            className="h-9 flex-1 gap-1.5 border-rose-200 text-rose-700 hover:bg-rose-50"
                          >
                            <XCircle className="h-4 w-4" />
                            Tolak
                          </Button>
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-[11px] text-slate-400">Versi v{q.version}</span>
                        <div className="flex shrink-0 items-center gap-1">
                          <DiskusiChip
                            count={commentCounts[q.id] ?? 0}
                            staffReplied={staffRepliedMap[q.id]}
                            onClick={() => setDiscussion({ entityType: 'QUOTATION', entityId: q.id, title: `${q.code} — ${q.title}` })}
                          />
                          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setQuoDetail(q)}>
                            Lihat Detail
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* ---------- Invoice ---------- */}
        <TabsContent value="invoice" className="mt-4">
          {invoices.length === 0 ? (
            <EmptyState icon={<Wallet className="h-5 w-5" />} title="Belum ada invoice" description="Invoice yang diterbitkan untuk perusahaan Anda akan tampil di sini." />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {invoices.map((inv) => {
                const due = dueInfoOf(inv)
                const paidPct = inv.total > 0 ? Math.min(100, Math.round((inv.paidAmount / inv.total) * 100)) : 0
                return (
                  <Card key={inv.id} className="rounded-xl border-slate-200 shadow-sm">
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <BrandChip name={inv.brandName} color={inv.brandColor} />
                            <span className="font-mono text-[11px] text-slate-400">{inv.code}</span>
                            {inv.projectCode && (
                              <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-600">
                                {inv.projectCode}
                              </span>
                            )}
                          </div>
                          <p className="mt-1.5 line-clamp-2 text-sm font-semibold leading-snug text-slate-900">{inv.title}</p>
                        </div>
                        <StatusBadge meta={INV_STATUS[inv.status] ?? INV_STATUS.UNPAID} />
                      </div>

                      <div>
                        <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                          <span>Terbayar {formatMoney(inv.paidAmount, inv.currency)} / {formatMoney(inv.total, inv.currency)}</span>
                          <span className="font-semibold text-slate-700">{paidPct}%</span>
                        </div>
                        <Progress value={paidPct} className="h-2" />
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <p className={cn('text-xs', due.overdue ? 'font-semibold text-rose-600' : 'text-slate-500')}>{due.text}</p>
                        <div className="flex shrink-0 items-center gap-1">
                          <DiskusiChip
                            count={commentCounts[inv.id] ?? 0}
                            staffReplied={staffRepliedMap[inv.id]}
                            onClick={() => setDiscussion({ entityType: 'INVOICE', entityId: inv.id, title: `${inv.code} — ${inv.title}` })}
                          />
                          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setInvDetail(inv)}>
                            Lihat Detail
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ================= Footer note ================= */}
      <p className="flex items-start gap-1.5 text-xs text-slate-400">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Data yang ditampilkan terbatas pada perusahaan Anda. Hubungi tim account manager untuk pertanyaan.
      </p>

      {/* ================= Dialog Penawaran ================= */}
      <Dialog
        open={quoDetail !== null}
        onOpenChange={(open) => { if (!open) { setQuoDetail(null); setPrintTarget(null) } }}
      >
        <DialogContent
          className={cn('max-h-[90vh] max-w-2xl overflow-y-auto', SCROLLBAR)}
          onInteractOutside={(e) => { if (printTarget) e.preventDefault() }}
        >
          {quoDetail && (
            <>
              <DialogHeader className="text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <BrandChip name={quoDetail.brandName} color={quoDetail.brandColor} />
                  <span className="font-mono text-xs text-slate-400">{quoDetail.code}</span>
                  <StatusBadge meta={QUO_STATUS[quoDetail.status] ?? QUO_STATUS.DRAFT} />
                </div>
                <DialogTitle className="text-left text-base leading-snug">{quoDetail.title}</DialogTitle>
                <DialogDescription className="text-left">
                  Penawaran resmi dari {quoDetail.brandName} untuk {company.name} · v{quoDetail.version}
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-100 bg-slate-50/60 p-3 text-xs text-slate-600">
                <p><span className="text-slate-400">Dikirim:</span> {formatDate(quoDetail.sentAt)}</p>
                <p><span className="text-slate-400">Berlaku hingga:</span> {formatDate(quoDetail.validUntil)}</p>
                {quoDetail.decidedAt && <p><span className="text-slate-400">Diputuskan:</span> {formatDate(quoDetail.decidedAt, true)}</p>}
                <p><span className="text-slate-400">Dibuat:</span> {formatDate(quoDetail.createdAt)}</p>
              </div>

              <div className={cn('max-h-64 overflow-y-auto rounded-lg border border-slate-100', SCROLLBAR)}>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="w-10 text-slate-500">No</TableHead>
                      <TableHead className="text-slate-500">Deskripsi</TableHead>
                      <TableHead className="w-16 text-right text-slate-500">Qty</TableHead>
                      <TableHead className="w-32 text-right text-slate-500">Harga</TableHead>
                      <TableHead className="w-36 text-right text-slate-500">Jumlah</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quoDetail.items.map((it, i) => (
                      <TableRow key={it.id ?? i}>
                        <TableCell className="text-slate-400">{i + 1}</TableCell>
                        <TableCell className="font-medium text-slate-800">{it.description}</TableCell>
                        <TableCell className="text-right text-slate-600">{it.qty}</TableCell>
                        <TableCell className="text-right text-slate-600">{formatMoney(it.unitPrice, quoDetail.currency)}</TableCell>
                        <TableCell className="text-right font-semibold text-slate-800">{formatMoney(it.lineTotal, quoDetail.currency)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="ml-auto w-full max-w-xs space-y-1 rounded-lg border border-slate-200 p-3 text-xs">
                <div className="flex items-center justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span className="font-semibold text-slate-800">{formatMoney(quoDetail.subtotal, quoDetail.currency)}</span>
                </div>
                {quoDetail.discountPct > 0 && (
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Diskon ({quoDetail.discountPct}%)</span>
                    <span className="font-semibold text-slate-800">- {formatMoney(quoDetail.discountAmount, quoDetail.currency)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-slate-600">
                  <span>PPN ({quoDetail.taxPct}%)</span>
                  <span className="font-semibold text-slate-800">{formatMoney(quoDetail.taxAmount, quoDetail.currency)}</span>
                </div>
                <div className="flex items-center justify-between border-t-2 border-slate-900 pt-1.5 text-[13px] font-bold text-slate-900">
                  <span>Total</span>
                  <span>{formatMoney(quoDetail.total, quoDetail.currency)}</span>
                </div>
              </div>

              <DialogFooter className="flex-row flex-wrap gap-2 border-t border-slate-100 pt-3 sm:justify-end">
                <Button
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setPrintTarget('quotation')}
                >
                  <Printer className="h-4 w-4" /> Cetak / PDF
                </Button>
                <Button variant="ghost" onClick={() => { setQuoDetail(null); setPrintTarget(null) }}>Tutup</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ================= Dialog Invoice ================= */}
      <Dialog
        open={invDetail !== null}
        onOpenChange={(open) => { if (!open) { setInvDetail(null); setPrintTarget(null) } }}
      >
        <DialogContent
          className={cn('max-h-[90vh] max-w-2xl overflow-y-auto', SCROLLBAR)}
          onInteractOutside={(e) => { if (printTarget) e.preventDefault() }}
        >
          {invDetail && (
            <>
              <DialogHeader className="text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <BrandChip name={invDetail.brandName} color={invDetail.brandColor} />
                  <span className="font-mono text-xs text-slate-400">{invDetail.code}</span>
                  <StatusBadge meta={INV_STATUS[invDetail.status] ?? INV_STATUS.UNPAID} />
                </div>
                <DialogTitle className="text-left text-base leading-snug">{invDetail.title}</DialogTitle>
                <DialogDescription className="text-left">
                  Invoice dari {invDetail.brandName} untuk {company.name}
                  {invDetail.projectCode ? ` · Proyek ${invDetail.projectCode}` : ''}
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-100 bg-slate-50/60 p-3 text-xs text-slate-600">
                <p><span className="text-slate-400">Diterbitkan:</span> {formatDate(invDetail.issuedAt)}</p>
                <p><span className="text-slate-400">Jatuh tempo:</span> {formatDate(invDetail.dueDate)}</p>
                <p><span className="text-slate-400">Nilai (sebelum PPN):</span> {formatMoney(invDetail.amount, invDetail.currency)}</p>
                <p><span className="text-slate-400">PPN:</span> {invDetail.taxPct}%</p>
              </div>

              <div className="rounded-lg border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="text-slate-500">
                    Terbayar <span className="font-semibold text-slate-800">{formatMoney(invDetail.paidAmount, invDetail.currency)}</span> / {formatMoney(invDetail.total, invDetail.currency)}
                  </span>
                  <span className={cn('font-semibold', invDetail.total - invDetail.paidAmount > 0 ? 'text-rose-600' : 'text-emerald-700')}>
                    Sisa {formatMoney(Math.max(0, invDetail.total - invDetail.paidAmount), invDetail.currency)}
                  </span>
                </div>
                <Progress
                  value={invDetail.total > 0 ? Math.min(100, Math.round((invDetail.paidAmount / invDetail.total) * 100)) : 0}
                  className="h-2"
                />
              </div>

              <div>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Riwayat Pembayaran</p>
                {invDetail.payments.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-3 py-4 text-center text-xs text-slate-400">
                    Belum ada pembayaran tercatat.
                  </p>
                ) : (
                  <div className={cn('max-h-52 overflow-y-auto rounded-lg border border-slate-100', SCROLLBAR)}>
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50">
                          <TableHead className="text-slate-500">Tanggal</TableHead>
                          <TableHead className="text-slate-500">Metode</TableHead>
                          <TableHead className="text-slate-500">Referensi</TableHead>
                          <TableHead className="text-right text-slate-500">Jumlah</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invDetail.payments.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="text-slate-600">{formatDate(p.paidAt)}</TableCell>
                            <TableCell className="text-slate-600">{p.method}</TableCell>
                            <TableCell className="text-slate-500">{p.reference || '—'}</TableCell>
                            <TableCell className="text-right font-semibold text-emerald-700">{formatMoney(p.amount, invDetail.currency)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              <DialogFooter className="flex-row flex-wrap gap-2 border-t border-slate-100 pt-3 sm:justify-end">
                <Button
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setPrintTarget('invoice')}
                >
                  <Printer className="h-4 w-4" /> Cetak / PDF
                </Button>
                <Button variant="ghost" onClick={() => { setInvDetail(null); setPrintTarget(null) }}>Tutup</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ================= Dialog Diskusi (semua dokumen) ================= */}
      <CommentThreadDialog
        open={discussion !== null}
        onOpenChange={(open) => { if (!open) setDiscussion(null) }}
        entityType={discussion?.entityType ?? 'QUOTATION'}
        entityId={discussion?.entityId ?? ''}
        title={discussion?.title ?? ''}
        onCountChange={bumpCommentCount}
      />

      {/* ================= AlertDialog Setujui Penawaran ================= */}
      <AlertDialog open={approveTarget !== null} onOpenChange={(open) => { if (!open) setApproveTarget(null) }}>
        <AlertDialogContent className="max-w-md rounded-xl">
          <AlertDialogHeader className="text-left">
            <AlertDialogTitle>Setujui penawaran ini?</AlertDialogTitle>
            <AlertDialogDescription>
              {approveTarget && (
                <>
                  Penawaran <span className="font-mono font-semibold text-slate-700">{approveTarget.code}</span> dengan total{' '}
                  <span className="font-semibold text-slate-700">{formatMoney(approveTarget.total, approveTarget.currency)}</span>.
                  {' '}Dengan menyetujui, tim {approveTarget.brandName} akan melanjutkan proses pengerjaan sesuai lingkup penawaran.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deciding !== null}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={deciding !== null}
              onClick={(e) => { e.preventDefault(); void handleDecision('ACCEPTED') }}
              className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {deciding === 'ACCEPTED' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Ya, Setujui
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ================= Dialog Tolak Penawaran ================= */}
      <Dialog
        open={rejectTarget !== null}
        onOpenChange={(open) => { if (!open) { setRejectTarget(null); setRejectNote('') } }}
      >
        <DialogContent className="max-w-md rounded-xl">
          <DialogHeader className="text-left">
            <DialogTitle>Tolak penawaran ini?</DialogTitle>
            <DialogDescription>
              {rejectTarget && (
                <>
                  Penawaran <span className="font-mono font-semibold text-slate-700">{rejectTarget.code}</span> dengan total{' '}
                  <span className="font-semibold text-slate-700">{formatMoney(rejectTarget.total, rejectTarget.currency)}</span>.
                  {' '}Beri tahu tim {rejectTarget.brandName} alasan Anda agar dapat ditindaklanjuti.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            placeholder="Alasan penolakan (opsional)…"
            aria-label="Alasan penolakan"
            rows={3}
            className="resize-none"
          />
          <DialogFooter className="flex-row gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => { setRejectTarget(null); setRejectNote('') }} disabled={deciding !== null}>
              Batal
            </Button>
            <Button
              onClick={() => void handleDecision('REJECTED')}
              disabled={deciding !== null}
              className="gap-1.5 bg-rose-600 text-white hover:bg-rose-700"
            >
              {deciding === 'REJECTED' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Kirim Penolakan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================= Print overlays ================= */}
      {printTarget === 'quotation' && quoDetail && (
        <PrintOverlay
          open
          docTitle={`${quoDetail.code} — ${quoDetail.title}`}
          onClose={() => setPrintTarget(null)}
        >
          <QuotationPrintBody q={buildQuotationDetail(quoDetail)} />
        </PrintOverlay>
      )}
      {printTarget === 'invoice' && invDetail && (
        <PrintOverlay
          open
          docTitle={`${invDetail.code} — ${invDetail.title}`}
          onClose={() => setPrintTarget(null)}
        >
          <InvoicePrintBody inv={buildInvoiceDetail(invDetail)} />
        </PrintOverlay>
      )}
    </div>
  )
}
