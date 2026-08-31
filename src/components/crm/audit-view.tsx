/* ============ Audit Logs View — immutable trail ============ */
'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { crmApi } from './api-client'
import { useToast } from '@/hooks/use-toast'
import { EmptyState, LoadingRows, RefreshButton, SectionHeader, UserAvatar } from './shared'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatDate, timeAgo } from '@/lib/crm-constants'
import type { AuditLogDTO } from '@/lib/crm-types'
import { cn } from '@/lib/utils'
import { ScrollText, Search } from 'lucide-react'

const ACTION_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  CREATE: { label: 'Create', bg: 'bg-emerald-50', color: 'text-emerald-700' },
  UPDATE: { label: 'Update', bg: 'bg-amber-50', color: 'text-amber-700' },
  DELETE: { label: 'Delete', bg: 'bg-rose-50', color: 'text-rose-700' },
  STAGE_CHANGE: { label: 'Stage Change', bg: 'bg-violet-50', color: 'text-violet-700' },
  AUTO_STAGE_CHANGE: { label: 'Auto Stage', bg: 'bg-violet-50', color: 'text-violet-700' },
  MERGE: { label: 'Merge', bg: 'bg-orange-50', color: 'text-orange-700' },
  LOGIN: { label: 'Login', bg: 'bg-slate-100', color: 'text-slate-600' },
  LOGOUT: { label: 'Logout', bg: 'bg-slate-100', color: 'text-slate-600' },
  LEAD_WEBSITE: { label: 'Lead Website', bg: 'bg-teal-50', color: 'text-teal-700' },
  INTERACTION_CREATE: { label: 'Interaction', bg: 'bg-cyan-50', color: 'text-cyan-700' },
  PROJECT_CREATE: { label: 'Project Create', bg: 'bg-lime-50', color: 'text-lime-700' },
  PROJECT_UPDATE: { label: 'Project Update', bg: 'bg-lime-50', color: 'text-lime-700' },
  TASK_CREATE: { label: 'Task Create', bg: 'bg-slate-100', color: 'text-slate-600' },
  TASK_UPDATE: { label: 'Task Update', bg: 'bg-slate-100', color: 'text-slate-600' },
  QUOTATION_CREATE: { label: 'Quotation Create', bg: 'bg-teal-50', color: 'text-teal-700' },
  QUOTATION_SENT: { label: 'Quotation Sent', bg: 'bg-amber-50', color: 'text-amber-700' },
  QUOTATION_ACCEPTED: { label: 'Quotation Accepted', bg: 'bg-emerald-50', color: 'text-emerald-700' },
  QUOTATION_REJECTED: { label: 'Quotation Rejected', bg: 'bg-rose-50', color: 'text-rose-700' },
  QUOTATION_EXPIRED: { label: 'Quotation Expired', bg: 'bg-slate-100', color: 'text-slate-600' },
  QUOTATION_UPDATE: { label: 'Quotation Update', bg: 'bg-amber-50', color: 'text-amber-700' },
  QUOTATION_DELETE: { label: 'Quotation Delete', bg: 'bg-rose-50', color: 'text-rose-700' },
  INVOICE_CREATE: { label: 'Invoice Create', bg: 'bg-lime-50', color: 'text-lime-700' },
  INVOICE_UPDATE: { label: 'Invoice Update', bg: 'bg-amber-50', color: 'text-amber-700' },
  PAYMENT_RECORD: { label: 'Payment', bg: 'bg-emerald-50', color: 'text-emerald-700' },
  BRIEF_SAVED: { label: 'Brief', bg: 'bg-fuchsia-50', color: 'text-fuchsia-700' },
  ESTIMATION_SAVED: { label: 'Estimasi', bg: 'bg-fuchsia-50', color: 'text-fuchsia-700' },
  PORTAL_VIEWED: { label: 'Portal View', bg: 'bg-teal-50', color: 'text-teal-700' },
}
const actionStyle = (a: string) => ACTION_STYLES[a] ?? { label: a.replaceAll('_', ' '), bg: 'bg-slate-100', color: 'text-slate-600' }

function parseJsonSafe(v?: string | null): unknown | null {
  if (!v) return null
  try { return JSON.parse(v) } catch { return v }
}

