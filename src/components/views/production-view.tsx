"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle2,
  Circle,
  CircleDashed,
  Factory,
  Gauge,
  Info,
  ListChecks,
  RefreshCw,
  ReceiptText,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api-client";
import {
  BRAND_LABEL,
  PROJECT_STATUS_BADGE,
  PROJECT_STATUS_LABEL,
  type MilestoneDTO,
  type OverviewStats,
  type ProductionStats,
  type ProjectDTO,
  type ProjectStatus,
  type SessionUser,
} from "@/lib/crm-types";
import { cn } from "@/lib/utils";

type MilestoneStatus = MilestoneDTO["status"];

const PROJECT_STATUSES = Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[];

const MS_LABEL: Record<MilestoneStatus, string> = {
  PENDING: "Menunggu",
  IN_PROGRESS: "Dikerjakan",
  DONE: "Selesai",
};

/** Siklus klik checkbox milestone: PENDING → IN_PROGRESS → DONE → PENDING */
const NEXT_MS: Record<MilestoneStatus, MilestoneStatus> = {
  PENDING: "IN_PROGRESS",
  IN_PROGRESS: "DONE",
  DONE: "PENDING",
};

const MS_ICON: Record<MilestoneStatus, typeof Circle> = {
  PENDING: Circle,
  IN_PROGRESS: CircleDashed,
  DONE: CheckCircle2,
};

const MS_ICON_CLASS: Record<MilestoneStatus, string> = {
  PENDING: "text-slate-300",
  IN_PROGRESS: "text-amber-500",
  DONE: "text-emerald-600",
};

const STATUS_BAR_CLASS: Record<ProjectStatus, string> = {
  PLANNED: "bg-stone-400",
  BRIEFED: "bg-amber-500",
  IN_PROGRESS: "bg-teal-500",
  REVIEW: "bg-violet-500",
  DONE: "bg-emerald-500",
};

const rpFmt = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" });

function fmtRp(n: number): string {
  return rpFmt.format(n);
}

function fmtDate(iso?: string | null): string {
  return iso ? dateFmt.format(new Date(iso)) : "—";
}

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-slate-200/70", className)} />;
}

function ProductionSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <SkeletonBlock className="h-7 w-56" />
        <SkeletonBlock className="h-4 w-80" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-28" />
        ))}
      </div>
      <SkeletonBlock className="h-72" />
      <div className="grid gap-4 lg:grid-cols-2">
        <SkeletonBlock className="h-56" />
        <SkeletonBlock className="h-56" />
      </div>
    </div>
  );
}

