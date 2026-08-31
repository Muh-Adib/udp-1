/* ============ Chat Fokus Full-Screen (R20) ============
   Percakapan per kontak dibuka sebagai overlay layar penuh agar marketing
   bisa fokus follow-up: timeline lega + panel konteks lead (desktop) +
   aksi cepat langsung dari chat — Assign Tugas, Buat Penawaran, Buat Brief.
   Mobile: chat penuh + tombol "Info" membuka sheet konteks lead.        */
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { crmApi, estimationApi, financeApi, type QuotationItemInput } from './api-client'
import { ConversationList } from './conversation-list'
import { BrandChip, ChannelIcon, EmptyState, StageBadge, TempBadge, UserAvatar } from './shared'
import { PRIORITIES, TASK_TYPES, channelMeta, daysUntil, formatDate, formatMoney, initials, temperatureMeta } from '@/lib/crm-constants'
import type { BriefDTO, ConversationListItemDTO, InteractionDTO, OpportunityDetailDTO, QuotationDTO, TaskDTO, UserDTO } from '@/lib/crm-types'
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
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
  AlertCircle, ArrowLeft, CalendarClock, Check, CheckCheck, ChevronDown, ClipboardList, Clock,
  FileBarChart2, Globe, Instagram, ListChecks, Loader2, Mail, MessagesSquare, Phone, Plus,
  Receipt, Send, Target, Trash2, User, X,
} from 'lucide-react'

const CHAT_CHANNELS = ['WHATSAPP', 'EMAIL', 'INSTAGRAM', 'PHONE'] as const
const NONE = '__none__'
const SCROLLBAR = '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-transparent'

/** Ikon putih utk bubble OUT (kontras di atas emerald). */
const OUT_CHANNEL_ICON: Record<string, React.ReactNode> = {
  EMAIL: <Mail className="h-3 w-3" />,
  INSTAGRAM: <Instagram className="h-3 w-3" />,
  PHONE: <Phone className="h-3 w-3" />,
  WEBSITE: <Globe className="h-3 w-3" />,
  MEETING: <User className="h-3 w-3" />,
}

const QUO_STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Draft', cls: 'border-slate-200 bg-slate-50 text-slate-600' },
  SENT: { label: 'Terkirim', cls: 'border-teal-200 bg-teal-50 text-teal-700' },
  ACCEPTED: { label: 'Diterima', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  REJECTED: { label: 'Ditolak', cls: 'border-rose-200 bg-rose-50 text-rose-700' },
  EXPIRED: { label: 'Kedaluwarsa', cls: 'border-amber-200 bg-amber-50 text-amber-700' },
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

const dayLabel = (iso: string) => {
  const d = new Date(iso)
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(d, now)) return 'Hari Ini'
  if (sameDay(d, yesterday)) return 'Kemarin'
  return formatDate(iso)
}

