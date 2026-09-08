/* ============ Projects View — alur produksi pasca-deal Won (termanage) ============
 * Alur: Won → tombol "Buat Project dari Brief" (di opportunity) → project tampil di sini.
 * Detail: milestone status flow (Mulai/Selesai), deskripsi + estimasi hari, lampiran file,
 * tambah/edit/hapus milestone (manajer), PM & budget (manajer), progress otomatis.
 * ================================================================================== */
'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { crmApi } from './api-client'
import { useCrmStore } from './crm-store'
import { useToast } from '@/hooks/use-toast'
import { BrandChip, EmptyState, LoadingRows, RefreshButton, SectionHeader } from './shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatDate, formatMoney, projectStatusMeta, PROJECT_STATUSES, daysUntil } from '@/lib/crm-constants'
import type { MilestoneAttachmentDTO, MilestoneDTO, ProjectDTO } from '@/lib/crm-types'
import { cn } from '@/lib/utils'
import {
  CalendarDays, CheckCircle2, ChevronDown, ChevronRight, Circle, CircleDot, Download,
  FolderKanban, Loader2, Paperclip, Pencil, Plus, Trash2, Upload, Wallet,
} from 'lucide-react'

const MAX_FILE_BYTES = 2 * 1024 * 1024

async function fileToAttachment(file: File): Promise<{ name: string; mimeType: string; size: number; dataUrl: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Gagal membaca file'))
    reader.readAsDataURL(file)
  })
  return { name: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, dataUrl }
}

