"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Inbox, MessagesSquare, RefreshCw, Timer, Trophy, Users, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChannelBadge } from "@/components/channel-badge";
import { toast } from "@/components/ui/sonner";
import { api } from "@/lib/api-client";
import {
  CHANNEL_LABEL,
  LEAD_STATUS_BADGE,
  LEAD_STATUS_LABEL,
  type ChannelType,
  type DashboardStats,
  type SessionUser,
} from "@/lib/crm-types";

/** Warna bar distribusi per kanal (tanpa biru/indigo). */
const BAR_COLOR: Record<ChannelType | "manual", string> = {
  whatsapp: "bg-emerald-500",
  email: "bg-amber-500",
  instagram: "bg-rose-500",
  web: "bg-stone-500",
  manual: "bg-slate-400",
};

function channelLabel(channel: ChannelType | "manual") {
  return channel === "manual" ? "Manual" : CHANNEL_LABEL[channel];
}

/** Waktu relatif lokal: baru saja / Xm / Xj / Xh. */
function timeAgo(iso: string | null | undefined) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "baru saja";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}j`;
  const d = Math.floor(h / 24);
  return `${d}h`;
}

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-slate-200/70 ${className ?? ""}`} />;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <SkeletonBlock className="h-7 w-64" />
        <SkeletonBlock className="h-4 w-48" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-28" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <SkeletonBlock className="h-64" />
        <SkeletonBlock className="h-64" />
      </div>
    </div>
  );
}

export default function DashboardView({ user }: { user: SessionUser }) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [failed, setFailed] = useState(false);

  const loadStats = useCallback(async () => {
    setFailed(false);
    try {
      const { stats: s } = await api.dashboard();
      setStats(s);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal memuat data dashboard.");
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const firstName = user.name.split(" ")[0];
  const todayLabel = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  if (failed) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="flex flex-col items-center gap-3 px-5 py-12 text-center">
          <WifiOff className="size-10 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">Gagal memuat data dashboard</p>
          <p className="text-xs text-muted-foreground">Periksa koneksi lalu coba lagi.</p>
          <Button size="sm" variant="outline" onClick={() => void loadStats()} className="rounded-xl">
            <RefreshCw className="size-4" /> Coba lagi
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!stats) return <DashboardSkeleton />;

  const kpis = [
    { label: "Total Lead", value: stats.totals.all, icon: Users, iconBox: "bg-slate-100 text-slate-600" },
    { label: "Lead Baru", value: stats.totals.new, icon: Inbox, iconBox: "bg-amber-100 text-amber-600" },
    { label: "Sedang Diikuti", value: stats.totals.followUp, icon: MessagesSquare, iconBox: "bg-violet-100 text-violet-600" },
    { label: "Menang", value: stats.totals.won, icon: Trophy, iconBox: "bg-emerald-100 text-emerald-600" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Selamat datang, {firstName}</h1>
        <p className="text-sm text-muted-foreground">{todayLabel}</p>
      </div>

      {/* Banner SLA */}
      {stats.totals.new > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          <span aria-hidden>⚠</span>
          <span>
            {stats.totals.new} lead baru menunggu respons (SLA {stats.slaHours} jam)
          </span>
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="rounded-2xl">
            <CardContent className="flex items-center gap-3 px-4 py-5 sm:gap-4 sm:px-5">
              <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl sm:size-11 ${kpi.iconBox}`}>
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

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Distribusi Kanal */}
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Distribusi Kanal (7 hari)</CardTitle>
            <CardDescription>Asal lead yang masuk dalam sepekan terakhir.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 px-5 pb-5">
            {stats.channelBreakdown.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Belum ada lead pada periode ini.</p>
            )}
            {stats.channelBreakdown.map((item) => (
              <div key={item.channel} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate text-xs text-slate-600 sm:text-sm">
                  {channelLabel(item.channel)}
                </span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${BAR_COLOR[item.channel]}`}
                    style={{ width: `${Math.min(100, Math.max(item.pct, item.count > 0 ? 4 : 0))}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-sm font-medium tabular-nums text-slate-700">
                  {item.count}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Kesehatan Kanal */}
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Kesehatan Kanal</CardTitle>
            <CardDescription>Status koneksi dan aktivitas tiap kanal.</CardDescription>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="max-h-96 space-y-1 overflow-y-auto pr-1">
              {stats.channelHealth.map((ch) => (
                <div
                  key={ch.type}
                  className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-slate-50"
                >
                  <span
                    className={`size-2.5 shrink-0 rounded-full ${
                      ch.enabled ? "animate-pulse bg-emerald-500" : "bg-stone-300"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{CHANNEL_LABEL[ch.type]}</p>
                    <p className="text-xs text-muted-foreground">
                      {ch.eventCount} event · {ch.enabled ? timeAgo(ch.lastEventAt) : "belum ada aktivitas"}
                    </p>
                  </div>
                  {!ch.enabled && (
                    <Badge variant="outline" className="border-stone-200 bg-stone-100 text-stone-500">
                      Nonaktif
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Responsivitas Tim */}
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Responsivitas Tim</CardTitle>
            <CardDescription>Seberapa cepat tim menanggapi lead masuk.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 px-5 pb-5">
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-slate-600">Tingkat respons</span>
                <span className="text-2xl font-bold tabular-nums text-emerald-600">{stats.responseRatePct}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${Math.min(100, stats.responseRatePct)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">Persentase lead yang mendapat respons pertama.</p>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex size-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                <Timer className="size-4" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Rata-rata respons pertama</p>
                <p className="text-lg font-semibold text-slate-900">
                  {stats.avgFirstResponseMins === null ? "—" : `± ${stats.avgFirstResponseMins} menit`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Lead Terbaru */}
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Lead Terbaru</CardTitle>
            <CardDescription>8 lead terakhir yang masuk dari semua kanal.</CardDescription>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {stats.recentLeads.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Inbox className="size-10 text-slate-300" />
                <p className="text-sm text-muted-foreground">Belum ada lead yang masuk.</p>
              </div>
            ) : (
              <div className="max-h-96 space-y-1 overflow-y-auto pr-1">
                {stats.recentLeads.slice(0, 8).map((lead) => (
                  <div key={lead.id} className="flex items-start gap-3 rounded-xl px-2 py-2.5 hover:bg-slate-50">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-slate-900">{lead.contact.name}</p>
                        <span className="shrink-0 font-mono text-[10px] text-slate-400">{lead.code}</span>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{lead.subject}</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <ChannelBadge channel={lead.channel} />
                        <Badge variant="outline" className={LEAD_STATUS_BADGE[lead.status]}>
                          {LEAD_STATUS_LABEL[lead.status]}
                        </Badge>
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(lead.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Catatan SLA kecil */}
      {stats.totals.new > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <AlertTriangle className="size-3.5 text-amber-500" />
          Respons pertama idealnya diberikan dalam {stats.slaHours} jam sejak lead masuk.
        </p>
      )}
    </div>
  );
}
