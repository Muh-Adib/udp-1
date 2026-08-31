/* ============ Sales Pipeline — Kanban + Table + Opportunity Detail ============ */
'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import {
  BrandChip, StageBadge, TempIcon, UserAvatar, RefreshButton, EmptyState,
} from './shared'
import { OpportunityDetailDrawer } from './opportunity-detail'
import { crmApi } from './api-client'
import { useCrmStore } from './crm-store'
import type { OpportunityDTO, Stage, Priority, CompanyDTO, ContactDTO, UserDTO, BrandDTO, ServiceDTO } from '@/lib/crm-types'
import {
  STAGES, stageMeta, LOST_REASONS, REACTIVATION_OPTIONS, CHANNELS, LEAD_SOURCES,
  PRIORITIES, TEMPERATURES, TEMPERATURES as TEMPS, formatMoney, formatDate, timeAgo,
} from '@/lib/crm-constants'
import { Search, Plus, ChevronDown, ArrowUp, ArrowDown, Download, AlertTriangle, Gauge } from 'lucide-react'
import { computeLeadScore, GRADE_META } from '@/lib/lead-score'

const SCROLLBAR = '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300'
const CURRENCIES = ['IDR', 'SGD', 'MYR', 'USD']
const FLAGS: Record<string, string> = {
  Indonesia: '🇮🇩', Singapore: '🇸🇬', Malaysia: '🇲🇾', Thailand: '🇹🇭', Vietnam: '🇻🇳',
  Philippines: '🇵🇭', India: '🇮🇳', China: '🇨🇳', Japan: '🇯🇵', 'South Korea': '🇰🇷',
  Australia: '🇦🇺', 'United States': '🇺🇸', 'United Kingdom': '🇬🇧', Germany: '🇩🇪',
  Netherlands: '🇳🇱', 'United Arab Emirates': '🇦🇪', 'Saudi Arabia': '🇸🇦', Qatar: '🇶🇦',
}
const flag = (country: string) => FLAGS[country] ?? '🌐'

type SortState = { key: 'value' | 'close' | 'score'; dir: 'asc' | 'desc' } | null

interface NewOppForm {
  title: string
  companyMode: 'existing' | 'new'
  companyId: string
  newCompanyName: string
  newCompanyIndustry: string
  contactMode: 'existing' | 'new'
  contactId: string
  newContactFirstName: string
  newContactEmail: string
  newContactWhatsapp: string
  sourceBrandId: string
  serviceId: string
  leadSource: string
  channel: string
  estimatedValue: string
  currency: string
  priority: Priority
  expectedCloseDate: string
  brief: string
  campaign: string
}

const EMPTY_FORM: NewOppForm = {
  title: '',
  companyMode: 'existing',
  companyId: '',
  newCompanyName: '',
  newCompanyIndustry: '',
  contactMode: 'existing',
  contactId: '',
  newContactFirstName: '',
  newContactEmail: '',
  newContactWhatsapp: '',
  sourceBrandId: '',
  serviceId: '',
  leadSource: 'WEBSITE',
  channel: 'WEBSITE',
  estimatedValue: '',
  currency: 'IDR',
  priority: 'MEDIUM',
  expectedCloseDate: '',
  brief: '',
  campaign: '',
}

/* ---------- Small form helpers ---------- */
function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <p className="mb-1 text-[11px] font-semibold text-slate-500">
      {children}{required && <span className="text-rose-500"> *</span>}
    </p>
  )
}

