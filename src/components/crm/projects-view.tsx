/* ============ Projects View — produksi pasca-deal Won ============ */
'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { crmApi } from './api-client'
import { useCrmStore } from './crm-store'
import { useToast } from '@/hooks/use-toast'
import { BrandChip, EmptyState, LoadingRows, RefreshButton, SectionHeader } from './shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { formatDate, formatMoney, projectStatusMeta, PROJECT_STATUSES, daysUntil } from '@/lib/crm-constants'
import type { ProjectDTO } from '@/lib/crm-types'
import { cn } from '@/lib/utils'
import { CalendarDays, CheckCircle2, Circle, CircleDot, FolderKanban, Loader2, Wallet } from 'lucide-react'

export default function ProjectsView() {
  const { toast } = useToast()
  const user = useCrmStore((s) => s.user)
  const [projects, setProjects] = useState<ProjectDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<ProjectDTO | null>(null)

  const canManage = user?.role === 'PRODUKSI' || user?.role === 'SUPER_ADMIN' || user?.role === 'DIREKTUR'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setProjects(await crmApi.projects())
    } catch (e) {
      toast({ title: 'Gagal memuat project', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally { setLoading(false) }
  }, [toast])

  useEffect(() => { load() }, [load])

  const stats = useMemo(() => ({
    total: projects.length,
    active: projects.filter(p => p.status === 'IN_PROGRESS').length,
    completed: projects.filter(p => p.status === 'COMPLETED').length,
    budget: projects.reduce((a, p) => a + p.budget, 0),
    atRisk: projects.filter(p => p.status !== 'COMPLETED' && p.endDate && (daysUntil(p.endDate) ?? 99) < 0).length,
  }), [projects])

  const updateMilestone = async (project: ProjectDTO, milestoneId: string) => {
    try {
      await crmApi.updateProject(project.id, { milestoneId, milestoneStatus: 'DONE' })
      toast({ title: 'Milestone selesai ✓', description: 'Progress project diperbarui otomatis.' })
      await load()
      setDetail(prev => prev ? { ...prev, ...{} } : prev)
      // refresh detail
      const fresh = await crmApi.projects()
      const updated = fresh.find(p => p.id === project.id)
      if (updated) setDetail(updated)
    } catch (e) {
      toast({ title: 'Gagal update milestone', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    }
  }

  const updateStatus = async (projectId: string, status: string) => {
    try {
      await crmApi.updateProject(projectId, { status })
      toast({ title: 'Status project diperbarui' })
      await load()
      const fresh = await crmApi.projects()
      const updated = fresh.find(p => p.id === projectId)
      if (updated) setDetail(updated)
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
        description="Dibuat otomatis saat opportunity menjadi Won — milestone mengikuti workflow layanan brand"
        action={<RefreshButton onClick={load} loading={loading} />}
      />

      {loading ? <LoadingRows rows={4} /> : projects.length === 0 ? (
        <EmptyState icon={<FolderKanban className="h-5 w-5" />} title="Belum ada project" description="Project dibuat otomatis ketika opportunity ditandai Won di Sales Pipeline." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {projects.map(p => {
            const st = projectStatusMeta(p.status)
            const late = p.status !== 'COMPLETED' && p.endDate && (daysUntil(p.endDate) ?? 99) < 0
            return (
              <Card key={p.id} className="card-hover cursor-pointer rounded-xl hover:border-slate-300" onClick={() => setDetail(p)}>
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
                    <span className="text-slate-500">{p.milestones.filter(m => m.status === 'DONE').length}/{p.milestones.length} milestone</span>
                    <span className="font-semibold text-slate-700 tabular-nums">{formatMoney(p.budget, 'IDR', true)}</span>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="max-w-xl">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="text-left">{detail.name}</DialogTitle>
                <DialogDescription className="text-left">
                  {detail.code} · {detail.companyName} · Brand {detail.brandName} · Workflow {detail.workflowType}
                </DialogDescription>
              </DialogHeader>
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

                {canManage && (
                  <div className="space-y-1.5">
                    <Label>Status project</Label>
                    <Select value={detail.status} onValueChange={(v) => updateStatus(detail.id, v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PROJECT_STATUSES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div>
                  <p className="mb-2 text-sm font-semibold text-slate-800">Milestone</p>
                  <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1 scrollbar-slim">
                    {detail.milestones.map(m => (
                      <div key={m.id} className="flex items-center gap-2.5 rounded-lg border border-slate-100 p-2.5">
                        {m.status === 'DONE' ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                          : m.status === 'IN_PROGRESS' ? <CircleDot className="h-4 w-4 shrink-0 text-amber-500" />
                            : <Circle className="h-4 w-4 shrink-0 text-slate-300" />}
                        <div className="min-w-0 flex-1">
                          <p className={cn('text-[13px] font-medium', m.status === 'DONE' ? 'text-slate-400 line-through' : 'text-slate-800')}>{m.stepOrder}. {m.name}</p>
                          <p className="text-[10px] text-slate-400">Target: {formatDate(m.dueDate)}</p>
                        </div>
                        {canManage && m.status !== 'DONE' && (
                          <Button size="sm" variant="outline" className="h-8 gap-1 text-[11px]" onClick={() => updateMilestone(detail, m.id)}>
                            {m.status === 'PENDING' ? <><Loader2 className="hidden h-3 w-3" /> Mulai/Selesai</> : 'Selesai'}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDetail(null)}>Tutup</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
