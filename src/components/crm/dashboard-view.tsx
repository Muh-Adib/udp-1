/* ============ Command Center — Dashboard Direktur ============ */
'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { analyticsApi, crmApi, insightApi } from './api-client'
import { useCrmStore } from './crm-store'
import {
  BrandChip, ChannelIcon, EmptyState, LoadingRows, PriorityBadge, RefreshButton, StageBadge, UserAvatar, downloadCsv,
} from './shared'
import {
  channelMeta, daysUntil, formatDate, formatMoney, lostReasonLabel, projectStatusMeta, stageMeta, timeAgo,
} from '@/lib/crm-constants'
import type { BriefingDTO, BriefingStatDTO, ConversationAnalyticsDTO, DashboardDTO, ForecastDTO, TaskDTO } from '@/lib/crm-types'
import { GRADE_META } from '@/lib/lead-score'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  AlertTriangle, ArrowLeftRight, Building2, CalendarClock, Check, CheckCircle2, ChevronDown, ChevronRight, Clock, Download, Inbox, ListTodo, Loader2,
  MessagesSquare, Printer, RefreshCw, Rocket, Shield, Siren, Sparkles, Sunrise, Target, Timer, TrendingUp, Trophy, Users, Wallet, XCircle,
} from 'lucide-react'

/* Tone bar kuat per channel (indikator Progress = child div) — pasangan CHANNEL_HEX di atas */
const CHANNEL_BAR: Record<string, string> = {
  WHATSAPP: '[&>div]:bg-emerald-500',
  EMAIL: '[&>div]:bg-amber-500',
  INSTAGRAM: '[&>div]:bg-rose-500',
  WEBSITE: '[&>div]:bg-teal-500',
  PHONE: '[&>div]:bg-orange-500',
  MEETING: '[&>div]:bg-violet-500',
}

/* Warna bar per channel (hex, agar aman dipakai di style inline) */
const CHANNEL_HEX: Record<string, string> = {
  WHATSAPP: '#059669',
  EMAIL: '#d97706',
  INSTAGRAM: '#e11d48',
  WEBSITE: '#0d9488',
  PHONE: '#ea580c',
  MEETING: '#7c3aed',
}

const fmtNum = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 1 })
const pctOf = (value: number, total: number) => (total > 0 ? Math.round((value / total) * 100) : 0)

/** Jam respons terbaca: < 48 jam → "X jam", ≥ 48 jam → "Y hari" (1 desimal, koma Indonesia) */
function formatHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || Number.isNaN(hours)) return '—'
  if (hours >= 48) return `${fmtNum(hours / 24)} hari`
  return `${fmtNum(hours)} jam`
}

/** Export CSV analitik percakapan — SATU file multi-seksi via shared downloadCsv (; separator + BOM). */
function exportConversationsCsv(data: ConversationAnalyticsDTO) {
  const { kpi, perBrand, perMarketer, channelMix, weekly } = data
  const totalInteractions = perBrand.reduce((acc, b) => acc + b.interactions, 0)
  const rows: (string | number | null | undefined)[][] = [
    // Seksi 1 — KPI
    ['Indikator', 'Nilai'],
    ['Respons Pertama (rata-rata)', formatHours(kpi.avgFirstResponseHours)],
    ['Respons Pertama (median)', formatHours(kpi.medianFirstResponseHours)],
    ['Kepatuhan SLA', kpi.slaCompliancePct !== null ? `${kpi.slaCompliancePct}%` : '—'],
    ['Percakapan Aktif', kpi.totalConversations],
    ['Menunggu Balasan', kpi.unansweredNow],
    ['Total Interaksi', totalInteractions],
    [''],
    // Seksi 2 — per brand
    ['brand', 'avg_first_response_hours', 'sla_pct', 'interactions'],
    ...perBrand.map((b) => [b.brandName, b.firstResponseHours ?? '', b.slaPct ?? '', b.interactions]),
    [''],
    // Seksi 3 — campuran kanal
    ['channel', 'count'],
    ...channelMix.map((c) => [channelMeta(c.channel).label, c.count]),
    [''],
    // Seksi 4 — aktivitas mingguan
    ['label', 'inbound', 'outbound'],
    ...weekly.map((w) => [w.label, w.inbound, w.outbound]),
    [''],
    // Seksi 5 — per marketer
    ['name', 'replies', 'avg_hours'],
    ...perMarketer.map((m) => [m.userName, m.replies, m.avgResponseHours ?? '']),
  ]
  downloadCsv(`laporan-percakapan-${new Date().toISOString().slice(0, 10)}.csv`, ['Laporan Analitik Percakapan', 'Grupa Kreasi CRM'], rows)
}

type Tone = 'default' | 'warning' | 'danger' | 'positive'
const TONES: Record<Tone, { card: string; icon: string }> = {
  default: { card: 'border-slate-200 bg-white', icon: 'bg-slate-100 text-slate-600' },
  warning: { card: 'border-amber-200 bg-amber-50', icon: 'bg-amber-100 text-amber-700' },
  danger: { card: 'border-rose-200 bg-rose-50', icon: 'bg-rose-100 text-rose-700' },
  positive: { card: 'border-teal-200 bg-teal-50/60', icon: 'bg-teal-100 text-teal-700' },
}

