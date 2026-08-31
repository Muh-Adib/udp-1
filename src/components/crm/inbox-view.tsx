/* ============ Lead Inbox — Omnichannel + Anti-Duplikat ============ */
'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { crmApi } from './api-client'
import { useCrmStore } from './crm-store'
import { BrandChip, ChannelIcon, EmptyState, LoadingRows, RefreshButton, StageBadge, UserAvatar } from './shared'
import { CHANNELS, channelMeta, formatDate, initials, PRIORITIES, timeAgo } from '@/lib/crm-constants'
import type { ContactDTO, ConversationListItemDTO, DuplicateCandidate, InteractionDTO, OpportunityDTO, TemplateDTO } from '@/lib/crm-types'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
  AlertTriangle, Building2, Check, CheckCheck, ChevronDown, Clock, Flame, Globe, Inbox, Instagram, List, Loader2,
  Mail, Merge, MessagesSquare, Phone, Plus, Search, Send, Users, X,
} from 'lucide-react'

const NONE = '__none__'
const ALL = '__all__'

/* Mapping channel → leadSource untuk create opportunity */
const CHANNEL_TO_LEAD_SOURCE: Record<string, string> = {
  WHATSAPP: 'WHATSAPP',
  EMAIL: 'EMAIL',
  INSTAGRAM: 'INSTAGRAM',
  WEBSITE: 'WEBSITE',
  PHONE: 'COLD_CALL',
  MEETING: 'REFERRAL',
}

const MATCH_META: Record<string, { label: string; cls: string }> = {
  EMAIL: { label: 'Email', cls: 'border-amber-200 bg-amber-50 text-amber-700' },
  WHATSAPP: { label: 'WhatsApp', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  PHONE: { label: 'Telepon', cls: 'border-orange-200 bg-orange-50 text-orange-700' },
}

const dupKey = (c: DuplicateCandidate) => `${c.matchType}:${c.contactA.id}:${c.contactB.id}`

/* ---------- Mode Chat: kanal composer + tipe percakapan ---------- */
const CHAT_CHANNELS = ['WHATSAPP', 'EMAIL', 'INSTAGRAM', 'PHONE'] as const

/** Ikon putih untuk bubble OUT (ChannelIcon memakai warna meta — kurang kontras di atas emerald). */
const OUT_CHANNEL_ICON: Record<string, ReactNode> = {
  EMAIL: <Mail className="h-3 w-3" />,
  INSTAGRAM: <Instagram className="h-3 w-3" />,
  PHONE: <Phone className="h-3 w-3" />,
  WEBSITE: <Globe className="h-3 w-3" />,
  MEETING: <Users className="h-3 w-3" />,
}

type SlaBreach = { over: number; sla: number; brandName: string }

/** Percakapan = interaksi ter-filter digroup per opportunity (client-side, tanpa API baru). */
type Conversation = {
  opportunityId: string
  contactName: string
  companyName?: string | null
  brandName: string
  brandColor: string
  opportunityTitle?: string | null
  messages: InteractionDTO[]
  last: InteractionDTO
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/** Label pemisah tanggal: Hari Ini / Kemarin / tanggal singkat. */
const dayLabel = (iso: string) => {
  const d = new Date(iso)
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(d, now)) return 'Hari Ini'
  if (sameDay(d, yesterday)) return 'Kemarin'
  return formatDate(iso)
}

/* ---------- Chip SLA + tingkat eskalasi (solid rose + Flame bila menunggu > 2× sla) ---------- */
function SlaChip({ breach }: { breach: SlaBreach }) {
  const escalated = breach.over > breach.sla
  if (escalated) {
    return (
      <span
        title={`Melewati ${breach.sla * 2} jam — eskalasi ke pemberi lead`}
        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold text-white"
      >
        <Flame className="h-3 w-3" /> ESKALASI +{breach.over}j
      </span>
    )
  }
  return (
    <span
      title={`Melewati SLA respons ${breach.brandName} (${breach.sla} jam)`}
      className="shrink-0 rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700"
    >
      SLA +{breach.over}j
    </span>
  )
}

/* ---------- Baris percakapan (mode Chat — kolom kiri desktop) ---------- */
function ConversationRow({ conv, active, breach, onSelect }: {
  conv: Conversation
  active: boolean
  breach?: SlaBreach
  onSelect: () => void
}) {
  const unanswered = conv.last.direction === 'IN'
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'block w-full border-l-[3px] px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400/60',
        active ? 'bg-slate-100 hover:bg-slate-100' : 'bg-white hover:bg-slate-50',
      )}
      style={{ borderLeftColor: conv.brandColor }}
    >
      <div className="flex items-center gap-2">
        <p className={cn('min-w-0 flex-1 truncate text-sm', active ? 'font-semibold text-slate-900' : 'font-medium text-slate-800')}>
          {conv.contactName}
        </p>
        <span className="shrink-0 text-[10px] text-slate-400">{formatDate(conv.last.sentAt)}</span>
      </div>
      <p className="truncate text-xs text-slate-500">{conv.companyName ?? 'Tanpa perusahaan'}</p>
      <p className="mt-1 truncate text-xs text-slate-600">
        {conv.last.direction === 'OUT' ? 'Anda: ' : ''}{conv.last.body}
      </p>
      <div className="mt-1.5 flex items-center gap-1.5">
        {unanswered && (
          <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden /> belum dibalas
          </span>
        )}
        {breach && <SlaChip breach={breach} />}
      </div>
    </button>
  )
}

/* ---------- Baris percakapan SERVER (mode Chat — kolom kiri desktop) ----------
   Sumber: GET /api/conversations (ConversationListItemDTO) — preview lastMessage dari DB
   sehingga "Anda: …" & dot belum-dibalas persist setelah reload (fix gap kosmetik R12). */
function ServerConversationRow({ conv, active, onSelect }: {
  conv: ConversationListItemDTO
  active: boolean
  onSelect: () => void
}) {
  // Chip SLA memakai renderer existing (SlaBreach): escalated server = over > sla (2× SLA) — sama dgn formula SlaChip.
  // Won/Lost = pertanyaan SLA tak relevan lagi → chip disembunyikan (hindari "ESKALASI +291j" pada deal selesai).
  const closed = conv.stage === 'WON' || conv.stage === 'LOST'
  const breach: SlaBreach | undefined =
    !closed && conv.slaOverHours != null
      ? { over: conv.slaOverHours, sla: conv.slaHours ?? 24, brandName: conv.brandName }
      : undefined
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'block w-full border-l-[3px] px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400/60',
        active ? 'bg-slate-100 hover:bg-slate-100' : 'bg-white hover:bg-slate-50',
      )}
      style={{ borderLeftColor: conv.brandColor }}
    >
      <div className="flex items-center gap-2">
        <p className={cn('min-w-0 flex-1 truncate text-sm', active ? 'font-semibold text-slate-900' : 'font-medium text-slate-800')}>
          {conv.contactName}
        </p>
        <span className="shrink-0 text-[10px] text-slate-400">{formatDate(conv.lastSentAt, true)}</span>
      </div>
      <p className="truncate text-xs text-slate-500">{conv.companyName ?? 'Tanpa perusahaan'}</p>
      <p className="mt-1 truncate text-xs text-slate-600">
        {conv.lastDirection === 'OUT' && <span className="font-medium text-emerald-600">Anda: </span>}
        {conv.lastBody}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {conv.unanswered && (
          <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden /> belum dibalas
          </span>
        )}
        {breach && <SlaChip breach={breach} />}
        <StageBadge stage={conv.stage} />
      </div>
    </button>
  )
}