function ModeToggle({ value, onChange, disableNew }: { value: 'existing' | 'new'; onChange: (m: 'existing' | 'new') => void; disableNew?: boolean }) {
  return (
    <div className="inline-flex shrink-0 rounded-lg border border-slate-200 bg-slate-100 p-0.5">
      <button
        type="button"
        onClick={() => onChange('existing')}
        className={cn('rounded-md px-2.5 py-1 text-[11px] font-medium transition', value === 'existing' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}
      >
        Existing
      </button>
      <button
        type="button"
        disabled={disableNew}
        onClick={() => onChange('new')}
        className={cn('rounded-md px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-40', value === 'new' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}
      >
        Baru
      </button>
    </div>
  )
}

/* ---------- Score badge + breakdown popover ---------- */
function ScoreBadge({ result, compact }: { result: ReturnType<typeof computeLeadScore>; compact?: boolean }) {
  const meta = GRADE_META[result.grade]
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ring-1 transition hover:brightness-95',
            meta.cls, meta.ring,
          )}
          title="Lihat rincian skor lead"
        >
          {!compact && <Gauge className="h-3 w-3" />}
          {result.score}
          <span className="opacity-70">· {result.grade}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-slate-800">Rincian Skor Lead</p>
          <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-bold ring-1', meta.cls, meta.ring)}>
            {result.score} · {meta.label}
          </span>
        </div>
        <div className="mt-2.5 space-y-1.5">
          {result.factors.map((f) => (
            <div key={f.label}>
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-medium text-slate-600">{f.label}</span>
                <span className="text-slate-400">{f.points}/{f.max}{f.note ? ` · ${f.note}` : ''}</span>
              </div>
              <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-teal-500 transition-all"
                  style={{ width: `${Math.min(100, (f.points / f.max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
          {result.penalties.map((f) => (
            <div key={f.label} className="flex items-center justify-between rounded-md bg-rose-50 px-1.5 py-1 text-[10px]">
              <span className="font-medium text-rose-700">{f.label}</span>
              <span className="font-bold text-rose-600">{f.points}{f.note ? ` · ${f.note}` : ''}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 border-t border-slate-100 pt-1.5 text-[9px] leading-relaxed text-slate-400">
          Skor otomatis dari tahap, engagement, recency, nilai, urgensi — dikurangi sinyal perhatian.
        </p>
      </PopoverContent>
    </Popover>
  )
}

/* ---------- Kanban card ---------- */
function PipelineCard({ o, busy, onOpen, onMove }: {
  o: OpportunityDTO
  busy: boolean
  onOpen: () => void
  onMove: (stage: Stage) => void
}) {
  const isClosed = o.stage === 'WON' || o.stage === 'LOST'
  const overdue = !isClosed && !!o.nextActionDate && new Date(o.nextActionDate).getTime() < Date.now()
  const suppressClick = React.useRef(false)
  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', o.id); e.dataTransfer.effectAllowed = 'move' }}
      onClick={() => {
        if (suppressClick.current) { suppressClick.current = false; return }
        onOpen()
      }}
      className={cn(
        'group cursor-pointer rounded-xl border border-slate-200 border-l-4 bg-white p-3 shadow-sm transition hover:border-slate-300 hover:shadow-md',
        busy && 'pointer-events-none opacity-50',
      )}
      style={{ borderLeftColor: o.brandColor }}
    >
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 text-[13px] font-semibold text-slate-800">{o.title}</p>
          <p className="text-[10px] text-slate-400">{o.code}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="rounded p-0.5 text-slate-300 transition hover:bg-slate-100 hover:text-slate-600 sm:opacity-0 sm:group-hover:opacity-100"
              title="Pindah ke…"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
            <DropdownMenuLabel className="text-[11px] text-slate-400">Pindah ke…</DropdownMenuLabel>
            {STAGES.filter((s) => s.key !== o.stage).map((s) => (
              <DropdownMenuItem key={s.key} onSelect={() => { suppressClick.current = true; onMove(s.key) }}>
                <span className={cn('mr-2 h-1.5 w-1.5 rounded-full', s.dot)} />{s.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <p className="truncate text-xs text-slate-500">{o.companyName} · {o.contactName}</p>

      <div className="mt-2 flex items-center gap-1.5">
        <BrandChip name={o.brandName} color={o.brandColor} size="xs" />
        <TempIcon temperature={o.temperature} />
        {o.serviceName && <span className="truncate text-[10px] text-slate-400">· {o.serviceName}</span>}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-slate-900">{formatMoney(o.estimatedValue, o.currency, true)}</span>
        <div className="flex items-center gap-1">
          {!isClosed && <ScoreBadge result={computeLeadScore(o)} compact />}
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">{o.probability}%</span>
        </div>
      </div>

      {o.nextAction && (
        <p className="mt-2 truncate rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700" title={o.nextAction}>
          {o.nextAction}
          {overdue && (
            <span className="ml-1 inline-flex items-center gap-0.5 whitespace-nowrap text-[10px] font-semibold text-rose-600">
              <span className="h-1 w-1 rounded-full bg-rose-500" />Terlambat
            </span>
          )}
        </p>
      )}
      {!o.nextAction && overdue && (
        <p className="mt-2 inline-flex items-center gap-1 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600">
          <span className="h-1 w-1 rounded-full bg-rose-500" />Terlambat
        </p>
      )}

      <div className="mt-2 flex items-center gap-1.5 border-t border-slate-100 pt-2">
        <UserAvatar name={o.ownerName} color={o.ownerColor} size={20} />
        <span className="truncate text-[10px] font-medium text-slate-500">{o.ownerName}</span>
        <span className="ml-auto truncate text-[10px] text-slate-400">{timeAgo(o.lastInteractionAt)}</span>
        <span title={o.companyCountry} className="text-[11px] leading-none">{flag(o.companyCountry)}</span>
      </div>
    </div>
  )
}

/* ================= Main view ================= */
export default function PipelineView({ focusOpportunityId, onConsumeFocus }: {
  focusOpportunityId: string | null
  onConsumeFocus: () => void
}) {
  const { toast } = useToast()
  const { brands, user } = useCrmStore()

  const [opps, setOpps] = useState<OpportunityDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  /* filters */
  const [search, setSearch] = useState('')
  const [brandFilter, setBrandFilter] = useState('all')
  const [ownerFilter, setOwnerFilter] = useState('all')
  const [tempFilter, setTempFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [view, setView] = useState<'kanban' | 'tabel'>('kanban')

  /* owners (MARKETING only) */
  const [marketingUsers, setMarketingUsers] = useState<UserDTO[]>([])

  /* kanban drag & drop */
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  /* detail drawer */
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  /* table */
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sort, setSort] = useState<SortState>(null)
  const [bulkOwner, setBulkOwner] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)

  /* stage dialogs */
  const [lostTarget, setLostTarget] = useState<OpportunityDTO | null>(null)
  const [lostReason, setLostReason] = useState('')
  const [lostNotes, setLostNotes] = useState('')
  const [lostCompetitor, setLostCompetitor] = useState('')
  const [lostReactivation, setLostReactivation] = useState('')
  const [lostFollowUp, setLostFollowUp] = useState('')
  const [wonTarget, setWonTarget] = useState<OpportunityDTO | null>(null)
  const [wonOffer, setWonOffer] = useState('')

  /* new opportunity dialog */
  const [newOpen, setNewOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<NewOppForm>(EMPTY_FORM)
  const [companies, setCompanies] = useState<CompanyDTO[]>([])
  const [companiesLoading, setCompaniesLoading] = useState(false)
  const [contacts, setContacts] = useState<ContactDTO[]>([])
  const [contactsLoading, setContactsLoading] = useState(false)

  /* ---------- data ---------- */
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await crmApi.opportunities()
      setOpps(data)
      setFetchError(null)
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : 'Gagal memuat pipeline')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    let alive = true
    crmApi.users()
      .then((us) => { if (alive) setMarketingUsers(us.filter((u) => u.isActive && u.role === 'MARKETING')) })
      .catch(() => { /* biarkan kosong */ })
    return () => { alive = false }
  }, [])

  /* focus dari view lain (mis. related opportunity di drawer) */
  useEffect(() => {
    if (focusOpportunityId) {
      setDetailId(focusOpportunityId)
      setDetailOpen(true)
      onConsumeFocus()
    }
  }, [focusOpportunityId, onConsumeFocus])

  /* ---------- client-side filter ---------- */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return opps.filter((o) => {
      if (brandFilter !== 'all' && o.sourceBrandId !== brandFilter) return false
      if (ownerFilter !== 'all' && o.ownerId !== ownerFilter) return false
      if (tempFilter !== 'all' && o.temperature !== tempFilter) return false
      if (priorityFilter !== 'all' && o.priority !== priorityFilter) return false
      if (q) {
        const hay = `${o.code} ${o.title} ${o.companyName} ${o.contactName}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [opps, search, brandFilter, ownerFilter, tempFilter, priorityFilter])

  /* ---------- lead scoring (rule-based, Phase 4) ---------- */
  const scoreMap = useMemo(() => {
    const m = new Map<string, ReturnType<typeof computeLeadScore>>()
    for (const o of filtered) m.set(o.id, computeLeadScore(o))
    return m
  }, [filtered])

  const tableRows = useMemo(() => {
    const rows = [...filtered]
    if (sort) {
      rows.sort((a, b) => {
        let d = 0
        if (sort.key === 'value') {
          d = a.estimatedValue - b.estimatedValue
        } else if (sort.key === 'score') {
          d = (scoreMap.get(a.id)?.score ?? 0) - (scoreMap.get(b.id)?.score ?? 0)
        } else {
          const ta = a.expectedCloseDate ? new Date(a.expectedCloseDate).getTime() : 0
          const tb = b.expectedCloseDate ? new Date(b.expectedCloseDate).getTime() : 0
          d = ta - tb
        }
        return sort.dir === 'asc' ? d : -d
      })
    }
    return rows
  }, [filtered, sort, scoreMap])

  /* ---------- stage moves ---------- */
  const applyStageChange = useCallback(async (id: string, stage: Stage, extra?: Record<string, unknown>, successTitle?: string) => {
    setBusyId(id)
    try {
      await crmApi.changeStage(id, { stage, ...extra })
      toast({
        title: successTitle ?? 'Stage diperbarui',
        description: `Opportunity dipindah ke ${stageMeta(stage).label}`,
      })
      await load()
    } catch (e) {
      toast({ title: 'Gagal memindahkan opportunity', description: e instanceof Error ? e.message : 'Terjadi kesalahan', variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }, [load, toast])

  const handleMove = useCallback((o: OpportunityDTO, target: Stage) => {
    if (target === o.stage) return
    if (target === 'LOST') {
      setLostReason(''); setLostNotes(''); setLostCompetitor(''); setLostReactivation(''); setLostFollowUp('')
      setLostTarget(o)
      return
    }
    if (target === 'WON') { setWonOffer(''); setWonTarget(o); return }
    void applyStageChange(o.id, target)
  }, [applyStageChange])

  const submitLost = () => {
    if (!lostTarget || !lostReason) return
    const id = lostTarget.id
    setLostTarget(null)
    void applyStageChange(id, 'LOST', {
      lostReason,
      ...(lostNotes.trim() ? { lostNotes: lostNotes.trim() } : {}),
      ...(lostCompetitor.trim() ? { competitorName: lostCompetitor.trim() } : {}),
      ...(lostReactivation ? { reactivation: lostReactivation } : {}),
      ...(lostFollowUp ? { followUpDate: lostFollowUp } : {}),
    }, 'Opportunity ditandai Lost')
  }

  const confirmWon = () => {
    if (!wonTarget) return
    const id = wonTarget.id
    const offer = Number(wonOffer)
    setWonTarget(null)
    void applyStageChange(id, 'WON', offer > 0 ? { lastOfferValue: offer } : {}, '🎉 Deal Won! Project produksi dibuat otomatis')
  }

  /* ---------- table helpers ---------- */
  const openDetail = useCallback((id: string) => { setDetailId(id); setDetailOpen(true) }, [])

  const toggleSort = (key: 'value' | 'close' | 'score') => {
    setSort((s) => {
      if (s?.key !== key) return { key, dir: 'desc' }
      if (s.dir === 'desc') return { key, dir: 'asc' }
      return null
    })
  }

  const toggleRow = (id: string, checked: boolean) => {
    setSelected((prev) => { const n = new Set(prev); if (checked) n.add(id); else n.delete(id); return n })
  }
  const allChecked = filtered.length > 0 && filtered.every((o) => selected.has(o.id))
  const toggleAll = (checked: boolean) => setSelected(checked ? new Set(filtered.map((o) => o.id)) : new Set())

  const canExport = !!user && ['SUPER_ADMIN', 'DIREKTUR', 'KEUANGAN'].includes(user.role)

  const exportCsv = () => {
    const rows = Array.from(selected)
      .map((id) => opps.find((o) => o.id === id))
      .filter((o): o is OpportunityDTO => !!o)
    if (rows.length === 0) return
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [
      ['Kode', 'Judul', 'Perusahaan', 'Brand', 'Stage', 'Nilai', 'Currency', 'Prob', 'Owner', 'Est Close'].join(';'),
      ...rows.map((o) => [
        o.code, o.title, o.companyName, o.brandName, stageMeta(o.stage).label,
        o.estimatedValue, o.currency, o.probability, o.ownerName, o.expectedCloseDate ?? '',
      ].map(esc).join(';')),
    ]
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'pipeline-opportunities.csv'
    a.click()
    URL.revokeObjectURL(url)
    toast({ title: 'CSV diekspor', description: `${rows.length} opportunity diekspor ke pipeline-opportunities.csv` })
  }

  const assignBulk = async (ownerId: string) => {
    setBulkBusy(true)
    try {
      const ids = Array.from(selected)
      for (const id of ids) {
        await crmApi.updateOpportunity(id, { ownerId })
      }
      const owner = marketingUsers.find((u) => u.id === ownerId)
      toast({ title: 'Assign selesai', description: `${ids.length} opportunity di-assign ke ${owner?.name ?? 'owner terpilih'}` })
      setSelected(new Set())
      setBulkOwner('')
      await load()
    } catch (e) {
      toast({ title: 'Gagal assign owner', description: e instanceof Error ? e.message : 'Terjadi kesalahan', variant: 'destructive' })
    } finally {
      setBulkBusy(false)
    }
  }

  /* ---------- new opportunity ---------- */
  const openNewDialog = async (open: boolean) => {
    setNewOpen(open)
    if (open) {
      setForm(EMPTY_FORM)
      setContacts([])
      setCompaniesLoading(true)
      try {
        setCompanies(await crmApi.companies())
      } catch {
        setCompanies([])
      } finally {
        setCompaniesLoading(false)
      }
    }
  }

  const onCompanyChange = async (id: string) => {
    setForm((f) => ({ ...f, companyId: id, contactId: '', contactMode: 'existing' }))
    setContactsLoading(true)
    try {
      const cs = await crmApi.contacts(`companyId=${id}`)
      setContacts(cs)
      if (cs.length === 0) setForm((f) => ({ ...f, contactMode: 'new' }))
    } catch {
      setContacts([])
    } finally {
      setContactsLoading(false)
    }
  }

  const onBrandChange = (id: string) => {
    const brand = brands.find((b: BrandDTO) => b.id === id)
    setForm((f) => ({ ...f, sourceBrandId: id, serviceId: '', currency: brand?.primaryCurrency ?? f.currency }))
  }

  const services: ServiceDTO[] = useMemo(
    () => brands.find((b: BrandDTO) => b.id === form.sourceBrandId)?.services ?? [],
    [brands, form.sourceBrandId],
  )

  const submitNew = async () => {
    if (!form.title.trim()) { toast({ title: 'Judul opportunity wajib diisi', variant: 'destructive' }); return }
    if (!form.sourceBrandId) { toast({ title: 'Brand sumber wajib dipilih', variant: 'destructive' }); return }
    if (form.companyMode === 'existing' && !form.companyId) { toast({ title: 'Perusahaan wajib dipilih', variant: 'destructive' }); return }
    if (form.companyMode === 'new' && !form.newCompanyName.trim()) { toast({ title: 'Nama perusahaan baru wajib diisi', variant: 'destructive' }); return }
    if (form.contactMode === 'existing' && !form.contactId) { toast({ title: 'Kontak wajib dipilih', variant: 'destructive' }); return }
    if (form.contactMode === 'new' && !form.newContactFirstName.trim()) { toast({ title: 'Nama kontak baru wajib diisi', variant: 'destructive' }); return }

    setCreating(true)
    try {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        sourceBrandId: form.sourceBrandId,
        leadSource: form.leadSource,
        channel: form.channel,
        estimatedValue: Number(form.estimatedValue) || 0,
        currency: form.currency,
        priority: form.priority,
        ...(form.serviceId ? { serviceId: form.serviceId } : {}),
        ...(form.expectedCloseDate ? { expectedCloseDate: form.expectedCloseDate } : {}),
        ...(form.brief.trim() ? { brief: form.brief.trim() } : {}),
        ...(form.campaign.trim() ? { campaign: form.campaign.trim() } : {}),
      }
      if (form.companyMode === 'existing') {
        payload.companyId = form.companyId
      } else {
        payload.newCompany = { name: form.newCompanyName.trim(), industry: form.newCompanyIndustry.trim() || undefined }
      }
      if (form.contactMode === 'existing') {
        payload.contactId = form.contactId
      } else {
        payload.newContact = {
          firstName: form.newContactFirstName.trim(),
          email: form.newContactEmail.trim() || undefined,
          whatsapp: form.newContactWhatsapp.trim() || undefined,
        }
      }
      const created = await crmApi.createOpportunity(payload)
      toast({ title: 'Opportunity dibuat', description: `${created.code} — ${created.title} masuk stage New` })
      setNewOpen(false)
      await load()
      openDetail(created.id)
    } catch (e) {
      toast({ title: 'Gagal membuat opportunity', description: e instanceof Error ? e.message : 'Terjadi kesalahan', variant: 'destructive' })
    } finally {
      setCreating(false)
    }
  }

  /* ---------- render ---------- */
  return (
    <div className="space-y-4">
      {/* ===== Toolbar ===== */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari kode, judul, perusahaan, kontak…"
            className="h-9 pl-8 text-sm"
          />
        </div>

        <Select value={brandFilter} onValueChange={setBrandFilter}>
          <SelectTrigger size="sm" className="w-full sm:w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Brand</SelectItem>
            {brands.map((b: BrandDTO) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={ownerFilter} onValueChange={setOwnerFilter}>
          <SelectTrigger size="sm" className="w-full sm:w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Owner</SelectItem>
            {marketingUsers.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={tempFilter} onValueChange={setTempFilter}>
          <SelectTrigger size="sm" className="w-full sm:w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Suhu</SelectItem>
            {TEMPS.map((t) => <SelectItem key={t.key} value={t.key}>{t.emoji} {t.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger size="sm" className="w-full sm:w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Prioritas</SelectItem>
            {PRIORITIES.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
            <button
              onClick={() => setView('kanban')}
              className={cn('rounded-md px-3 py-1.5 text-xs font-medium transition', view === 'kanban' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800')}
            >
              Kanban
            </button>
            <button
              onClick={() => setView('tabel')}
              className={cn('rounded-md px-3 py-1.5 text-xs font-medium transition', view === 'tabel' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800')}
            >
              Tabel
            </button>
          </div>
          <Button onClick={() => void openNewDialog(true)} className="h-9 gap-1.5 bg-slate-900 text-white hover:bg-slate-800">
            <Plus className="h-4 w-4" /><span className="hidden sm:inline">Opportunity</span>
          </Button>
          <RefreshButton onClick={() => void load()} loading={loading} />
        </div>
      </div>

      {/* ===== Error ===== */}
      {fetchError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Gagal memuat pipeline</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{fetchError}</span>
            <Button variant="outline" size="sm" onClick={() => void load()}>Coba lagi</Button>
          </AlertDescription>
        </Alert>
      )}

      {/* ===== Loading skeleton ===== */}
      {loading && opps.length === 0 && !fetchError && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="mt-2 h-3 w-1/2" />
              <Skeleton className="mt-4 h-5 w-24" />
              <Skeleton className="mt-4 h-8 w-full rounded-lg" />
            </div>
          ))}
        </div>
      )}

      {!loading && opps.length === 0 && !fetchError && (
        <EmptyState
          title="Belum ada opportunity"
          description="Buat opportunity pertama lewat tombol “+ Opportunity”, atau tambahkan lead baru dari Lead Inbox."
          action={
            <Button size="sm" className="bg-slate-900 hover:bg-slate-800" onClick={() => void openNewDialog(true)}>
              <Plus className="mr-1.5 h-4 w-4" />Opportunity
            </Button>
          }
        />
      )}

      {opps.length > 0 && (
        <>
          {/* ===== Kanban ===== */}
          {view === 'kanban' && (
            <div className="flex gap-3 overflow-x-auto pb-4">
              {STAGES.map((stage) => {
                const items = filtered.filter((o) => o.stage === stage.key)
                const sum = items.reduce((acc, o) => acc + o.estimatedValue, 0)
                return (
                  <div
                    key={stage.key}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(stage.key) }}
                    onDragLeave={() => setDragOver((cur) => (cur === stage.key ? null : cur))}
                    onDrop={(e) => {
                      e.preventDefault()
                      setDragOver(null)
                      const id = e.dataTransfer.getData('text/plain')
                      const opp = opps.find((x) => x.id === id)
                      if (opp) handleMove(opp, stage.key)
                    }}
                    className={cn(
                      'flex w-[290px] shrink-0 flex-col rounded-xl border bg-slate-50/60 transition-colors',
                      dragOver === stage.key ? 'border-teal-400 bg-teal-50/40' : 'border-slate-200',
                    )}
                  >
                    <div className="flex items-center gap-2 border-b border-slate-200/70 px-3 py-2.5">
                      <span className={cn('h-2 w-2 rounded-full', stage.dot)} />
                      <span className="text-xs font-semibold text-slate-700">{stage.label}</span>
                      <span className="rounded-full bg-slate-200/70 px-1.5 text-[10px] font-bold text-slate-600">{items.length}</span>
                      <span className="ml-auto whitespace-nowrap text-[10px] font-semibold text-slate-500">{formatMoney(sum, 'IDR', true)}</span>
                    </div>
                    <div className={cn('min-h-[120px] max-h-[calc(100vh-320px)] flex-1 space-y-2 overflow-y-auto p-2', SCROLLBAR)}>
                      {items.map((o) => (
                        <PipelineCard
                          key={o.id}
                          o={o}
                          busy={busyId === o.id}
                          onOpen={() => openDetail(o.id)}
                          onMove={(s) => handleMove(o, s)}
                        />
                      ))}
                      {items.length === 0 && (
                        <p className="py-8 text-center text-[11px] text-slate-300">Tarik kartu ke sini</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ===== Table ===== */}
          {view === 'tabel' && (
            <div className="space-y-3">
              {selected.size > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-teal-200 bg-teal-50/60 p-3">
                  <span className="text-sm font-semibold text-teal-900">{selected.size} dipilih</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Assign ke:</span>
                    <Select value={bulkOwner || 'none'} onValueChange={(v) => { if (v !== 'none') { setBulkOwner(v); void assignBulk(v) } }}>
                      <SelectTrigger size="sm" className="w-[160px]" disabled={bulkBusy}>
                        <SelectValue placeholder={bulkBusy ? 'Menugaskan…' : 'Pilih owner'} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" disabled>Pilih owner…</SelectItem>
                        {marketingUsers.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {canExport && (
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv}>
                      <Download className="h-3.5 w-3.5" />Export CSV
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setSelected(new Set())}>Bersihkan</Button>
                </div>
              )}

              <Card className="overflow-hidden rounded-xl border-slate-200 py-0">
                <div className="overflow-x-auto">
                  <Table className="min-w-[1120px]">
                    <TableHeader>
                      <TableRow className="bg-slate-50 hover:bg-slate-50">
                        <TableHead className="w-10">
                          <Checkbox checked={allChecked} onCheckedChange={(v) => toggleAll(v === true)} aria-label="Pilih semua baris" />
                        </TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Kode</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Judul</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Brand</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Service</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Stage</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">
                          <button onClick={() => toggleSort('score')} className="inline-flex items-center gap-1 font-medium hover:text-slate-900">
                            Skor
                            {sort?.key === 'score' && (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                          </button>
                        </TableHead>
                        <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-500">
                          <button onClick={() => toggleSort('value')} className="inline-flex items-center gap-1 font-medium hover:text-slate-900">
                            Nilai
                            {sort?.key === 'value' && (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                          </button>
                        </TableHead>
                        <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-500">Prob. %</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">
                          <button onClick={() => toggleSort('close')} className="inline-flex items-center gap-1 font-medium hover:text-slate-900">
                            Est. Close
                            {sort?.key === 'close' && (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                          </button>
                        </TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Owner</TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Update</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tableRows.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={12} className="py-10 text-center text-sm text-slate-400">
                            Tidak ada opportunity yang cocok dengan filter.
                          </TableCell>
                        </TableRow>
                      )}
                      {tableRows.map((o) => {
                        const closePast = o.expectedCloseDate && o.stage !== 'WON' && o.stage !== 'LOST' && new Date(o.expectedCloseDate).getTime() < Date.now()
                        return (
                          <TableRow key={o.id} onClick={() => openDetail(o.id)} className="cursor-pointer hover:bg-slate-50/80">
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <Checkbox checked={selected.has(o.id)} onCheckedChange={(v) => toggleRow(o.id, v === true)} aria-label={`Pilih ${o.code}`} />
                            </TableCell>
                            <TableCell className="whitespace-nowrap font-mono text-[11px] text-slate-400">{o.code}</TableCell>
                            <TableCell className="max-w-[230px]">
                              <p className="line-clamp-1 text-[13px] font-medium text-slate-800">{o.title}</p>
                              <p className="truncate text-[11px] text-slate-400">{o.companyName} · {o.contactName}</p>
                            </TableCell>
                            <TableCell><BrandChip name={o.brandName} color={o.brandColor} size="xs" /></TableCell>
                            <TableCell className="text-xs text-slate-500">{o.serviceName ?? '—'}</TableCell>
                            <TableCell><StageBadge stage={o.stage} /></TableCell>
                            <TableCell>
                              {o.stage === 'WON' || o.stage === 'LOST' ? (
                                <span className="text-[11px] text-slate-300">—</span>
                              ) : (
                                <ScoreBadge result={scoreMap.get(o.id) ?? computeLeadScore(o)} />
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-right text-[13px] font-bold tabular-nums text-slate-800">{formatMoney(o.estimatedValue, o.currency, true)}</TableCell>
                            <TableCell className="text-right"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-slate-500">{o.probability}%</span></TableCell>
                            <TableCell className={cn('whitespace-nowrap text-xs', closePast ? 'font-semibold text-rose-600' : 'text-slate-600')}>
                              {formatDate(o.expectedCloseDate)}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <UserAvatar name={o.ownerName} color={o.ownerColor} size={22} />
                                <span className="max-w-[110px] truncate text-[11px] text-slate-600">{o.ownerName}</span>
                              </div>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-[11px] text-slate-400">{timeAgo(o.lastInteractionAt ?? o.stageUpdatedAt)}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </div>
          )}
        </>
      )}

      {/* ===== Detail drawer ===== */}
      <OpportunityDetailDrawer
        opportunityId={detailId}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onChanged={load}
      />

      {/* ===== Dialog: Lost reason (kanban drop) ===== */}
      <Dialog open={!!lostTarget} onOpenChange={(o) => { if (!o) setLostTarget(null) }}>
        <DialogContent className={cn('max-h-[85vh] overflow-y-auto sm:max-w-md', SCROLLBAR)}>
          <DialogHeader>
            <DialogTitle>Tandai Lost — {lostTarget?.code}</DialogTitle>
            <DialogDescription>Pilih alasan utama kenapa deal ini lost untuk analitik funnel.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={lostReason || undefined} onValueChange={setLostReason}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Alasan lost *" /></SelectTrigger>
              <SelectContent>
                {LOST_REASONS.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Textarea
              value={lostNotes}
              onChange={(e) => setLostNotes(e.target.value)}
              placeholder="Catatan tambahan (opsional)…"
              className="min-h-[64px] resize-none text-sm"
            />
            <Input
              value={lostCompetitor}
              onChange={(e) => setLostCompetitor(e.target.value)}
              placeholder="Kompetitor (opsional)"
              className="text-sm"
            />
            <Select value={lostReactivation || 'none'} onValueChange={(v) => setLostReactivation(v === 'none' ? '' : v)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Rencana reaktivasi" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Tidak ada rencana —</SelectItem>
                {REACTIVATION_OPTIONS.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div>
              <p className="mb-1 text-xs text-slate-500">Tanggal follow-up (opsional)</p>
              <Input type="date" value={lostFollowUp} onChange={(e) => setLostFollowUp(e.target.value)} className="text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLostTarget(null)}>Batal</Button>
            <Button variant="destructive" disabled={!lostReason} onClick={submitLost}>Tandai Lost</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Dialog: Confirm WON (kanban drop) ===== */}
      <Dialog open={!!wonTarget} onOpenChange={(o) => { if (!o) setWonTarget(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tandai WON?</DialogTitle>
            <DialogDescription>Project akan dibuat otomatis dengan milestone sesuai workflow brand{wonTarget ? ` (${wonTarget.brandName})` : ''}.</DialogDescription>
          </DialogHeader>
          <div>
            <p className="mb-1 text-xs text-slate-500">Nilai final / last offer (opsional — finalize nilai deal)</p>
            <Input
              type="number"
              min={0}
              value={wonOffer}
              onChange={(e) => setWonOffer(e.target.value)}
              placeholder={wonTarget ? String(wonTarget.estimatedValue) : '0'}
              className="text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWonTarget(null)}>Batal</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={confirmWon}>Ya, Tandai WON</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Dialog: New Opportunity ===== */}
      <Dialog open={newOpen} onOpenChange={(o) => void openNewDialog(o)}>
        <DialogContent className={cn('max-h-[88vh] overflow-y-auto sm:max-w-2xl', SCROLLBAR)}>
          <DialogHeader>
            <DialogTitle>Opportunity Baru</DialogTitle>
            <DialogDescription>Buat opportunity manual — pakai perusahaan & kontak existing, atau buat data baru.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FieldLabel required>Judul</FieldLabel>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Misal: Video profil perusahaan 2026"
                className="text-sm"
              />
            </div>

            {/* Perusahaan */}
            <div className="rounded-xl border border-slate-200 p-3 sm:col-span-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <FieldLabel required>Perusahaan</FieldLabel>
                <ModeToggle
                  value={form.companyMode}
                  onChange={(m) => setForm((f) => ({
                    ...f,
                    companyMode: m,
                    companyId: m === 'new' ? '' : f.companyId,
                    contactMode: m === 'new' ? 'new' : f.contactMode,
                    contactId: m === 'new' ? '' : f.contactId,
                  }))}
                />
              </div>
              {form.companyMode === 'existing' ? (
                <Select value={form.companyId || undefined} onValueChange={(v) => void onCompanyChange(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={companiesLoading ? 'Memuat perusahaan…' : 'Pilih perusahaan'} />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} · {c.country}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Input
                    value={form.newCompanyName}
                    onChange={(e) => setForm((f) => ({ ...f, newCompanyName: e.target.value }))}
                    placeholder="Nama perusahaan *"
                    className="text-sm"
                  />
                  <Input
                    value={form.newCompanyIndustry}
                    onChange={(e) => setForm((f) => ({ ...f, newCompanyIndustry: e.target.value }))}
                    placeholder="Industri (opsional)"
                    className="text-sm"
                  />
                </div>
              )}
            </div>

            {/* Kontak */}
            <div className="rounded-xl border border-slate-200 p-3 sm:col-span-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <FieldLabel required>Kontak</FieldLabel>
                <ModeToggle
                  value={form.contactMode}
                  disableNew={false}
                  onChange={(m) => setForm((f) => ({ ...f, contactMode: m, contactId: m === 'new' ? '' : f.contactId }))}
                />
              </div>
              {form.contactMode === 'existing' ? (
                form.companyMode === 'new' ? (
                  <p className="text-xs text-slate-400">Perusahaan baru — kontak akan dibuat baru juga.</p>
                ) : contactsLoading ? (
                  <p className="text-xs text-slate-400">Memuat kontak…</p>
                ) : contacts.length === 0 ? (
                  <p className="text-xs text-slate-400">Perusahaan ini belum punya kontak — buat kontak baru.</p>
                ) : (
                  <Select value={form.contactId || undefined} onValueChange={(v) => setForm((f) => ({ ...f, contactId: v }))}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Pilih kontak" /></SelectTrigger>
                    <SelectContent className="max-h-64">
                      {contacts.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.fullName}{c.position ? ` — ${c.position}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Input
                    value={form.newContactFirstName}
                    onChange={(e) => setForm((f) => ({ ...f, newContactFirstName: e.target.value }))}
                    placeholder="Nama depan *"
                    className="text-sm"
                  />
                  <Input
                    type="email"
                    value={form.newContactEmail}
                    onChange={(e) => setForm((f) => ({ ...f, newContactEmail: e.target.value }))}
                    placeholder="Email (opsional)"
                    className="text-sm"
                  />
                  <Input
                    value={form.newContactWhatsapp}
                    onChange={(e) => setForm((f) => ({ ...f, newContactWhatsapp: e.target.value }))}
                    placeholder="WhatsApp (opsional)"
                    className="text-sm"
                  />
                </div>
              )}
            </div>

            {/* Brand + service */}
            <div>
              <FieldLabel required>Brand Sumber</FieldLabel>
              <Select value={form.sourceBrandId || undefined} onValueChange={onBrandChange}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Pilih brand" /></SelectTrigger>
                <SelectContent>
                  {brands.map((b: BrandDTO) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FieldLabel>Service</FieldLabel>
              <Select
                value={form.serviceId || undefined}
                onValueChange={(v) => setForm((f) => ({ ...f, serviceId: v }))}
                disabled={!form.sourceBrandId}
              >
                <SelectTrigger className="w-full"><SelectValue placeholder={form.sourceBrandId ? 'Pilih service' : 'Pilih brand dulu'} /></SelectTrigger>
                <SelectContent>
                  {services.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Lead source + channel */}
            <div>
              <FieldLabel required>Sumber Lead</FieldLabel>
              <Select value={form.leadSource} onValueChange={(v) => setForm((f) => ({ ...f, leadSource: v }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAD_SOURCES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FieldLabel required>Kanal</FieldLabel>
              <Select value={form.channel} onValueChange={(v) => setForm((f) => ({ ...f, channel: v }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Value + currency */}
            <div>
              <FieldLabel>Nilai Estimasi</FieldLabel>
              <Input
                type="number"
                min={0}
                value={form.estimatedValue}
                onChange={(e) => setForm((f) => ({ ...f, estimatedValue: e.target.value }))}
                placeholder="0"
                className="text-sm"
              />
            </div>
            <div>
              <FieldLabel>Currency</FieldLabel>
              <Select value={form.currency} onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Priority + expected close */}
            <div>
              <FieldLabel>Prioritas</FieldLabel>
              <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v as Priority }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FieldLabel>Est. Close Date</FieldLabel>
              <Input
                type="date"
                value={form.expectedCloseDate}
                onChange={(e) => setForm((f) => ({ ...f, expectedCloseDate: e.target.value }))}
                className="text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <FieldLabel>Brief</FieldLabel>
              <Textarea
                value={form.brief}
                onChange={(e) => setForm((f) => ({ ...f, brief: e.target.value }))}
                placeholder="Ringkasan kebutuhan client…"
                className="min-h-[72px] resize-none text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <FieldLabel>Campaign (opsional)</FieldLabel>
              <Input
                value={form.campaign}
                onChange={(e) => setForm((f) => ({ ...f, campaign: e.target.value }))}
                placeholder="Misal: Ramadhan Campaign 2026"
                className="text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Batal</Button>
            <Button className="bg-slate-900 hover:bg-slate-800" disabled={creating} onClick={() => void submitNew()}>
              {creating ? 'Membuat…' : 'Buat Opportunity'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