/** Tanggal → yyyy-mm-dd (input type=date), default = hari ini + offset hari. */
const dateInputValue = (offsetDays = 0) => {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

/* ================================================================== */
/* Dialog: Assign Tugas                                                */
/* ================================================================== */
function AssignTaskDialog({ open, onOpenChange, opp, users, onCreated }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  opp: ConversationListItemDTO
  users: UserDTO[]
  onCreated: (t: TaskDTO) => void
}) {
  const { toast } = useToast()
  const [form, setForm] = useState({ title: '', description: '', assigneeId: '', dueDate: '', priority: 'MEDIUM', type: 'FOLLOW_UP' })
  const [saving, setSaving] = useState(false)
  const internalUsers = useMemo(() => users.filter((u) => u.isActive && u.role !== 'CLIENT'), [users])

  useEffect(() => {
    if (!open) return
    const defaultAssignee = internalUsers.find((u) => u.role === 'MARKETING')?.id ?? internalUsers[0]?.id ?? ''
    setForm({
      title: `Follow-up ${opp.contactName}`,
      description: '',
      assigneeId: defaultAssignee,
      dueDate: dateInputValue(1),
      priority: 'MEDIUM',
      type: 'FOLLOW_UP',
    })
  }, [open, opp.contactName, internalUsers])

  const submit = async () => {
    if (!form.title.trim()) { toast({ title: 'Judul tugas wajib diisi', variant: 'destructive' }); return }
    if (!form.assigneeId) { toast({ title: 'Pilih assignee tugas', variant: 'destructive' }); return }
    setSaving(true)
    try {
      const task = await crmApi.createTask({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        opportunityId: opp.opportunityId,
        assigneeId: form.assigneeId,
        dueDate: form.dueDate || undefined,
        priority: form.priority,
        type: form.type,
      })
      toast({ title: 'Tugas ditugaskan', description: `${task.title} → ${task.assigneeName ?? 'anggota tim'}` })
      onOpenChange(false)
      onCreated(task)
    } catch (e) {
      toast({ title: 'Gagal menugaskan tugas', description: e instanceof Error ? e.message : 'Coba lagi', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Tugas Follow-up</DialogTitle>
          <DialogDescription>
            Tugas terhubung ke lead {opp.opportunityCode} — {opp.contactName}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Judul tugas</Label>
            <Input id="task-title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Contoh: Kirim revisi penawaran" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-desc">Deskripsi (opsional)</Label>
            <Textarea id="task-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} placeholder="Detail instruksi…" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="task-assignee">Assignee</Label>
              <Select value={form.assigneeId || NONE} onValueChange={(v) => setForm((f) => ({ ...f, assigneeId: v === NONE ? '' : v }))}>
                <SelectTrigger id="task-assignee"><SelectValue placeholder="Pilih anggota" /></SelectTrigger>
                <SelectContent>
                  {internalUsers.length === 0 && <SelectItem value={NONE} disabled>Tidak ada anggota</SelectItem>}
                  {internalUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name} · {u.role}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-due">Tenggat</Label>
              <Input id="task-due" type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-priority">Prioritas</Label>
              <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
                <SelectTrigger id="task-priority"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-type">Tipe</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger id="task-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Batal</Button>
          <Button onClick={() => void submit()} disabled={saving} className="gap-1.5 bg-slate-900 text-white hover:bg-slate-800">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />} Tugaskan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ================================================================== */
/* Dialog: Buat Penawaran (quotation)                                  */
/* ================================================================== */
type ItemRow = { description: string; qty: string; unitPrice: string }

function QuotationDialog({ open, onOpenChange, opp, onCreated }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  opp: ConversationListItemDTO
  onCreated: (q: QuotationDTO, summaryMsg?: InteractionDTO) => void
}) {
  const { toast } = useToast()
  const [title, setTitle] = useState('')
  const [items, setItems] = useState<ItemRow[]>([{ description: '', qty: '1', unitPrice: '' }])
  const [discountPct, setDiscountPct] = useState('0')
  const [taxPct, setTaxPct] = useState('11')
  const [validUntil, setValidUntil] = useState(dateInputValue(14))
  const [notes, setNotes] = useState('')
  const [sendSummary, setSendSummary] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setTitle(`Penawaran ${opp.opportunityTitle}`)
    setItems([{ description: '', qty: '1', unitPrice: '' }])
    setDiscountPct('0')
    setTaxPct('11')
    setValidUntil(dateInputValue(14))
    setNotes('')
    setSendSummary(true)
  }, [open, opp.opportunityTitle])

  const parsedItems = useMemo(
    () => items
      .map((it) => ({ description: it.description.trim(), qty: Number(it.qty), unitPrice: Number(it.unitPrice) }))
      .filter((it) => it.description && Number.isFinite(it.qty) && it.qty > 0 && Number.isFinite(it.unitPrice) && it.unitPrice >= 0),
    [items],
  )
  const totals = useMemo(() => {
    const subtotal = parsedItems.reduce((s, it) => s + it.qty * it.unitPrice, 0)
    const dPct = Math.min(100, Math.max(0, Number(discountPct) || 0))
    const tPct = Math.min(100, Math.max(0, Number(taxPct) || 0))
    const discount = Math.round((subtotal * dPct) / 100)
    const tax = Math.round(((subtotal - discount) * tPct) / 100)
    return { subtotal: Math.round(subtotal), discount, tax, total: Math.round(subtotal) - discount + tax }
  }, [parsedItems, discountPct, taxPct])

  const setItem = (i: number, patch: Partial<ItemRow>) =>
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))

  const submit = async () => {
    if (parsedItems.length === 0) {
      toast({ title: 'Minimal satu item valid', description: 'Isi deskripsi, qty > 0, dan harga satuan.', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const payload: QuotationItemInput[] = parsedItems.map((it) => ({ description: it.description, qty: it.qty, unitPrice: it.unitPrice }))
      const q = await financeApi.createQuotation({
        opportunityId: opp.opportunityId,
        title: title.trim() || undefined,
        items: payload,
        discountPct: Number(discountPct) || 0,
        taxPct: Number(taxPct) || 0,
        validUntil: validUntil || undefined,
        notes: notes.trim() || undefined,
      })
      toast({ title: `Penawaran ${q.code} dibuat`, description: `Total ${formatMoney(q.total, q.currency)} — status Draft.` })
      let summaryMsg: InteractionDTO | null = null
      if (sendSummary) {
        try {
          const lines = [
            `📄 Penawaran ${q.code} — ${q.title}`,
            `${q.itemsCount ?? payload.length} item · Total ${formatMoney(q.total, q.currency)}`,
            validUntil ? `Berlaku sampai ${formatDate(validUntil)}` : null,
            'Silakan ditinjau — kami siap diskusi lebih lanjut. Terima kasih! 🙏',
          ].filter(Boolean)
          summaryMsg = await crmApi.addInteraction(opp.opportunityId, { channel: 'WHATSAPP', direction: 'OUT', body: lines.join('\n') })
        } catch { /* ringkasan gagal — quotation tetap tercatat */ }
      }
      onOpenChange(false)
      onCreated(q, summaryMsg ?? undefined)
    } catch (e) {
      toast({ title: 'Gagal membuat penawaran', description: e instanceof Error ? e.message : 'Coba lagi', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Buat Penawaran</DialogTitle>
          <DialogDescription>
            Untuk lead {opp.opportunityCode} — {opp.contactName} ({opp.brandName}). Penawaran tersimpan sebagai Draft di modul Penawaran.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="quo-title">Judul penawaran</Label>
            <Input id="quo-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Judul dokumen" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Item penawaran</Label>
              <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setItems((arr) => [...arr, { description: '', qty: '1', unitPrice: '' }])}>
                <Plus className="h-3 w-3" /> Tambah item
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Input
                        value={it.description}
                        onChange={(e) => setItem(i, { description: e.target.value })}
                        placeholder={`Deskripsi item ${i + 1} — mis. Desain website 5 halaman`}
                        aria-label={`Deskripsi item ${i + 1}`}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          type="number" min="0" step="1" inputMode="numeric"
                          value={it.qty}
                          onChange={(e) => setItem(i, { qty: e.target.value })}
                          placeholder="Qty"
                          aria-label={`Qty item ${i + 1}`}
                        />
                        <Input
                          type="number" min="0" step="1000" inputMode="numeric"
                          value={it.unitPrice}
                          onChange={(e) => setItem(i, { unitPrice: e.target.value })}
                          placeholder="Harga satuan (Rp)"
                          aria-label={`Harga satuan item ${i + 1}`}
                        />
                      </div>
                    </div>
                    <Button
                      type="button" variant="ghost" size="icon"
                      className="mt-0.5 h-8 w-8 shrink-0 text-slate-400 hover:text-rose-600"
                      aria-label={`Hapus item ${i + 1}`}
                      disabled={items.length === 1}
                      onClick={() => setItems((arr) => arr.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="quo-disc">Diskon (%)</Label>
              <Input id="quo-disc" type="number" min="0" max="100" step="1" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quo-tax">Pajak (%)</Label>
              <Input id="quo-tax" type="number" min="0" max="100" step="1" value={taxPct} onChange={(e) => setTaxPct(e.target.value)} />
            </div>
            <div className="col-span-2 space-y-1.5 sm:col-span-1">
              <Label htmlFor="quo-valid">Berlaku sampai</Label>
              <Input id="quo-valid" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </div>
          </div>

          {/* Ringkasan live */}
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-slate-600"><span>Subtotal</span><span className="tabular-nums">{formatMoney(totals.subtotal)}</span></div>
              {totals.discount > 0 && <div className="flex justify-between text-amber-700"><span>Diskon</span><span className="tabular-nums">−{formatMoney(totals.discount)}</span></div>}
              {totals.tax > 0 && <div className="flex justify-between text-slate-600"><span>Pajak</span><span className="tabular-nums">+{formatMoney(totals.tax)}</span></div>}
              <div className="flex justify-between border-t border-slate-100 pt-1.5 text-base font-bold text-slate-900"><span>Total</span><span className="tabular-nums">{formatMoney(totals.total)}</span></div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quo-notes">Catatan (opsional)</Label>
            <Textarea id="quo-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Syarat pembayaran, asumsi pekerjaan…" />
          </div>

          <label htmlFor="quo-summary" className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <Switch id="quo-summary" checked={sendSummary} onCheckedChange={setSendSummary} />
            <span className="text-xs leading-relaxed text-slate-600">
              <span className="block font-semibold text-slate-800">Kirim ringkasan ke percakapan</span>
              Pesan keluar berisi kode, total, dan masa berlaku penawaran otomatis tercatat di chat ini.
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Batal</Button>
          <Button onClick={() => void submit()} disabled={saving} className="gap-1.5 bg-teal-700 text-white hover:bg-teal-800">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />} Buat Penawaran
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ================================================================== */
/* Dialog: Brief                                                       */
/* ================================================================== */
const BRIEF_EMPTY = { serviceScope: '', objectives: '', targetAudience: '', keyMessages: '', deliverables: '', timeline: '', references: '', budgetRange: '', constraints: '' }

function BriefDialog({ open, onOpenChange, opp, onSaved }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  opp: ConversationListItemDTO
  onSaved: (b: BriefDTO) => void
}) {
  const { toast } = useToast()
  const [form, setForm] = useState({ ...BRIEF_EMPTY })
  const [status, setStatus] = useState<'DRAFT' | 'FINAL'>('DRAFT')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof BRIEF_EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  useEffect(() => {
    if (!open) return
    setLoading(true)
    estimationApi.brief(opp.opportunityId)
      .then((b) => {
        if (b) {
          setForm({
            serviceScope: b.serviceScope ?? '', objectives: b.objectives ?? '', targetAudience: b.targetAudience ?? '',
            keyMessages: b.keyMessages ?? '', deliverables: b.deliverables ?? '', timeline: b.timeline ?? '',
            references: b.references ?? '', budgetRange: b.budgetRange ?? '', constraints: b.constraints ?? '',
          })
          setStatus(b.status)
        } else {
          setForm({ ...BRIEF_EMPTY })
          setStatus('DRAFT')
        }
      })
      .catch(() => { setForm({ ...BRIEF_EMPTY }) })
      .finally(() => setLoading(false))
  }, [open, opp.opportunityId])

  const submit = async () => {
    setSaving(true)
    try {
      const b = await estimationApi.saveBrief(opp.opportunityId, { ...form, status })
      toast({ title: status === 'FINAL' ? 'Brief difinalisasi' : 'Brief tersimpan', description: `Brief lead ${opp.opportunityCode} — ${opp.contactName}.` })
      onOpenChange(false)
      onSaved(b)
    } catch (e) {
      toast({ title: 'Gagal menyimpan brief', description: e instanceof Error ? e.message : 'Coba lagi', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Brief Kreatif</DialogTitle>
          <DialogDescription>
            Brief untuk lead {opp.opportunityCode} — {opp.contactName}. Satu brief per lead; perubahan menimpa yang ada.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Memuat brief…
          </div>
        ) : (
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="brief-scope">Lingkup layanan</Label>
              <Input id="brief-scope" value={form.serviceScope} onChange={set('serviceScope')} placeholder="Mis. Website company profile + video profil" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="brief-objectives">Tujuan</Label>
                <Textarea id="brief-objectives" value={form.objectives} onChange={set('objectives')} rows={2} placeholder="Apa yang ingin dicapai?" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="brief-audience">Target audiens</Label>
                <Textarea id="brief-audience" value={form.targetAudience} onChange={set('targetAudience')} rows={2} placeholder="Siapa yang dituju?" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="brief-messages">Pesan kunci</Label>
                <Textarea id="brief-messages" value={form.keyMessages} onChange={set('keyMessages')} rows={2} placeholder="Poin utama yang harus tersampaikan" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="brief-deliverables">Deliverables</Label>
                <Textarea id="brief-deliverables" value={form.deliverables} onChange={set('deliverables')} rows={2} placeholder="Mis. 1 video 60s + 5 foto" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="brief-timeline">Timeline</Label>
                <Input id="brief-timeline" value={form.timeline} onChange={set('timeline')} placeholder="Mis. 3 minggu" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="brief-budget">Rentang budget</Label>
                <Input id="brief-budget" value={form.budgetRange} onChange={set('budgetRange')} placeholder="Mis. Rp 15–25 juta" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="brief-refs">Referensi</Label>
                <Input id="brief-refs" value={form.references} onChange={set('references')} placeholder="Link referensi / moodboard" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="brief-constraints">Batasan</Label>
                <Input id="brief-constraints" value={form.constraints} onChange={set('constraints')} placeholder="Larangan brand, lokasi, dsb." />
              </div>
            </div>
            <label htmlFor="brief-final" className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <Switch id="brief-final" checked={status === 'FINAL'} onCheckedChange={(v) => setStatus(v ? 'FINAL' : 'DRAFT')} />
              <span className="text-xs leading-relaxed text-slate-600">
                <span className="block font-semibold text-slate-800">Finalisasi brief</span>
                Brief final siap dibawa ke tim produksi & estimasi biaya.
              </span>
            </label>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving || loading}>Batal</Button>
          <Button onClick={() => void submit()} disabled={saving || loading} className="gap-1.5 bg-slate-900 text-white hover:bg-slate-800">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />} Simpan Brief
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ================================================================== */
/* Panel konteks lead — dipakai sidebar desktop & sheet mobile          */
/* ================================================================== */
function SidebarBody({ opp, briefStatus, tasks, quotations, loadingLists, onToggleTask, onOpenBrief, onNewTask, onNewQuotation, onOpenOpportunity }: {
  opp: OpportunityDetailDTO | null
  briefStatus: 'LOADING' | 'NONE' | 'DRAFT' | 'FINAL'
  tasks: TaskDTO[]
  quotations: QuotationDTO[]
  loadingLists: boolean
  onToggleTask: (t: TaskDTO) => void
  onOpenBrief: () => void
  onNewTask: () => void
  onNewQuotation: () => void
  onOpenOpportunity: () => void
}) {
  const openTasks = tasks.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS')
  return (
    <div className="space-y-3 p-3">
      {/* Konteks lead */}
      <section className="rounded-xl border border-slate-200 bg-white p-3.5">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 shrink-0 text-teal-600" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Konteks Lead</h3>
        </div>
        {!opp ? (
          <p className="mt-2 text-xs text-slate-400">Memuat detail lead…</p>
        ) : (
          <>
            <p className="mt-2 line-clamp-2 text-sm font-semibold text-slate-900">{opp.title}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <StageBadge stage={opp.stage} />
              <TempBadge temperature={opp.temperature} />
              <button type="button" onClick={onOpenOpportunity} className="font-mono text-[10px] text-slate-400 hover:text-teal-700 hover:underline" title="Buka opportunity terkait">
                {opp.code}
              </button>
            </div>
            <p className="mt-2.5 text-lg font-bold tabular-nums text-slate-900">{formatMoney(opp.estimatedValue, opp.currency)}</p>
            <dl className="mt-2 space-y-1.5 text-xs">
              <div className="flex items-center gap-2">
                <dt className="w-24 shrink-0 text-slate-400">Owner</dt>
                <dd className="flex min-w-0 items-center gap-1.5 text-slate-700">
                  <UserAvatar name={opp.ownerName} color={opp.ownerColor} size={18} /> <span className="truncate">{opp.ownerName}</span>
                </dd>
              </div>
              <div className="flex items-center gap-2">
                <dt className="shrink-0 text-slate-400">Peluang</dt>
                <dd className="font-semibold text-slate-700">{opp.probability}%</dd>
              </div>
              {opp.nextAction && (
                <div className="flex items-start gap-2">
                  <dt className="w-24 shrink-0 text-slate-400">Aksi next</dt>
                  <dd className="min-w-0 flex-1 text-slate-700">{opp.nextAction}</dd>
                </div>
              )}
              {opp.deadline && (
                <div className="flex items-center gap-2">
                  <dt className="shrink-0 text-slate-400">Tenggat</dt>
                  <dd className="flex items-center gap-1 text-slate-700"><CalendarClock className="h-3 w-3" /> {formatDate(opp.deadline)}</dd>
                </div>
              )}
            </dl>
          </>
        )}
      </section>

      {/* Aksi cepat */}
      <section className="rounded-xl border border-slate-200 bg-white p-3.5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Aksi Cepat</h3>
        <div className="mt-2.5 grid grid-cols-1 gap-2">
          <button
            type="button" onClick={onNewQuotation}
            className="flex items-center gap-3 rounded-xl border border-teal-200 bg-teal-50/70 px-3 py-2.5 text-left transition-colors hover:border-teal-300 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-700 text-white"><Receipt className="h-4 w-4" /></span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-900">Buat Penawaran</span>
              <span className="block truncate text-[11px] text-slate-500">Draft quotation + kirim ringkasan ke chat</span>
            </span>
          </button>
          <button
            type="button" onClick={onOpenBrief}
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-left transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-white"><ClipboardList className="h-4 w-4" /></span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-900">{briefStatus === 'NONE' ? 'Buat Brief' : 'Buka Brief'}</span>
              <span className="block truncate text-[11px] text-slate-500">
                {briefStatus === 'LOADING' ? 'Memeriksa brief…' : briefStatus === 'NONE' ? 'Belum ada brief untuk lead ini' : briefStatus === 'FINAL' ? 'Brief FINAL — klik untuk ubah' : 'Brief draft tersimpan — klik untuk lanjut'}
              </span>
            </span>
            {briefStatus === 'FINAL' && <Badge className="ml-auto shrink-0 bg-emerald-600 text-[9px] text-white">FINAL</Badge>}
            {briefStatus === 'DRAFT' && <Badge variant="outline" className="ml-auto shrink-0 border-amber-200 bg-amber-50 text-[9px] text-amber-700">DRAFT</Badge>}
          </button>
          <button
            type="button" onClick={onNewTask}
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-left transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-white"><ListChecks className="h-4 w-4" /></span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-900">Assign Tugas</span>
              <span className="block truncate text-[11px] text-slate-500">Delegasikan follow-up ke anggota tim</span>
            </span>
          </button>
        </div>
      </section>

      {/* Tugas */}
      <section className="rounded-xl border border-slate-200 bg-white p-3.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Tugas ({openTasks.length} aktif)</h3>
          <button type="button" onClick={onNewTask} className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60" aria-label="Assign tugas baru">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className={cn('mt-2 space-y-1.5', tasks.length > 4 && 'max-h-60 overflow-y-auto pr-1', SCROLLBAR)}>
          {loadingLists && tasks.length === 0 ? (
            <p className="py-2 text-xs text-slate-400">Memuat tugas…</p>
          ) : tasks.length === 0 ? (
            <p className="py-2 text-xs text-slate-400">Belum ada tugas. Assign tugas agar follow-up tidak terlewat.</p>
          ) : tasks.map((t) => {
            const done = t.status === 'DONE'
            const overdue = !done && isTaskOverdue(t.dueDate)
            return (
              <div key={t.id} className={cn('flex items-start gap-2 rounded-lg border px-2.5 py-2', done ? 'border-slate-100 bg-slate-50/60' : overdue ? 'border-rose-200 bg-rose-50/50' : 'border-slate-200 bg-white')}>
                <button
                  type="button" role="checkbox" aria-checked={done} aria-label={done ? `Tandai ${t.title} belum selesai` : `Tandai ${t.title} selesai`}
                  onClick={() => onToggleTask(t)}
                  className={cn(
                    'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400',
                    done ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white hover:border-emerald-500',
                  )}
                >
                  {done && <Check className="h-3 w-3" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={cn('truncate text-xs font-medium', done ? 'text-slate-400 line-through' : 'text-slate-800')} title={t.title}>{t.title}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                    <span className="inline-flex items-center gap-1 text-slate-400"><User className="h-2.5 w-2.5" />{t.assigneeName ?? '—'}</span>
                    {t.dueDate && (
                      <span className={cn('inline-flex items-center gap-1', overdue ? 'font-semibold text-rose-600' : 'text-slate-400')}>
                        <CalendarClock className="h-2.5 w-2.5" />{formatDate(t.dueDate)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Penawaran */}
      <section className="rounded-xl border border-slate-200 bg-white p-3.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Penawaran ({quotations.length})</h3>
          <button type="button" onClick={onNewQuotation} className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60" aria-label="Buat penawaran baru">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className={cn('mt-2 space-y-1.5', quotations.length > 4 && 'max-h-60 overflow-y-auto pr-1', SCROLLBAR)}>
          {loadingLists && quotations.length === 0 ? (
            <p className="py-2 text-xs text-slate-400">Memuat penawaran…</p>
          ) : quotations.length === 0 ? (
            <p className="py-2 text-xs text-slate-400">Belum ada penawaran. Buat dari aksi cepat di atas.</p>
          ) : quotations.map((q) => {
            const st = QUO_STATUS[q.status] ?? QUO_STATUS.DRAFT
            return (
              <div key={q.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-800" title={q.title}>{q.title}</p>
                  <p className="mt-0.5 text-[10px] text-slate-400"><span className="font-mono">{q.code}</span> · {formatDate(q.createdAt)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-bold tabular-nums text-slate-900">{formatMoney(q.total, q.currency, true)}</p>
                  <Badge variant="outline" className={cn('mt-0.5 px-1.5 py-px text-[9px]', st.cls)}>{st.label}</Badge>
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

const isTaskOverdue = (iso?: string | null) => {
  if (!iso) return false
  const d = daysUntil(iso)
  return d !== null && d < 0
}

/* ================================================================== */
/* View utama: overlay full-screen                                     */
/* ================================================================== */
export function ChatFocusView({ conv, conversations, activeConvId, onSelectConversation, listToolbar, onClose, onMessageSent, onActivity, onOpenOpportunity }: {
  conv: ConversationListItemDTO
  /** Daftar percakapan utk switcher (sidebar desktop ≥xl / drawer mobile <xl) — opsional */
  conversations?: ConversationListItemDTO[]
  activeConvId?: string | null
  onSelectConversation?: (id: string) => void
  /** Slot toolbar filter bersama dari inbox-view (search, chip brand, kanal, belum-dibalas) */
  listToolbar?: React.ReactNode
  onClose: () => void
  onMessageSent: (m: InteractionDTO) => void
  onActivity: () => void
  onOpenOpportunity: (id: string) => void
}) {
  const { toast } = useToast()
  const oppId = conv.opportunityId

  /* ---------- Thread ---------- */
  const [thread, setThread] = useState<InteractionDTO[] | null>(null)
  const [threadLoading, setThreadLoading] = useState(true)

  /* ---------- Composer ---------- */
  const [chatBody, setChatBody] = useState('')
  const [chatChannel, setChatChannel] = useState('WHATSAPP')
  const [chatSending, setChatSending] = useState(false)
  // Draft per percakapan — berganti kontak via switcher tidak menghilangkan ketikan
  const draftsRef = useRef(new Map<string, string>())
  const [templates, setTemplates] = useState<React.ComponentState>(null)
  const [isCoarse, setIsCoarse] = useState(false)

  /* ---------- Data panel ---------- */
  const [oppDetail, setOppDetail] = useState<OpportunityDetailDTO | null>(null)
  const [tasks, setTasks] = useState<TaskDTO[]>([])
  const [quotations, setQuotations] = useState<QuotationDTO[]>([])
  const [briefStatus, setBriefStatus] = useState<'LOADING' | 'NONE' | 'DRAFT' | 'FINAL'>('LOADING')
  const [loadingLists, setLoadingLists] = useState(true)

  /* ---------- UI state ---------- */
  const [infoOpen, setInfoOpen] = useState(false)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [showJump, setShowJump] = useState(false)
  const stickToBottomRef = useRef(true)
  const threadRef = useRef<HTMLDivElement>(null)
  const chatTaRef = useRef<HTMLTextAreaElement>(null)
  const [taskOpen, setTaskOpen] = useState(false)
  const [quoOpen, setQuoOpen] = useState(false)
  const [briefOpen, setBriefOpen] = useState(false)
  const [users, setUsers] = useState<UserDTO[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  /* ---------- ESC utk tutup (handler di container, BUKAN window —
     dialog Radix ter-render di portal document.body sehingga ESC saat dialog
     terbuka tidak pernah sampai ke container ini; hanya menutup view fokus
     ketika tidak ada dialog. Info sheet (bukan portal) ditutup lebih dulu.) ---------- */
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    // Fokus ke container agar ESC (onKeyDown container) langsung aktif tanpa klik dulu
    containerRef.current?.focus({ preventScroll: true })
    return () => { document.body.style.overflow = '' }
  }, [])
  const handleContainerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape' || e.nativeEvent.isComposing) return
    // Event keyboard di dalam dialog Radix (portal document.body) membubble lewat React tree
    // hingga ke container ini. Cek DOM asli: bila target BUKAN keturunan container → event
    // berasal dari dialog portal; biarkan Radix menutup dialognya sendiri.
    const target = e.target as Node | null
    if (target && containerRef.current && !containerRef.current.contains(target)) return
    e.stopPropagation()
    if (switcherOpen) { setSwitcherOpen(false); return }
    if (infoOpen) { setInfoOpen(false); return }
    onClose()
  }

  /* Saat dialog/sheet menutup, Radix sering mengembalikan fokus ke <body>
     (trigger diklik secara programatik tidak memindahkan fokus). Kembalikan fokus
     ke container agar ESC "tutup view fokus" tetap bekerja setelah dialog ditutup. */
  useEffect(() => {
    if (!taskOpen && !quoOpen && !briefOpen && !infoOpen && !switcherOpen) {
      containerRef.current?.focus({ preventScroll: true })
    }
  }, [taskOpen, quoOpen, briefOpen, infoOpen, switcherOpen])

  /* Pindah percakapan (switcher) → pulihkan draft milik percakapan tsb */
  useEffect(() => {
    setChatBody(draftsRef.current.get(oppId) ?? '')
  }, [oppId])

  /* ---------- Keyboard semantik: coarse pointer = Enter newline ---------- */
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)')
    const update = () => setIsCoarse(mq.matches)
    update()
    mq.addEventListener?.('change', update)
    return () => mq.removeEventListener?.('change', update)
  }, [])

  /* ---------- Muat data saat dibuka ---------- */
  useEffect(() => {
    let cancelled = false
    setThreadLoading(true)
    setThread(null)
    crmApi.opportunityThread(oppId)
      .then((msgs) => { if (!cancelled) setThread(msgs) })
      .catch((e) => {
        if (cancelled) return
        toast({ title: 'Gagal memuat thread percakapan', description: e instanceof Error ? e.message : 'Coba lagi', variant: 'destructive' })
      })
      .finally(() => { if (!cancelled) setThreadLoading(false) })
    return () => { cancelled = true }
  }, [oppId, toast])

  const loadLists = useCallback(async () => {
    setLoadingLists(true)
    try {
      const [detail, taskList, quoList] = await Promise.all([
        crmApi.opportunity(oppId).catch(() => null),
        crmApi.tasks(`opportunityId=${oppId}`).catch(() => [] as TaskDTO[]),
        financeApi.quotations(`opportunityId=${oppId}`).catch(() => [] as QuotationDTO[]),
      ])
      setOppDetail(detail)
      setTasks(taskList)
      setQuotations(quoList)
    } finally {
      setLoadingLists(false)
    }
  }, [oppId])

  useEffect(() => { void loadLists() }, [loadLists])

  useEffect(() => {
    let cancelled = false
    setBriefStatus('LOADING')
    estimationApi.brief(oppId)
      .then((b) => { if (!cancelled) setBriefStatus(b ? b.status : 'NONE') })
      .catch(() => { if (!cancelled) setBriefStatus('NONE') })
    return () => { cancelled = true }
  }, [oppId, briefOpen])

  /* Users utk dialog tugas — fetch sekali */
  useEffect(() => {
    if (users.length > 0) return
    crmApi.users().then(setUsers).catch(() => { /* dialog tetap bisa dibuka; pilihan kosong */ })
  }, [users.length])

  /* ---------- Auto-scroll & jump ---------- */
  useEffect(() => {
    const el = threadRef.current
    if (!el) return
    stickToBottomRef.current = true
    setShowJump(false)
    el.scrollTop = el.scrollHeight
  }, [oppId])
  useEffect(() => {
    const el = threadRef.current
    if (!el || !stickToBottomRef.current) return
    el.scrollTop = el.scrollHeight
  }, [thread?.length])
  const handleThreadScroll = useCallback(() => {
    const el = threadRef.current
    if (!el) return
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight
    stickToBottomRef.current = gap < 80
    setShowJump(gap > 160)
  }, [])
  const jumpToLatest = useCallback(() => {
    const el = threadRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    stickToBottomRef.current = true
    setShowJump(false)
  }, [])

  /* ---------- Auto-resize textarea ---------- */
  useEffect(() => {
    const el = chatTaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 140)}px`
    }
  }, [chatBody])

  /* ---------- Balasan cepat ---------- */
  useEffect(() => {
    if (templates !== null) return
    let cancelled = false
    crmApi.templates()
      .then((t) => { if (!cancelled) setTemplates(t) })
      .catch(() => { if (!cancelled) setTemplates([]) })
    return () => { cancelled = true }
  }, [templates])

  /* ---------- Kirim pesan ---------- */
  const handleSend = async () => {
    if (!chatBody.trim() || chatSending) return
    setChatSending(true)
    try {
      const msg = await crmApi.addInteraction(oppId, { channel: chatChannel, direction: 'OUT', body: chatBody.trim() })
      setThread((prev) => (prev ? [...prev, msg] : [msg]))
      setChatBody('')
      draftsRef.current.set(oppId, '')
      onMessageSent(msg)
      toast({ title: 'Pesan terkirim', description: `Kepada ${conv.contactName} via ${channelMeta(chatChannel).label}.` })
    } catch (e) {
      toast({ title: 'Gagal mengirim pesan', description: e instanceof Error ? e.message : 'Coba lagi', variant: 'destructive' })
    } finally {
      setChatSending(false)
    }
  }

  /* ---------- Toggle status tugas ---------- */
  const handleToggleTask = async (t: TaskDTO) => {
    const next = t.status === 'DONE' ? 'OPEN' : 'DONE'
    try {
      const updated = await crmApi.updateTask(t.id, { status: next })
      setTasks((arr) => arr.map((x) => (x.id === t.id ? updated : x)))
      onActivity()
    } catch (e) {
      toast({ title: 'Gagal mengubah tugas', description: e instanceof Error ? e.message : 'Coba lagi', variant: 'destructive' })
    }
  }

  /* ---------- Callback dialog ---------- */
  const handleTaskCreated = (t: TaskDTO) => {
    setTasks((arr) => [t, ...arr])
    onActivity()
  }
  const handleQuotationCreated = (q: QuotationDTO, msg?: InteractionDTO) => {
    setQuotations((arr) => [q, ...arr])
    // Ringkasan penawaran (bila dikirim) langsung tampil sebagai bubble OUT di timeline
    if (msg) setThread((prev) => (prev ? [...prev, msg] : [msg]))
    onActivity()
  }
  const handleBriefSaved = (b: BriefDTO) => {
    setBriefStatus(b.status)
    onActivity()
  }

  const messages = thread ?? []
  const channelOptions = CHAT_CHANNELS

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      onKeyDown={handleContainerKeyDown}
      className="fixed inset-0 z-50 flex flex-col bg-slate-100 outline-none"
      role="dialog"
      aria-modal="true"
      aria-label={`Percakapan dengan ${conv.contactName}`}
    >
      {/* ===== Header ===== */}
      <header className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-2 py-2 sm:px-4">
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Kembali ke daftar percakapan" className="h-9 w-9 shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        {onSelectConversation && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSwitcherOpen(true)}
            aria-label="Ganti percakapan"
            title="Ganti percakapan"
            className="h-9 w-9 shrink-0 xl:hidden"
          >
            <MessagesSquare className="h-5 w-5" />
          </Button>
        )}
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ring-2 ring-white"
          style={{ backgroundColor: conv.brandColor }}
          aria-hidden
        >
          {initials(conv.contactName)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{conv.contactName}</p>
          <div className="flex min-w-0 items-center gap-1.5">
            {conv.companyName && <span className="truncate text-xs text-slate-500">{conv.companyName} ·</span>}
            <BrandChip name={conv.brandName} color={conv.brandColor} size="xs" />
            {conv.unanswered && (
              <Badge variant="outline" className="hidden border-amber-200 bg-amber-50 px-1.5 py-px text-[9px] font-semibold text-amber-700 sm:inline-flex">Belum dibalas</Badge>
            )}
            {conv.escalated && (
              <Badge variant="outline" className="hidden border-rose-200 bg-rose-50 px-1.5 py-px text-[9px] font-semibold text-rose-700 sm:inline-flex">SLA terlampaui</Badge>
            )}
          </div>
        </div>
        <div className="hidden shrink-0 items-center gap-2 md:flex">
          <button
            type="button"
            onClick={() => onOpenOpportunity(oppId)}
            title="Buka opportunity terkait"
            className="font-mono text-[10px] text-slate-400 hover:text-teal-700 hover:underline"
          >
            {conv.opportunityCode}
          </button>
          <StageBadge stage={conv.stage} />
        </div>
        <Button variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 lg:hidden" onClick={() => setInfoOpen(true)}>
          <FileBarChart2 className="h-3.5 w-3.5" /> Info
        </Button>
      </header>

      {/* ===== Body: switcher percakapan + chat + sidebar ===== */}
      <div className="flex min-h-0 flex-1">
        {/* Daftar percakapan — switcher desktop (≥xl): berganti kontak tanpa keluar dari mode fokus */}
        {onSelectConversation && (
          <aside className="hidden w-[300px] shrink-0 flex-col border-r border-slate-200 bg-white xl:flex" aria-label="Daftar percakapan">
            <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-3.5 py-2.5">
              <MessagesSquare className="h-4 w-4 shrink-0 text-teal-600" aria-hidden />
              <h2 className="text-sm font-semibold text-slate-900">Percakapan</h2>
              <span className="ml-auto shrink-0 text-[10px] tabular-nums text-slate-400">{conversations?.length ?? 0}</span>
            </div>
            <ConversationList
              rows={conversations ?? []}
              activeId={activeConvId}
              onSelect={onSelectConversation}
              toolbar={listToolbar}
              loading={conversations === undefined}
              ariaLabel="Ganti percakapan"
            />
          </aside>
        )}

        {/* Kolom chat */}
        <section className="flex min-w-0 flex-1 flex-col">
          {/* Timeline */}
          <div className="relative min-h-0 flex-1">
            <div
              ref={threadRef}
              role="log"
              aria-label="Timeline pesan"
              aria-live="polite"
              onScroll={handleThreadScroll}
              className={cn('absolute inset-0 overflow-y-auto p-3 sm:p-5', SCROLLBAR)}
            >
              <div className="mx-auto max-w-3xl">
                {threadLoading && !thread ? (
                  <div className="space-y-2.5" aria-hidden>
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className={cn('flex', i % 2 === 0 ? 'justify-start' : 'justify-end')}>
                        <div
                          className="h-10 w-2/3 max-w-[300px] animate-pulse rounded-2xl bg-slate-200/70"
                          style={{ animationDelay: `${i * 120}ms` }}
                        />
                      </div>
                    ))}
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <EmptyState
                      icon={<Send className="h-6 w-6" />}
                      title="Belum ada pesan"
                      description="Mulai percakapan dengan mengirim pesan dari kolom di bawah."
                    />
                  </div>
                ) : (
                  messages.map((m, i) => {
                    const prev = i > 0 ? messages[i - 1] : null
                    const next = i < messages.length - 1 ? messages[i + 1] : null
                    const showDate = !prev || !sameDay(new Date(prev.sentAt), new Date(m.sentAt))
                    const isIn = m.direction !== 'OUT'
                    const near = (a: InteractionDTO | null, b: InteractionDTO | null) =>
                      !!a && !!b && a.direction === b.direction && a.channel === b.channel
                      && sameDay(new Date(a.sentAt), new Date(b.sentAt))
                      && Math.abs(new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()) < 5 * 60_000
                    const groupedPrev = !showDate && near(prev, m)
                    const groupedNext = !!(next && near(m, next))
                    return (
                      <div key={m.id} className={showDate ? 'mt-1.5' : groupedPrev ? 'mt-0.5' : 'mt-2.5'}>
                        {showDate && (
                          <div className="mb-2 flex items-center gap-2">
                            <span className="h-px flex-1 bg-slate-200" aria-hidden />
                            <span className="rounded-full bg-slate-200/80 px-3 py-0.5 text-[10px] font-semibold text-slate-600">{dayLabel(m.sentAt)}</span>
                            <span className="h-px flex-1 bg-slate-200" aria-hidden />
                          </div>
                        )}
                        <div className={cn('flex', isIn ? 'justify-start' : 'justify-end')}>
                          <div
                            className={cn(
                              'max-w-[88%] rounded-2xl px-3.5 py-2 shadow-sm sm:max-w-[75%]',
                              isIn
                                ? cn('border border-slate-200 bg-white text-slate-800', groupedPrev ? 'rounded-tl-md' : 'rounded-tl-sm', groupedNext ? 'rounded-bl-md' : 'rounded-bl-2xl')
                                : cn('bg-emerald-600 text-white', groupedPrev ? 'rounded-tr-md' : 'rounded-tr-sm', groupedNext ? 'rounded-br-md' : 'rounded-br-2xl'),
                            )}
                          >
                            {m.subject && (
                              <p className={cn('mb-0.5 break-words text-xs font-bold', isIn ? 'text-slate-900' : 'text-white')}>{m.subject}</p>
                            )}
                            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{m.body}</p>
                            <div className={cn('mt-1 flex items-center gap-1.5 text-[10px]', isIn ? 'text-slate-400' : 'text-emerald-100')}>
                              {m.channel !== 'WHATSAPP' && (
                                <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-px font-medium', isIn ? 'bg-slate-100 text-slate-500' : 'bg-white/15 text-white')}>
                                  {isIn ? <ChannelIcon channel={m.channel} className="h-3 w-3" /> : (OUT_CHANNEL_ICON[m.channel] ?? <Globe className="h-3 w-3" />)}
                                  {channelMeta(m.channel).label}
                                </span>
                              )}
                              <span className="ml-auto shrink-0 tabular-nums" title={new Date(m.sentAt).toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' })}>
                                {formatDate(m.sentAt, true)}
                              </span>
                              {!isIn && (
                                m.status === 'READ'
                                  ? <CheckCheck className="h-3.5 w-3.5 shrink-0" aria-label="Dibaca" />
                                  : m.status === 'SENT'
                                    ? <Check className="h-3.5 w-3.5 shrink-0" aria-label="Terkirim" />
                                    : <Clock className="h-3.5 w-3.5 shrink-0" aria-label={m.status || 'Menunggu'} />
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
            {showJump && (
              <button
                type="button"
                onClick={jumpToLatest}
                className="absolute bottom-3 right-4 flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-[11px] font-medium text-slate-600 shadow-md transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                <ChevronDown className="h-3.5 w-3.5" /> Ke pesan terbaru
              </button>
            )}
          </div>

          {/* Chip aksi cepat — di atas composer (mobile utama; desktop tetap berguna) */}
          <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-t border-slate-200 bg-white px-3 py-2 sm:px-4" role="group" aria-label="Aksi cepat follow-up">
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Aksi</span>
            <button
              type="button" onClick={() => setQuoOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800 transition-colors hover:bg-teal-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50"
            >
              <Receipt className="h-3.5 w-3.5" /> Penawaran
            </button>
            <button
              type="button" onClick={() => setBriefOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50"
            >
              <ClipboardList className="h-3.5 w-3.5" /> Brief
            </button>
            <button
              type="button" onClick={() => setTaskOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50"
            >
              <ListChecks className="h-3.5 w-3.5" /> Tugas
            </button>
          </div>

          {/* Composer */}
          <div className="shrink-0 border-t border-slate-200 bg-white px-3 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-2.5 sm:px-4 sm:pb-3">
            <div className="mx-auto max-w-3xl">
              {Array.isArray(templates) && templates.length > 0 && (
                <div className="mb-2 flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:flex-wrap sm:overflow-visible">
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Balasan cepat</span>
                  {(templates as { id: string; name: string; body: string }[]).slice(0, 6).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      title={t.body}
                      onClick={() => {
                        setChatBody(t.body)
                        draftsRef.current.set(oppId, t.body)
                      }}
                      className="max-w-[220px] shrink-0 truncate rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60"
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2">
                <Textarea
                  ref={chatTaRef}
                  value={chatBody}
                  onChange={(e) => {
                    const v = e.target.value
                    setChatBody(v)
                    draftsRef.current.set(oppId, v)
                  }}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      e.preventDefault()
                      void handleSend()
                      return
                    }
                    if (e.key === 'Enter' && !e.shiftKey && !isCoarse && !e.nativeEvent.isComposing) {
                      e.preventDefault()
                      void handleSend()
                    }
                  }}
                  placeholder={`Tulis pesan untuk ${conv.contactName}…`}
                  rows={1}
                  className="min-h-[40px] max-h-[140px] flex-1 resize-none py-2"
                  aria-label="Tulis pesan balasan"
                />
                <Select value={chatChannel} onValueChange={setChatChannel}>
                  <SelectTrigger aria-label="Kanal pengiriman" className="h-9 w-[104px] shrink-0 text-xs sm:w-[124px] sm:text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {channelOptions.map((c) => (
                      <SelectItem key={c} value={c}>{channelMeta(c).label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => void handleSend()}
                  disabled={chatSending || !chatBody.trim()}
                  className="h-9 shrink-0 gap-1.5 bg-emerald-600 px-3 text-white hover:bg-emerald-700"
                  aria-label="Kirim pesan"
                >
                  {chatSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  <span className="hidden sm:inline">Kirim</span>
                </Button>
              </div>
              {!isCoarse && (
                <p className="mt-1 text-right text-[10px] text-slate-400">
                  <kbd className="rounded border border-slate-200 bg-slate-50 px-1 font-sans">Enter</kbd> kirim ·
                  <kbd className="ml-0.5 rounded border border-slate-200 bg-slate-50 px-1 font-sans">Shift+Enter</kbd> baris baru ·
                  <kbd className="ml-0.5 rounded border border-slate-200 bg-slate-50 px-1 font-sans">Esc</kbd> kembali
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Sidebar konteks — desktop */}
        <aside className={cn('hidden w-[340px] shrink-0 overflow-y-auto border-l border-slate-200 bg-slate-50/70 xl:w-[380px] lg:block', SCROLLBAR)} aria-label="Panel konteks lead">
          <SidebarBody
            opp={oppDetail}
            briefStatus={briefStatus}
            tasks={tasks}
            quotations={quotations}
            loadingLists={loadingLists}
            onToggleTask={(t) => void handleToggleTask(t)}
            onOpenBrief={() => setBriefOpen(true)}
            onNewTask={() => setTaskOpen(true)}
            onNewQuotation={() => setQuoOpen(true)}
            onOpenOpportunity={() => onOpenOpportunity(oppId)}
          />
        </aside>
      </div>

      {/* Drawer daftar percakapan — switcher mobile/tablet (<xl) */}
      {switcherOpen && onSelectConversation && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-white xl:hidden" role="dialog" aria-modal="true" aria-label="Ganti percakapan">
          <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 py-2.5">
            <Button variant="ghost" size="icon" onClick={() => setSwitcherOpen(false)} aria-label="Tutup daftar percakapan" className="h-9 w-9 shrink-0">
              <X className="h-5 w-5" />
            </Button>
            <h2 className="text-sm font-semibold text-slate-900">Percakapan</h2>
            <span className="ml-auto shrink-0 text-[10px] tabular-nums text-slate-400">{conversations?.length ?? 0}</span>
          </div>
          <ConversationList
            rows={conversations ?? []}
            activeId={activeConvId}
            onSelect={(id) => { onSelectConversation(id); setSwitcherOpen(false) }}
            toolbar={listToolbar}
            loading={conversations === undefined}
            ariaLabel="Daftar percakapan"
          />
        </div>
      )}

      {/* Sheet Info (mobile/tablet) */}
      {infoOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-slate-100 lg:hidden" role="dialog" aria-modal="true" aria-label="Info lead">
          <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 py-2.5">
            <Button variant="ghost" size="icon" onClick={() => setInfoOpen(false)} aria-label="Tutup info lead" className="h-9 w-9 shrink-0">
              <X className="h-5 w-5" />
            </Button>
            <h2 className="text-sm font-semibold text-slate-900">Info Lead — {conv.contactName}</h2>
          </div>
          <div className={cn('min-h-0 flex-1 overflow-y-auto', SCROLLBAR)}>
            <SidebarBody
              opp={oppDetail}
              briefStatus={briefStatus}
              tasks={tasks}
              quotations={quotations}
              loadingLists={loadingLists}
              onToggleTask={(t) => void handleToggleTask(t)}
              onOpenBrief={() => { setInfoOpen(false); setBriefOpen(true) }}
              onNewTask={() => { setInfoOpen(false); setTaskOpen(true) }}
              onNewQuotation={() => { setInfoOpen(false); setQuoOpen(true) }}
              onOpenOpportunity={() => { setInfoOpen(false); onOpenOpportunity(oppId) }}
            />
          </div>
        </div>
      )}

      {/* Dialog aksi */}
      <AssignTaskDialog open={taskOpen} onOpenChange={setTaskOpen} opp={conv} users={users} onCreated={handleTaskCreated} />
      <QuotationDialog open={quoOpen} onOpenChange={setQuoOpen} opp={conv} onCreated={handleQuotationCreated} />
      <BriefDialog open={briefOpen} onOpenChange={setBriefOpen} opp={conv} onSaved={handleBriefSaved} />
    </div>
  )
}
