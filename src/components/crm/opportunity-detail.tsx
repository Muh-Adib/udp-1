/* ============ Opportunity Detail Drawer (Sheet) ============ */
'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import {
  Sheet, SheetContent, SheetClose, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import {
  BrandChip, StageBadge, PriorityBadge, TempBadge, ChannelIcon, UserAvatar, EmptyState,
} from './shared'
import { crmApi } from './api-client'
import { BriefEstimationTab } from './brief-estimation-tab'
import { useCrmStore } from './crm-store'
import type { OpportunityDetailDTO, OpportunityAiSummaryDTO, Stage, Temperature, Priority, ContactDTO } from '@/lib/crm-types'
import {
  STAGES, stageMeta, LOST_REASONS, lostReasonLabel, REACTIVATION_OPTIONS, reactivationLabel,
  channelMeta, LEAD_SOURCES, leadSourceLabel, PRIORITIES, priorityMeta, TEMPERATURES, temperatureMeta,
  TASK_TYPES, projectStatusMeta, formatMoney, formatDate, timeAgo,
} from '@/lib/crm-constants'
import {
  Building2, User, Mail, MessageCircle, MoreVertical, AlertTriangle, CheckCircle2, Circle,
  Clock, Copy, Loader2, Plus, Send, Sparkles, Trash2, Settings2, CalendarClock, Paperclip, Link2, CornerDownRight, X, Calculator,
} from 'lucide-react'

const SCROLLBAR = '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300'

/* Sentiment chip meta — Ringkasan AI (Phase 4) */
const AI_SENTIMENT: Record<OpportunityAiSummaryDTO['sentiment'], { label: string; cls: string }> = {
  POSITIVE: { label: 'Positif', cls: 'bg-emerald-100 text-emerald-700' },
  NEUTRAL: { label: 'Netral', cls: 'bg-slate-100 text-slate-600' },
  NEGATIVE: { label: 'Negatif', cls: 'bg-rose-100 text-rose-700' },
  MIXED: { label: 'Bercampur', cls: 'bg-amber-100 text-amber-700' },
}

type TabKey = 'ringkasan' | 'percakapan' | 'tugas' | 'catatan' | 'brief_estimasi'

interface LostForm { reason: string; notes: string; competitor: string; reactivation: string; followUpDate: string }

const EMPTY_LOST: LostForm = { reason: '', notes: '', competitor: '', reactivation: '', followUpDate: '' }

/* ---------- Small definition item ---------- */
function DefItem({ label, value }: { label: string; value?: React.ReactNode | null }) {
  const empty = value === null || value === undefined || value === ''
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <div className={cn('mt-0.5 whitespace-pre-wrap break-words text-sm', empty ? 'text-slate-300' : 'text-slate-700')}>
        {empty ? '—' : value}
      </div>
    </div>
  )
}