function KpiCard({ icon, label, value, hint, tone = 'default', progress, hintClass }: {
  icon: React.ReactNode; label: string; value: string; hint: string; tone?: Tone
  progress?: React.ReactNode; hintClass?: string
}) {
  const t = TONES[tone]
  return (
    <Card className={cn('rounded-xl shadow-sm transition-shadow hover:shadow-md', t.card)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', t.icon)}>{icon}</div>
        </div>
        <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
        <p className={cn('mt-1 text-[11px] leading-snug', hintClass ?? 'text-slate-400')}>{hint}</p>
        {progress}
      </CardContent>
    </Card>
  )
}

/* ================= TAB KONVERSI — Analitik Percakapan (Fase 3) ================= */
function ConversationsTab({ data, loading, error, onRefresh }: {
  data: ConversationAnalyticsDTO | null; loading: boolean; error: string | null; onRefresh: () => void
}) {
  if (loading && !data) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-[300px] rounded-xl" />
          ))}
        </div>
      </div>
    )
  }
  if (error && !data) {
    return (
      <Card className="mx-auto max-w-lg rounded-xl border-rose-200 bg-rose-50">
        <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-rose-500" />
          <div>
            <p className="font-semibold text-rose-800">Gagal memuat analitik percakapan</p>
            <p className="mt-1 text-sm text-rose-600">{error}</p>
          </div>
          <Button variant="outline" onClick={onRefresh} className="border-rose-300 hover:bg-rose-100">
            Coba Lagi
          </Button>
        </CardContent>
      </Card>
    )
  }
  if (!data) return null

  const { kpi, perBrand, perMarketer, channelMix, weekly } = data
  const totalInteractions = perBrand.reduce((acc, b) => acc + b.interactions, 0)
  const channelTotal = channelMix.reduce((acc, c) => acc + c.count, 0)
  const maxChannelCount = Math.max(...channelMix.map((c) => c.count), 1)
  const respondedBrands = perBrand.filter((b) => b.firstResponseHours !== null)
  const noResponseBrands = perBrand.filter((b) => b.firstResponseHours === null)
  const marketers = perMarketer.slice(0, 8)
  const maxReplies = Math.max(...marketers.map((m) => m.replies), 1)

  const slaBarClass =
    kpi.slaCompliancePct === null
      ? '[&>div]:bg-slate-400'
      : kpi.slaCompliancePct >= 80
        ? '[&>div]:bg-emerald-500'
        : kpi.slaCompliancePct >= 50
          ? '[&>div]:bg-amber-500'
          : '[&>div]:bg-rose-500'

  const kpis: { key: string; icon: React.ReactNode; label: string; value: string; hint: string; tone?: Tone; progress?: React.ReactNode; hintClass?: string }[] = [
    {
      key: 'response', icon: <Timer className="h-4 w-4" />, label: 'Respons Pertama',
      value: formatHours(kpi.avgFirstResponseHours),
      hint: kpi.medianFirstResponseHours !== null ? `Median ${formatHours(kpi.medianFirstResponseHours)}` : 'Belum ada respons tercatat',
    },
    {
      key: 'sla', icon: <Target className="h-4 w-4" />, label: 'Kepatuhan SLA',
      value: kpi.slaCompliancePct !== null ? `${kpi.slaCompliancePct}%` : '—',
      hint: 'Respons pertama ≤ target SLA jam brand',
      progress: kpi.slaCompliancePct !== null ? (
        <Progress value={kpi.slaCompliancePct} className={cn('mt-2 h-1.5 bg-slate-100', slaBarClass)} />
      ) : undefined,
    },
    {
      key: 'active', icon: <MessagesSquare className="h-4 w-4" />, label: 'Percakapan Aktif',
      value: String(kpi.totalConversations),
      hint: `${kpi.unansweredNow} menunggu balasan`,
      hintClass: kpi.unansweredNow > 0 ? 'font-medium text-rose-600' : undefined,
      tone: kpi.unansweredNow > 0 ? 'warning' : 'default',
    },
    {
      key: 'interactions', icon: <ArrowLeftRight className="h-4 w-4" />, label: 'Total Interaksi',
      value: fmtNum(totalInteractions),
      hint: 'Pesan masuk + keluar, 90 hari terakhir',
    },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Analitik Percakapan</h2>
          <p className="mt-0.5 text-sm text-slate-500">Waktu respons, kepatuhan SLA, dan aktivitas omnichannel 90 hari terakhir</p>
        </div>
        <div className="flex items-center gap-3 print:hidden">
          <span className="text-[11px] text-slate-400">Diperbarui {timeAgo(data.generatedAt)}</span>
          <Button variant="outline" onClick={() => exportConversationsCsv(data)} className="gap-1.5">
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Button variant="outline" onClick={() => window.print()} className="gap-1.5">
            <Printer className="h-4 w-4" /> Cetak Laporan
          </Button>
          <RefreshButton onClick={onRefresh} loading={loading} />
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((item) => (
          <KpiCard
            key={item.key}
            icon={item.icon}
            label={item.label}
            value={item.value}
            hint={item.hint}
            tone={item.tone}
            hintClass={item.hintClass}
            progress={item.progress}
          />
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Waktu respons per brand — bar horizontal */}
        <Card className="rounded-xl border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Timer className="h-4 w-4 text-teal-600" /> Waktu Respons per Brand
            </CardTitle>
            <CardDescription>Rata-rata first response — warna mengikuti brand</CardDescription>
          </CardHeader>
          <CardContent>
            {respondedBrands.length === 0 ? (
              <EmptyState icon={<Timer className="h-5 w-5" />} title="Belum ada respons" description="First response akan muncul setelah pesan masuk dibalas tim." />
            ) : (
              <>
                <div className="h-[240px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={respondedBrands} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                      <XAxis
                        type="number"
                        unit=" jam"
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="brandName"
                        width={110}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: '#f1f5f9' }}
                        formatter={(value) => [`${fmtNum(Number(value))} jam`, 'Respons pertama']}
                        contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                      />
                      <Bar dataKey="firstResponseHours" name="Respons pertama" radius={[0, 4, 4, 0]} maxBarSize={20}>
                        {respondedBrands.map((b) => (
                          <Cell key={b.brandId} fill={b.brandColor} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {noResponseBrands.length > 0 && (
                  <p className="mt-2 text-[11px] text-slate-400">
                    {noResponseBrands.map((b) => b.brandName).join(', ')} belum ada respons dalam 90 hari terakhir.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Aktivitas mingguan — inbound vs outbound */}
        <Card className="rounded-xl border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-teal-600" /> Aktivitas Mingguan
            </CardTitle>
            <CardDescription>Pesan masuk vs keluar per minggu (8 minggu terakhir)</CardDescription>
          </CardHeader>
          <CardContent>
            {weekly.length === 0 ? (
              <EmptyState icon={<Inbox className="h-5 w-5" />} title="Belum ada aktivitas" description="Interaksi percakapan akan tampil per minggu di sini." />
            ) : (
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weekly} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} width={32} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="inbound" name="Masuk" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={24} />
                    <Bar dataKey="outbound" name="Keluar" fill="#334155" radius={[4, 4, 0, 0]} maxBarSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Campuran kanal */}
        <Card className="rounded-xl border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Inbox className="h-4 w-4 text-teal-600" /> Campuran Kanal
            </CardTitle>
            <CardDescription>Distribusi interaksi per kanal 90 hari terakhir</CardDescription>
          </CardHeader>
          <CardContent>
            {channelMix.length === 0 ? (
              <EmptyState icon={<Inbox className="h-5 w-5" />} title="Belum ada data kanal" />
            ) : (
              <div className="space-y-3">
                {channelMix.map((c) => {
                  const meta = channelMeta(c.channel)
                  return (
                    <div key={c.channel} className="flex items-center gap-3">
                      <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', meta.bg)}>
                        <ChannelIcon channel={c.channel} className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-medium text-slate-700">{meta.label}</p>
                          <p className="text-xs font-semibold text-slate-900">
                            {c.count} <span className="font-normal text-slate-400">· {pctOf(c.count, channelTotal)}%</span>
                          </p>
                        </div>
                        <Progress
                          value={pctOf(c.count, maxChannelCount)}
                          className={cn('mt-1 h-1.5 bg-slate-100', CHANNEL_BAR[c.channel] ?? '[&>div]:bg-slate-500')}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Respons tim marketing */}
        <Card className="rounded-xl border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-violet-600" /> Respons Tim Marketing
            </CardTitle>
            <CardDescription>Jumlah balasan dan kecepatan respons per marketer</CardDescription>
          </CardHeader>
          <CardContent>
            {marketers.length === 0 ? (
              <EmptyState icon={<Users className="h-5 w-5" />} title="Belum ada balasan" description="Balasan marketer akan tampil di sini setelah pesan keluar terkirim." />
            ) : (
              <div className="space-y-3">
                {marketers.map((m) => (
                  <div key={m.userId}>
                    <div className="flex items-center gap-2.5">
                      <UserAvatar name={m.userName} color={m.avatarColor} size={28} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{m.userName}</p>
                        <p className="text-[11px] text-slate-400">{m.replies} balasan</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs font-semibold text-slate-700">{formatHours(m.avgResponseHours)}</p>
                        <p className="text-[10px] text-slate-400">rata-rata respons</p>
                      </div>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-slate-700" style={{ width: `${pctOf(m.replies, maxReplies)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/* ================= LAPORAN CETAK — Analitik Percakapan (print-only, R12) =================
   Dirender via portal ke document.body dengan class .print-overlay-root sehingga lolos dari
   rule global @media print (body > *:not(.print-overlay-root) display:none) — di layar tetap
   hidden (display:none), hanya muncul saat window.print() dipicu tombol "Cetak Laporan". */
function PrintTh({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn('border-b border-slate-400 px-2 py-1.5 text-left font-semibold', className)}>{children}</th>
}

function PrintTd({ children, className, colSpan }: { children: React.ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={cn('border-b border-slate-200 px-2 py-1.5', className)}>{children}</td>
}

function ConversationPrintReport({ data }: { data: ConversationAnalyticsDTO }) {
  const { kpi, perBrand, perMarketer, channelMix, weekly } = data
  const totalInteractions = perBrand.reduce((acc, b) => acc + b.interactions, 0)
  const channelTotal = channelMix.reduce((acc, c) => acc + c.count, 0)

  const kpiRows: [string, string][] = [
    ['Respons Pertama', `${formatHours(kpi.avgFirstResponseHours)}${kpi.medianFirstResponseHours !== null ? ` (median ${formatHours(kpi.medianFirstResponseHours)})` : ''}`],
    ['Kepatuhan SLA', kpi.slaCompliancePct !== null ? `${kpi.slaCompliancePct}%` : '—'],
    ['Percakapan Aktif', `${kpi.totalConversations} (${kpi.unansweredNow} menunggu balasan)`],
    ['Total Interaksi', `${fmtNum(totalInteractions)} (90 hari terakhir)`],
  ]

  return createPortal(
    <div className="print-overlay-root hidden print:block">
      <div className="mx-auto w-full max-w-[180mm] p-2 text-[11px] leading-relaxed text-black">
        {/* Kepala laporan */}
        <div className="border-b-2 border-black pb-3">
          <h1 className="text-lg font-bold uppercase tracking-wide">Grupa Kreasi CRM — Laporan Analitik Percakapan</h1>
          <p className="mt-1">
            Dibuat {formatDate(data.generatedAt, true)} · Periode data 90 hari terakhir · Perusahaan: Grupa Kreasi Media
          </p>
        </div>

        {/* Ringkasan KPI */}
        <section className="mt-4">
          <h2 className="mb-1 text-sm font-bold">1. Ringkasan KPI</h2>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <PrintTh className="w-1/3">Indikator</PrintTh>
                <PrintTh>Nilai</PrintTh>
              </tr>
            </thead>
            <tbody>
              {kpiRows.map(([label, value]) => (
                <tr key={label}>
                  <PrintTd className="font-medium">{label}</PrintTd>
                  <PrintTd>{value}</PrintTd>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Per brand */}
        <section className="mt-4">
          <h2 className="mb-1 text-sm font-bold">2. Respons per Brand</h2>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <PrintTh>Brand</PrintTh>
                <PrintTh className="text-right">Rata-rata Respons</PrintTh>
                <PrintTh className="text-right">Kepatuhan SLA</PrintTh>
                <PrintTh className="text-right">Interaksi</PrintTh>
              </tr>
            </thead>
            <tbody>
              {perBrand.length === 0 ? (
                <tr><PrintTd colSpan={4}>Belum ada data brand.</PrintTd></tr>
              ) : perBrand.map((b) => (
                <tr key={b.brandId}>
                  <PrintTd className="font-medium">{b.brandName}</PrintTd>
                  <PrintTd className="text-right">{b.firstResponseHours !== null ? `${fmtNum(b.firstResponseHours)} jam` : '—'}</PrintTd>
                  <PrintTd className="text-right">{b.slaPct !== null ? `${b.slaPct}%` : '—'}</PrintTd>
                  <PrintTd className="text-right">{b.interactions}</PrintTd>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Aktivitas mingguan */}
        <section className="mt-4">
          <h2 className="mb-1 text-sm font-bold">3. Aktivitas Mingguan (Masuk vs Keluar)</h2>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <PrintTh>Minggu</PrintTh>
                <PrintTh className="text-right">Masuk</PrintTh>
                <PrintTh className="text-right">Keluar</PrintTh>
              </tr>
            </thead>
            <tbody>
              {weekly.length === 0 ? (
                <tr><PrintTd colSpan={3}>Belum ada aktivitas.</PrintTd></tr>
              ) : weekly.map((w) => (
                <tr key={w.weekStart}>
                  <PrintTd className="font-medium">{w.label}</PrintTd>
                  <PrintTd className="text-right">{w.inbound}</PrintTd>
                  <PrintTd className="text-right">{w.outbound}</PrintTd>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Campuran kanal */}
        <section className="mt-4">
          <h2 className="mb-1 text-sm font-bold">4. Campuran Kanal</h2>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <PrintTh>Kanal</PrintTh>
                <PrintTh className="text-right">Jumlah</PrintTh>
                <PrintTh className="text-right">Persentase</PrintTh>
              </tr>
            </thead>
            <tbody>
              {channelMix.length === 0 ? (
                <tr><PrintTd colSpan={3}>Belum ada data kanal.</PrintTd></tr>
              ) : channelMix.map((c) => (
                <tr key={c.channel}>
                  <PrintTd className="font-medium">{channelMeta(c.channel).label}</PrintTd>
                  <PrintTd className="text-right">{c.count}</PrintTd>
                  <PrintTd className="text-right">{pctOf(c.count, channelTotal)}%</PrintTd>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Respons tim marketing */}
        <section className="mt-4">
          <h2 className="mb-1 text-sm font-bold">5. Respons Tim Marketing</h2>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <PrintTh>Marketer</PrintTh>
                <PrintTh className="text-right">Balasan</PrintTh>
                <PrintTh className="text-right">Rata-rata Respons</PrintTh>
              </tr>
            </thead>
            <tbody>
              {perMarketer.length === 0 ? (
                <tr><PrintTd colSpan={3}>Belum ada balasan tercatat.</PrintTd></tr>
              ) : perMarketer.slice(0, 8).map((m) => (
                <tr key={m.userId}>
                  <PrintTd className="font-medium">{m.userName}</PrintTd>
                  <PrintTd className="text-right">{m.replies}</PrintTd>
                  <PrintTd className="text-right">{m.avgResponseHours !== null ? formatHours(m.avgResponseHours) : '—'}</PrintTd>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <p className="mt-4 border-t border-slate-300 pt-2 text-[10px] text-slate-500">
          Dicetak dari Grupa Kreasi CRM — Modul Dashboard, tab Konversasi.
        </p>
      </div>
    </div>,
    document.body,
  )
}

/* ================= BRIEFING PAGI — digest AI (R14) ================= */
/* Kartu kontras gelap di atas tab Ringkasan — digenerate server dari snapshot CRM (cache 10 menit).
   Data di-lift ke DashboardView agar tidak refetch saat pindah tab; state collapse persist di localStorage. */
const BRIEFING_TONE_CLS: Record<BriefingStatDTO['tone'], string> = {
  default: 'text-white',
  good: 'text-emerald-300',
  warn: 'text-amber-300',
  bad: 'text-rose-300',
}

function BriefingCard({ data, loading, error, refreshing, onRetry, onRefresh, onOpenOpportunity }: {
  data: BriefingDTO | null; loading: boolean; error: string | null; refreshing: boolean
  onRetry: () => void; onRefresh: () => void; onOpenOpportunity: (id: string) => void
}) {
  /* Persist per perangkat — key sederhana tanpa userId (briefing sama untuk seluruh tim internal).
     Lazy initializer aman: dashboard hanya dirender client-side setelah bootstrap (tidak ada SSR mismatch). */
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      if (typeof window === 'undefined') return false
      return localStorage.getItem('crm-briefing-collapsed') === '1'
    } catch { return false }
  })

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      try { localStorage.setItem('crm-briefing-collapsed', next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }

  if (loading && !data) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 p-4 sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-teal-500/10 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 animate-pulse rounded-xl bg-white/10" />
            <div className="space-y-2">
              <div className="h-4 w-44 animate-pulse rounded bg-white/10" />
              <div className="h-3 w-28 animate-pulse rounded bg-white/5" />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <div className="h-3 w-full animate-pulse rounded bg-white/5" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-white/5" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-white/5" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-white/5" style={{ animationDelay: `${i * 70}ms` }} />
            ))}
          </div>
          <p className="mt-4 inline-flex items-center gap-1.5 text-[11px] text-slate-500">
            <Loader2 className="h-3 w-3 animate-spin" /> AI sedang menyusun briefing pagi…
          </p>
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-rose-900/60 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 p-4 text-white sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
            <div>
              <p className="text-sm font-semibold">Briefing pagi gagal dimuat</p>
              <p className="text-[11px] text-slate-400">{error}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            disabled={loading}
            className="border-rose-800 bg-transparent text-rose-300 hover:bg-rose-950/40 hover:text-rose-200"
          >
            Coba Lagi
          </Button>
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <section className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 text-white shadow-sm">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-teal-500/10 blur-3xl" />
      <div className="relative p-4 sm:p-6">
        {/* Header — collapse toggle + Segarkan; saat collapsed jadi satu baris ringkas */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-500/15 text-teal-300">
              <Sunrise className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className={cn('truncate font-bold tracking-tight', collapsed ? 'text-sm' : 'text-base sm:text-lg')}>{data.greeting}</p>
              {collapsed ? (
                <p className="line-clamp-1 text-xs text-slate-400">{data.headline}</p>
              ) : (
                <p className="text-[11px] text-slate-400">{formatDate(new Date().toISOString())}</p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              disabled={refreshing || loading}
              title="Segarkan briefing (abaikan cache 10 menit)"
              className="h-8 gap-1.5 border border-white/10 bg-white/5 px-2.5 text-xs text-slate-200 hover:bg-white/10 hover:text-white"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
              <span className="hidden sm:inline">Segarkan</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleCollapsed}
              title={collapsed ? 'Tampilkan briefing lengkap' : 'Ringkas briefing'}
              className="h-8 w-8 p-0 text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <ChevronDown className={cn('h-4 w-4 transition-transform', collapsed && '-rotate-90')} />
            </Button>
          </div>
        </div>

        {!collapsed && (
          <div className="mt-4 space-y-4">
            {/* Headline */}
            <p className="text-sm leading-relaxed text-slate-200">{data.headline}</p>

            {/* Prioritas hari ini — baris dengan opportunityId dapat diklik → drawer deal */}
            {data.priorities.length > 0 && (
              <div className="space-y-2">
                {data.priorities.map((p, i) => {
                  const inner = (
                    <>
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold text-teal-300">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-xs font-semibold text-white">{p.title}</span>
                          <span className="ml-auto shrink-0 text-[9px] font-semibold uppercase tracking-wider text-slate-500">{p.source}</span>
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-slate-400">{p.reason}</span>
                        <span className="mt-1 inline-flex rounded-md bg-teal-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-teal-300">
                          → {p.action}
                        </span>
                      </span>
                    </>
                  )
                  return p.opportunityId ? (
                    <button
                      key={`${p.source}-${i}`}
                      type="button"
                      onClick={() => p.opportunityId && onOpenOpportunity(p.opportunityId)}
                      className="-mx-2 flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60"
                    >
                      {inner}
                    </button>
                  ) : (
                    <div key={`${p.source}-${i}`} className="flex items-start gap-2.5 px-2 py-1.5">{inner}</div>
                  )
                })}
              </div>
            )}

            {/* Risiko */}
            {data.risks.length > 0 && (
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Risiko</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {data.risks.map((r, i) => (
                    <span key={i} className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                      <AlertTriangle className="h-3 w-3 shrink-0" /> {r}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Fokus hari ini */}
            <div className="flex items-start gap-2">
              <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-300" />
              <p className="text-xs leading-relaxed text-slate-300">{data.focus}</p>
            </div>

            {/* Statistik mini */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {data.stats.map((s, i) => (
                <div key={i} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <p className={cn('text-sm font-bold tabular-nums', BRIEFING_TONE_CLS[s.tone])}>{s.value}</p>
                  <p className="mt-0.5 text-[10px] leading-tight text-slate-400">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Footer meta */}
            <p className="text-[10px] text-slate-500">
              {data.model} · {formatDate(data.generatedAt, true)}{data.cached ? ' · dari cache' : ''}
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

/* ================= TAB PROYEKSI — pipeline berbobot (R14) ================= */
const BAR_CAP = 85 // % tinggi maksimum bar — sisakan ruang label di atas

function ProyeksiCard({ title, subtitle, icon, children }: {
  title: string; subtitle: string; icon: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
      <h3 className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">{icon}{title}</h3>
      <p className="mt-0.5 text-[11px] text-slate-400">{subtitle}</p>
      <div className="mt-4">{children}</div>
    </div>
  )
}

function ProyeksiTab({ data, loading, error, onRefresh, onOpenOpportunity }: {
  data: ForecastDTO | null; loading: boolean; error: string | null
  onRefresh: () => void; onOpenOpportunity: (id: string) => void
}) {
  if (loading && !data) {
    return (
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[150px] rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-[340px] rounded-2xl" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-[240px] rounded-2xl" />
          <Skeleton className="h-[320px] rounded-2xl" />
        </div>
      </div>
    )
  }
  if (error && !data) {
    return (
      <Card className="mx-auto max-w-lg rounded-xl border-rose-200 bg-rose-50">
        <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-rose-500" />
          <div>
            <p className="font-semibold text-rose-800">Gagal memuat proyeksi</p>
            <p className="mt-1 text-sm text-rose-600">{error}</p>
          </div>
          <Button variant="outline" onClick={onRefresh} className="border-rose-300 hover:bg-rose-100">
            Coba Lagi
          </Button>
        </CardContent>
      </Card>
    )
  }
  if (!data) return null
  if (data.openDealsCount === 0) {
    return (
      <Card className="rounded-2xl border-slate-200">
        <CardContent className="p-6">
          <EmptyState
            icon={<Target className="h-5 w-5" />}
            title="Belum ada pipeline aktif untuk diproyeksikan"
            description="Proyeksi berbobot akan muncul setelah ada opportunity pada stage terbuka."
          />
        </CardContent>
      </Card>
    )
  }

  const { scenarios, monthly, byBrand, topDeals, baseline, excludedNonIdr, openDealsCount } = data
  const maxMonthly = Math.max(...monthly.map((m) => Math.max(m.total, m.weighted)), 1)
  const maxWeighted = Math.max(...byBrand.map((b) => b.weighted), 1)

  const scenarioCards: { key: string; label: string; value: number; icon: React.ReactNode; tile: string; cardCls: string; note: string; badge?: string }[] = [
    {
      key: 'conservative', label: 'Konservatif', value: scenarios.conservative,
      icon: <Shield className="h-4 w-4" />, tile: 'bg-slate-100 text-slate-600', cardCls: '',
      note: 'Σ nilai × (probability −15%)',
    },
    {
      key: 'realistic', label: 'Realistis', value: scenarios.realistic,
      icon: <TrendingUp className="h-4 w-4" />, tile: 'bg-teal-100 text-teal-700', cardCls: 'border-teal-200 bg-teal-50/50',
      note: 'Σ nilai × probability blended', badge: 'utama',
    },
    {
      key: 'optimistic', label: 'Optimistis', value: scenarios.optimistic,
      icon: <Rocket className="h-4 w-4" />, tile: 'bg-emerald-100 text-emerald-700', cardCls: '',
      note: 'Σ nilai × (probability +15%)',
    },
  ]

  return (
    <div className="space-y-5">
      {/* Header seksi */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Proyeksi Pipeline</h2>
          <p className="mt-0.5 text-sm text-slate-500">Pipeline berbobot — 60% probabilitas stage + 40% skor lead</p>
        </div>
        <span className="text-[11px] text-slate-400">Dihitung {timeAgo(data.generatedAt)}</span>
      </div>

      {/* a) Skenario */}
      <div className="grid gap-4 sm:grid-cols-3">
        {scenarioCards.map((s) => (
          <div key={s.key} className={cn('rounded-2xl border border-slate-200 bg-white p-4', s.cardCls)}>
            <div className="flex items-center justify-between gap-2">
              <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', s.tile)}>{s.icon}</div>
              {s.badge && (
                <span className="rounded-full bg-teal-600 px-2 py-0.5 text-[10px] font-bold text-white">{s.badge}</span>
              )}
            </div>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{s.label}</p>
            <p className="mt-1 text-xl font-bold tabular-nums tracking-tight text-slate-900 sm:text-2xl">
              {formatMoney(s.value, 'IDR', true)}
            </p>
            <p className="mt-1.5 text-[11px] leading-snug text-slate-400">{s.note}</p>
          </div>
        ))}
      </div>

      {/* b) Proyeksi per bulan — bar chart custom (2 seri berdampingan: total vs berbobot) */}
      <ProyeksiCard
        title="Proyeksi per Bulan"
        subtitle="6 bulan ke depan — dibucket berdasarkan perkiraan tanggal closing"
        icon={<TrendingUp className="h-4 w-4 shrink-0 text-teal-600" />}
      >
        <div className="scrollbar-slim overflow-x-auto pb-1">
          <div className="flex min-w-[560px] items-end gap-4 sm:gap-6">
            {monthly.map((m) => (
              <div key={m.month} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <div className="flex h-40 w-full items-end justify-center gap-1 sm:h-44 sm:gap-1.5">
                  <div className="flex h-full flex-col items-center justify-end gap-1">
                    {m.total > 0 && (
                      <span className="whitespace-nowrap text-[9px] font-medium tabular-nums text-slate-500">
                        {formatMoney(m.total, 'IDR', true)}
                      </span>
                    )}
                    <div
                      className="w-6 rounded-t bg-slate-200 sm:w-8"
                      style={{ height: `${m.total > 0 ? Math.max(pctOf(m.total, maxMonthly) * BAR_CAP / 100, 3) : 0}%` }}
                    />
                  </div>
                  <div className="flex h-full flex-col items-center justify-end gap-1">
                    {m.weighted > 0 && (
                      <span className="whitespace-nowrap text-[9px] font-semibold tabular-nums text-teal-700">
                        {formatMoney(m.weighted, 'IDR', true)}
                      </span>
                    )}
                    <div
                      className="w-6 rounded-t bg-teal-600 sm:w-8"
                      style={{ height: `${m.weighted > 0 ? Math.max(pctOf(m.weighted, maxMonthly) * BAR_CAP / 100, 3) : 0}%` }}
                    />
                  </div>
                </div>
                <p className="text-[11px] font-semibold text-slate-700">{m.label}</p>
                <span className="text-[10px] tabular-nums text-slate-400">{m.count} deal</span>
              </div>
            ))}
          </div>
        </div>
        {/* Legenda */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-[10px] text-slate-500">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-slate-200" /> Total pipeline</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-teal-600" /> Berbobot (weighted)</span>
        </div>
      </ProyeksiCard>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* c) Pipeline berbobot per brand */}
        <ProyeksiCard
          title="Pipeline Berbobot per Brand"
          subtitle="Kontribusi nilai berbobot tiap brand"
          icon={<Building2 className="h-4 w-4 shrink-0 text-teal-600" />}
        >
          {byBrand.length === 0 ? (
            <EmptyState icon={<Building2 className="h-5 w-5" />} title="Belum ada data brand" />
          ) : (
            <div className="space-y-4">
              {byBrand.map((b) => (
                <div key={b.brandId}>
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: b.color }} />
                    <span className="truncate text-xs font-semibold text-slate-800">{b.name}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-slate-400">{b.count} deal</span>
                    <span className="ml-auto shrink-0 text-xs font-bold tabular-nums text-slate-900">
                      {formatMoney(b.weighted, 'IDR', true)}
                    </span>
                  </div>
                  <Progress
                    value={pctOf(b.weighted, maxWeighted)}
                    className="h-2 bg-slate-100 [&>div]:bg-[var(--brand-c)]"
                    style={{ ['--brand-c' as string]: b.color }}
                  />
                </div>
              ))}
            </div>
          )}
        </ProyeksiCard>

        {/* d) Deal terbesar (berbobot) */}
        <ProyeksiCard
          title="Deal Terbesar (berbobot)"
          subtitle="Peluang dengan kontribusi berbobot terbesar — klik untuk membuka"
          icon={<Target className="h-4 w-4 shrink-0 text-teal-600" />}
        >
          {topDeals.length === 0 ? (
            <EmptyState icon={<Target className="h-5 w-5" />} title="Belum ada deal terbuka" />
          ) : (
            <div className="scrollbar-slim max-h-96 space-y-2 overflow-y-auto pr-1">
              {topDeals.map((d) => {
                const gm = GRADE_META[d.grade]
                return (
                  <button
                    key={d.opportunityId}
                    type="button"
                    onClick={() => onOpenOpportunity(d.opportunityId)}
                    className="flex w-full items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="shrink-0 text-xs font-bold tabular-nums text-slate-900">{d.code}</span>
                        <span className="truncate text-[11px] text-slate-500">{d.companyName} — {d.title}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-600">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: d.brandColor }} /> {d.brandName}
                        </span>
                        <StageBadge stage={d.stage} />
                        <span className={cn('inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-bold', gm.cls)}>
                          {d.grade} · {d.score}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[10px] tabular-nums text-slate-400">{Math.round(d.weight * 100)}%</p>
                      <p className="text-sm font-bold tabular-nums text-slate-900">
                        {d.currency === 'IDR'
                          ? formatMoney(d.weightedValue, 'IDR', true)
                          : formatMoney(d.value, d.currency)}
                      </p>
                      <p className="text-[10px] tabular-nums text-slate-400">{d.expectedClose ? formatDate(d.expectedClose) : '—'}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </ProyeksiCard>
      </div>

      {/* e) Baseline & catatan mata uang */}
      <div className="rounded-xl bg-slate-50 p-4 text-[11px] leading-relaxed text-slate-500">
        <p>
          Baseline 90 hari terakhir:{' '}
          <span className="font-semibold tabular-nums text-slate-700">{baseline.won90dCount} deal won</span>{' '}
          ({formatMoney(baseline.won90dValue, 'IDR', true)}) · win rate{' '}
          <span className="font-semibold tabular-nums text-slate-700">{fmtNum(baseline.winRate)}%</span> · rata-rata deal{' '}
          <span className="font-semibold tabular-nums text-slate-700">{formatMoney(baseline.avgDealSize, 'IDR', true)}</span> ·{' '}
          <span className="font-semibold tabular-nums text-slate-700">{openDealsCount}</span> deal aktif dianalisis
        </p>
        {excludedNonIdr.map((x) => (
          <p key={x.currency} className="mt-1 flex items-start gap-1.5 text-amber-700">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              {x.count} deal {x.currency} senilai {formatMoney(x.total, x.currency, true)} tidak masuk penjumlahan (mata uang berbeda)
            </span>
          </p>
        ))}
      </div>
    </div>
  )
}

function dueInfo(task: TaskDTO): { label: string; overdue: boolean } {
  if (!task.dueDate) return { label: 'Tanpa tenggat', overdue: false }
  const d = daysUntil(task.dueDate)
  if (d === null) return { label: formatDate(task.dueDate), overdue: false }
  if (d < 0) return { label: `${formatDate(task.dueDate)} · terlambat ${Math.abs(d)} hari`, overdue: true }
  if (d === 0) return { label: `${formatDate(task.dueDate)} · hari ini`, overdue: false }
  return { label: `${formatDate(task.dueDate)} · ${d} hari lagi`, overdue: false }
}

export default function DashboardView() {
  const openOpportunity = useCrmStore((s) => s.openOpportunity)
  const openCompany = useCrmStore((s) => s.openCompany)
  const user = useCrmStore((s) => s.user)
  const users = useCrmStore((s) => s.users)
  const { toast } = useToast()

  const [data, setData] = useState<DashboardDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set())

  /* Eskalasi SLA (13-d) — task URGENT ke owner lead; id row yang sudah dibuat (per session) */
  const [escalatedIds, setEscalatedIds] = useState<Set<string>>(new Set())
  const [escalatingId, setEscalatingId] = useState<string | null>(null)

  /* State analitik percakapan (tab Konversasi) — di-lift agar cache saat pindah-pindah tab */
  const [tab, setTab] = useState('ringkasan')
  const [analytics, setAnalytics] = useState<ConversationAnalyticsDTO | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsError, setAnalyticsError] = useState<string | null>(null)
  const analyticsRequestedRef = useRef(false)

  /* Briefing pagi AI (R14) — di-lift agar cache antar tab; server cache 10 menit jadi murah */
  const [briefing, setBriefing] = useState<BriefingDTO | null>(null)
  const [briefingLoading, setBriefingLoading] = useState(true)
  const [briefingRefreshing, setBriefingRefreshing] = useState(false)
  const [briefingError, setBriefingError] = useState<string | null>(null)

  /* Proyeksi forecast (R14) — lazy-load saat tab pertama dibuka, cache di state setelahnya */
  const [forecast, setForecast] = useState<ForecastDTO | null>(null)
  const [forecastLoading, setForecastLoading] = useState(false)
  const [forecastError, setForecastError] = useState<string | null>(null)
  const forecastRequestedRef = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await crmApi.dashboard()
      setData(res)
      setLastUpdated(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat dashboard')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  /* Briefing pagi — auto-load sekali saat dashboard mount (server cache 10 menit) */
  const loadBriefing = useCallback(async (refresh = false) => {
    if (refresh) setBriefingRefreshing(true)
    else setBriefingLoading(true)
    setBriefingError(null)
    try {
      const res = await insightApi.briefing(refresh)
      setBriefing(res)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Gagal memuat briefing pagi'
      setBriefingError(msg)
      if (refresh) toast({ title: 'Gagal menyegarkan briefing', description: msg, variant: 'destructive' })
    } finally {
      setBriefingLoading(false)
      setBriefingRefreshing(false)
    }
  }, [toast])

  useEffect(() => { void loadBriefing() }, [loadBriefing])

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true)
    setAnalyticsError(null)
    try {
      const res = await analyticsApi.conversations()
      setAnalytics(res)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Gagal memuat analitik percakapan'
      setAnalyticsError(msg)
      toast({ title: 'Gagal memuat analitik percakapan', description: msg, variant: 'destructive' })
    } finally {
      setAnalyticsLoading(false)
    }
  }, [toast])

  const loadForecast = useCallback(async () => {
    setForecastLoading(true)
    setForecastError(null)
    try {
      const res = await insightApi.forecast()
      setForecast(res)
    } catch (e) {
      setForecastError(e instanceof Error ? e.message : 'Gagal memuat proyeksi')
    } finally {
      setForecastLoading(false)
    }
  }, [])

  /* Analitik dimuat sekali saat tab Konversasi pertama dibuka — cache di parent, pindah tab tidak refetch.
     Proyeksi (R14) mengikuti pola yang sama utk tab Proyeksi. */
  const handleTabChange = useCallback((next: string) => {
    setTab(next)
    if (next === 'konversasi' && !analytics && !analyticsLoading && !analyticsRequestedRef.current) {
      analyticsRequestedRef.current = true
      void loadAnalytics()
    }
    if (next === 'proyeksi' && !forecast && !forecastLoading && !forecastRequestedRef.current) {
      forecastRequestedRef.current = true
      void loadForecast()
    }
  }, [analytics, analyticsLoading, loadAnalytics, forecast, forecastLoading, loadForecast])

  const handleCompleteTask = async (task: TaskDTO) => {
    setCompletingIds((prev) => new Set(prev).add(task.id))
    try {
      await crmApi.updateTask(task.id, { status: 'DONE' })
      toast({ title: 'Task diselesaikan', description: task.title })
      await load()
    } catch (e) {
      toast({
        title: 'Gagal menyelesaikan task',
        description: e instanceof Error ? e.message : 'Coba lagi',
        variant: 'destructive',
      })
    } finally {
      setCompletingIds((prev) => {
        const next = new Set(prev)
        next.delete(task.id)
        return next
      })
    }
  }

  /* ---------- Eskalasi SLA (13-d + R14) ---------- */
  /* R14: slaBreaches kini membawa ownerId → dipakai LANGSUNG utk assignee; chain lama
     (resolve ownerName via store users → user login) hanya fallback utk data cache lama. */
  const resolveEscalationAssignee = useCallback((ownerName?: string | null, ownerId?: string | null): string => {
    if (ownerId) return ownerId
    if (ownerName) {
      const owner = users.find((u) => u.name === ownerName)
      if (owner) return owner.id
    }
    return user?.id ?? ''
  }, [users, user])

  const handleEscalate = useCallback(async (b: DashboardDTO['slaBreaches'][number]) => {
    if (escalatedIds.has(b.opportunityId) || escalatingId) return
    setEscalatingId(b.opportunityId)
    try {
      await crmApi.createTask({
        title: `ESKALASI: segera hubungi ${b.companyName} — SLA ${b.brandName} terlewati (${b.code})`,
        opportunityId: b.opportunityId,
        assigneeId: resolveEscalationAssignee(b.ownerName, b.ownerId),
        priority: 'URGENT',
        type: 'FOLLOW_UP',
        dueDate: new Date().toISOString(),
      })
      setEscalatedIds((prev) => new Set(prev).add(b.opportunityId))
      toast({ title: `Task eskalasi dibuat untuk ${b.ownerName ?? 'owner lead'}`, description: `${b.code} · prioritas URGENT · tenggat hari ini` })
    } catch (e) {
      toast({
        title: 'Gagal membuat task eskalasi',
        description: e instanceof Error ? e.message : 'Coba lagi',
        variant: 'destructive',
      })
    } finally {
      setEscalatingId(null)
    }
  }, [escalatedIds, escalatingId, resolveEscalationAssignee, toast])

  /* ---------- Loading & error ---------- */
  if (loading && !data) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-xl" />
          ))}
        </div>
        <Card className="rounded-xl border-slate-200">
          <CardContent className="p-6">
            <LoadingRows rows={4} />
          </CardContent>
        </Card>
      </div>
    )
  }
  if (error && !data) {
    return (
      <Card className="mx-auto max-w-lg rounded-xl border-rose-200 bg-rose-50">
        <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-rose-500" />
          <div>
            <p className="font-semibold text-rose-800">Gagal memuat dashboard</p>
            <p className="mt-1 text-sm text-rose-600">{error}</p>
          </div>
          <Button variant="outline" onClick={() => void load()} className="border-rose-300 hover:bg-rose-100">
            Coba lagi
          </Button>
        </CardContent>
      </Card>
    )
  }
  if (!data) return null

  const k = data.kpis
  const maxBrandCount = Math.max(...data.leadsByBrand.map((b) => b.count), 1)
  const maxChannel = Math.max(...data.leadsByChannel.map((c) => c.count), 1)
  const maxCountry = Math.max(...data.leadsByCountry.map((c) => c.count), 1)
  const maxLost = Math.max(...data.lostReasons.map((r) => r.count), 1)
  const wonTotal = data.wonLost.won + data.wonLost.lost
  const winRatio = wonTotal > 0 ? Math.round((data.wonLost.won / wonTotal) * 100) : 0
  const upcoming = data.upcomingTasks.slice(0, 8)
  const activities = data.recentInteractions.slice(0, 8)
  const funnelData = data.funnel.map((f) => ({ name: stageMeta(f.stage).label, count: f.count }))

  const kpis: { key: string; icon: React.ReactNode; label: string; value: string; hint: string; tone?: Tone }[] = [
    { key: 'open', icon: <Users className="h-4 w-4" />, label: 'Total Lead Aktif', value: String(k.totalOpenLeads), hint: 'Opportunity dengan stage terbuka' },
    { key: 'new', icon: <Sparkles className="h-4 w-4" />, label: 'Lead Baru Minggu Ini', value: String(k.newThisWeek), hint: 'Masuk dalam 7 hari terakhir', tone: 'positive' },
    { key: 'unread', icon: <Inbox className="h-4 w-4" />, label: 'Belum Dibalas', value: String(k.unreadInbound), hint: 'Pesan masuk menunggu respons', tone: k.unreadInbound > 0 ? 'warning' : 'default' },
    { key: 'pipeline', icon: <Wallet className="h-4 w-4" />, label: 'Pipeline Value', value: formatMoney(k.pipelineValue, 'IDR', true), hint: 'Nilai seluruh lead aktif (IDR)' },
    { key: 'weighted', icon: <Target className="h-4 w-4" />, label: 'Weighted Pipeline', value: formatMoney(k.weightedPipeline, 'IDR', true), hint: 'Nilai × probabilitas per stage' },
    { key: 'winrate', icon: <Trophy className="h-4 w-4" />, label: 'Win Rate', value: `${fmtNum(k.winRate)}%`, hint: 'Persentase deal yang dimenangkan' },
    { key: 'response', icon: <Timer className="h-4 w-4" />, label: 'Avg Response Time', value: `${fmtNum(k.avgResponseHours)} jam`, hint: 'Rata-rata waktu balas pesan masuk' },
    { key: 'overdue', icon: <AlertTriangle className="h-4 w-4" />, label: 'Overdue Tasks', value: String(k.overdueTasks), hint: 'Task melewati jatuh tempo', tone: k.overdueTasks > 0 ? 'danger' : 'default' },
  ]

  const forecasts: { key: string; label: string; value: number; bar: string }[] = [
    { key: '30', label: '≤ 30 Hari', value: k.forecast30, bar: '[&>div]:bg-teal-600' },
    { key: '60', label: '≤ 60 Hari', value: k.forecast60, bar: '[&>div]:bg-teal-400' },
    { key: '90', label: '≤ 90 Hari', value: k.forecast90, bar: '[&>div]:bg-amber-500' },
  ]

  return (
    <div className="space-y-5">
      {/* Error stale banner */}
      {error && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <span className="inline-flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Gagal memuat data terbaru: {error}</span>
          <Button size="sm" variant="outline" className="h-7 border-amber-300 hover:bg-amber-100" onClick={() => void load()}>Coba lagi</Button>
        </div>
      )}

      <Tabs value={tab} onValueChange={handleTabChange} className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <TabsList className="grid h-auto w-full grid-cols-5 gap-1 p-1 sm:inline-flex sm:w-auto">
            <TabsTrigger value="ringkasan" className="min-w-0 truncate px-3 py-1.5 text-xs sm:text-sm">Ringkasan</TabsTrigger>
            <TabsTrigger value="analitik" className="min-w-0 truncate px-3 py-1.5 text-xs sm:text-sm">Funnel &amp; Analitik</TabsTrigger>
            <TabsTrigger value="tim" className="min-w-0 truncate px-3 py-1.5 text-xs sm:text-sm">Tim Marketing</TabsTrigger>
            <TabsTrigger value="konversasi" className="min-w-0 truncate px-3 py-1.5 text-xs sm:text-sm">Konversasi</TabsTrigger>
            <TabsTrigger value="proyeksi" className="min-w-0 truncate px-3 py-1.5 text-xs sm:text-sm">Proyeksi</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-3">
            {lastUpdated && <span className="text-[11px] text-slate-400">Diperbarui {lastUpdated}</span>}
            <RefreshButton onClick={() => void load()} loading={loading} />
          </div>
        </div>

        {/* ================= TAB RINGKASAN ================= */}
        <TabsContent value="ringkasan" className="space-y-5">
          {/* Briefing Pagi (R14) — digest AI harian, kartu kontras gelap di atas semua seksi ringkasan */}
          <BriefingCard
            data={briefing}
            loading={briefingLoading}
            error={briefingError}
            refreshing={briefingRefreshing}
            onRetry={() => void loadBriefing(false)}
            onRefresh={() => void loadBriefing(true)}
            onOpenOpportunity={openOpportunity}
          />

          {/* SLA breach banner — lead belum direspons melewati SLA jam brand.
              Eskalasi (R12): waitingHours > 2 × slaHours → badge ESKALASI + banner diperdalam. */}
          {data.slaBreaches.length > 0 && (() => {
            const escalatedCount = data.slaBreaches.filter((b) => b.waitingHours > 2 * b.slaHours).length
            return (
              <Alert className={cn(
                'cursor-default rounded-xl border text-rose-900',
                /* minmax(0,1fr): 1fr default tidak bisa menyusut di bawah min-content →
                   baris breach (13-d) memaksa track 704px & overflow di 390px — dibenahi R14 */
                'has-[>svg]:grid-cols-[calc(var(--spacing)*4)_minmax(0,1fr)]',
                escalatedCount > 0 ? 'border-rose-300 bg-rose-100/60' : 'border-rose-200 bg-rose-50',
              )}>
                <Timer className="h-4 w-4 text-rose-600" />
                <AlertTitle className="min-w-0 text-sm font-semibold text-rose-800">
                  {data.slaBreaches.length} lead melewati SLA respons brand{escalatedCount > 0 ? ` (${escalatedCount} eskalasi)` : ''}
                </AlertTitle>
                <AlertDescription className="min-w-0 text-xs text-rose-700">
                  <span>
                    Respons tertunda melebihi {data.slaBreaches[0].slaHours} jam — hubungi lead sekarang sebelum kompetitor.
                  </span>
                  <div className="mt-2 w-full min-w-0 space-y-1">
                    {data.slaBreaches.map((b) => {
                      const escalated = b.waitingHours > 2 * b.slaHours
                      const tasked = escalatedIds.has(b.opportunityId)
                      return (
                        <div
                          key={b.opportunityId}
                          role="button"
                          tabIndex={0}
                          onClick={() => openOpportunity(b.opportunityId)}
                          onKeyDown={(e) => {
                            if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
                              e.preventDefault()
                              openOpportunity(b.opportunityId)
                            }
                          }}
                          title={escalated
                            ? `Melewati ${2 * b.slaHours} jam (2× SLA) — eskalasi ke pemberi lead`
                            : undefined}
                          className={cn(
                            'flex w-full min-w-0 flex-wrap cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                            escalated ? 'bg-rose-100/70' : 'hover:bg-rose-100/60',
                          )}
                        >
                          {escalated && (
                            <span className="shrink-0 rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                              ESKALASI
                            </span>
                          )}
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: b.brandColor }} />
                          <span className="min-w-0 flex-1 truncate text-xs text-rose-900">
                            <span className="font-semibold">{b.code}</span> · {b.companyName} — {b.title}
                          </span>
                          <span className="shrink-0 text-xs font-semibold text-rose-700">
                            {fmtNum(b.waitingHours)} jam / SLA {b.slaHours} jam
                          </span>
                          {b.ownerName && (
                            <span
                              className="hidden shrink-0 items-center gap-1.5 rounded-full bg-white/70 py-0.5 pl-0.5 pr-2 sm:inline-flex"
                              title={b.ownerName}
                            >
                              <UserAvatar name={b.ownerName} color="#be123c" size={18} />
                              <span className="text-[11px] font-medium text-rose-800">{b.ownerName.split(' ')[0]}</span>
                            </span>
                          )}
                          {tasked && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                              <CheckCircle2 className="h-3 w-3" /> task dibuat
                            </span>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 shrink-0 gap-1 border-rose-300 px-2 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
                            disabled={tasked || escalatingId === b.opportunityId}
                            title="Buat task URGENT untuk owner lead"
                            onClick={(e) => { e.stopPropagation(); void handleEscalate(b) }}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            {escalatingId === b.opportunityId
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <Siren className="h-3 w-3" />}
                            Eskalasi
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </AlertDescription>
              </Alert>
            )
          })()}

          {/* KPI grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kpis.map((item) => (
              <KpiCard key={item.key} icon={item.icon} label={item.label} value={item.value} hint={item.hint} tone={item.tone} />
            ))}
          </div>

          {/* Forecast penutupan */}
          <Card className="rounded-xl border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="h-4 w-4 text-teal-600" /> Forecast Penutupan
              </CardTitle>
              <CardDescription>Proyeksi nilai deal yang diperkirakan closing dalam rentang waktu berikut</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                {forecasts.map((f) => (
                  <div key={f.key} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{f.label}</p>
                      <p className="text-[11px] text-slate-400">{pctOf(f.value, k.pipelineValue)}% pipeline</p>
                    </div>
                    <p className="mt-1.5 text-xl font-bold text-slate-900">{formatMoney(f.value, 'IDR', true)}</p>
                    <Progress value={pctOf(f.value, k.pipelineValue)} className={cn('mt-2.5 h-2 bg-slate-100', f.bar)} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Lead per brand */}
          <Card className="rounded-xl border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Lead per Brand</CardTitle>
              <CardDescription>Jumlah lead aktif dan total nilai per brand</CardDescription>
            </CardHeader>
            <CardContent>
              {data.leadsByBrand.length === 0 ? (
                <EmptyState icon={<Users className="h-5 w-5" />} title="Belum ada lead aktif" description="Lead akan muncul di sini setelah opportunity dibuat." />
              ) : (
                <div className="space-y-4">
                  {data.leadsByBrand.map((b) => (
                    <div key={b.brandId}>
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <BrandChip name={b.name} color={b.color} />
                        <span className="text-xs font-semibold text-slate-700">{b.count} lead</span>
                        <span className="ml-auto text-xs font-medium text-slate-500">{formatMoney(b.value, 'IDR', true)}</span>
                      </div>
                      <Progress
                        value={pctOf(b.count, maxBrandCount)}
                        className="h-2 bg-slate-100 [&>div]:bg-current"
                        style={{ color: b.color }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Kanal + Negara */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="rounded-xl border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Lead per Kanal</CardTitle>
                <CardDescription>Dari mana lead masuk</CardDescription>
              </CardHeader>
              <CardContent>
                {data.leadsByChannel.length === 0 ? (
                  <EmptyState icon={<Inbox className="h-5 w-5" />} title="Belum ada data kanal" />
                ) : (
                  <div className="space-y-3">
                    {data.leadsByChannel.map((c) => {
                      const meta = channelMeta(c.channel)
                      return (
                        <div key={c.channel} className="flex items-center gap-3">
                          <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', meta.bg)}>
                            <ChannelIcon channel={c.channel} className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-xs font-medium text-slate-700">{meta.label}</p>
                              <p className="text-xs font-semibold text-slate-900">{c.count}</p>
                            </div>
                            <Progress
                              value={pctOf(c.count, maxChannel)}
                              className="mt-1 h-1.5 bg-slate-100 [&>div]:bg-current"
                              style={{ color: CHANNEL_HEX[c.channel] ?? '#64748b' }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-xl border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Lead per Negara</CardTitle>
                <CardDescription>Sebaran geografis lead aktif</CardDescription>
              </CardHeader>
              <CardContent>
                {data.leadsByCountry.length === 0 ? (
                  <EmptyState icon={<Users className="h-5 w-5" />} title="Belum ada data negara" />
                ) : (
                  <div className="space-y-3">
                    {data.leadsByCountry.map((c) => (
                      <div key={c.country}>
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-medium text-slate-700">{c.country}</p>
                          <p className="text-xs font-semibold text-slate-900">{c.count}</p>
                        </div>
                        <Progress value={pctOf(c.count, maxCountry)} className="mt-1 h-1.5 bg-slate-100 [&>div]:bg-slate-500" />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Task mendatang + aktivitas terbaru */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="rounded-xl border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ListTodo className="h-4 w-4 text-amber-600" /> Task Mendatang
                </CardTitle>
                <CardDescription>Follow-up dan aktivitas yang perlu diselesaikan</CardDescription>
              </CardHeader>
              <CardContent>
                {upcoming.length === 0 ? (
                  <EmptyState icon={<Check className="h-5 w-5" />} title="Tidak ada task mendatang" description="Semua task sudah selesai atau belum dijadwalkan." />
                ) : (
                  <div className="space-y-2">
                    {upcoming.map((task) => {
                      const due = dueInfo(task)
                      return (
                        <div key={task.id} className="flex items-start gap-3 rounded-lg border border-slate-100 p-3 transition-colors hover:bg-slate-50">
                          <div className="w-0 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <PriorityBadge priority={task.priority} />
                              <p className="w-0 min-w-0 flex-1 truncate text-sm font-medium text-slate-900">{task.title}</p>
                            </div>
                            <p className="mt-0.5 truncate text-xs text-slate-500">
                              {task.opportunityTitle ?? task.companyName ?? 'Tanpa konteks'}
                            </p>
                            <span className={cn('mt-1 inline-flex items-center gap-1 text-[11px]', due.overdue ? 'font-semibold text-rose-600' : 'text-slate-400')}>
                              <Clock className="h-3 w-3" /> {due.label}
                            </span>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1.5">
                            <UserAvatar name={task.assigneeName ?? '?'} color={task.assigneeColor} size={24} />
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 gap-1 rounded-full px-2.5 text-[11px]"
                              disabled={completingIds.has(task.id)}
                              onClick={() => void handleCompleteTask(task)}
                            >
                              {completingIds.has(task.id)
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <Check className="h-3 w-3 text-emerald-600" />}
                              Selesai
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-xl border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Aktivitas Terbaru</CardTitle>
                <CardDescription>Pesan masuk dan keluar lintas kanal</CardDescription>
              </CardHeader>
              <CardContent>
                {activities.length === 0 ? (
                  <EmptyState icon={<Inbox className="h-5 w-5" />} title="Belum ada aktivitas" description="Interaksi dengan kontak akan tampil di sini." />
                ) : (
                  <div className="space-y-2">
                    {activities.map((a) => {
                      const clickable = Boolean(a.opportunityId)
                      const inner = (
                        <>
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100">
                            <ChannelIcon channel={a.channel} className="h-4 w-4" />
                          </div>
                          <div className="w-0 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <p className="w-0 min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{a.contactName}</p>
                              {a.companyName && <span className="truncate text-xs text-slate-500">{a.companyName}</span>}
                              <BrandChip name={a.brandName} color={a.brandColor} size="xs" />
                              <span className="ml-auto shrink-0 text-[11px] text-slate-400">{timeAgo(a.sentAt)}</span>
                            </div>
                            <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-slate-500">{a.body}</p>
                          </div>
                          {clickable && <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300" />}
                        </>
                      )
                      const cls = 'flex w-full items-start gap-3 rounded-lg border border-slate-100 p-3 text-left transition-colors'
                      return clickable ? (
                        <button
                          key={a.id}
                          type="button"
                          className={cn(cls, 'cursor-pointer hover:border-teal-200 hover:bg-teal-50/40')}
                          onClick={() => a.opportunityId && openOpportunity(a.opportunityId)}
                        >
                          {inner}
                        </button>
                      ) : (
                        <div key={a.id} className={cls}>{inner}</div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ================= TAB FUNNEL & ANALITIK ================= */}
        <TabsContent value="analitik" className="space-y-5">
          <Card className="rounded-xl border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-teal-600" /> Funnel Lead
              </CardTitle>
              <CardDescription>Jumlah lead pada setiap tahap pipeline</CardDescription>
            </CardHeader>
            <CardContent>
              {funnelData.length === 0 ? (
                <EmptyState icon={<Target className="h-5 w-5" />} title="Belum ada data funnel" />
              ) : (
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={funnelData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="funnelGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f59e0b" />
                          <stop offset="100%" stopColor="#0d9488" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        interval={0}
                        angle={-32}
                        textAnchor="end"
                        height={76}
                        tickLine={false}
                      />
                      <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} width={32} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                      <Bar dataKey="count" name="Jumlah lead" fill="url(#funnelGrad)" radius={[6, 6, 0, 0]} maxBarSize={44} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Alasan lost */}
            <Card className="rounded-xl border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <XCircle className="h-4 w-4 text-rose-500" /> Alasan Lost
                </CardTitle>
                <CardDescription>Mengapa deal tidak jadi — peluang perbaikan proses</CardDescription>
              </CardHeader>
              <CardContent>
                {data.lostReasons.length === 0 ? (
                  <EmptyState icon={<Check className="h-5 w-5" />} title="Belum ada lead lost" description="Bagus — belum ada deal yang gagal di periode ini." />
                ) : (
                  <div className="space-y-3">
                    {data.lostReasons.map((r) => (
                      <div key={r.reason}>
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-medium text-slate-700">{lostReasonLabel(r.reason) ?? r.reason}</p>
                          <p className="text-xs font-semibold text-slate-900">{r.count}</p>
                        </div>
                        <Progress value={pctOf(r.count, maxLost)} className="mt-1 h-1.5 bg-slate-100 [&>div]:bg-rose-400" />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Pipeline per stage */}
            <Card className="rounded-xl border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Pipeline per Stage</CardTitle>
                <CardDescription>Jumlah dan nilai lead pada tiap tahap</CardDescription>
              </CardHeader>
              <CardContent>
                {data.funnel.length === 0 ? (
                  <EmptyState icon={<Target className="h-5 w-5" />} title="Belum ada pipeline" />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Stage</TableHead>
                        <TableHead className="text-right text-xs">Lead</TableHead>
                        <TableHead className="text-right text-xs">Nilai</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.funnel.map((f) => (
                        <TableRow key={f.stage}>
                          <TableCell><StageBadge stage={f.stage} /></TableCell>
                          <TableCell className="text-right text-sm font-medium">{f.count}</TableCell>
                          <TableCell className="text-right text-sm text-slate-500">{formatMoney(f.value, 'IDR', true)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Status project */}
            <Card className="rounded-xl border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Status Project</CardTitle>
                <CardDescription>Distribusi pekerjaan pasca-deal</CardDescription>
              </CardHeader>
              <CardContent>
                {data.projectsStatus.length === 0 ? (
                  <EmptyState icon={<Target className="h-5 w-5" />} title="Belum ada project" description="Project otomatis dibuat saat opportunity ditandai Won." />
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {data.projectsStatus.map((p) => {
                      const meta = projectStatusMeta(p.status)
                      return (
                        <span key={p.status} className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium', meta.bg, meta.color)}>
                          {meta.label}
                          <span className="rounded-full bg-white/70 px-1.5 text-[11px] font-bold">{p.count}</span>
                        </span>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Perusahaan teratas */}
            <Card className="rounded-xl border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Building2 className="h-4 w-4 text-teal-600" /> Perusahaan Teratas
                </CardTitle>
                <CardDescription>Nilai pipeline terbesar — klik untuk membuka detail</CardDescription>
              </CardHeader>
              <CardContent>
                {data.topCompanies.length === 0 ? (
                  <EmptyState icon={<Building2 className="h-5 w-5" />} title="Belum ada perusahaan" />
                ) : (
                  <div className="space-y-1.5">
                    {data.topCompanies.map((c) => (
                      <button
                        key={c.companyId}
                        type="button"
                        onClick={() => openCompany(c.companyId)}
                        className="flex w-full items-center gap-3 rounded-lg border border-slate-100 px-3 py-2.5 text-left transition-colors hover:border-teal-200 hover:bg-teal-50/40"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">{c.name}</p>
                          <p className="text-xs text-slate-500">{c.country} · {c.openOpps} open</p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold text-slate-700">{formatMoney(c.totalValue, 'IDR', true)}</span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ================= TAB TIM MARKETING ================= */}
        <TabsContent value="tim" className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="rounded-xl border-slate-200 lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4 text-violet-600" /> Performa Marketing
                </CardTitle>
                <CardDescription>Open, won, lost, dan kecepatan respons per marketer</CardDescription>
              </CardHeader>
              <CardContent>
                {data.marketingPerf.length === 0 ? (
                  <EmptyState icon={<Users className="h-5 w-5" />} title="Belum ada data marketing" />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Marketing</TableHead>
                        <TableHead className="text-right text-xs">Open</TableHead>
                        <TableHead className="text-right text-xs">Won</TableHead>
                        <TableHead className="text-right text-xs">Lost</TableHead>
                        <TableHead className="text-right text-xs">Avg Response</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.marketingPerf.map((m) => (
                        <TableRow key={m.userId}>
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <UserAvatar name={m.name} color={m.color} size={28} />
                              <span className="text-sm font-medium text-slate-900">{m.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium">{m.open}</TableCell>
                          <TableCell className="text-right text-sm font-semibold text-emerald-700">{m.won}</TableCell>
                          <TableCell className="text-right text-sm font-semibold text-rose-600">{m.lost}</TableCell>
                          <TableCell className="text-right text-sm text-slate-500">
                            {m.avgResponseHours > 0 ? `${fmtNum(m.avgResponseHours)} jam` : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-xl border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Trophy className="h-4 w-4 text-amber-500" /> Won / Lost Summary
                </CardTitle>
                <CardDescription>Total deal yang sudah ditutup</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Won</p>
                    <p className="mt-1 text-3xl font-bold text-emerald-800">{data.wonLost.won}</p>
                  </div>
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Lost</p>
                    <p className="mt-1 text-3xl font-bold text-rose-800">{data.wonLost.lost}</p>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Rasio kemenangan</span>
                    <span className="font-semibold text-slate-700">{winRatio}%</span>
                  </div>
                  <Progress value={winRatio} className="mt-1.5 h-2 bg-slate-100 [&>div]:bg-emerald-500" />
                  <p className="mt-2 text-xs text-slate-500">
                    {data.wonLost.won} dari {wonTotal} deal selesai berhasil dimenangkan.
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                  <p><span className="font-semibold text-slate-700">{data.marketingPerf.length} marketer</span> aktif menangani pipeline lintas brand.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ================= TAB KONVERSI — ANALITIK PERCAKAPAN ================= */}
        <TabsContent value="konversasi" className="space-y-5">
          <ConversationsTab
            data={analytics}
            loading={analyticsLoading}
            error={analyticsError}
            onRefresh={() => void loadAnalytics()}
          />
          {/* Laporan cetak (print-only, portal ke body) — terisi bila data analitik sudah dimuat */}
          {analytics && <ConversationPrintReport data={analytics} />}
        </TabsContent>

        {/* ================= TAB PROYEKSI — pipeline berbobot (R14) ================= */}
        <TabsContent value="proyeksi" className="space-y-5">
          <ProyeksiTab
            data={forecast}
            loading={forecastLoading}
            error={forecastError}
            onRefresh={() => void loadForecast()}
            onOpenOpportunity={openOpportunity}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