const SCROLLBAR = '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-transparent'

/* ---------- Kartu kontak kecil untuk dialog duplikat ---------- */
function DuplicateContactCard({ contact, tag }: { contact: ContactDTO; tag: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex items-center gap-2">
        <UserAvatar name={contact.fullName} color={tag === 'A' ? '#0d9488' : '#d97706'} size={26} />
        <p className="truncate text-sm font-semibold text-slate-900">{contact.fullName}</p>
        <span className="ml-auto rounded bg-white px-1.5 text-[10px] font-bold text-slate-400">KONTAK {tag}</span>
      </div>
      <p className="mt-1.5 truncate text-xs text-slate-500">{contact.company?.name ?? 'Tanpa perusahaan'}</p>
      <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-slate-500">
        <Mail className="h-3 w-3 shrink-0 text-slate-400" /> {contact.email ?? '—'}
      </p>
      <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-slate-500">
        <Phone className="h-3 w-3 shrink-0 text-slate-400" /> {contact.whatsapp ?? contact.phone ?? '—'}
      </p>
    </div>
  )
}

export default function InboxView() {
  const brands = useCrmStore((s) => s.brands)
  const openOpportunity = useCrmStore((s) => s.openOpportunity)
  const { toast } = useToast()

  /* ---------- Filter state ---------- */
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [brandId, setBrandId] = useState('')
  const [channel, setChannel] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(false)

  /* ---------- Data state ---------- */
  const [interactions, setInteractions] = useState<InteractionDTO[]>([])
  const [opportunities, setOpportunities] = useState<OpportunityDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /* ---------- Duplicate state ---------- */
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [dupOpen, setDupOpen] = useState(false)
  const [mergingKey, setMergingKey] = useState<string | null>(null)

  /* ---------- Dialog state ---------- */
  const [replyTarget, setReplyTarget] = useState<InteractionDTO | null>(null)
  const [replyChannel, setReplyChannel] = useState('WHATSAPP')
  const [replyBody, setReplyBody] = useState('')
  const [sending, setSending] = useState(false)

  const [createTarget, setCreateTarget] = useState<InteractionDTO | null>(null)
  const [oppForm, setOppForm] = useState({ title: '', brandId: '', serviceId: NONE, estimatedValue: '', brief: '', priority: 'MEDIUM' })
  const [creating, setCreating] = useState(false)

  const [webFormOpen, setWebFormOpen] = useState(false)
  const [wf, setWf] = useState({ name: '', email: '', whatsapp: '', brandId: '', serviceId: NONE, message: '' })
  const [submittingWf, setSubmittingWf] = useState(false)

  /* ---------- Mode Chat state ---------- */
  const [view, setView] = useState<'list' | 'chat'>('list')
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null)
  const [chatBody, setChatBody] = useState('')
  const [chatChannel, setChatChannel] = useState('WHATSAPP')
  const [chatSending, setChatSending] = useState(false)
  const [templates, setTemplates] = useState<TemplateDTO[] | null>(null)
  // Balasan OUT terkirim dari composer — dipakai di DUA tempat: (1) digabung ke grouping
  // percakapan LOKAL yang kini hanya fallback (API conversations gagal), (2) overlay
  // optimistik di atas daftar percakapan SERVER agar preview "Anda: …" & hilangnya dot
  // "belum dibalas" terlihat SEKETIKA setelah kirim (sebelum refetch conversations selesai).
  // Bukan lagi sumber utama preview — daftar server (lastMessage dari DB) yang authoritative
  // dan persist setelah reload (fix gap kosmetik R12); thread panel tetap append sendiri.
  const [sentExtras, setSentExtras] = useState<InteractionDTO[]>([])
  // Thread penuh IN+OUT hasil GET /api/opportunities/[id]/thread — sumber panel chat.
  // null = belum termuat utk percakapan terpilih (saat loading / gagal → fallback grouping lokal).
  const [thread, setThread] = useState<{ oppId: string; msgs: InteractionDTO[] } | null>(null)
  const [threadLoading, setThreadLoading] = useState(false)
  // Daftar percakapan SERVER (GET /api/conversations) — authoritative di mode Chat.
  // null = belum termuat / gagal → tampilan jatuh ke grouping lokal (view tidak pernah rusak).
  const [serverConvs, setServerConvs] = useState<ConversationListItemDTO[] | null>(null)
  const [convLoading, setConvLoading] = useState(false)
  const convLoadedRef = useRef(false)
  const convErrToastRef = useRef(0)
  const threadRef = useRef<HTMLDivElement>(null)
  const chatTaRef = useRef<HTMLTextAreaElement>(null)
  // R15 UX: tombol "ke pesan terbaru" muncul saat user scroll jauh ke atas;
  // auto-scroll hanya dipaksa saat membuka percakapan, bukan saat user sedang membaca riwayat.
  const [showJump, setShowJump] = useState(false)
  const stickToBottomRef = useRef(true)
  // R15 UX: keyboard virtual mobile = Enter → baris baru (bukan kirim); desktop = Enter kirim.
  const [isCoarse, setIsCoarse] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)')
    const update = () => setIsCoarse(mq.matches)
    update()
    mq.addEventListener?.('change', update)
    return () => mq.removeEventListener?.('change', update)
  }, [])
  // R15 UX mobile: panel thread diref agar bisa di-scrollIntoView saat percakapan dipilih via chip
  const threadPanelRef = useRef<HTMLDivElement>(null)

  /* ---------- Debounce search 400ms ---------- */
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 400)
    return () => clearTimeout(t)
  }, [searchInput])

  /* ---------- Query params (hanya yang terisi) ---------- */
  const params = useMemo(() => {
    const p = new URLSearchParams()
    if (brandId) p.set('brandId', brandId)
    if (channel) p.set('channel', channel)
    if (unreadOnly) p.set('unreadOnly', '1')
    if (search) p.set('search', search)
    return p.toString()
  }, [brandId, channel, unreadOnly, search])

  const loadInteractions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // opportunities ikut dimuat untuk komputasi SLA per lead (stage/createdAt/brand)
      const [msgs, opps] = await Promise.all([crmApi.interactions(params), crmApi.opportunities()])
      setInteractions(msgs)
      setOpportunities(opps)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat pesan')
    } finally {
      setLoading(false)
    }
  }, [params])

  const loadDuplicates = useCallback(async () => {
    try {
      setDuplicates(await crmApi.duplicates())
    } catch {
      /* banner duplikat bersifat opsional — gagal senyap */
    }
  }, [])

  useEffect(() => { void loadInteractions() }, [loadInteractions])
  useEffect(() => { void loadDuplicates() }, [loadDuplicates])

  /* ---------- Muat daftar percakapan server (authoritative di mode Chat) ----------
     Refetch: setiap masuk mode Chat, tombol refresh, dan setelah kirim pesan.
     Gagal → toast (throttle 30 dtk, silent utk refresh latar) + fallback grouping lokal. */
  const loadConversations = useCallback(async (opts?: { silent?: boolean }) => {
    setConvLoading(true)
    try {
      const list = await crmApi.conversations()
      convLoadedRef.current = true
      setServerConvs(list)
    } catch (e) {
      if (!opts?.silent && Date.now() - convErrToastRef.current > 30_000) {
        convErrToastRef.current = Date.now()
        toast({
          title: 'Gagal memuat daftar percakapan server',
          description: e instanceof Error ? e.message : 'Menampilkan grouping lokal sebagai fallback',
          variant: 'destructive',
        })
      }
    } finally {
      setConvLoading(false)
    }
  }, [toast])

  /* Masuk mode Chat → pastikan daftar server terbaru */
  useEffect(() => {
    if (view !== 'chat') return
    void loadConversations()
  }, [view, loadConversations])

  const visibleDuplicates = useMemo(
    () => duplicates.filter((d) => !dismissed.has(dupKey(d))),
    [duplicates, dismissed],
  )
  const unreadCount = interactions.filter((m) => !m.replied).length

  /* ---------- SLA breach per lead (client-side, sama dgn dashboard) ---------- */
  // waitingSince = lastInboundAt (interaksi IN terakhir, fallback createdAt utk lead
  // yang belum pernah ada inbound). Breach bila waitingHours > slaHours brand
  // (sourceBrand ?? executingBrand, fallback 24).
  const slaBreaches = useMemo(() => {
    const map = new Map<string, { over: number; sla: number; brandName: string }>()
    const nowMs = Date.now()
    for (const o of opportunities) {
      if (o.stage !== 'NEW' && o.stage !== 'CONTACT_ATTEMPTED') continue
      const brand = brands.find((b) => b.id === o.sourceBrandId) ?? brands.find((b) => b.id === o.executingBrandId)
      const sla = brand?.slaHours ?? 24
      const waitingHours = (nowMs - new Date(o.lastInboundAt ?? o.createdAt).getTime()) / 3600000
      if (waitingHours > sla) {
        map.set(o.id, { over: Math.round(waitingHours - sla), sla, brandName: brand?.name ?? o.brandName })
      }
    }
    return map
  }, [opportunities, brands])

  /* ---------- Mode Chat FALLBACK: group percakapan per opportunity (client-side, hanya bila API conversations gagal/belum termuat) ---------- */
  const conversations = useMemo<Conversation[]>(() => {
    const byOpp = new Map<string, InteractionDTO[]>()
    for (const m of interactions) {
      if (!m.opportunityId) continue
      const arr = byOpp.get(m.opportunityId)
      if (arr) arr.push(m)
      else byOpp.set(m.opportunityId, [m])
    }
    // bubble OUT hasil kirim dari composer (API inbox hanya IN) — digabung agar thread & preview akurat
    for (const x of sentExtras) {
      if (!x.opportunityId) continue
      const arr = byOpp.get(x.opportunityId)
      if (arr) arr.push(x)
      else byOpp.set(x.opportunityId, [x])
    }
    const convs: Conversation[] = []
    for (const [oppId, msgs] of byOpp) {
      msgs.sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime())
      const last = msgs[msgs.length - 1]
      convs.push({
        opportunityId: oppId,
        contactName: last.contactName,
        companyName: last.companyName,
        brandName: last.brandName,
        brandColor: last.brandColor,
        opportunityTitle: last.opportunityTitle,
        messages: msgs,
        last,
      })
    }
    convs.sort((a, b) => new Date(b.last.sentAt).getTime() - new Date(a.last.sentAt).getTime())
    return convs
  }, [interactions, sentExtras])

  const activeConv = useMemo(
    () => conversations.find((c) => c.opportunityId === selectedConvId) ?? null,
    [conversations, selectedConvId],
  )
  const activeOpp = activeConv ? opportunities.find((o) => o.id === activeConv.opportunityId) ?? null : null

  /* Baris server utk percakapan terpilih — sumber kode/stage header saat daftar server aktif */
  const activeRow = useMemo(
    () => serverConvs?.find((c) => c.opportunityId === selectedConvId) ?? null,
    [serverConvs, selectedConvId],
  )
  const activeCode = activeRow?.opportunityCode ?? activeOpp?.code ?? null
  const activeStage = activeRow?.stage ?? activeOpp?.stage ?? null

  /* Identitas percakapan aktif — grouping lokal dulu, fallback ke baris server
     (daftar server bisa memuat percakapan yang tidak ada di grouping lokal krn
     /api/interactions ter-filter, mis. pesan terakhir OUT hasil kirim sendiri). */
  const activeIdentity = useMemo<{ contactName: string; companyName: string | null; brandName: string; brandColor: string } | null>(() => {
    if (activeConv) {
      return { contactName: activeConv.contactName, companyName: activeConv.companyName ?? null, brandName: activeConv.brandName, brandColor: activeConv.brandColor }
    }
    if (activeRow) {
      return { contactName: activeRow.contactName, companyName: activeRow.companyName ?? null, brandName: activeRow.brandName, brandColor: activeRow.brandColor }
    }
    return null
  }, [activeConv, activeRow])

  /* ---------- Daftar percakapan SERVER + overlay optimistik sentExtras ----------
     Overlay: pesan terkirim menimpa lastMessage baris terkait → preview "Anda: …" &
     dot belum-dibalas hilang SEKETIKA; refetch conversations menyusul & konvergen
     (server mengurutkan desc by lastSentAt — sort overlay hanya menyamakan urutan agar
     baris naik ke atas tanpa lompatan visual saat refetch tiba). */
  const chatRows = useMemo<ConversationListItemDTO[]>(() => {
    if (!serverConvs) return []
    const extras = new Map<string, InteractionDTO>()
    for (const x of sentExtras) if (x.opportunityId) extras.set(x.opportunityId, x)
    if (extras.size === 0) return serverConvs
    const merged = serverConvs.map((c) => {
      const x = extras.get(c.opportunityId)
      if (!x) return c
      return { ...c, lastDirection: 'OUT' as const, lastBody: x.body, lastSentAt: x.sentAt, lastChannel: x.channel, unanswered: false }
    })
    return [...merged].sort((a, b) => new Date(b.lastSentAt).getTime() - new Date(a.lastSentAt).getTime())
  }, [serverConvs, sentExtras])

  /* Filter client-side atas daftar server: brand, kanal (lastChannel), belum dibalas (flag server),
     search (opportunityCode / companyName / contactName / lastBody) */
  const visibleChatRows = useMemo(() => {
    const q = search.toLowerCase()
    return chatRows.filter((c) => {
      if (brandId && c.brandId !== brandId) return false
      if (channel && c.lastChannel !== channel) return false
      if (unreadOnly && !c.unanswered) return false
      if (q) {
        const hay = `${c.opportunityCode} ${c.companyName ?? ''} ${c.contactName} ${c.lastBody}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [chatRows, brandId, channel, unreadOnly, search])

  /* Thread API (IN+OUT penuh) utk percakapan aktif; fallback = grouping lokal (inbox IN-only) */
  const activeThread = thread && thread.oppId === selectedConvId ? thread.msgs : null
  const activeMessages = activeThread ?? activeConv?.messages ?? []
  const activeMsgCount = activeMessages.length

  /* Muat thread penuh (semua direction, asc) saat percakapan dipilih di mode Chat —
     fix: /api/interactions hanya IN sehingga bubble OUT hilang setelah reload.
     Gagal → toast destructive + fallback ke grouping lokal (panel tetap terpakai). */
  useEffect(() => {
    if (view !== 'chat' || !selectedConvId) return
    let cancelled = false
    setThreadLoading(true)
    crmApi.opportunityThread(selectedConvId)
      .then((msgs) => { if (!cancelled) setThread({ oppId: selectedConvId, msgs }) })
      .catch((e) => {
        if (cancelled) return
        setThread(null)
        toast({
          title: 'Gagal memuat thread percakapan',
          description: e instanceof Error ? e.message : 'Menampilkan pesan lokal saja',
          variant: 'destructive',
        })
      })
      .finally(() => { if (!cancelled) setThreadLoading(false) })
    return () => { cancelled = true }
  }, [view, selectedConvId, toast])

  /* Balasan cepat — fetch lazy saat mode Chat pertama dibuka; gagal/kosong = baris dihilangkan senyap */
  useEffect(() => {
    if (view !== 'chat' || templates !== null) return
    let cancelled = false
    crmApi.templates()
      .then((t) => { if (!cancelled) setTemplates(t) })
      .catch(() => { if (!cancelled) setTemplates([]) })
    return () => { cancelled = true }
  }, [view, templates])

  /* Auto-scroll thread ke bawah saat membuka percakapan / ada pesan baru.
     R15: hormati posisi baca — hanya scroll otomatis bila user memang di dekat dasar
     (atau baru ganti percakapan); pesan baru saat user membaca riwayat tidak menculik. */
  useEffect(() => {
    const el = threadRef.current
    if (!el) return
    stickToBottomRef.current = true
    setShowJump(false)
    el.scrollTop = el.scrollHeight
  }, [selectedConvId, view])
  useEffect(() => {
    const el = threadRef.current
    if (!el || !stickToBottomRef.current) return
    el.scrollTop = el.scrollHeight
  }, [activeMsgCount])

  /* R15 UX: paksa user dibawa ke panel thread saat memilih percakapan di mobile
     (chip horizontal) — panel berada di bawah chip, tanpa ini user harus scroll manual. */
  const selectConvMobile = useCallback((oppId: string) => {
    setSelectedConvId(oppId)
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      // delay satu frame agar panel sudah dirender sebelum di-scroll ke viewport
      requestAnimationFrame(() => threadPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
  }, [])

  /* R15 UX: pelacak posisi scroll utk tombol "ke pesan terbaru" + sticky auto-scroll */
  const handleThreadScroll = useCallback(() => {
    const el = threadRef.current
    if (!el) return
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight
    const nearBottom = gap < 80
    stickToBottomRef.current = nearBottom
    setShowJump(gap > 160)
  }, [])

  const jumpToLatest = useCallback(() => {
    const el = threadRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    stickToBottomRef.current = true
    setShowJump(false)
  }, [])

  /* Auto-resize composer textarea (1–4 baris, maks 120px) */
  useEffect(() => {
    const el = chatTaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`
    }
  }, [chatBody])

  /* ---------- Aksi: kirim pesan dari composer Chat ---------- */
  const handleSendChat = async () => {
    if (!selectedConvId || !chatBody.trim() || chatSending) return
    setChatSending(true)
    try {
      const text = chatBody.trim()
      const oppId = selectedConvId
      const msg = await crmApi.addInteraction(oppId, { channel: chatChannel, direction: 'OUT', body: text })
      // Append ke thread ter-fetch (panel chat merender API thread → bubble langsung tampil dan
      // persist setelah reload krn tersimpan di DB) + ke sentExtras utk overlay optimistik daftar
      // server (preview "Anda: …" & dot belum-dibalas hilang seketika). loadInteractions +
      // loadConversations di-refresh agar list server, flag replied, chip SLA tetap sinkron.
      setThread((prev) => (prev && prev.oppId === oppId ? { ...prev, msgs: [...prev.msgs, msg] } : prev))
      setSentExtras((prev) => [...prev, msg])
      setChatBody('')
      toast({ title: 'Pesan terkirim — tercatat di percakapan', description: `Kepada ${msg.contactName} via ${channelMeta(chatChannel).label}.` })
      await Promise.all([loadInteractions(), loadConversations({ silent: true })])
    } catch (e) {
      toast({
        title: 'Gagal mengirim pesan',
        description: e instanceof Error ? e.message : 'Coba lagi',
        variant: 'destructive',
      })
    } finally {
      setChatSending(false)
    }
  }

  /* ---------- Aksi: reply ---------- */
  const openReply = (m: InteractionDTO) => {
    setReplyChannel(m.channel === 'EMAIL' ? 'EMAIL' : 'WHATSAPP')
    setReplyBody('')
    setReplyTarget(m)
  }

  const handleSendReply = async () => {
    if (!replyTarget || !replyBody.trim()) return
    setSending(true)
    try {
      const body = replyBody.trim()
      if (replyTarget.opportunityId) {
        await crmApi.addInteraction(replyTarget.opportunityId, { channel: replyChannel, direction: 'OUT', body })
      } else {
        await crmApi.logInteraction({
          contactId: replyTarget.contactId,
          brandId: replyTarget.brandId,
          channel: replyChannel,
          direction: 'OUT',
          body,
        })
      }
      toast({ title: 'Balasan terkirim — draft disimpan di percakapan', description: `Kepada ${replyTarget.contactName} via ${channelMeta(replyChannel).label}.` })
      setReplyTarget(null)
      setReplyBody('')
      await Promise.all([loadInteractions(), loadConversations({ silent: true })])
    } catch (e) {
      toast({
        title: 'Gagal mengirim balasan',
        description: e instanceof Error ? e.message : 'Coba lagi',
        variant: 'destructive',
      })
    } finally {
      setSending(false)
    }
  }

  /* ---------- Aksi: create opportunity ---------- */
  useEffect(() => {
    if (createTarget) {
      setOppForm({
        title: `Kebutuhan ${createTarget.brandName}`,
        brandId: createTarget.brandId,
        serviceId: NONE,
        estimatedValue: '',
        brief: createTarget.body,
        priority: 'MEDIUM',
      })
    }
  }, [createTarget])

  const selectedBrand = brands.find((b) => b.id === oppForm.brandId)
  const brandServices = selectedBrand?.services ?? []

  /** API opportunity butuh companyId — resolve dari kontak via endpoint contacts. */
  const resolveCompanyId = async (contactId: string, contactName: string): Promise<string | null> => {
    try {
      const list = await crmApi.contacts(`search=${encodeURIComponent(contactName)}`)
      const hit = list.find((c) => c.id === contactId)
      if (hit?.companyId) return hit.companyId
      const all = await crmApi.contacts()
      return all.find((c) => c.id === contactId)?.companyId ?? null
    } catch {
      return null
    }
  }

  const handleCreateOpp = async () => {
    if (!createTarget) return
    if (!oppForm.title.trim()) {
      toast({ title: 'Judul wajib diisi', variant: 'destructive' })
      return
    }
    if (!oppForm.brandId) {
      toast({ title: 'Brand wajib dipilih', variant: 'destructive' })
      return
    }
    setCreating(true)
    try {
      const companyId = await resolveCompanyId(createTarget.contactId, createTarget.contactName)
      if (!companyId) {
        throw new Error('Company untuk kontak ini tidak ditemukan. Buat company terlebih dahulu di modul Contacts.')
      }
      const opp = await crmApi.createOpportunity({
        title: oppForm.title.trim(),
        companyId,
        contactId: createTarget.contactId,
        sourceBrandId: oppForm.brandId,
        executingBrandId: oppForm.brandId,
        serviceId: oppForm.serviceId === NONE ? undefined : oppForm.serviceId,
        leadSource: CHANNEL_TO_LEAD_SOURCE[createTarget.channel] ?? 'WEBSITE',
        channel: createTarget.channel,
        estimatedValue: oppForm.estimatedValue ? Number(oppForm.estimatedValue) : 0,
        brief: oppForm.brief.trim() || undefined,
        priority: oppForm.priority,
      })
      toast({ title: 'Opportunity dibuat', description: `${opp.code} — ${opp.title}` })
      setCreateTarget(null)
      openOpportunity(opp.id)
    } catch (e) {
      toast({
        title: 'Gagal membuat opportunity',
        description: e instanceof Error ? e.message : 'Coba lagi',
        variant: 'destructive',
      })
    } finally {
      setCreating(false)
    }
  }

  /* ---------- Aksi: merge / keep separate ---------- */
  const handleMerge = async (c: DuplicateCandidate) => {
    const key = dupKey(c)
    setMergingKey(key)
    try {
      await crmApi.merge({ keepId: c.contactA.id, mergeId: c.contactB.id })
      toast({
        title: 'Duplikat digabung',
        description: `${c.contactA.fullName} dipertahankan; data ${c.contactB.fullName} digabungkan ke kontak utama.`,
      })
      setDupOpen(false)
      await Promise.all([loadDuplicates(), loadInteractions()])
    } catch (e) {
      toast({
        title: 'Gagal menggabungkan duplikat',
        description: e instanceof Error ? e.message : 'Coba lagi',
        variant: 'destructive',
      })
    } finally {
      setMergingKey(null)
    }
  }

  const handleKeepSeparate = (c: DuplicateCandidate) => {
    setDismissed((prev) => new Set(prev).add(dupKey(c)))
    toast({ title: 'Kandidat diabaikan', description: `${c.contactA.fullName} & ${c.contactB.fullName} dibiarkan terpisah.` })
  }

  /* ---------- Aksi: simulasi form website ---------- */
  const handleWebsiteForm = async () => {
    if (!wf.name.trim() || !wf.email.trim() || !wf.brandId || !wf.message.trim()) {
      toast({ title: 'Lengkapi nama, email, brand, dan pesan', variant: 'destructive' })
      return
    }
    if (!/.+@.+\..+/.test(wf.email.trim())) {
      toast({ title: 'Format email tidak valid', variant: 'destructive' })
      return
    }
    setSubmittingWf(true)
    try {
      await crmApi.websiteForm({
        websiteForm: {
          name: wf.name.trim(),
          email: wf.email.trim(),
          whatsapp: wf.whatsapp.trim() || undefined,
          message: wf.message.trim(),
          brandId: wf.brandId,
          serviceId: wf.serviceId === NONE ? undefined : wf.serviceId,
        },
      })
      toast({ title: 'Lead baru dari website masuk ke inbox', description: `${wf.name.trim()} — ${brands.find((b) => b.id === wf.brandId)?.name ?? ''}` })
      setWebFormOpen(false)
      setWf({ name: '', email: '', whatsapp: '', brandId: '', serviceId: NONE, message: '' })
      await loadInteractions()
    } catch (e) {
      toast({
        title: 'Gagal mensimulasikan lead website',
        description: e instanceof Error ? e.message : 'Coba lagi',
        variant: 'destructive',
      })
    } finally {
      setSubmittingWf(false)
    }
  }

  const wfServices = brands.find((b) => b.id === wf.brandId)?.services ?? []

  /* ---------- Render ---------- */
  return (
    <div className="space-y-4">
      {/* ===== Toolbar ===== */}
      <Card className="rounded-xl border-slate-200 shadow-sm">
        <CardContent className="flex flex-wrap items-center gap-2 p-3 sm:p-4">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="inbox-search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') setSearch(searchInput.trim()) }}
              placeholder="Cari nama, isi pesan…"
              className="h-9 pl-9"
              aria-label="Cari pesan"
            />
          </div>

          <Select value={brandId || ALL} onValueChange={(v) => setBrandId(v === ALL ? '' : v)}>
            <SelectTrigger className="h-9 w-[150px] sm:w-[170px]" aria-label="Filter brand">
              <SelectValue placeholder="Semua Brand" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Semua Brand</SelectItem>
              {brands.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={channel || ALL} onValueChange={(v) => setChannel(v === ALL ? '' : v)}>
            <SelectTrigger className="h-9 w-[140px] sm:w-[150px]" aria-label="Filter kanal">
              <SelectValue placeholder="Semua Kanal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Semua Kanal</SelectItem>
              {CHANNELS.map((c) => (
                <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <label htmlFor="inbox-unread" className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50">
            <Switch id="inbox-unread" checked={unreadOnly} onCheckedChange={setUnreadOnly} />
            Belum dibalas saja
          </label>

          {/* Toggle mode tampilan: Daftar / Chat */}
          <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="group" aria-label="Mode tampilan inbox">
            <button
              type="button"
              onClick={() => setView('list')}
              aria-pressed={view === 'list'}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60',
                view === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
              )}
            >
              <List className="h-3.5 w-3.5" /> Daftar
            </button>
            <button
              type="button"
              onClick={() => setView('chat')}
              aria-pressed={view === 'chat'}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60',
                view === 'chat' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
              )}
            >
              <MessagesSquare className="h-3.5 w-3.5" /> Chat
            </button>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <RefreshButton
              onClick={() => {
                void loadInteractions()
                // Refresh juga daftar percakapan server (toast hanya bila mode Chat aktif)
                void loadConversations({ silent: view !== 'chat' })
              }}
              loading={loading}
            />
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setWebFormOpen(true)}>
              <Globe className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Simulasi Form Website</span>
              <span className="sm:hidden">Form Website</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ===== Banner duplikat ===== */}
      {visibleDuplicates.length > 0 && (
        <Alert className="rounded-xl border-amber-300 bg-amber-50 text-amber-900">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-sm font-semibold">⚠️ {visibleDuplicates.length} kandidat duplikat terdeteksi</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-amber-800">
              Kontak ganda memecah timeline percakapan dan merusak statistik pipeline. Review dan gabungkan sekarang.
            </span>
            <Button size="sm" className="h-8 gap-1.5 bg-amber-600 text-white hover:bg-amber-700" onClick={() => setDupOpen(true)}>
              <Merge className="h-3.5 w-3.5" /> Review Duplikat
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* ===== Daftar pesan ===== */}
      <Card className="rounded-xl border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            {view === 'chat' ? <MessagesSquare className="h-4 w-4 text-teal-600" /> : <Inbox className="h-4 w-4 text-teal-600" />}
            {view === 'chat' ? 'Percakapan' : 'Pesan Masuk'}
          </CardTitle>
          <CardDescription>
            {loading
              ? 'Memuat…'
              : view === 'chat'
                ? serverConvs
                  ? `${visibleChatRows.length} percakapan · ${visibleChatRows.filter((c) => c.unanswered).length} belum dibalas`
                  : `${conversations.length} percakapan · ${unreadCount} belum dibalas`
                : `${interactions.length} pesan · ${unreadCount} belum dibalas`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 sm:p-4 sm:pt-0">
          {error ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
              <AlertTriangle className="h-7 w-7 text-rose-500" />
              <div>
                <p className="font-semibold text-rose-800">Gagal memuat pesan</p>
                <p className="mt-0.5 text-sm text-rose-600">{error}</p>
              </div>
              <Button variant="outline" className="border-rose-300 hover:bg-rose-100" onClick={() => void loadInteractions()}>
                Coba lagi
              </Button>
            </div>
          ) : view === 'chat' ? (
            /* ===== Mode Chat =====
               Daftar authoritative = server (GET /api/conversations). Grouping lokal hanya
               fallback loading/error — view tidak pernah kosong/rusak.
               CATATAN: branch chat dicek SEBELUM empty-check interactions — daftar percakapan
               server independen dari hasil /api/interactions (search dpt mengosongkan
               interactions tanpa mengosongkan daftar percakapan). */
            (loading && interactions.length === 0 && !serverConvs) ? (
              <LoadingRows rows={6} />
            ) : (serverConvs ? visibleChatRows.length === 0 : conversations.length === 0) ? (
              <EmptyState
                icon={<MessagesSquare className="h-6 w-6" />}
                title={serverConvs && chatRows.length > 0 ? 'Tidak ada percakapan yang cocok' : 'Belum ada percakapan'}
                description={
                  serverConvs && chatRows.length > 0
                    ? 'Tidak ada percakapan yang cocok dengan filter aktif. Coba ubah pencarian, filter, atau matikan “Belum dibalas saja”.'
                    : 'Belum ada pesan yang terhubung ke opportunity. Gunakan mode Daftar untuk membuat opportunity dari pesan masuk terlebih dahulu.'
                }
              />
            ) : (
              <div className="flex flex-col gap-3 lg:h-[65vh] lg:flex-row">
                {/* Daftar percakapan — kolom kiri (desktop) */}
                <div className={cn('hidden w-80 shrink-0 overflow-y-auto rounded-xl border border-slate-200 bg-white lg:block', SCROLLBAR)} aria-label="Daftar percakapan">
                  <div className="divide-y divide-slate-100">
                    {serverConvs
                      ? visibleChatRows.map((c) => (
                          <ServerConversationRow
                            key={c.opportunityId}
                            conv={c}
                            active={c.opportunityId === selectedConvId}
                            onSelect={() => setSelectedConvId(c.opportunityId)}
                          />
                        ))
                      : conversations.map((c) => (
                          <ConversationRow
                            key={c.opportunityId}
                            conv={c}
                            active={c.opportunityId === selectedConvId}
                            breach={slaBreaches.get(c.opportunityId)}
                            onSelect={() => setSelectedConvId(c.opportunityId)}
                          />
                        ))}
                  </div>
                </div>

                {/* Pemilih percakapan — chip horizontal (mobile) */}
                <div className="flex gap-1.5 overflow-x-auto pb-1 lg:hidden" role="tablist" aria-label="Pilih percakapan">
                  {serverConvs
                    ? visibleChatRows.map((c) => (
                        <button
                          key={c.opportunityId}
                          type="button"
                          role="tab"
                          aria-selected={c.opportunityId === selectedConvId}
                          onClick={() => selectConvMobile(c.opportunityId)}
                          className={cn(
                            'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60',
                            c.opportunityId === selectedConvId ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                          )}
                        >
                          {c.unanswered && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />}
                          {c.contactName}
                        </button>
                      ))
                    : conversations.map((c) => (
                        <button
                          key={c.opportunityId}
                          type="button"
                          role="tab"
                          aria-selected={c.opportunityId === selectedConvId}
                          onClick={() => selectConvMobile(c.opportunityId)}
                          className={cn(
                            'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60',
                            c.opportunityId === selectedConvId ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                          )}
                        >
                          {c.last.direction === 'IN' && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />}
                          {c.contactName}
                        </button>
                      ))}
                </div>

                {/* Panel thread — R15: tinggi terprediksi di mobile (h-[65vh], shrink-0 agar tidak collapse oleh flex basis-0)
                    + ref utk scrollIntoView saat chip dipilih */}
                <div ref={threadPanelRef} className="flex h-[65vh] shrink-0 basis-auto flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50/60 lg:h-auto lg:min-h-0 lg:flex-1 lg:shrink lg:basis-0">
                  {!selectedConvId || !activeIdentity ? (
                    <div className="flex flex-1 items-center justify-center p-4">
                      <EmptyState
                        icon={<MessagesSquare className="h-6 w-6" />}
                        title="Pilih percakapan untuk mulai membalas"
                        description="Pilih salah satu percakapan untuk melihat timeline pesan dan mengirim balasan dari composer di bawah."
                      />
                    </div>
                  ) : (
                    <>
                      {/* Header thread (sticky) — R15: avatar memakai warna brand + badge status percakapan */}
                      <div className="flex shrink-0 items-center gap-2.5 border-b border-slate-200 bg-white px-3 py-2.5 sm:px-4">
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ring-2 ring-white"
                          style={{ backgroundColor: activeIdentity.brandColor }}
                          aria-hidden
                        >
                          {initials(activeIdentity.contactName)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">{activeIdentity.contactName}</p>
                          <div className="flex min-w-0 items-center gap-1.5">
                            {activeIdentity.companyName && <span className="truncate text-xs text-slate-500">{activeIdentity.companyName} ·</span>}
                            <BrandChip name={activeIdentity.brandName} color={activeIdentity.brandColor} size="xs" />
                            {activeRow?.unanswered && (
                              <Badge variant="outline" className="hidden border-amber-200 bg-amber-50 px-1.5 py-px text-[9px] font-semibold text-amber-700 sm:inline-flex">Belum dibalas</Badge>
                            )}
                            {activeRow?.escalated && (
                              <Badge variant="outline" className="hidden border-rose-200 bg-rose-50 px-1.5 py-px text-[9px] font-semibold text-rose-700 sm:inline-flex">SLA terlampaui</Badge>
                            )}
                          </div>
                        </div>
                        {(activeCode || activeStage) && (
                          <div className="hidden shrink-0 items-center gap-2 sm:flex">
                            {activeCode && (
                              <button
                                type="button"
                                onClick={() => selectedConvId && openOpportunity(selectedConvId)}
                                title="Buka opportunity terkait"
                                className="font-mono text-[10px] text-slate-400 hover:text-teal-700 hover:underline"
                              >
                                {activeCode}
                              </button>
                            )}
                            {activeStage && <StageBadge stage={activeStage} />}
                          </div>
                        )}
                      </div>

                      {/* Timeline pesan — sumber thread API (IN+OUT); pulse halus saat thread dimuat pertama kali.
                          R15: aria-live utk screen reader + onScroll pelacak posisi + grouping bubble. */}
                      <div className="relative min-h-0 flex-1">
                        <div
                          ref={threadRef}
                          role="log"
                          aria-label="Timeline pesan"
                          aria-live="polite"
                          onScroll={handleThreadScroll}
                          className={cn('absolute inset-0 overflow-y-auto p-3 sm:p-4', SCROLLBAR)}
                        >
                          {threadLoading && !activeThread ? (
                            <div className="space-y-2.5" aria-hidden>
                              {[0, 1, 2].map((i) => (
                                <div key={i} className={cn('flex', i % 2 === 0 ? 'justify-start' : 'justify-end')}>
                                  <div
                                    className="h-9 w-2/3 max-w-[260px] animate-pulse rounded-2xl bg-slate-200/70"
                                    style={{ animationDelay: `${i * 120}ms` }}
                                  />
                                </div>
                              ))}
                            </div>
                          ) : activeMessages.length === 0 ? (
                            <div className="flex h-full items-center justify-center">
                              <EmptyState
                                icon={<MessagesSquare className="h-6 w-6" />}
                                title="Belum ada pesan"
                                description="Mulai percakapan dengan mengirim balasan dari kolom di bawah."
                              />
                            </div>
                          ) : activeMessages.map((m, i) => {
                            const prev = i > 0 ? activeMessages[i - 1] : null
                            const next = i < activeMessages.length - 1 ? activeMessages[i + 1] : null
                            const showDate = !prev || !sameDay(new Date(prev.sentAt), new Date(m.sentAt))
                            const isIn = m.direction !== 'OUT'
                            /* R15 grouping: pesan berurutan arah & kanal sama (≤5 menit) dibubungkan
                               rapat — margin menyempit & ekor bubble hanya di pesan pertama grup. */
                            const near = (a: InteractionDTO | null, b: InteractionDTO | null) =>
                              !!a && !!b && a.direction === b.direction && a.channel === b.channel
                              && sameDay(new Date(a.sentAt), new Date(b.sentAt))
                              && Math.abs(new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()) < 5 * 60_000
                            const groupedPrev = !showDate && near(prev, m)
                            const groupedNext = !!(next && near(m, next))
                            return (
                              <div key={m.id} className={showDate ? 'mt-1.5' : groupedPrev ? 'mt-0.5' : 'mt-2'}>
                                {showDate && (
                                  <div className="mb-1.5 flex items-center gap-2">
                                    <span className="h-px flex-1 bg-slate-200" aria-hidden />
                                    <span className="rounded-full bg-slate-200/80 px-3 py-0.5 text-[10px] font-semibold text-slate-600">{dayLabel(m.sentAt)}</span>
                                    <span className="h-px flex-1 bg-slate-200" aria-hidden />
                                  </div>
                                )}
                                <div className={cn('flex', isIn ? 'justify-start' : 'justify-end')}>
                                  <div
                                    className={cn(
                                      'max-w-[85%] rounded-2xl px-3 py-2 shadow-sm sm:max-w-[75%]',
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
                          })}
                        </div>
                        {/* R15: tombol “ke pesan terbaru” — muncul saat user menjauh dari dasar timeline */}
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

                      {/* Composer — R15: aman utk keyboard mobile (safe-area), Enter kirim di desktop,
                          tombol kanal ringkas di mobile, hint keyboard desktop-only */}
                      <div className="shrink-0 border-t border-slate-200 bg-white px-3 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-2.5 sm:px-4 sm:pb-2.5">
                        {templates && templates.length > 0 && (
                          <div className="mb-2 flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:flex-wrap sm:overflow-visible">
                            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Balasan cepat</span>
                            {templates.slice(0, 6).map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                title={t.body}
                                onClick={() => setChatBody(t.body)}
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
                            onChange={(e) => setChatBody(e.target.value)}
                            onKeyDown={(e) => {
                              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                                e.preventDefault()
                                void handleSendChat()
                                return
                              }
                              /* Enter kirim hanya di pointer halus (mouse/trackpad); mobile = newline */
                              if (e.key === 'Enter' && !e.shiftKey && !isCoarse && !e.nativeEvent.isComposing) {
                                e.preventDefault()
                                void handleSendChat()
                              }
                            }}
                            placeholder={`Tulis pesan untuk ${activeIdentity.contactName}…`}
                            rows={1}
                            className="min-h-[40px] max-h-[120px] flex-1 resize-none py-2"
                            aria-label="Tulis pesan balasan"
                          />
                          <Select value={chatChannel} onValueChange={setChatChannel}>
                            <SelectTrigger aria-label="Kanal pengiriman" className="h-9 w-[104px] shrink-0 text-xs sm:w-[124px] sm:text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {CHAT_CHANNELS.map((c) => (
                                <SelectItem key={c} value={c}>{channelMeta(c).label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            onClick={() => void handleSendChat()}
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
                            <kbd className="ml-0.5 rounded border border-slate-200 bg-slate-50 px-1 font-sans">Shift+Enter</kbd> baris baru
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )
          ) : loading && interactions.length === 0 ? (
            <LoadingRows rows={6} />
          ) : interactions.length === 0 ? (
            <EmptyState
              icon={<Inbox className="h-6 w-6" />}
              title="Tidak ada pesan masuk"
              description="Coba ubah filter, matikan “Belum dibalas saja”, atau simulasikan lead masuk dari form website."
              action={
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setWebFormOpen(true)}>
                  <Globe className="h-3.5 w-3.5" /> Simulasi Form Website
                </Button>
              }
            />
          ) : (
            <div className={cn('max-h-[65vh] space-y-2 overflow-y-auto pr-1', SCROLLBAR)}>
              {interactions.map((m) => {
                const meta = channelMeta(m.channel)
                const breach = m.opportunityId ? slaBreaches.get(m.opportunityId) : undefined
                return (
                  <div
                    key={m.id}
                    className={cn(
                      'group relative flex gap-3 rounded-xl p-3 transition-colors sm:p-4',
                      m.replied
                        ? 'border border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                        : 'border border-slate-900/20 bg-white shadow-sm hover:border-slate-900/35',
                    )}
                  >
                    {/* Channel icon */}
                    <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', meta.bg)}>
                      <ChannelIcon channel={m.channel} className="h-5 w-5" />
                    </div>

                    {/* Main */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{m.contactName}</p>
                        {m.companyName && <span className="truncate text-xs text-slate-500">{m.companyName}</span>}
                        <BrandChip name={m.brandName} color={m.brandColor} size="xs" />
                        <span className="ml-auto shrink-0 text-[11px] text-slate-400 transition-opacity md:group-hover:opacity-0">
                          {timeAgo(m.sentAt)}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm leading-snug text-slate-600">{m.body}</p>

                      {/* Badges baris 3 */}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {breach && <SlaChip breach={breach} />}
                        {!m.replied && (
                          <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Belum dibalas</Badge>
                        )}
                        {m.status === 'READ' && (
                          <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-500">Dibaca</Badge>
                        )}
                        {m.opportunityTitle && (
                          <button
                            type="button"
                            onClick={() => m.opportunityId && openOpportunity(m.opportunityId)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800 hover:underline"
                            title="Buka opportunity terkait"
                          >
                            <Building2 className="h-3 w-3" /> {m.opportunityTitle}
                          </button>
                        )}
                      </div>

                      {/* Aksi mobile — selalu terlihat */}
                      <div className="mt-2.5 flex items-center gap-2 border-t border-slate-100 pt-2.5 md:hidden">
                        {!m.opportunityId && (
                          <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => setCreateTarget(m)}>
                            <Plus className="h-3 w-3" /> Buat Opportunity
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => openReply(m)}>
                          <Send className="h-3 w-3" /> Balas
                        </Button>
                      </div>
                    </div>

                    {/* Aksi desktop — muncul saat hover */}
                    <div className="absolute right-4 top-3.5 hidden items-center gap-2 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 md:flex">
                      {!m.opportunityId && (
                        <Button size="sm" variant="outline" className="h-7 gap-1 bg-white text-xs shadow-sm" onClick={() => setCreateTarget(m)}>
                          <Plus className="h-3 w-3" /> Buat Opportunity
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="h-7 gap-1 bg-white text-xs shadow-sm" onClick={() => openReply(m)}>
                        <Send className="h-3 w-3" /> Balas
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===== Dialog Reply ===== */}
      <Dialog open={!!replyTarget} onOpenChange={(o) => { if (!o) setReplyTarget(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Balas Pesan</DialogTitle>
            <DialogDescription>
              Balasan terkirim sebagai pesan keluar (OUT) dan otomatis tercatat di timeline percakapan.
            </DialogDescription>
          </DialogHeader>

          {replyTarget && (
            <div className="space-y-4">
              {/* Konteks kontak */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-2.5">
                  <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', channelMeta(replyTarget.channel).bg)}>
                    <ChannelIcon channel={replyTarget.channel} className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{replyTarget.contactName}</p>
                    <p className="truncate text-xs text-slate-500">{replyTarget.companyName ?? 'Tanpa perusahaan'}</p>
                  </div>
                  <BrandChip name={replyTarget.brandName} color={replyTarget.brandColor} size="xs" />
                </div>
                <div className="mt-2.5 max-h-28 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2.5 text-xs leading-relaxed text-slate-600">
                  {replyTarget.body}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reply-channel">Kanal balasan</Label>
                <Select value={replyChannel} onValueChange={setReplyChannel}>
                  <SelectTrigger id="reply-channel"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                    <SelectItem value="EMAIL">Email</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reply-body">Isi balasan</Label>
                <Textarea
                  id="reply-body"
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder="Tulis balasan…"
                  rows={4}
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReplyTarget(null)}>Batal</Button>
            <Button
              onClick={() => void handleSendReply()}
              disabled={sending || !replyBody.trim()}
              className="gap-1.5 bg-teal-600 text-white hover:bg-teal-700"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Kirim Balasan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Dialog Create Opportunity ===== */}
      <Dialog open={!!createTarget} onOpenChange={(o) => { if (!o) setCreateTarget(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Buat Opportunity dari Pesan</DialogTitle>
            <DialogDescription>
              Konversi pesan masuk menjadi opportunity pipeline. Perusahaan & kontak otomatis terhubung.
            </DialogDescription>
          </DialogHeader>

          {createTarget && (
            <div className="space-y-3.5">
              <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                <ChannelIcon channel={createTarget.channel} className="h-3.5 w-3.5" />
                <span className="font-semibold text-slate-700">{createTarget.contactName}</span>
                {createTarget.companyName && <span>· {createTarget.companyName}</span>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="opp-title">Judul</Label>
                <Input
                  id="opp-title"
                  value={oppForm.title}
                  onChange={(e) => setOppForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Kebutuhan klien"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Brand</Label>
                  <Select
                    value={oppForm.brandId || undefined}
                    onValueChange={(v) => setOppForm((f) => ({ ...f, brandId: v, serviceId: NONE }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Pilih brand" /></SelectTrigger>
                    <SelectContent>
                      {brands.map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Layanan</Label>
                  <Select value={oppForm.serviceId} onValueChange={(v) => setOppForm((f) => ({ ...f, serviceId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Pilih layanan" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>— Tanpa layanan —</SelectItem>
                      {brandServices.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="opp-value">Estimasi Nilai (IDR, opsional)</Label>
                  <Input
                    id="opp-value"
                    type="number"
                    min={0}
                    value={oppForm.estimatedValue}
                    onChange={(e) => setOppForm((f) => ({ ...f, estimatedValue: e.target.value }))}
                    placeholder="mis. 25000000"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Prioritas</Label>
                  <Select value={oppForm.priority} onValueChange={(v) => setOppForm((f) => ({ ...f, priority: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => (
                        <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="opp-brief">Brief (opsional)</Label>
                <Textarea
                  id="opp-brief"
                  value={oppForm.brief}
                  onChange={(e) => setOppForm((f) => ({ ...f, brief: e.target.value }))}
                  placeholder="Ringkasan kebutuhan…"
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCreateTarget(null)}>Batal</Button>
            <Button
              onClick={() => void handleCreateOpp()}
              disabled={creating}
              className="gap-1.5 bg-teal-600 text-white hover:bg-teal-700"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Buat Opportunity
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Dialog Simulasi Form Website ===== */}
      <Dialog open={webFormOpen} onOpenChange={setWebFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-teal-600" /> Simulasi Form Website
            </DialogTitle>
            <DialogDescription>
              Fitur ini mensimulasikan lead masuk dari form website publik. Lead langsung muncul di inbox sebagai pesan channel Website.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="wf-name">Nama *</Label>
                <Input id="wf-name" value={wf.name} onChange={(e) => setWf((f) => ({ ...f, name: e.target.value }))} placeholder="Nama lengkap" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wf-email">Email *</Label>
                <Input id="wf-email" type="email" value={wf.email} onChange={(e) => setWf((f) => ({ ...f, email: e.target.value }))} placeholder="nama@perusahaan.com" />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="wf-wa">WhatsApp (opsional)</Label>
                <Input id="wf-wa" value={wf.whatsapp} onChange={(e) => setWf((f) => ({ ...f, whatsapp: e.target.value }))} placeholder="+62…" />
              </div>
              <div className="space-y-1.5">
                <Label>Brand *</Label>
                <Select
                  value={wf.brandId || undefined}
                  onValueChange={(v) => setWf((f) => ({ ...f, brandId: v, serviceId: NONE }))}
                >
                  <SelectTrigger><SelectValue placeholder="Pilih brand" /></SelectTrigger>
                  <SelectContent>
                    {brands.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Layanan (opsional)</Label>
              <Select value={wf.serviceId} onValueChange={(v) => setWf((f) => ({ ...f, serviceId: v }))}>
                <SelectTrigger><SelectValue placeholder="Pilih layanan" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Tanpa layanan —</SelectItem>
                  {wfServices.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wf-message">Pesan *</Label>
              <Textarea
                id="wf-message"
                value={wf.message}
                onChange={(e) => setWf((f) => ({ ...f, message: e.target.value }))}
                placeholder="Saya tertarik dengan layanan…"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setWebFormOpen(false)}>Batal</Button>
            <Button
              onClick={() => void handleWebsiteForm()}
              disabled={submittingWf}
              className="gap-1.5 bg-teal-600 text-white hover:bg-teal-700"
            >
              {submittingWf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
              Kirim sebagai Lead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Dialog Review Duplikat ===== */}
      <Dialog open={dupOpen} onOpenChange={setDupOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Review Kandidat Duplikat
            </DialogTitle>
            <DialogDescription>
              Sistem mendeteksi kontak dengan email / WhatsApp / telepon yang sama. Gabungkan untuk menyatukan timeline percakapan — kontak utama (kiri) dipertahankan, data kontak kanan dipindahkan lalu dinonaktifkan.
            </DialogDescription>
          </DialogHeader>

          <div className={cn('max-h-[60vh] space-y-3 overflow-y-auto pr-1', SCROLLBAR)}>
            {visibleDuplicates.length === 0 ? (
              <EmptyState icon={<Merge className="h-5 w-5" />} title="Tidak ada kandidat duplikat" description="Semua kandidat sudah digabung atau diabaikan." />
            ) : (
              visibleDuplicates.map((c) => {
                const key = dupKey(c)
                const match = MATCH_META[c.matchType] ?? { label: c.matchType, cls: 'border-slate-200 bg-slate-50 text-slate-600' }
                return (
                  <div key={key} className="rounded-xl border border-slate-200 p-3.5">
                    <div className="mb-2.5 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={match.cls}>{match.label}</Badge>
                      <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">{c.matchValue}</span>
                      <span className="text-[11px] text-slate-400">cocok pada {match.label.toLowerCase()} ini</span>
                    </div>
                    <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                      <DuplicateContactCard contact={c.contactA} tag="A" />
                      <div className="flex items-center justify-center">
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">VS</span>
                      </div>
                      <DuplicateContactCard contact={c.contactB} tag="B" />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={mergingKey === key}
                        onClick={() => handleKeepSeparate(c)}
                      >
                        <X className="h-3.5 w-3.5" /> Keep Separate
                      </Button>
                      <Button
                        size="sm"
                        className="gap-1.5 bg-teal-600 text-white hover:bg-teal-700"
                        disabled={mergingKey === key}
                        onClick={() => void handleMerge(c)}
                      >
                        {mergingKey === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Merge className="h-3.5 w-3.5" />}
                        Gabung (Merge)
                      </Button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