function fmtSize(n: number): string {
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`
  if (n >= 1024) return `${Math.round(n / 1024)} KB`
  return `${n} B`
}

/* Status ikon & warna milestone */
function MilestoneIcon({ status }: { status: string }) {
  if (status === 'DONE') return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
  if (status === 'IN_PROGRESS') return <CircleDot className="h-4 w-4 shrink-0 text-amber-500" />
  return <Circle className="h-4 w-4 shrink-0 text-slate-300" />
}

export default function ProjectsView() {
  const { toast } = useToast()
  const user = useCrmStore((s) => s.user)
  const [projects, setProjects] = useState<ProjectDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<ProjectDTO | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const canWork = user?.role === 'PRODUKSI' || user?.role === 'SUPER_ADMIN' || user?.role === 'DIREKTUR' || user?.role === 'MANAJER'
  const canManageStructure = user?.role === 'SUPER_ADMIN' || user?.role === 'DIREKTUR' || user?.role === 'MANAJER'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setProjects(await crmApi.projects())
    } catch (e) {
      toast({ title: 'Gagal memuat project', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally { setLoading(false) }
  }, [toast])

  useEffect(() => { load() }, [load])

  /* Muat detail penuh (lampiran) saat dialog dibuka */
  const openDetail = useCallback(async (id: string) => {
    setDetailLoading(true)
    setDetail((prev) => prev && prev.id === id ? prev : projects.find((p) => p.id === id) ?? null)
    try {
      setDetail(await crmApi.projectDetail(id))
    } catch (e) {
      toast({ title: 'Gagal memuat detail', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally { setDetailLoading(false) }
  }, [projects, toast])

  const stats = useMemo(() => ({
    total: projects.length,
    active: projects.filter(p => p.status === 'IN_PROGRESS').length,
    completed: projects.filter(p => p.status === 'COMPLETED').length,
    budget: projects.reduce((a, p) => a + p.budget, 0),
    atRisk: projects.filter(p => p.status !== 'COMPLETED' && p.endDate && (daysUntil(p.endDate) ?? 99) < 0).length,
  }), [projects])

  const refreshDetail = useCallback(async (id: string) => {
    try {
      const fresh = await crmApi.projectDetail(id)
      setDetail(fresh)
      setProjects((rows) => rows.map((r) => r.id === id ? { ...fresh, milestones: fresh.milestones.map(({ attachments: _a, ...m }) => m) } : r))
    } catch { /* toast ditangani pemanggil */ }
  }, [])

  /* ---------- aksi milestone ---------- */
  const setMilestoneStatus = async (m: MilestoneDTO, status: 'PENDING' | 'IN_PROGRESS' | 'DONE') => {
    if (!detail) return
    try {
      const res = await crmApi.updateMilestone(detail.id, m.id, { status })
      toast({
        title: status === 'DONE' ? 'Milestone selesai ✓' : status === 'IN_PROGRESS' ? 'Milestone dimulai' : 'Milestone dibuka ulang',
        description: typeof res.projectProgress === 'number' ? `Progress project: ${res.projectProgress}%` : undefined,
      })
      await refreshDetail(detail.id)
    } catch (e) {
      toast({ title: 'Gagal update milestone', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    }
  }

  const updateStatus = async (projectId: string, status: string) => {
    try {
      await crmApi.updateProject(projectId, { status })
      toast({ title: 'Status project diperbarui' })
      await load()
      await refreshDetail(projectId)
    } catch (e) {
      toast({ title: 'Gagal update status', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { label: 'Total Project', value: String(stats.total), icon: FolderKanban, cls: 'text-slate-700', accent: 'bg-slate-300' },
          { label: 'In Progress', value: String(stats.active), icon: CircleDot, cls: 'text-teal-700', accent: 'bg-teal-500' },
          { label: 'Completed', value: String(stats.completed), icon: CheckCircle2, cls: 'text-emerald-700', accent: 'bg-emerald-500' },
          { label: 'At Risk', value: String(stats.atRisk), icon: CalendarDays, cls: stats.atRisk > 0 ? 'text-rose-700' : 'text-slate-700', accent: stats.atRisk > 0 ? 'bg-rose-500' : 'bg-slate-300' },
          { label: 'Total Budget', value: formatMoney(stats.budget, 'IDR', true), icon: Wallet, cls: 'text-slate-700', accent: 'bg-slate-300' },
        ].map(kpi => (
          <Card key={kpi.label} className="card-hover relative overflow-hidden rounded-xl">
            <span aria-hidden className={cn('absolute left-1/2 top-0 h-[2px] w-12 -translate-x-1/2 rounded-full', kpi.accent)} />
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                <kpi.icon className={cn('h-4.5 w-4.5', kpi.cls)} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-[11px] text-slate-500">{kpi.label}</p>
                <p className={cn('truncate text-lg font-bold tabular-nums', kpi.cls)}>{kpi.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <SectionHeader
        title="Project Produksi"
        description="Dibuat dari tombol “Buat Project dari Brief” pada opportunity Won — milestone, estimasi waktu & lampiran termanage di sini"
        action={<RefreshButton onClick={load} loading={loading} />}
      />

      {loading ? <LoadingRows rows={4} /> : projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="h-5 w-5" />}
          title="Belum ada project"
          description="Buka opportunity berstatus Won di Sales Pipeline, lalu klik “Buat Project dari Brief”."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {projects.map(p => {
            const st = projectStatusMeta(p.status)
            const late = p.status !== 'COMPLETED' && p.endDate && (daysUntil(p.endDate) ?? 99) < 0
            const doneCount = p.milestones.filter(m => m.status === 'DONE').length
            return (
              <Card key={p.id} className="card-hover cursor-pointer rounded-xl hover:border-slate-300" onClick={() => void openDetail(p.id)}>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-[15px] leading-snug">{p.name}</CardTitle>
                      <p className="mt-0.5 text-[11px] text-slate-400">{p.code} · {p.companyName} · PM: {p.managerName ?? '—'}</p>
                    </div>
                    <Badge className={cn('border-0', st.bg, st.color)} variant="secondary">{st.label}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <BrandChip name={p.brandName} color={p.brandColor} size="xs" />
                    <span>{formatDate(p.startDate)} → {formatDate(p.endDate)}</span>
                    {late && <span className="font-semibold text-rose-600">· Melewati tenggat</span>}
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-[11px]">
                      <span className="font-medium text-slate-600">Progress</span>
                      <span className="font-bold text-slate-800 tabular-nums">{p.progress}%</span>
                    </div>
                    <Progress value={p.progress} className="h-2" />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">
                      {doneCount}/{p.milestones.length} milestone
                      {p.milestones.some(m => (m.attachmentCount ?? 0) > 0) && (
                        <span className="ml-2 inline-flex items-center gap-0.5 text-slate-400"><Paperclip className="h-3 w-3" /> ada lampiran</span>
                      )}
                    </span>
                    <span className="font-semibold text-slate-700 tabular-nums">{formatMoney(p.budget, 'IDR', true)}</span>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ================= Detail dialog ================= */}
      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto max-w-[calc(100%-2rem)] sm:max-w-3xl">
          {detail && (
            <ProjectDetailBody
              detail={detail}
              detailLoading={detailLoading}
              canWork={canWork}
              canManageStructure={canManageStructure}
              onRefresh={() => refreshDetail(detail.id)}
              onStatusChange={updateStatus}
              onMilestoneStatus={setMilestoneStatus}
              onClose={() => setDetail(null)}
              onReloadAll={load}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ================= Detail body (dipisah agar state lokal bersih) ================= */
function ProjectDetailBody({
  detail, detailLoading, canWork, canManageStructure,
  onRefresh, onStatusChange, onMilestoneStatus, onClose, onReloadAll,
}: {
  detail: ProjectDTO
  detailLoading: boolean
  canWork: boolean
  canManageStructure: boolean
  onRefresh: () => Promise<void> | void
  onStatusChange: (projectId: string, status: string) => Promise<void>
  onMilestoneStatus: (m: MilestoneDTO, status: 'PENDING' | 'IN_PROGRESS' | 'DONE') => Promise<void>
  onClose: () => void
  onReloadAll: () => Promise<void> | void
}) {
  const { toast } = useToast()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [editing, setEditing] = useState<MilestoneDTO | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const toggle = (id: string) => setExpanded((s) => ({ ...s, [id]: !s[id] }))

  const deleteMilestone = async (m: MilestoneDTO) => {
    if (!window.confirm(`Hapus milestone "${m.name}"? Lampiran ikut terhapus.`)) return
    setBusy(true)
    try {
      await crmApi.deleteMilestone(detail.id, m.id)
      toast({ title: 'Milestone dihapus' })
      await onRefresh()
      await onReloadAll()
    } catch (e) {
      toast({ title: 'Gagal hapus milestone', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally { setBusy(false) }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-left">{detail.name}</DialogTitle>
        <DialogDescription className="text-left">
          {detail.code} · {detail.companyName} · Brand {detail.brandName} · PM: {detail.managerName ?? '—'}
        </DialogDescription>
      </DialogHeader>
      {detailLoading && <div className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Memuat lampiran…</div>}

      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg bg-slate-50 p-2.5">
            <p className="text-[10px] text-slate-500">Budget</p>
            <p className="text-sm font-bold text-slate-800 tabular-nums">{formatMoney(detail.budget, 'IDR', true)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-2.5">
            <p className="text-[10px] text-slate-500">Progress</p>
            <p className="text-sm font-bold text-teal-700 tabular-nums">{detail.progress}%</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-2.5">
            <p className="text-[10px] text-slate-500">Tenggat</p>
            <p className="text-sm font-bold text-slate-800">{formatDate(detail.endDate)}</p>
          </div>
        </div>

        {canWork && (
          <div className="space-y-1.5">
            <Label>Status project</Label>
            <Select value={detail.status} onValueChange={(v) => void onStatusChange(detail.id, v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROJECT_STATUSES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-800">Milestone ({detail.milestones.length})</p>
            {canManageStructure && (
              <Button size="sm" variant="outline" className="h-8 gap-1 text-[11px]" onClick={() => setAddOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Tambah
              </Button>
            )}
          </div>
          <div className="max-h-[46dvh] space-y-1.5 overflow-y-auto pr-1 scrollbar-slim">
            {detail.milestones.map(m => (
              <div key={m.id} className="rounded-lg border border-slate-100">
                <div className="flex items-center gap-2.5 p-2.5">
                  <button
                    aria-label={expanded[m.id] ? 'Tutup detail' : 'Buka detail'}
                    className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    onClick={() => toggle(m.id)}
                  >
                    {expanded[m.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <MilestoneIcon status={m.status} />
                  <div className="min-w-0 flex-1">
                    <p className={cn('truncate text-[13px] font-medium', m.status === 'DONE' ? 'text-slate-400 line-through' : 'text-slate-800')}>
                      {m.stepOrder}. {m.name}
                    </p>
                    <p className="truncate text-[10px] text-slate-400">
                      Target: {formatDate(m.dueDate)}
                      {m.estimatedDays ? ` · est. ${m.estimatedDays} hari` : ''}
                      {(m.attachmentCount ?? 0) > 0 && ` · ${m.attachmentCount} lampiran`}
                    </p>
                  </div>
                  {(m.price ?? 0) > 0 && (
                    <span className="hidden shrink-0 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-emerald-700 sm:block" title="Nilai tahap dari workflow layanan">
                      {formatMoney(m.price, 'IDR', true)}
                    </span>
                  )}
                  {canWork && m.status !== 'DONE' && (
                    <div className="flex shrink-0 gap-1">
                      {m.status === 'PENDING' && (
                        <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => void onMilestoneStatus(m, 'IN_PROGRESS')}>
                          Mulai
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-[11px] hover:bg-emerald-50 hover:text-emerald-700" onClick={() => void onMilestoneStatus(m, 'DONE')}>
                        <CheckCircle2 className="h-3 w-3" /> Selesai
                      </Button>
                    </div>
                  )}
                  {canWork && m.status === 'DONE' && (
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-slate-400" onClick={() => void onMilestoneStatus(m, 'PENDING')}>
                      Buka ulang
                    </Button>
                  )}
                  {canManageStructure && (
                    <>
                      <button aria-label="Edit milestone" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => setEditing(m)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button aria-label="Hapus milestone" className="rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-600" disabled={busy || detail.milestones.length <= 1} onClick={() => void deleteMilestone(m)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
                {/* Expanded: deskripsi + lampiran */}
                {expanded[m.id] && (
                  <MilestoneExpanded projectId={detail.id} milestone={m} canWork={canWork} onChanged={onRefresh} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Tutup</Button>
      </DialogFooter>

      {/* Dialog edit milestone */}
      <MilestoneEditDialog
        projectId={detail.id}
        milestone={editing}
        onClose={() => setEditing(null)}
        onSaved={async () => { setEditing(null); await onRefresh(); await onReloadAll() }}
      />
      {/* Dialog tambah milestone */}
      <MilestoneEditDialog
        projectId={detail.id}
        milestone={null}
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={async () => { setAddOpen(false); await onRefresh(); await onReloadAll() }}
      />
    </>
  )
}

/* ---------- Expanded: deskripsi + lampiran (upload/download/hapus) ---------- */
function MilestoneExpanded({ projectId, milestone, canWork, onChanged }: {
  projectId: string
  milestone: MilestoneDTO
  canWork: boolean
  onChanged: () => Promise<void> | void
}) {
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const attachments = milestone.attachments ?? []

  const upload = async (file: File) => {
    if (file.size > MAX_FILE_BYTES) {
      toast({ title: 'File terlalu besar', description: 'Maksimal 2MB per lampiran.', variant: 'destructive' })
      return
    }
    setUploading(true)
    try {
      await crmApi.addMilestoneAttachment(projectId, milestone.id, await fileToAttachment(file))
      toast({ title: 'Lampiran terunggang ✓', description: file.name })
      await onChanged()
    } catch (e) {
      toast({ title: 'Gagal unggah lampiran', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally { setUploading(false) }
  }

  const remove = async (att: MilestoneAttachmentDTO) => {
    try {
      await crmApi.deleteMilestoneAttachment(projectId, milestone.id, att.id)
      toast({ title: 'Lampiran dihapus' })
      await onChanged()
    } catch (e) {
      toast({ title: 'Gagal hapus lampiran', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-2.5 border-t border-slate-100 bg-slate-50/60 p-3">
      {milestone.description && (
        <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-slate-600">{milestone.description}</p>
      )}
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
        {milestone.startDate && <span>Mulai: {formatDate(milestone.startDate)}</span>}
        {milestone.completedAt && <span className="text-emerald-600">Selesai: {formatDate(milestone.completedAt)}</span>}
      </div>
      {attachments.length > 0 && (
        <div className="space-y-1">
          {attachments.map(a => (
            <div key={a.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1 truncate text-[12px] text-slate-700">{a.name}</span>
              <span className="shrink-0 text-[10px] text-slate-400">{fmtSize(a.size)}</span>
              <a
                aria-label={`Unduh ${a.name}`}
                href={a.dataUrl ? `data:${a.mimeType};base64,${a.dataUrl.split(',')[1] ?? ''}` : undefined}
                download={a.name}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-teal-700"
                onClick={(e) => { if (!a.dataUrl) e.preventDefault() }}
              >
                <Download className="h-3.5 w-3.5" />
              </a>
              {canWork && (
                <button aria-label={`Hapus ${a.name}`} className="rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-600" onClick={() => void remove(a)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {canWork && (
        <>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.7z,.csv,.txt,.rtf"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void upload(f)
              e.target.value = ''
            }}
          />
          <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
            Unggah lampiran (maks 2MB)
          </Button>
        </>
      )}
    </div>
  )
}

/* ---------- Dialog tambah/edit milestone ---------- */
function MilestoneEditDialog({ projectId, milestone, open: openProp, onClose, onSaved }: {
  projectId: string
  milestone: MilestoneDTO | null
  open?: boolean
  onClose: () => void
  onSaved: () => Promise<void> | void
}) {
  const { toast } = useToast()
  const isNew = !milestone
  const open = openProp ?? !!milestone
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [estimatedDays, setEstimatedDays] = useState('')
  const [price, setPrice] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(milestone?.name ?? '')
    setDescription(milestone?.description ?? '')
    setEstimatedDays(milestone?.estimatedDays ? String(milestone.estimatedDays) : '')
    setPrice(milestone?.price ? String(Math.round(milestone.price)) : '')
    setDueDate(milestone?.dueDate ? milestone.dueDate.slice(0, 10) : '')
  }, [open, milestone])

  const save = async () => {
    if (!name.trim()) { toast({ title: 'Nama milestone wajib diisi', variant: 'destructive' }); return }
    setSaving(true)
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || undefined,
        estimatedDays: estimatedDays ? Number(estimatedDays) : undefined,
        price: price ? Number(price) : 0,
        dueDate: dueDate || undefined,
      }
      if (isNew) {
        await crmApi.createMilestone(projectId, body)
        toast({ title: 'Milestone ditambahkan ✓' })
      } else {
        await crmApi.updateMilestone(projectId, milestone!.id, {
          name: body.name,
          description: description.trim() || null,
          estimatedDays: estimatedDays ? Number(estimatedDays) : null,
          price: price ? Number(price) : null,
          dueDate: dueDate || null,
        })
        toast({ title: 'Milestone diperbarui ✓' })
      }
      await onSaved()
    } catch (e) {
      toast({ title: 'Gagal menyimpan milestone', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-left">{isNew ? 'Tambah Milestone' : 'Edit Milestone'}</DialogTitle>
          <DialogDescription className="text-left">
            {isNew ? 'Milestone ditambahkan di urutan terakhir.' : 'Perubahan tercatat di audit log.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nama milestone</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="mis. Shooting hari 1" />
          </div>
          <div className="space-y-1.5">
            <Label>Deskripsi pekerjaan</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Detail deliverable, lokasi, kebutuhan alat, dsb."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Estimasi (hari)</Label>
              <Input inputMode="numeric" value={estimatedDays} onChange={(e) => setEstimatedDays(e.target.value.replace(/[^\d]/g, ''))} placeholder="mis. 3" />
            </div>
            <div className="space-y-1.5">
              <Label>Target selesai</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Nilai tahap (IDR)</Label>
              <Input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ''))} placeholder="0" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Batal</Button>
          <Button onClick={save} disabled={saving} className="bg-teal-700 hover:bg-teal-800">
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