export default function AuditView() {
  const { toast } = useToast()
  const [logs, setLogs] = useState<AuditLogDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState('all')
  const [entityType, setEntityType] = useState('all')
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState<AuditLogDTO | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '200' })
      if (action !== 'all') params.set('action', action)
      if (entityType !== 'all') params.set('entityType', entityType)
      setLogs(await crmApi.auditLogs(params.toString()))
    } catch (e) {
      toast({ title: 'Gagal memuat audit log', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally { setLoading(false) }
  }, [action, entityType, toast])

  useEffect(() => { load() }, [load])

  const actions = useMemo(() => Array.from(new Set(logs.map(l => l.action))).sort(), [logs])
  const entityTypes = useMemo(() => Array.from(new Set(logs.map(l => l.entityType))).sort(), [logs])
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return logs.filter(l =>
      !q || (l.entityLabel ?? '').toLowerCase().includes(q) || (l.userName ?? '').toLowerCase().includes(q) || (l.newValue ?? '').toLowerCase().includes(q))
  }, [logs, search])
  const hasFilter = action !== 'all' || entityType !== 'all' || search.trim().length > 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader title="Jejak Audit" description="Immutable log: siapa mengubah apa, kapan, dari nilai apa menjadi apa, dari perangkat mana" action={<RefreshButton onClick={load} loading={loading} />} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-56">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari label, user, nilai…" className="w-full pl-8 sm:w-56" />
        </div>
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger className="min-w-0 flex-1 sm:w-44 sm:flex-none"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Aksi</SelectItem>
            {actions.map(a => <SelectItem key={a} value={a}>{actionStyle(a).label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={entityType} onValueChange={setEntityType}>
          <SelectTrigger className="min-w-0 flex-1 sm:w-44 sm:flex-none"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Entitas</SelectItem>
            {entityTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Badge variant="secondary" className="border-0 bg-slate-100 text-slate-600 tabular-nums">{filtered.length} event</Badge>
      </div>

      {loading ? <LoadingRows rows={8} /> : filtered.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="h-5 w-5" />}
          title={hasFilter ? 'Tidak ada event yang cocok' : 'Belum ada event tercatat'}
          description={hasFilter
            ? 'Coba ubah kata kunci pencarian atau reset filter aksi/entitas untuk melihat seluruh jejak.'
            : 'Setiap aksi di CRM (create, update, stage change, pembayaran, dll.) akan tercatat otomatis di sini.'}
        />
      ) : (
        <Card className="rounded-xl">
          <CardContent className="p-0">
            <div className="max-h-[62vh] overflow-y-auto scrollbar-slim">
              <div className="divide-y divide-slate-100">
                {filtered.map(log => {
                  const st = actionStyle(log.action)
                  return (
                    <button key={log.id} onClick={() => setDetail(log)} className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400/60">
                      <UserAvatar name={log.userName ?? 'System'} color="#64748b" size={28} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge className={cn('border-0 px-1.5 py-0 text-[10px]', st.bg, st.color)} variant="secondary">{st.label}</Badge>
                          <span className="text-[12px] font-medium text-slate-800">{log.userName ?? 'System'}</span>
                          <span className="text-[11px] text-slate-400">·</span>
                          <span className="text-[12px] text-slate-600">{log.entityType}</span>
                          {log.entityLabel && <span className="max-w-[280px] truncate text-[11px] text-slate-500">— {log.entityLabel}</span>}
                        </div>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[10px] tabular-nums text-slate-400">
                          <span>{formatDate(log.createdAt, true)} · {timeAgo(log.createdAt)}</span>
                          <span aria-hidden>·</span>
                          <span className="max-w-[160px] truncate" title={log.ip ? `IP ${log.ip}` : undefined}>IP {log.ip ?? '—'}</span>
                        </p>
                      </div>
                      {(log.oldValue || log.newValue) && (
                        <span className="mt-1 hidden shrink-0 text-[10px] font-medium text-teal-600 sm:block">Lihat perubahan →</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{actionStyle(detail.action).label} — {detail.entityType}</DialogTitle>
                <DialogDescription>
                  <span className="tabular-nums">{detail.userName ?? 'System'} · {formatDate(detail.createdAt, true)}</span>
                  {detail.ip && <span className="font-mono tabular-nums"> · IP {detail.ip}</span>}
                  {detail.userAgent && <span className="block break-all text-[10px] text-slate-400" title={detail.userAgent}>{detail.userAgent}</span>}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                {detail.entityLabel && (
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-700">
                    <span><b>Entitas:</b> {detail.entityLabel}</span>
                    {detail.entityId && (
                      <span className="max-w-[220px] truncate rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-slate-500" title={detail.entityId}>
                        {detail.entityId}
                      </span>
                    )}
                  </p>
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-[11px] font-semibold uppercase text-slate-400">Nilai lama</p>
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-rose-50/70 p-3 text-[11px] text-rose-900">
                      {parseJsonSafe(detail.oldValue) ? JSON.stringify(parseJsonSafe(detail.oldValue), null, 2) : '—'}
                    </pre>
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] font-semibold uppercase text-slate-400">Nilai baru</p>
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-emerald-50/70 p-3 text-[11px] text-emerald-900">
                      {parseJsonSafe(detail.newValue) ? JSON.stringify(parseJsonSafe(detail.newValue), null, 2) : '—'}
                    </pre>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