export default function ProductionView({ user }: { user: SessionUser }) {
  const [stats, setStats] = useState<ProductionStats | null>(null);
  const [projects, setProjects] = useState<ProjectDTO[] | null>(null);
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const canAct = ["OWNER", "MANAGER", "MARKETER"].includes(user.role);

  // Waktu "sekarang" dihitung di efek (react-hooks/purity: Date.now tidak boleh dipanggil saat render)
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    setNowMs(Date.now());
  }, [projects]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, pj, ov] = await Promise.all([api.productionStats(), api.projects(), api.overviewStats()]);
      setStats(s.stats);
      setProjects(pj.projects);
      setOverview(ov.stats);
      setFailed(false);
    } catch (e) {
      toast.error((e as Error).message || "Gagal memuat data produksi");
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function cycleMilestone(project: ProjectDTO, ms: MilestoneDTO) {
    const next = NEXT_MS[ms.status];
    setBusyKey(`${project.id}:${ms.id}`);
    try {
      await api.updateProject(project.id, { milestoneId: ms.id, milestoneStatus: next });
      toast.success(`Milestone "${ms.title}" → ${MS_LABEL[next]}`);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyKey(null);
    }
  }

  async function changeStatus(project: ProjectDTO, status: ProjectStatus) {
    if (status === project.status) return;
    try {
      await api.updateProject(project.id, { status });
      toast.success(`${project.code} → ${PROJECT_STATUS_LABEL[status]}`);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (failed) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <AlertTriangle className="size-8 text-rose-500" />
          <div>
            <p className="text-sm font-semibold text-slate-900">Gagal memuat data produksi</p>
            <p className="text-xs text-muted-foreground">Periksa koneksi Anda lalu coba lagi.</p>
          </div>
          <Button size="sm" onClick={() => void load()}>
            <RefreshCw className="size-3.5" /> Coba Lagi
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!stats || !projects || !overview) return <ProductionSkeleton />;

  // ---- agregat chart gabungan ----
  const maxRevenue = Math.max(...overview.monthly.map((m) => m.revenue), 1);
  const maxDone = Math.max(...overview.monthly.map((m) => m.projectsCompleted), 1);
  const maxStatusCount = Math.max(...stats.byStatus.map((s) => s.count), 1);

  const kpis = [
    { label: "Proyek Aktif", value: String(stats.activeCount), icon: Factory, iconBox: "bg-slate-100 text-slate-600" },
    { label: "Selesai", value: String(stats.doneCount), icon: CheckCircle2, iconBox: "bg-emerald-100 text-emerald-600" },
    { label: "Progress Rata-rata", value: `${stats.avgProgress}%`, icon: Gauge, iconBox: "bg-teal-100 text-teal-600" },
    { label: "Milestone Selesai", value: `${stats.milestoneDonePct}%`, icon: ListChecks, iconBox: "bg-amber-100 text-amber-600" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Produksi</h2>
          <p className="text-sm text-muted-foreground">Proyek, milestone, dan keterkaitan produksi dengan keuangan.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} /> Muat ulang
        </Button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="rounded-2xl">
            <CardContent className="flex items-center gap-3 px-4 py-5 sm:gap-4 sm:px-5">
              <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl sm:size-11", kpi.iconBox)}>
                <kpi.icon className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs text-muted-foreground">{kpi.label}</p>
                <p className="text-3xl font-bold tabular-nums text-slate-900">{kpi.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Bagan gabungan Keuangan × Produksi */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base">Pendapatan vs Proyek Selesai (6 bulan)</CardTitle>
          <CardDescription>
            Bar emerald = pendapatan (skala nilai), bar amber = proyek selesai (skala jumlah). Keduanya dinormalisasi terhadap nilai tertinggi masing-masing.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-emerald-500" aria-hidden /> Pendapatan
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-amber-500" aria-hidden /> Proyek selesai
            </span>
          </div>
          <div className="flex items-end gap-2 sm:gap-4">
            {overview.monthly.map((m) => {
              const revPct = m.revenue > 0 ? Math.max(4, Math.round((m.revenue / maxRevenue) * 100)) : 0;
              const donePct = m.projectsCompleted > 0 ? Math.max(6, Math.round((m.projectsCompleted / maxDone) * 100)) : 0;
              return (
                <div key={m.month} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                  <div className="flex h-40 w-full items-end justify-center gap-1 sm:gap-1.5">
                    <div
                      className="w-3 rounded-t-md bg-emerald-500 transition-all sm:w-5"
                      style={{ height: `${revPct}%` }}
                      role="img"
                      aria-label={`${m.label}: pendapatan ${fmtRp(m.revenue)}`}
                      title={`Pendapatan: ${fmtRp(m.revenue)}`}
                    />
                    <div className="flex h-full flex-col items-center justify-end gap-0.5">
                      <span className="text-[10px] font-semibold tabular-nums text-amber-600">{m.projectsCompleted}</span>
                      <div
                        className="w-3 rounded-t-md bg-amber-500 transition-all sm:w-5"
                        style={{ height: `${donePct}%` }}
                        role="img"
                        aria-label={`${m.label}: ${m.projectsCompleted} proyek selesai`}
                        title={`${m.projectsCompleted} proyek selesai`}
                      />
                    </div>
                  </div>
                  <span className="truncate text-[10px] text-muted-foreground sm:text-xs">{m.label}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-4 flex items-center gap-1.5 rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            <Info className="size-3.5 shrink-0" aria-hidden />
            <span>
              Keuangan &amp; produksi saling terhubung: penawaran disetujui otomatis membuka proyek &amp; invoice DP.
            </span>
          </p>
        </CardContent>
      </Card>

      {/* Distribusi status + per brand */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Distribusi Status Proyek</CardTitle>
            <CardDescription>{stats.totalProjects} proyek tercatat.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 px-5 pb-5">
            {stats.byStatus.map((s) => (
              <div key={s.status} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate text-xs text-slate-600 sm:text-sm">{PROJECT_STATUS_LABEL[s.status]}</span>
                <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={cn("h-full rounded-full", STATUS_BAR_CLASS[s.status])}
                    style={{ width: `${s.count > 0 ? Math.max(4, Math.round((s.count / maxStatusCount) * 100)) : 0}%` }}
                  />
                </div>
                <span className="w-6 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-700">{s.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Proyek per Brand</CardTitle>
            <CardDescription>Aktif vs selesai beserta total budget.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 px-5 pb-5">
            {stats.byBrand.map((b) => {
              const total = b.active + b.done;
              const activeW = total ? Math.round((b.active / total) * 100) : 0;
              return (
                <div key={b.brand} className="rounded-xl border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="text-sm font-medium text-slate-900">{BRAND_LABEL[b.brand] ?? b.brand}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      <span className="font-semibold text-teal-700">{b.active} aktif</span> · <span className="font-semibold text-emerald-700">{b.done} selesai</span>
                    </span>
                  </div>
                  <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full bg-teal-500 transition-all" style={{ width: `${activeW}%` }} />
                    <div className="h-full bg-emerald-500 transition-all" style={{ width: `${100 - activeW}%` }} />
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Total budget: <span className="font-medium text-slate-700 tabular-nums">{fmtRp(b.budget)}</span>
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Daftar proyek */}
      <div className="space-y-3">
        <h3 className="text-base font-semibold text-slate-900">
          Daftar Proyek <span className="text-sm font-normal text-muted-foreground">({projects.length})</span>
        </h3>
        {projects.length === 0 ? (
          <Card className="rounded-2xl">
            <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
              <Factory className="size-9 text-slate-300" aria-hidden />
              <p className="text-sm font-semibold text-slate-900">Belum ada proyek produksi</p>
              <p className="max-w-md text-xs text-muted-foreground">
                Proyek otomatis terbuka saat penawaran disetujui di menu Keuangan.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {projects.map((p) => {
              const isLate = Boolean(p.dueDate) && p.status !== "DONE" && new Date(p.dueDate!).getTime() < nowMs;
              const msDone = p.milestones.filter((m) => m.status === "DONE").length;
              return (
                <Card key={p.id} className="rounded-2xl">
                  <CardContent className="space-y-3 p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {p.code}
                          </Badge>
                          <Badge variant="outline" className={PROJECT_STATUS_BADGE[p.status]}>
                            {PROJECT_STATUS_LABEL[p.status]}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{BRAND_LABEL[p.brand] ?? p.brand}</span>
                        </div>
                        <h4 className="mt-1 truncate text-sm font-bold text-slate-900">{p.name}</h4>
                      </div>
                      {canAct && (
                        <Select value={p.status} onValueChange={(v) => void changeStatus(p, v as ProjectStatus)}>
                          <SelectTrigger className="h-8 w-[150px] shrink-0" aria-label={`Ubah status proyek ${p.code}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PROJECT_STATUSES.map((s) => (
                              <SelectItem key={s} value={s}>
                                {PROJECT_STATUS_LABEL[s]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>

                    {/* Progress */}
                    <div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-semibold tabular-nums text-slate-700">{p.progress}%</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${p.progress}%` }} />
                      </div>
                    </div>

                    {/* Meta */}
                    <div className="grid gap-1.5 text-xs text-muted-foreground sm:grid-cols-2">
                      <span className="flex items-center gap-1.5">
                        <Wallet className="size-3.5 shrink-0" aria-hidden />
                        Budget: <span className="font-medium tabular-nums text-slate-700">{fmtRp(p.budget)}</span>
                      </span>
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Building2 className="size-3.5 shrink-0" aria-hidden />
                        <span className="truncate">{p.companyName ?? "—"}</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <CalendarDays className="size-3.5 shrink-0" aria-hidden />
                        Deadline: {fmtDate(p.dueDate)}
                        {isLate && (
                          <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">
                            Terlambat
                          </Badge>
                        )}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <ReceiptText className="size-3.5 shrink-0" aria-hidden />
                        Terbit invoice: <span className="font-medium tabular-nums text-slate-700">{fmtRp(p.billedAmount)}</span>
                      </span>
                    </div>

                    {/* Milestone */}
                    <div>
                      <p className="mb-1.5 flex items-center justify-between text-xs">
                        <span className="font-medium uppercase tracking-wide text-muted-foreground">Milestone</span>
                        <span className="tabular-nums text-muted-foreground">
                          {msDone}/{p.milestones.length} selesai
                        </span>
                      </p>
                      {p.milestones.length === 0 ? (
                        <p className="rounded-xl border border-dashed px-3 py-3 text-center text-xs text-muted-foreground">
                          Belum ada milestone
                        </p>
                      ) : (
                        <div className="max-h-40 divide-y overflow-y-auto rounded-xl border">
                          {p.milestones.map((ms) => {
                            const Icon = MS_ICON[ms.status];
                            const busy = busyKey === `${p.id}:${ms.id}`;
                            const next = NEXT_MS[ms.status];
                            if (!canAct) {
                              return (
                                <div key={ms.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                                  <Icon className={cn("size-4 shrink-0", MS_ICON_CLASS[ms.status])} aria-hidden />
                                  <span className={cn("min-w-0 flex-1 truncate", ms.status === "DONE" && "text-muted-foreground line-through")}>
                                    {ms.title}
                                  </span>
                                  <span className="shrink-0 tabular-nums text-muted-foreground">{ms.weight}%</span>
                                </div>
                              );
                            }
                            return (
                              <button
                                key={ms.id}
                                type="button"
                                role="checkbox"
                                aria-checked={ms.status === "DONE"}
                                aria-label={`Milestone ${ms.title}, status ${MS_LABEL[ms.status]}. Klik untuk ubah menjadi ${MS_LABEL[next]}`}
                                disabled={busy}
                                onClick={() => void cycleMilestone(p, ms)}
                                className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-accent/60 disabled:opacity-60"
                              >
                                <Icon className={cn("size-4 shrink-0", MS_ICON_CLASS[ms.status])} aria-hidden />
                                <span className={cn("min-w-0 flex-1 truncate", ms.status === "DONE" && "text-muted-foreground line-through")}>
                                  {ms.title}
                                </span>
                                <span className="shrink-0 tabular-nums text-muted-foreground">{ms.weight}%</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
