/* ============ Lead Inbox — percakapan per kontak (R21) ============
   Mode "Daftar" (daftar pesan datar) DIHAPUS — tampilan aneh & memecah
   fokus. Inbox kini satu panel messenger: daftar percakapan ringkas
   untuk berganti kontak + klik → chat fokus full-screen (chat-focus).
   Filter (search/brand/kanal/belum-dibalas) diangkat ke sini & dibagikan
   ke semua penempatan daftar (halaman, sidebar desktop, drawer mobile). */
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { crmApi } from './api-client'
import { useCrmStore } from './crm-store'
import { ChatFocusView } from './chat-focus'
import { ConversationList } from './conversation-list'
import { RefreshButton, UserAvatar } from './shared'
import { CHANNELS } from '@/lib/crm-constants'
import type { ContactDTO, ConversationListItemDTO, DuplicateCandidate, InteractionDTO, OpportunityDTO } from '@/lib/crm-types'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
  AlertTriangle, Globe, Loader2, Mail, Merge, MessagesSquare, Phone, Search, X,
} from 'lucide-react'

const NONE = '__none__'
const ALL = '__all__'

const MATCH_META: Record<string, { label: string; cls: string }> = {
  EMAIL: { label: 'Email', cls: 'border-amber-200 bg-amber-50 text-amber-700' },
  WHATSAPP: { label: 'WhatsApp', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  PHONE: { label: 'Telepon', cls: 'border-orange-200 bg-orange-50 text-orange-700' },
}

const dupKey = (c: DuplicateCandidate) => `${c.matchType}:${c.contactA.id}:${c.contactB.id}`

type SlaBreach = { over: number; sla: number; brandName: string }

const SCROLLBAR = '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-transparent'

/** Percakapan = interaksi ter-filter digroup per opportunity (client-side, fallback tanpa API baru). */
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

  /* ---------- Filter state (dibagikan ke semua penempatan daftar) ---------- */
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

  /* ---------- Dialog simulasi form website ---------- */
  const [webFormOpen, setWebFormOpen] = useState(false)
  const [wf, setWf] = useState({ name: '', email: '', whatsapp: '', brandId: '', serviceId: NONE, message: '' })
  const [submittingWf, setSubmittingWf] = useState(false)

  /* ---------- Chat state (percakapan terpilih → chat fokus full-screen) ---------- */
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null)
  // Balasan OUT terkirim dari chat fokus — overlay optimistik di atas daftar percakapan
  // SERVER agar preview "Anda: …" & hilangnya dot "belum dibalas" terlihat SEKETIKA.
  const [sentExtras, setSentExtras] = useState<InteractionDTO[]>([])
  // Daftar percakapan SERVER (GET /api/conversations) — authoritative.
  // null = belum termuat / gagal → tampilan jatuh ke grouping lokal (view tidak pernah rusak).
  const [serverConvs, setServerConvs] = useState<ConversationListItemDTO[] | null>(null)
  const [convLoading, setConvLoading] = useState(false)
  const convLoadedRef = useRef(false)
  const convErrToastRef = useRef(0)

  /* ---------- Debounce search 400ms ---------- */
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 400)
    return () => clearTimeout(t)
  }, [searchInput])

  const loadInteractions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // opportunities ikut dimuat untuk komputasi SLA per lead & fallback grouping
      const [msgs, opps] = await Promise.all([crmApi.interactions(), crmApi.opportunities()])
      setInteractions(msgs)
      setOpportunities(opps)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat pesan')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadDuplicates = useCallback(async () => {
    try {
      setDuplicates(await crmApi.duplicates())
    } catch {
      /* banner duplikat bersifat opsional — gagal senyap */
    }
  }, [])

  /* ---------- Muat daftar percakapan server (authoritative) ----------
     Refetch: mount, tombol refresh, dan setelah aksi dari chat fokus.
     Gagal → toast (throttle 30 dtk) + fallback grouping lokal. */
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

  useEffect(() => { void loadInteractions() }, [loadInteractions])
  useEffect(() => { void loadDuplicates() }, [loadDuplicates])
  useEffect(() => { void loadConversations() }, [loadConversations])

  const visibleDuplicates = useMemo(
    () => duplicates.filter((d) => !dismissed.has(dupKey(d))),
    [duplicates, dismissed],
  )

  /* ---------- SLA breach per lead (client-side, sama dgn dashboard) ---------- */
  // waitingSince = lastInboundAt (interaksi IN terakhir, fallback createdAt utk lead
  // yang belum pernah ada inbound). Breach bila waitingHours > slaHours brand
  // (sourceBrand ?? executingBrand, fallback 24).
  const slaBreaches = useMemo(() => {
    const map = new Map<string, SlaBreach>()
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

  /* ---------- Fallback: group percakapan per opportunity (client-side, hanya bila API conversations gagal/belum termuat) ---------- */
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

  /* ---------- Baris fallback → bentuk ConversationListItemDTO ---------- */
  const fallbackRows = useMemo<ConversationListItemDTO[]>(() => {
    return conversations.map((local) => {
      const opp = opportunities.find((o) => o.id === local.opportunityId)
      return {
        opportunityId: local.opportunityId,
        opportunityCode: opp?.code ?? '—',
        opportunityTitle: opp?.title ?? local.opportunityTitle ?? '',
        stage: opp?.stage ?? 'NEW',
        contactName: local.contactName,
        companyName: local.companyName ?? null,
        brandId: opp?.sourceBrandId ?? null,
        brandName: local.brandName,
        brandColor: local.brandColor,
        lastDirection: local.last.direction === 'OUT' ? ('OUT' as const) : ('IN' as const),
        lastBody: local.last.body,
        lastSentAt: local.last.sentAt,
        lastChannel: local.last.channel,
        messageCount: local.messages.length,
        unanswered: local.last.direction !== 'OUT',
        slaOverHours: slaBreaches.get(local.opportunityId)?.over ?? null,
        slaHours: null,
        escalated: false,
        ownerName: opp?.ownerName ?? null,
      }
    })
  }, [conversations, opportunities, slaBreaches])

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

  const allRows = serverConvs ? chatRows : fallbackRows

  /* Filter client-side atas semua baris: brand, kanal (lastChannel), belum dibalas,
     search (opportunityCode / companyName / contactName / lastBody) */
  const visibleRows = useMemo(() => {
    const q = search.toLowerCase()
    return allRows.filter((c) => {
      if (brandId && c.brandId !== brandId) return false
      if (channel && c.lastChannel !== channel) return false
      if (unreadOnly && !c.unanswered) return false
      if (q) {
        const hay = `${c.opportunityCode} ${c.companyName ?? ''} ${c.contactName} ${c.lastBody}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [allRows, brandId, channel, unreadOnly, search])

  /* ---------- Identitas percakapan terpilih utk chat fokus ----------
     Sumber utama: baris server (+overlay optimistik). Fallback: grouping lokal. */
  const focusConv = useMemo<ConversationListItemDTO | null>(() => {
    if (!selectedConvId) return null
    return chatRows.find((c) => c.opportunityId === selectedConvId)
      ?? fallbackRows.find((c) => c.opportunityId === selectedConvId)
      ?? null
  }, [selectedConvId, chatRows, fallbackRows])

  const rowsLoading = loading && interactions.length === 0 && !serverConvs
  const visibleUnanswered = visibleRows.filter((c) => c.unanswered).length
  const filtersActive = !!search || !!brandId || !!channel || unreadOnly

  /* ---------- Toolbar daftar (dipakai halaman + sidebar/drawer chat fokus) ---------- */
  const chipBase = 'shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60'
  const chipIdle = 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
  const listToolbar = (
    <div className="space-y-2 px-3 pb-2.5 pt-2.5 sm:px-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') setSearch(searchInput.trim()) }}
          placeholder="Cari nama, isi pesan, kode…"
          className="h-9 pl-9"
          aria-label="Cari percakapan"
        />
      </div>
      <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5" role="group" aria-label="Filter brand">
        <button
          type="button"
          aria-pressed={!brandId}
          onClick={() => setBrandId('')}
          className={cn(chipBase, !brandId ? 'border-slate-900 bg-slate-900 text-white' : chipIdle)}
        >
          Semua
        </button>
        {brands.map((b) => {
          const active = brandId === b.id
          return (
            <button
              key={b.id}
              type="button"
              aria-pressed={active}
              onClick={() => setBrandId(active ? '' : b.id)}
              style={active ? { borderColor: b.color, backgroundColor: `${b.color}14`, color: b.color } : undefined}
              className={cn(chipBase, !active && chipIdle)}
            >
              {b.name}
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-2">
        <Select value={channel || ALL} onValueChange={(v) => setChannel(v === ALL ? '' : v)}>
          <SelectTrigger className="h-8 w-[138px] shrink-0 text-xs" aria-label="Filter kanal pesan terakhir">
            <SelectValue placeholder="Semua Kanal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Semua Kanal</SelectItem>
            {CHANNELS.map((c) => (
              <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 rounded-lg px-1.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50">
          <Switch
            checked={unreadOnly}
            onCheckedChange={setUnreadOnly}
            aria-label="Hanya percakapan yang belum dibalas"
          />
          Belum dibalas
        </label>
      </div>
    </div>
  )

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
      await Promise.all([loadInteractions(), loadConversations({ silent: true })])
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

  /* ---------- Render ---------- */
  return (
    <div className="space-y-4">
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

      {/* ===== Panel percakapan (messenger workspace) ===== */}
      <section
        className="flex h-[calc(100dvh-160px)] min-h-[440px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
        aria-label="Kotak percakapan masuk"
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-3 py-2.5 sm:px-4">
          <MessagesSquare className="h-4 w-4 shrink-0 text-teal-600" aria-hidden />
          <h2 className="text-sm font-semibold text-slate-900">Percakapan</h2>
          {!rowsLoading && (
            <>
              <Badge variant="outline" className="shrink-0 border-slate-200 bg-slate-50 text-[10px] text-slate-600">
                {visibleRows.length}
              </Badge>
              {visibleUnanswered > 0 && (
                <Badge className="shrink-0 border-0 bg-amber-100 text-[10px] text-amber-800 hover:bg-amber-100">
                  {visibleUnanswered} belum dibalas
                </Badge>
              )}
            </>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <RefreshButton
              onClick={() => {
                void loadInteractions()
                void loadConversations({ silent: true })
              }}
              loading={loading || convLoading}
            />
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              aria-label="Simulasi lead dari form website"
              title="Simulasi lead dari form website"
              onClick={() => setWebFormOpen(true)}
            >
              <Globe className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {error && !serverConvs && fallbackRows.length === 0 ? (
          <div className="m-3 flex flex-col items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-6 text-center sm:m-4">
            <AlertTriangle className="h-7 w-7 text-rose-500" />
            <div>
              <p className="font-semibold text-rose-800">Gagal memuat percakapan</p>
              <p className="mt-0.5 text-sm text-rose-600">{error}</p>
            </div>
            <Button variant="outline" className="border-rose-300 hover:bg-rose-100" onClick={() => void loadInteractions()}>
              Coba lagi
            </Button>
          </div>
        ) : (
          <ConversationList
            rows={visibleRows}
            activeId={selectedConvId}
            onSelect={setSelectedConvId}
            toolbar={listToolbar}
            loading={rowsLoading}
            ariaLabel="Daftar percakapan masuk"
            emptyTitle={filtersActive && allRows.length > 0 ? 'Tidak ada percakapan yang cocok' : 'Belum ada percakapan'}
            emptyDescription={
              filtersActive && allRows.length > 0
                ? 'Tidak ada percakapan yang cocok dengan filter aktif. Coba ubah pencarian, chip brand, kanal, atau matikan “Belum dibalas”.'
                : 'Belum ada pesan yang terhubung ke opportunity. Simulasikan lead masuk dari form website untuk mencoba alur ini.'
            }
          />
        )}
      </section>

      {/* ===== Chat Fokus Full-Screen =====
          Overlay layar penuh per kontak: timeline lega + daftar percakapan utk
          berganti kontak (sidebar desktop / drawer mobile) + panel konteks lead +
          aksi cepat (Penawaran / Brief / Assign Tugas) langsung dari percakapan. */}
      {focusConv && (
        <ChatFocusView
          conv={focusConv}
          conversations={visibleRows}
          activeConvId={selectedConvId}
          onSelectConversation={setSelectedConvId}
          listToolbar={listToolbar}
          onClose={() => setSelectedConvId(null)}
          onMessageSent={(m) => {
            setSentExtras((prev) => [...prev, m])
            void loadConversations({ silent: true })
          }}
          onActivity={() => {
            void loadInteractions()
            void loadConversations({ silent: true })
          }}
          onOpenOpportunity={(id) => {
            setSelectedConvId(null)
            openOpportunity(id)
          }}
        />
      )}

      {/* ===== Dialog Simulasi Form Website ===== */}
      <Dialog open={webFormOpen} onOpenChange={setWebFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-teal-600" /> Simulasi Form Website
            </DialogTitle>
            <DialogDescription>
              Fitur ini mensimulasikan lead masuk dari form website publik. Lead langsung muncul di daftar percakapan.
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
              <div className="py-4 text-center text-sm text-slate-500">Tidak ada kandidat duplikat — semua sudah digabung atau diabaikan.</div>
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