export function OpportunityDetailDrawer({ opportunityId, open, onClose, onChanged }: {
  opportunityId: string | null
  open: boolean
  onClose: () => void
  onChanged?: () => void
}) {
  const { toast } = useToast()
  const { user, openOpportunity } = useCrmStore()

  const [detail, setDetail] = useState<OpportunityDetailDTO | null>(null)
  const [contact, setContact] = useState<ContactDTO | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>('ringkasan')

  /* composer */
  const composerRef = useRef<HTMLDivElement | null>(null)
  const [composerChannel, setComposerChannel] = useState('WHATSAPP')
  const [composerBody, setComposerBody] = useState('')
  const [sending, setSending] = useState(false)

  /* task form */
  const [taskTitle, setTaskTitle] = useState('')
  const [taskAssignee, setTaskAssignee] = useState('')
  const [taskDue, setTaskDue] = useState('')
  const [taskType, setTaskType] = useState('FOLLOW_UP')
  const [addingTask, setAddingTask] = useState(false)
  const [togglingTask, setTogglingTask] = useState<string | null>(null)

  /* note form */
  const [noteBody, setNoteBody] = useState('')
  const [noteVisibility, setNoteVisibility] = useState('INTERNAL')
  const [addingNote, setAddingNote] = useState(false)

  /* AI summary (Phase 4) — cache per opportunity id, pindah opportunity tidak refetch kecuali Buat Ulang */
  const [aiSummaries, setAiSummaries] = useState<Record<string, OpportunityAiSummaryDTO>>({})
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState(false)
  const [aiTaskCreated, setAiTaskCreated] = useState<Set<string>>(new Set())
  const [aiTaskCreating, setAiTaskCreating] = useState<string | null>(null)

  /* dialogs */
  const [movingStage, setMovingStage] = useState(false)
  const [lostOpen, setLostOpen] = useState(false)
  const [lostForm, setLostForm] = useState<LostForm>(EMPTY_LOST)
  const [wonOpen, setWonOpen] = useState(false)
  const [wonOffer, setWonOffer] = useState('')
  const [priorityOpen, setPriorityOpen] = useState(false)
  const [priPriority, setPriPriority] = useState<Priority>('MEDIUM')
  const [priTemperature, setPriTemperature] = useState<Temperature>('WARM')
  const [nextActionOpen, setNextActionOpen] = useState(false)
  const [naText, setNaText] = useState('')
  const [naDate, setNaDate] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const users = useCrmStore((s) => s.users)
  const activeUsers = useMemo(() => users.filter((u) => u.isActive), [users])

  /* ---------- data ---------- */
  const load = useCallback(async () => {
    if (!opportunityId) return
    setLoading(true)
    setError(null)
    try {
      const d = await crmApi.opportunity(opportunityId)
      setDetail(d)
      try {
        const cs = await crmApi.contacts(`companyId=${d.companyId}`)
        setContact(cs.find((c) => c.id === d.contactId) ?? null)
      } catch { setContact(null) }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat detail opportunity')
    } finally {
      setLoading(false)
    }
  }, [opportunityId])

  useEffect(() => {
    if (open && opportunityId) {
      void load()
    }
    if (!open) {
      setDetail(null)
      setContact(null)
      setError(null)
      setTab('ringkasan')
      setComposerBody('')
      setComposerChannel('WHATSAPP')
      setTaskTitle(''); setTaskDue(''); setTaskType('FOLLOW_UP'); setTaskAssignee('')
      setNoteBody(''); setNoteVisibility('INTERNAL')
      setLostForm(EMPTY_LOST); setWonOffer('')
      setAiError(false)
    }
  }, [open, opportunityId, load])

  /* ---------- stage mutations ---------- */
  const doChangeStage = useCallback(async (stage: Stage, extra?: Record<string, unknown>, successTitle?: string) => {
    if (!detail) return
    setMovingStage(true)
    try {
      await crmApi.changeStage(detail.id, { stage, ...extra })
      toast({ title: successTitle ?? 'Stage diperbarui', description: `${detail.code} dipindah ke ${stageMeta(stage).label}` })
      setLostOpen(false); setWonOpen(false)
      await load()
      onChanged?.()
    } catch (e) {
      toast({ title: 'Gagal memindah stage', description: e instanceof Error ? e.message : 'Terjadi kesalahan', variant: 'destructive' })
    } finally {
      setMovingStage(false)
    }
  }, [detail, load, onChanged, toast])

  const handleStageIntent = (target: string) => {
    if (!detail || target === detail.stage) return
    if (target === 'LOST') { setLostForm(EMPTY_LOST); setLostOpen(true); return }
    if (target === 'WON') { setWonOffer(''); setWonOpen(true); return }
    void doChangeStage(target as Stage)
  }

  const submitLost = () => {
    if (!lostForm.reason) return
    void doChangeStage('LOST', {
      lostReason: lostForm.reason,
      ...(lostForm.notes.trim() ? { lostNotes: lostForm.notes.trim() } : {}),
      ...(lostForm.competitor.trim() ? { competitorName: lostForm.competitor.trim() } : {}),
      ...(lostForm.reactivation ? { reactivation: lostForm.reactivation } : {}),
      ...(lostForm.followUpDate ? { followUpDate: lostForm.followUpDate } : {}),
    }, 'Opportunity ditandai Lost')
  }

  const confirmWon = () => {
    const offer = Number(wonOffer)
    void doChangeStage('WON', offer > 0 ? { lastOfferValue: offer } : {}, '🎉 Deal Won! Project produksi dibuat otomatis')
  }

  /* ---------- priority / next action / delete ---------- */
  const openPriorityDialog = () => {
    if (!detail) return
    setPriPriority(detail.priority)
    setPriTemperature(detail.temperature)
    setPriorityOpen(true)
  }

  const savePriority = async () => {
    if (!detail) return
    if (priPriority === detail.priority && priTemperature === detail.temperature) { setPriorityOpen(false); return }
    try {
      await crmApi.updateOpportunity(detail.id, { priority: priPriority, temperature: priTemperature })
      toast({ title: 'Prioritas diperbarui', description: `${detail.code} → ${priorityMeta(priPriority).label} · ${temperatureMeta(priTemperature).label}` })
      setPriorityOpen(false)
      await load()
      onChanged?.()
    } catch (e) {
      toast({ title: 'Gagal memperbarui prioritas', description: e instanceof Error ? e.message : 'Terjadi kesalahan', variant: 'destructive' })
    }
  }

  const openNextActionDialog = () => {
    if (!detail) return
    setNaText(detail.nextAction ?? '')
    setNaDate(detail.nextActionDate ? detail.nextActionDate.slice(0, 10) : '')
    setNextActionOpen(true)
  }

  const saveNextAction = async () => {
    if (!detail) return
    const text = naText.trim()
    const same = text === (detail.nextAction ?? '') && naDate === (detail.nextActionDate ? detail.nextActionDate.slice(0, 10) : '')
    if (same) { setNextActionOpen(false); return }
    try {
      await crmApi.updateOpportunity(detail.id, { nextAction: text, nextActionDate: naDate })
      toast({ title: 'Next action diperbarui' })
      setNextActionOpen(false)
      await load()
      onChanged?.()
    } catch (e) {
      toast({ title: 'Gagal memperbarui next action', description: e instanceof Error ? e.message : 'Terjadi kesalahan', variant: 'destructive' })
    }
  }

  const confirmDelete = async () => {
    if (!detail) return
    setDeleting(true)
    try {
      await crmApi.deleteOpportunity(detail.id)
      toast({ title: 'Opportunity dihapus', description: `${detail.code} dihapus dari pipeline` })
      setDeleteOpen(false)
      onClose()
      onChanged?.()
    } catch (e) {
      toast({ title: 'Gagal menghapus', description: e instanceof Error ? e.message : 'Terjadi kesalahan', variant: 'destructive' })
    } finally {
      setDeleting(false)
    }
  }

  /* ---------- interactions ---------- */
  const scrollToComposer = () => {
    setTab('percakapan')
    setTimeout(() => composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
  }

  const sendInteraction = async () => {
    if (!detail || !composerBody.trim()) return
    setSending(true)
    try {
      await crmApi.addInteraction(detail.id, { channel: composerChannel, direction: 'OUT', body: composerBody.trim() })
      toast({ title: 'Terkirim — stage otomatis naik ke Connected bila sebelumnya New' })
      setComposerBody('')
      await load()
      onChanged?.()
    } catch (e) {
      toast({ title: 'Gagal mengirim', description: e instanceof Error ? e.message : 'Terjadi kesalahan', variant: 'destructive' })
    } finally {
      setSending(false)
    }
  }

  /* ---------- tasks ---------- */
  const toggleTask = async (taskId: string, done: boolean) => {
    setTogglingTask(taskId)
    try {
      await crmApi.updateTask(taskId, { status: done ? 'DONE' : 'OPEN' })
      await load()
      onChanged?.()
    } catch (e) {
      toast({ title: 'Gagal memperbarui task', description: e instanceof Error ? e.message : 'Terjadi kesalahan', variant: 'destructive' })
    } finally {
      setTogglingTask(null)
    }
  }

  const submitTask = async () => {
    if (!detail) return
    if (!taskTitle.trim() || !taskAssignee) {
      toast({ title: 'Lengkapi judul dan assignee task', variant: 'destructive' })
      return
    }
    setAddingTask(true)
    try {
      await crmApi.createTask({
        opportunityId: detail.id,
        title: taskTitle.trim(),
        assigneeId: taskAssignee,
        type: taskType,
        ...(taskDue ? { dueDate: taskDue } : {}),
      })
      toast({ title: 'Task ditambahkan' })
      setTaskTitle(''); setTaskDue(''); setTaskType('FOLLOW_UP')
      await load()
      onChanged?.()
    } catch (e) {
      toast({ title: 'Gagal menambah task', description: e instanceof Error ? e.message : 'Terjadi kesalahan', variant: 'destructive' })
    } finally {
      setAddingTask(false)
    }
  }

  /* ---------- notes ---------- */
  const submitNote = async () => {
    if (!detail || !noteBody.trim()) return
    setAddingNote(true)
    try {
      await crmApi.addNote(detail.id, { body: noteBody.trim(), visibility: noteVisibility })
      toast({ title: 'Catatan disimpan' })
      setNoteBody('')
      await load()
      onChanged?.()
    } catch (e) {
      toast({ title: 'Gagal menyimpan catatan', description: e instanceof Error ? e.message : 'Terjadi kesalahan', variant: 'destructive' })
    } finally {
      setAddingNote(false)
    }
  }

  /* ---------- AI summary ---------- */
  const generateAiSummary = useCallback(async () => {
    if (!detail || aiLoading) return
    setAiLoading(true)
    setAiError(false)
    try {
      const res = await crmApi.aiSummary(detail.id)
      setAiSummaries((prev) => ({ ...prev, [detail.id]: res }))
    } catch (e) {
      setAiError(true)
      toast({
        title: 'Gagal menghasilkan ringkasan AI — coba lagi',
        description: e instanceof Error ? e.message : 'Terjadi kesalahan',
        variant: 'destructive',
      })
    } finally {
      setAiLoading(false)
    }
  }, [detail, aiLoading, toast])

  const createTaskFromAction = useCallback(async (actionIdx: number, actionText: string) => {
    if (!detail) return
    const key = `${detail.id}::${actionIdx}`
    if (aiTaskCreated.has(key) || aiTaskCreating) return
    setAiTaskCreating(key)
    try {
      await crmApi.createTask({
        title: actionText.slice(0, 120),
        opportunityId: detail.id,
        assigneeId: detail.ownerId || user?.id || '',
        priority: 'HIGH',
        type: 'FOLLOW_UP',
      })
      setAiTaskCreated((prev) => new Set(prev).add(key))
      toast({ title: 'Task dibuat dari saran AI', description: actionText.slice(0, 80) })
    } catch (e) {
      toast({ title: 'Gagal membuat task', description: e instanceof Error ? e.message : 'Terjadi kesalahan', variant: 'destructive' })
    } finally {
      setAiTaskCreating(null)
    }
  }, [detail, aiTaskCreated, aiTaskCreating, user, toast])

  const copyAiDraft = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast({ title: 'Draft disalin' })
    } catch {
      toast({ title: 'Gagal menyalin draft', description: 'Clipboard tidak tersedia di browser ini', variant: 'destructive' })
    }
  }, [toast])

  /* ---------- derived ---------- */
  const overdueTasks = useMemo(() => {
    if (!detail) return []
    const now = Date.now()
    return detail.tasks.filter((t) => t.status !== 'DONE' && t.dueDate && new Date(t.dueDate).getTime() < now)
  }, [detail])

  const aiSummary = detail ? aiSummaries[detail.id] : undefined
  const aiDraft = aiSummary?.suggestedFollowUp ?? null

  /* ---------- render ---------- */
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent side="right" className={cn('flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-2xl [&>button]:hidden', SCROLLBAR)}>
        <SheetTitle className="sr-only">Detail Opportunity</SheetTitle>
        <SheetDescription className="sr-only">Ringkasan lengkap opportunity, percakapan, tugas, dan catatan</SheetDescription>

        {/* loading / error / empty states */}
        {loading && !detail && (
          <div className="space-y-4 p-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-7 w-3/4" />
            <div className="flex gap-2"><Skeleton className="h-6 w-20" /><Skeleton className="h-6 w-24" /><Skeleton className="h-6 w-16" /></div>
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        )}

        {!loading && error && (
          <div className="p-5">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Gagal memuat opportunity</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>Coba lagi</Button>
          </div>
        )}

        {detail && (
          <>
            {/* ---------- sticky header ---------- */}
            <div className="sticky top-0 z-20 border-b border-slate-100 bg-white/95 px-5 pb-4 pt-4 backdrop-blur">
              <div className="flex items-start justify-between gap-2 pr-8">
                <div className="min-w-0">
                  <p className="font-mono text-xs text-slate-400">{detail.code}</p>
                  <h2 className="mt-0.5 text-lg font-bold leading-snug text-slate-900">{detail.title}</h2>
                </div>
                <SheetClose asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-slate-400 hover:text-slate-700" title="Tutup">
                    <X className="h-4 w-4" />
                  </Button>
                </SheetClose>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <BrandChip name={detail.brandName} color={detail.brandColor} />
                <StageBadge stage={detail.stage} />
                <TempBadge temperature={detail.temperature} />
                <PriorityBadge priority={detail.priority} />
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{detail.probability}%</span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-slate-400" />{detail.companyName}</span>
                <span className="inline-flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-slate-400" />{detail.contactName}</span>
                {contact?.whatsapp && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-slate-400"><MessageCircle className="h-3 w-3" />{contact.whatsapp}</span>
                )}
                {contact?.email && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-slate-400"><Mail className="h-3 w-3" />{contact.email}</span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xl font-extrabold tracking-tight text-slate-900">{formatMoney(detail.estimatedValue, detail.currency)}</p>
                  <p className="inline-flex items-center gap-1 text-[11px] text-slate-400"><CalendarClock className="h-3 w-3" />Est. close: {formatDate(detail.expectedCloseDate)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={scrollToComposer}>✉️ Log Percakapan</Button>
                  <Select value={detail.stage} onValueChange={handleStageIntent} disabled={movingStage}>
                    <SelectTrigger size="sm" className="w-[168px]" title="Pindah stage">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STAGES.map((s) => (
                        <SelectItem key={s.key} value={s.key} disabled={s.key === detail.stage}>
                          <span className="inline-flex items-center gap-2"><span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} />{s.label}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500" title="Aksi lainnya">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={openPriorityDialog}><Settings2 className="mr-2 h-4 w-4" />Edit Prioritas</DropdownMenuItem>
                      <DropdownMenuItem onClick={openNextActionDialog}><CalendarClock className="mr-2 h-4 w-4" />Edit Next Action</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-rose-600 focus:text-rose-700" onClick={() => setDeleteOpen(true)}>
                        <Trash2 className="mr-2 h-4 w-4" />Hapus
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>

            {/* ---------- tabs ---------- */}
            <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="flex min-h-0 flex-1 flex-col">
              <div className="sticky top-0 z-10 bg-white px-5 pt-3">
                <TabsList className="w-full justify-start overflow-x-auto">
                  <TabsTrigger value="ringkasan">Ringkasan</TabsTrigger>
                  <TabsTrigger value="percakapan" className="gap-1.5">Percakapan <span className="rounded-full bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-500">{detail.interactions.length}</span></TabsTrigger>
                  <TabsTrigger value="tugas" className="gap-1.5">Tugas <span className="rounded-full bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-500">{detail.tasks.length}</span></TabsTrigger>
                  <TabsTrigger value="catatan" className="gap-1.5">Catatan <span className="rounded-full bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-500">{detail.notes.length}</span></TabsTrigger>
                  <TabsTrigger value="brief_estimasi" className="gap-1.5"><Calculator className="h-3.5 w-3.5" /> Brief &amp; Estimasi</TabsTrigger>
                </TabsList>
              </div>

              {/* ===== Ringkasan ===== */}
              <TabsContent value="ringkasan" className="space-y-5 px-5 pb-8 pt-4">
                {overdueTasks.length > 0 && (
                  <Alert className="border-amber-200 bg-amber-50 text-amber-800 [&>svg]:text-amber-600">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>{overdueTasks.length} task melewati tenggat</AlertTitle>
                    <AlertDescription className="flex flex-wrap items-center gap-2">
                      <span className="line-clamp-1">{overdueTasks.map((t) => t.title).join(' · ')}</span>
                      <button onClick={() => setTab('tugas')} className="whitespace-nowrap font-semibold text-amber-900 underline underline-offset-2">Lihat tugas</button>
                    </AlertDescription>
                  </Alert>
                )}

                {/* ===== Ringkasan AI (Phase 4) ===== */}
                {aiLoading ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
                      <p className="text-sm font-medium text-slate-700">AI sedang membaca percakapan…</p>
                    </div>
                    <div className="mt-3 space-y-2">
                      <Skeleton className="h-3.5 w-full" />
                      <Skeleton className="h-3.5 w-11/12" />
                      <Skeleton className="h-3.5 w-3/4" />
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Skeleton className="h-16 rounded-xl" />
                      <Skeleton className="h-16 rounded-xl" />
                    </div>
                  </div>
                ) : aiSummary ? (
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    {/* header */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-4">
                      <div className="flex items-start gap-2.5">
                        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
                        <div>
                          <p className="text-sm font-semibold text-slate-800">Ringkasan AI</p>
                          <p className="text-[11px] text-slate-500">Analisis otomatis percakapan &amp; konteks deal</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-400">{formatDate(aiSummary.generatedAt, true)}</span>
                        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" disabled={aiLoading} onClick={() => void generateAiSummary()}>
                          <Sparkles className="h-3 w-3" /> Buat Ulang
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-4 p-4">
                      {/* sentiment + ringkasan */}
                      <div>
                        <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold', (AI_SENTIMENT[aiSummary.sentiment] ?? AI_SENTIMENT.NEUTRAL).cls)}>
                          {(AI_SENTIMENT[aiSummary.sentiment] ?? AI_SENTIMENT.NEUTRAL).label}
                        </span>
                        <p className="mt-2 text-sm leading-relaxed text-slate-700">{aiSummary.summary}</p>
                      </div>

                      {/* minat + risiko */}
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Minat Client</p>
                          {aiSummary.interests.length === 0 ? (
                            <p className="mt-2 text-xs text-slate-400">Belum ada minat terdeteksi.</p>
                          ) : (
                            <ul className="mt-2 space-y-1.5">
                              {aiSummary.interests.map((it, i) => (
                                <li key={i} className="flex items-start gap-1.5 text-xs leading-relaxed text-slate-700">
                                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600" />
                                  <span>{it}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Risiko</p>
                          {aiSummary.risks.length === 0 ? (
                            <p className="mt-2 text-xs text-slate-400">Tidak ada risiko terdeteksi</p>
                          ) : (
                            <ul className="mt-2 space-y-1.5">
                              {aiSummary.risks.map((r, i) => (
                                <li key={i} className="flex items-start gap-1.5 text-xs leading-relaxed text-slate-700">
                                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                                  <span>{r}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>

                      {/* aksi disarankan */}
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Aksi Disarankan</p>
                        {aiSummary.suggestedActions.length === 0 ? (
                          <p className="mt-2 text-xs text-slate-400">Belum ada aksi yang disarankan.</p>
                        ) : (
                          <ol className="mt-2 space-y-2">
                            {aiSummary.suggestedActions.map((a, i) => {
                              const taskKey = `${detail.id}::${i}`
                              const created = aiTaskCreated.has(taskKey)
                              return (
                                <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
                                  <span className="min-w-0 flex-1 text-xs leading-relaxed text-slate-700">
                                    <span className="mr-1.5 font-bold text-slate-400">{i + 1}.</span>{a}
                                  </span>
                                  {created ? (
                                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                      <CheckCircle2 className="h-3 w-3" /> Task dibuat
                                    </span>
                                  ) : (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 shrink-0 gap-1 px-2 text-xs text-slate-600 hover:text-slate-900"
                                      disabled={aiTaskCreating === taskKey}
                                      onClick={() => void createTaskFromAction(i, a)}
                                    >
                                      {aiTaskCreating === taskKey ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                                      Jadikan Task
                                    </Button>
                                  )}
                                </li>
                              )
                            })}
                          </ol>
                        )}
                      </div>

                      {/* draft balasan */}
                      {aiDraft && (
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Draft Balasan</p>
                            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => void copyAiDraft(aiDraft)}>
                              <Copy className="h-3 w-3" /> Salin Draft
                            </Button>
                          </div>
                          <div className="mt-1.5 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">{aiDraft}</div>
                        </div>
                      )}

                      {/* meta */}
                      <p className="text-[11px] text-slate-400">{aiSummary.messageCount} pesan dianalisis · model {aiSummary.model}</p>
                    </div>
                  </div>
                ) : (
                  <div className={cn(
                    'flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed p-4',
                    aiError ? 'border-rose-300 bg-rose-50/60' : 'border-slate-300 bg-slate-50/50',
                  )}>
                    <div className="flex items-start gap-2.5">
                      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
                      <div>
                        <p className="text-sm font-semibold text-slate-800">Ringkasan AI</p>
                        <p className={cn('text-xs', aiError ? 'text-rose-600' : 'text-slate-500')}>
                          {aiError ? 'Gagal menghasilkan ringkasan — klik Coba Lagi untuk mencoba lagi.' : 'Analisis otomatis percakapan & konteks deal'}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="shrink-0 gap-1.5 bg-slate-900 text-white hover:bg-slate-800"
                      onClick={() => void generateAiSummary()}
                    >
                      <Sparkles className="h-3.5 w-3.5" />{aiError ? 'Coba Lagi' : 'Buat Ringkasan AI'}
                    </Button>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <DefItem label="Brief" value={detail.brief} />
                  <DefItem label="Kebutuhan" value={detail.needs} />
                  <DefItem label="Target Audiens" value={detail.targetAudience} />
                  <DefItem label="Deliverables" value={detail.deliverables} />
                  <DefItem label="Deadline" value={detail.deadline ? formatDate(detail.deadline) : null} />
                  <DefItem label="Sumber" value={`${leadSourceLabel(detail.leadSource) ?? '—'} · ${channelMeta(detail.channel).label}`} />
                  <DefItem label="Campaign" value={detail.campaign} />
                  <DefItem label="Kompetitor" value={detail.competitorName} />
                  <DefItem
                    label="Next Action"
                    value={detail.nextAction ? `${detail.nextAction}${detail.nextActionDate ? ` — ${formatDate(detail.nextActionDate)}` : ''}` : null}
                  />
                  {detail.stage === 'LOST' && (
                    <DefItem
                      label="Info Lost"
                      value={[
                        lostReasonLabel(detail.lostReason) ?? '—',
                        detail.lostNotes ? ` — ${detail.lostNotes}` : '',
                        detail.reactivation ? ` · Rencana: ${reactivationLabel(detail.reactivation)}` : '',
                        detail.followUpDate ? ` · Follow-up: ${formatDate(detail.followUpDate)}` : '',
                      ].join('')}
                    />
                  )}
                </div>

                {/* Related opportunities */}
                <div>
                  <Separator className="mb-4" />
                  <h3 className="text-sm font-semibold text-slate-800">Opportunity Lain di Perusahaan Ini</h3>
                  {detail.related.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-400">Belum ada opportunity lain untuk {detail.companyName}.</p>
                  ) : (
                    <div className={cn('mt-2 max-h-64 space-y-2 overflow-y-auto pr-1', SCROLLBAR)}>
                      {detail.related.map((r) => (
                        <button
                          key={r.id}
                          onClick={() => openOpportunity(r.id)}
                          className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-teal-300 hover:shadow-sm"
                        >
                          <StageBadge stage={r.stage} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-800">{r.title}</p>
                            <p className="text-[11px] text-slate-400">{r.code} · est. close {formatDate(r.expectedCloseDate)}</p>
                          </div>
                          <BrandChip name={r.brandName} color={r.brandColor} size="xs" />
                          <span className="whitespace-nowrap text-sm font-bold text-slate-700">{formatMoney(r.estimatedValue, r.currency, true)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Projects */}
                <div>
                  <Separator className="mb-4" />
                  <h3 className="text-sm font-semibold text-slate-800">Projects Terkait</h3>
                  {detail.projects.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-400">Belum ada project — project dibuat otomatis saat deal Won.</p>
                  ) : (
                    <div className="mt-2 space-y-3">
                      {detail.projects.map((p) => {
                        const st = projectStatusMeta(p.status)
                        return (
                          <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-mono text-[11px] text-slate-400">{p.code}</p>
                                <p className="truncate text-sm font-semibold text-slate-800">{p.name}</p>
                              </div>
                              <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold', st.bg, st.color)}>{st.label}</span>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                              <BrandChip name={p.brandName} color={p.brandColor} size="xs" />
                              {p.managerName && <span>PM: {p.managerName}</span>}
                              <span>Budget: {formatMoney(p.budget, 'IDR', true)}</span>
                            </div>
                            <div className="mt-3 flex items-center gap-3">
                              <Progress value={p.progress} className="h-2 flex-1" />
                              <span className="text-[11px] font-bold text-slate-600">{p.progress}%</span>
                            </div>
                            {p.milestones.length > 0 && (
                              <div className={cn('mt-3 max-h-44 space-y-1.5 overflow-y-auto pr-1', SCROLLBAR)}>
                                {p.milestones.map((m) => (
                                  <div key={m.id} className="flex items-center gap-2 text-xs">
                                    {m.status === 'DONE' ? (
                                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                    ) : m.status === 'IN_PROGRESS' ? (
                                      <Clock className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                                    ) : (
                                      <Circle className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                                    )}
                                    <span className={cn('min-w-0 flex-1 truncate', m.status === 'DONE' ? 'text-slate-400 line-through' : 'text-slate-600')}>{m.name}</span>
                                    <span className="whitespace-nowrap text-[10px] text-slate-400">{formatDate(m.dueDate)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* ===== Percakapan ===== */}
              <TabsContent value="percakapan" className="flex min-h-0 flex-1 flex-col px-5 pb-0 pt-4">
                {detail.interactions.length === 0 ? (
                  <div className="pb-4">
                    <EmptyState
                      icon={<MessageCircle className="h-5 w-5" />}
                      title="Belum ada percakapan"
                      description="Catat panggilan, kirim WhatsApp, atau email dari composer di bawah — timeline akan terisi otomatis."
                    />
                  </div>
                ) : (
                  <div className="pb-5">
                    {detail.interactions.map((it, idx) => {
                      const out = it.direction === 'OUT'
                      const meta = channelMeta(it.channel)
                      const isLast = idx === detail.interactions.length - 1
                      return (
                        <div key={it.id} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white shadow-sm', meta.bg)}>
                              <ChannelIcon channel={it.channel} className="h-3.5 w-3.5" />
                            </div>
                            {!isLast && <div className="my-1 w-px flex-1 bg-slate-200" />}
                          </div>
                          <div className={cn('min-w-0 flex-1', out ? 'flex justify-end' : 'flex justify-start')}>
                            <div className={cn(
                              'mb-4 max-w-[92%] rounded-xl border px-3.5 py-3 sm:max-w-[85%]',
                              out ? 'border-teal-100 bg-teal-50/70' : 'border-slate-200 bg-white',
                            )}>
                              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                {out ? `Anda${it.respondedBy ? ` · ${it.respondedBy}` : ''}` : `${it.contactName} · ${meta.label}`}
                              </p>
                              {it.subject && <p className="text-sm font-semibold text-slate-800">{it.subject}</p>}
                              <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{it.body}</p>
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                                <span>{formatDate(it.sentAt, true)}</span>
                                <span className={cn(
                                  'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                                  it.status === 'READ' ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-500',
                                )}>{it.status}</span>
                                {it.attachmentName && (
                                  <span className="inline-flex items-center gap-1"><Paperclip className="h-3 w-3" />{it.attachmentName}</span>
                                )}
                                {it.originalLink && (
                                  <a href={it.originalLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-teal-700 hover:underline">
                                    <Link2 className="h-3 w-3" />tautan
                                  </a>
                                )}
                                {it.externalMessageId && <span className="font-mono text-[9px] text-slate-300">{it.externalMessageId}</span>}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Composer */}
                <div ref={composerRef} className="sticky bottom-0 z-10 -mx-5 mt-auto border-t border-slate-200 bg-white p-3">
                  <div className="flex items-start gap-2">
                    <Select value={composerChannel} onValueChange={setComposerChannel}>
                      <SelectTrigger size="sm" className="w-[128px] shrink-0"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                        <SelectItem value="EMAIL">Email</SelectItem>
                      </SelectContent>
                    </Select>
                    <Textarea
                      value={composerBody}
                      onChange={(e) => setComposerBody(e.target.value)}
                      placeholder="Tulis balasan / catat panggilan…"
                      className="min-h-[64px] flex-1 resize-none text-sm"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void sendInteraction() }
                      }}
                    />
                    <Button size="sm" className="mt-0.5 shrink-0 gap-1.5 bg-teal-600 hover:bg-teal-700" disabled={sending || !composerBody.trim()} onClick={() => void sendInteraction()}>
                      <Send className="h-3.5 w-3.5" />{sending ? 'Mengirim…' : 'Kirim'}
                    </Button>
                  </div>
                  <p className="mt-1.5 text-[10px] text-slate-400">Balasan dicatat sebagai pesan keluar (OUT). Tekan ⌘/Ctrl + Enter untuk mengirim.</p>
                </div>
              </TabsContent>

              {/* ===== Tugas ===== */}
              <TabsContent value="tugas" className="space-y-3 px-5 pb-8 pt-4">
                {detail.tasks.length === 0 ? (
                  <p className="text-xs text-slate-400">Belum ada task untuk opportunity ini.</p>
                ) : (
                  <div className="space-y-2">
                    {detail.tasks.map((t) => {
                      const done = t.status === 'DONE'
                      const overdue = !done && t.dueDate && new Date(t.dueDate).getTime() < Date.now()
                      return (
                        <div key={t.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                          <Checkbox
                            checked={done}
                            disabled={togglingTask === t.id}
                            onCheckedChange={(v) => void toggleTask(t.id, v === true)}
                            aria-label={done ? 'Tandai belum selesai' : 'Tandai selesai'}
                          />
                          <div className="min-w-0 flex-1">
                            <p className={cn('truncate text-sm font-medium', done ? 'text-slate-400 line-through' : 'text-slate-800')}>{t.title}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                              <PriorityBadge priority={t.priority} />
                              {t.dueDate && (
                                <span className={cn('inline-flex items-center gap-1', overdue && 'font-semibold text-rose-600')}>
                                  <Clock className="h-3 w-3" />{formatDate(t.dueDate)}{overdue ? ' · terlambat' : ''}
                                </span>
                              )}
                              <span className="rounded bg-slate-100 px-1.5 py-0.5">{TASK_TYPES.find((x) => x.key === t.type)?.label ?? t.type}</span>
                              <span className="text-slate-400">{timeAgo(t.createdAt)}</span>
                            </div>
                          </div>
                          <UserAvatar name={t.assigneeName ?? '?'} color={t.assigneeColor} size={24} />
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Add task */}
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-3">
                  <p className="mb-2 text-xs font-semibold text-slate-600">Tambah Task</p>
                  <Input
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder="Judul task…"
                    className="mb-2 h-8 bg-white text-sm"
                  />
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <Select value={taskAssignee || undefined} onValueChange={setTaskAssignee}>
                      <SelectTrigger size="sm" className="w-full bg-white"><SelectValue placeholder="Assignee" /></SelectTrigger>
                      <SelectContent>
                        {activeUsers.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} className="h-8 bg-white text-sm" />
                    <Select value={taskType} onValueChange={setTaskType}>
                      <SelectTrigger size="sm" className="w-full bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TASK_TYPES.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    size="sm"
                    className="mt-2 bg-slate-900 hover:bg-slate-800"
                    disabled={addingTask}
                    onClick={() => void submitTask()}
                  >
                    {addingTask ? 'Menambah…' : 'Tambah'}
                  </Button>
                </div>
              </TabsContent>

              {/* ===== Catatan ===== */}
              <TabsContent value="catatan" className="space-y-3 px-5 pb-8 pt-4">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <Textarea
                    value={noteBody}
                    onChange={(e) => setNoteBody(e.target.value)}
                    placeholder="Tulis catatan internal…"
                    className="min-h-[72px] resize-none border-0 p-0 text-sm shadow-none focus-visible:ring-0"
                  />
                  <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
                    <Select value={noteVisibility} onValueChange={setNoteVisibility}>
                      <SelectTrigger size="sm" className="w-[170px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="INTERNAL">Internal</SelectItem>
                        <SelectItem value="DIRECTOR">Khusus Direktur</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="sm" className="bg-slate-900 hover:bg-slate-800" disabled={addingNote || !noteBody.trim()} onClick={() => void submitNote()}>
                      {addingNote ? 'Menyimpan…' : 'Simpan Catatan'}
                    </Button>
                  </div>
                  <p className="mt-1.5 text-[10px] text-slate-400">Catatan internal tidak terlihat oleh client.</p>
                </div>

                {detail.notes.length === 0 ? (
                  <p className="text-xs text-slate-400">Belum ada catatan.</p>
                ) : (
                  <div className="space-y-2">
                    {detail.notes.map((n) => (
                      <div key={n.id} className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex items-center gap-2">
                          <UserAvatar name={n.authorName} color={n.authorColor} size={22} />
                          <span className="text-xs font-semibold text-slate-700">{n.authorName}</span>
                          <span className="text-[10px] text-slate-400">{formatDate(n.createdAt, true)}</span>
                          <Badge
                            variant="outline"
                            className={cn(
                              'ml-auto border-0 text-[10px]',
                              n.visibility === 'DIRECTOR' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500',
                            )}
                          >
                            {n.visibility === 'DIRECTOR' ? 'Khusus Direktur' : 'Internal'}
                          </Badge>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700">{n.body}</p>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* ===== Brief & Estimasi ===== */}
              <TabsContent value="brief_estimasi" className="flex min-h-0 flex-1 flex-col px-5 pb-8 pt-4">
                <BriefEstimationTab opportunity={detail} onChanged={load} />
              </TabsContent>
            </Tabs>
          </>
        )}

        {/* ---------- Dialog: Lost ---------- */}
        <Dialog open={lostOpen} onOpenChange={setLostOpen}>
          <DialogContent className={cn('max-h-[85vh] overflow-y-auto sm:max-w-md', SCROLLBAR)}>
            <DialogHeader>
              <DialogTitle>Tandai Lost — {detail?.code}</DialogTitle>
              <DialogDescription>Pilih alasan utama kenapa deal ini lost. Data ini dipakai untuk analitik funnel dan reaktivasi.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Select value={lostForm.reason || undefined} onValueChange={(v) => setLostForm((f) => ({ ...f, reason: v }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Alasan lost *" /></SelectTrigger>
                <SelectContent>
                  {LOST_REASONS.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Textarea
                value={lostForm.notes}
                onChange={(e) => setLostForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Catatan tambahan (opsional)…"
                className="min-h-[64px] resize-none text-sm"
              />
              <Input
                value={lostForm.competitor}
                onChange={(e) => setLostForm((f) => ({ ...f, competitor: e.target.value }))}
                placeholder="Kompetitor (opsional)"
                className="text-sm"
              />
              <Select value={lostForm.reactivation || 'none'} onValueChange={(v) => setLostForm((f) => ({ ...f, reactivation: v === 'none' ? '' : v }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Rencana reaktivasi" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Tidak ada rencana —</SelectItem>
                  {REACTIVATION_OPTIONS.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <div>
                <p className="mb-1 text-xs text-slate-500">Tanggal follow-up (opsional)</p>
                <Input type="date" value={lostForm.followUpDate} onChange={(e) => setLostForm((f) => ({ ...f, followUpDate: e.target.value }))} className="text-sm" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLostOpen(false)}>Batal</Button>
              <Button variant="destructive" disabled={!lostForm.reason || movingStage} onClick={submitLost}>
                {movingStage ? 'Memproses…' : 'Tandai Lost'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ---------- Dialog: Won ---------- */}
        <Dialog open={wonOpen} onOpenChange={setWonOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Tandai WON?</DialogTitle>
              <DialogDescription>Project akan dibuat otomatis dengan milestone sesuai workflow brand ({detail?.brandName}).</DialogDescription>
            </DialogHeader>
            <div>
              <p className="mb-1 text-xs text-slate-500">Nilai final / last offer (opsional — finalize nilai deal)</p>
              <Input
                type="number"
                min={0}
                value={wonOffer}
                onChange={(e) => setWonOffer(e.target.value)}
                placeholder={detail ? String(detail.estimatedValue) : '0'}
                className="text-sm"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setWonOpen(false)}>Batal</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={movingStage} onClick={confirmWon}>
                {movingStage ? 'Memproses…' : 'Ya, Tandai WON'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ---------- Dialog: Prioritas ---------- */}
        <Dialog open={priorityOpen} onOpenChange={setPriorityOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Edit Prioritas</DialogTitle>
              <DialogDescription>Prioritas & temperatur membantu tim memfokuskan follow-up.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <p className="mb-1 text-xs text-slate-500">Prioritas</p>
                <Select value={priPriority} onValueChange={(v) => setPriPriority(v as Priority)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="mb-1 text-xs text-slate-500">Temperatur</p>
                <Select value={priTemperature} onValueChange={(v) => setPriTemperature(v as Temperature)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TEMPERATURES.map((t) => <SelectItem key={t.key} value={t.key}>{t.emoji} {t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPriorityOpen(false)}>Batal</Button>
              <Button className="bg-slate-900 hover:bg-slate-800" onClick={() => void savePriority()}>Simpan</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ---------- Dialog: Next Action ---------- */}
        <Dialog open={nextActionOpen} onOpenChange={setNextActionOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Edit Next Action</DialogTitle>
              <DialogDescription>Aktivitas lanjutan yang harus dilakukan untuk opportunity ini.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Input value={naText} onChange={(e) => setNaText(e.target.value)} placeholder="Misal: Kirim revisi penawaran" className="text-sm" />
              <div>
                <p className="mb-1 text-xs text-slate-500">Tenggat next action</p>
                <Input type="date" value={naDate} onChange={(e) => setNaDate(e.target.value)} className="text-sm" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNextActionOpen(false)}>Batal</Button>
              <Button className="bg-slate-900 hover:bg-slate-800" onClick={() => void saveNextAction()}>Simpan</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ---------- Dialog: Hapus ---------- */}
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Hapus opportunity ini?</DialogTitle>
              <DialogDescription>
                {detail ? `${detail.code} — ${detail.title} akan dihapus dari pipeline. Tindakan ini tercatat di audit log.` : ''}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteOpen(false)}>Batal</Button>
              <Button variant="destructive" disabled={deleting} onClick={() => void confirmDelete()}>
                <Trash2 className="mr-1.5 h-4 w-4" />{deleting ? 'Menghapus…' : 'Ya, Hapus'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* hint khusus role marketing — kecil, informatif */}
        {detail && user?.role === 'MARKETING' && detail.stage === 'NURTURE' && (
          <div className="mx-5 mb-6 flex items-start gap-2 rounded-xl bg-cyan-50 p-3 text-[11px] text-cyan-800">
            <CornerDownRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Opportunity ada di Nurture — jalankan rencana reaktivasi: {reactivationLabel(detail.reactivation) ?? 'belum ditentukan'}.</span>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
