"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Banknote,
  Filter,
  Flame,
  Inbox,
  Info,
  Loader2,
  Percent,
  RefreshCw,
  Tag,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChannelBadge } from "@/components/channel-badge";
import { toast } from "@/components/ui/sonner";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
  BRAND_LABEL,
  LEAD_STAGES,
  LEAD_STAGE_BADGE,
  LEAD_STAGE_LABEL,
  LOST_REASONS,
  type LeadStage,
  type PipelineLeadDTO,
  type PipelineStats,
  type SessionUser,
} from "@/lib/crm-types";

// ---------- Helper lokal ----------

const rupiahFmt = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

/** Format Rupiah: "Rp 12.500.000" (desimal dibuang, gaya id-ID). */
function formatRupiah(value: number): string {
  return `Rp ${rupiahFmt.format(Math.round(value || 0))}`;
}

/** Tahapan yang masuk bagan funnel (LOST tampil sebagai catatan terpisah). */
const FUNNEL_STAGES: LeadStage[] = ["NEW", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON"];

/** Warna aksen per stage (dilarang biru/indigo — sesuai palet proyek). */
const STAGE_COLOR: Record<LeadStage, string> = {
  NEW: "bg-amber-500",
  QUALIFIED: "bg-teal-500",
  PROPOSAL: "bg-violet-500",
  NEGOTIATION: "bg-orange-500",
  WON: "bg-emerald-500",
  LOST: "bg-rose-500",
};

interface PipelineData {
  stats: PipelineStats;
  leads: PipelineLeadDTO[];
}

// ---------- Bagan Funnel (CSS murni, tanpa library chart) ----------

function FunnelChart({ stats }: { stats: PipelineStats }) {
  const byStage = useMemo(() => new Map(stats.stages.map((s) => [s.stage, s])), [stats]);
  const maxCount = Math.max(1, ...FUNNEL_STAGES.map((s) => byStage.get(s)?.count ?? 0));
  const lost = byStage.get("LOST");

  return (
    <div className="space-y-3">
      {FUNNEL_STAGES.map((stage) => {
        const st = byStage.get(stage);
        const count = st?.count ?? 0;
        const value = st?.value ?? 0;
        const pct = st?.pctOfWon ?? 0;
        // Lebar proporsional terhadap stage terbesar (min 5% agar tetap terlihat).
        const widthPct = count > 0 ? Math.max((count / maxCount) * 100, 5) : 0;
        return (
          <div key={stage} className="flex items-center gap-2 sm:gap-3">
            <div className="flex w-24 shrink-0 items-center gap-1.5 sm:w-36">
              <span className={cn("size-2 shrink-0 rounded-full", STAGE_COLOR[stage])} aria-hidden="true" />
              <span className="truncate text-xs font-medium text-slate-700 sm:text-sm">{LEAD_STAGE_LABEL[stage]}</span>
            </div>
            <div className="relative h-9 min-w-0 flex-1 overflow-hidden rounded-lg bg-slate-100">
              <div
                className={cn("absolute inset-y-0 left-0 rounded-lg transition-all duration-500", STAGE_COLOR[stage])}
                style={{ width: `${widthPct}%` }}
                role="presentation"
              />
              <div className="absolute inset-0 flex items-center justify-between gap-2 px-2.5 text-xs">
                <span className="font-semibold text-slate-900">{count} lead</span>
                <span className="whitespace-nowrap text-slate-600">{formatRupiah(value)}</span>
              </div>
            </div>
            <div
              className="w-11 shrink-0 text-right text-xs font-semibold text-slate-500 sm:w-14 sm:text-sm"
              title="Persentase terhadap seluruh lead yang masuk"
            >
              {pct}%
            </div>
          </div>
        );
      })}
      {lost && (
        <p className="flex items-start gap-1.5 pt-1 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0 text-rose-400" aria-hidden="true" />
          <span>
            Di luar funnel:{" "}
            <span className="font-semibold text-slate-700">
              {lost.count} lead {LEAD_STAGE_LABEL.LOST}
            </span>{" "}
            senilai {formatRupiah(lost.value)} ({lost.pctOfWon}% dari total lead masuk) tidak dihitung dalam bagan.
          </span>
        </p>
      )}
    </div>
  );
}

// ---------- Kartu KPI ----------

function KpiCard({
  icon: Icon,
  iconWrapClass,
  label,
  value,
  sub,
}: {
  icon: LucideIcon;
  iconWrapClass: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="flex items-center gap-3.5 px-4 py-4 sm:gap-4 sm:px-5 sm:py-5">
        <div className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", iconWrapClass)}>
          <Icon className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
          <p className="truncate text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{value}</p>
          <p className="truncate text-xs text-muted-foreground">{sub}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Kartu lead kanban ----------

function LeadCard({
  lead,
  busy,
  onPickStage,
  onOpenValue,
}: {
  lead: PipelineLeadDTO;
  busy: boolean;
  onPickStage: (lead: PipelineLeadDTO, stage: LeadStage) => void;
  onOpenValue: (lead: PipelineLeadDTO) => void;
}) {
  const hot = lead.score >= 80;
  return (
    <Card className="gap-2 rounded-xl border-slate-200 p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-slate-500">{lead.code}</span>
        {hot && (
          <Badge variant="outline" className="border-amber-200 bg-amber-100 text-amber-800">
            <Flame className="size-3" aria-hidden="true" />
            Hot · {lead.score}
          </Badge>
        )}
      </div>
      <p className="truncate text-sm font-semibold text-slate-900" title={lead.subject}>
        {lead.subject}
      </p>
      <p className="truncate text-xs text-muted-foreground" title={lead.contact.name}>
        {lead.contact.name}
        {lead.contact.company ? ` · ${lead.contact.company}` : ""}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <ChannelBadge channel={lead.channel} />
        <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
          {BRAND_LABEL[lead.brand] ?? lead.brand}
        </Badge>
      </div>
      <p className="text-sm font-bold text-slate-900">{formatRupiah(lead.estValue)}</p>
      <div className="flex items-center gap-1.5 border-t border-slate-100 pt-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 rounded-lg px-2 text-xs"
              disabled={busy}
              aria-label={`Pindah tahap lead ${lead.code}`}
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowLeftRight className="size-3.5" />}
              Pindah
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel>Pindah ke tahap</DropdownMenuLabel>
            {LEAD_STAGES.filter((s) => s !== lead.stage).map((s) => (
              <DropdownMenuItem key={s} onSelect={() => onPickStage(lead, s)}>
                <span className={cn("size-2 shrink-0 rounded-full", STAGE_COLOR[s])} aria-hidden="true" />
                {LEAD_STAGE_LABEL[s]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 rounded-lg px-2 text-xs text-slate-600"
          disabled={busy}
          onClick={() => onOpenValue(lead)}
          aria-label={`Atur nilai deal lead ${lead.code}`}
        >
          <Tag className="size-3.5" />
          Nilai
        </Button>
      </div>
    </Card>
  );
}

// ---------- Kolom kanban ----------

function KanbanColumn({
  stage,
  leads,
  busyId,
  onPickStage,
  onOpenValue,
}: {
  stage: LeadStage;
  leads: PipelineLeadDTO[];
  busyId: string | null;
  onPickStage: (lead: PipelineLeadDTO, stage: LeadStage) => void;
  onOpenValue: (lead: PipelineLeadDTO) => void;
}) {
  return (
    <section className="flex min-w-[240px] shrink-0 flex-col rounded-2xl border border-slate-200 bg-slate-50/70 lg:min-w-[260px]" aria-label={`Kolom ${LEAD_STAGE_LABEL[stage]}`}>
      <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("size-2 shrink-0 rounded-full", STAGE_COLOR[stage])} aria-hidden="true" />
          <span className="truncate text-sm font-semibold text-slate-800">{LEAD_STAGE_LABEL[stage]}</span>
        </div>
        <Badge variant="outline" className={LEAD_STAGE_BADGE[stage]}>
          {leads.length}
        </Badge>
      </div>
      <div className="max-h-[420px] space-y-2.5 overflow-y-auto p-2.5">
        {leads.length === 0 ? (
          <p className="flex flex-col items-center gap-1.5 py-8 text-center text-xs text-muted-foreground">
            <Inbox className="size-5 text-slate-300" aria-hidden="true" />
            Tidak ada lead
          </p>
        ) : (
          leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              busy={busyId === lead.id}
              onPickStage={onPickStage}
              onOpenValue={onOpenValue}
            />
          ))
        )}
      </div>
    </section>
  );
}

// ---------- Skeleton ----------

function PipelineSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Memuat pipeline">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[86px] animate-pulse rounded-2xl border border-slate-200 bg-white" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white" />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-72 w-[240px] shrink-0 animate-pulse rounded-2xl border border-slate-200 bg-white lg:w-[260px]" />
        ))}
      </div>
    </div>
  );
}

// ---------- View utama ----------

export default function PipelineView({ user }: { user: SessionUser }) {
  void user; // view internal (OWNER/MANAGER/MARKETER/FINANCE); data tidak bergantung role

  const [data, setData] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null); // lead yang sedang diproses
  const [busy, setBusy] = useState(false); // aksi di dalam dialog

  // Dialog "Tandai Hilang"
  const [lostTarget, setLostTarget] = useState<PipelineLeadDTO | null>(null);
  const [lostReason, setLostReason] = useState<string>("");
  // Dialog "Atur Nilai"
  const [valueTarget, setValueTarget] = useState<PipelineLeadDTO | null>(null);
  const [valueInput, setValueInput] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.pipeline();
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat pipeline.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Muat ulang di latar belakang (tanpa skeleton) setelah aksi sukses. */
  const refresh = useCallback(async () => {
    try {
      const res = await api.pipeline();
      setData(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal memuat ulang pipeline.");
    }
  }, []);

  const handlePickStage = useCallback(
    async (lead: PipelineLeadDTO, stage: LeadStage) => {
      if (stage === "LOST") {
        // Wajib memilih alasan dari LOST_REASONS lewat dialog.
        setLostReason("");
        setLostTarget(lead);
        return;
      }
      setBusyId(lead.id);
      try {
        await api.updateLeadStage(lead.id, { stage });
        toast.success(`${lead.code} dipindah ke "${LEAD_STAGE_LABEL[stage]}".`);
        await refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Gagal memindahkan tahap lead.");
      } finally {
        setBusyId(null);
      }
    },
    [refresh]
  );

  const confirmLost = useCallback(async () => {
    if (!lostTarget || !lostReason) return;
    setBusy(true);
    try {
      await api.updateLeadStage(lostTarget.id, { stage: "LOST", lostReason });
      toast.success(`${lostTarget.code} ditandai Hilang (alasan: ${lostReason}).`);
      setLostTarget(null);
      setLostReason("");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menandai lead sebagai hilang.");
    } finally {
      setBusy(false);
    }
  }, [lostTarget, lostReason, refresh]);

  const openValueDialog = useCallback((lead: PipelineLeadDTO) => {
    setValueInput(lead.estValue > 0 ? String(lead.estValue) : "");
    setValueTarget(lead);
  }, []);

  const saveValue = useCallback(async () => {
    if (!valueTarget) return;
    const parsed = Number(valueInput);
    if (valueInput.trim() === "" || Number.isNaN(parsed) || parsed < 0) {
      toast.error("Masukkan angka nilai deal yang valid (≥ 0).");
      return;
    }
    setBusy(true);
    try {
      await api.updateLeadStage(valueTarget.id, { estValue: Math.round(parsed) });
      toast.success(`Nilai ${valueTarget.code} diperbarui menjadi ${formatRupiah(parsed)}.`);
      setValueTarget(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal memperbarui nilai deal.");
    } finally {
      setBusy(false);
    }
  }, [valueTarget, valueInput, refresh]);

  const stats = data?.stats ?? null;
  const leads = data?.leads ?? [];

  const leadsByStage = useMemo(() => {
    const map = new Map<LeadStage, PipelineLeadDTO[]>(LEAD_STAGES.map((s) => [s, []]));
    for (const l of leads) {
      const stage = (LEAD_STAGES as string[]).includes(l.stage) ? (l.stage as LeadStage) : "NEW";
      map.get(stage)?.push(l);
    }
    return map;
  }, [leads]);

  const valuePreview = Number.isNaN(Number(valueInput)) ? null : formatRupiah(Number(valueInput));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Pipeline &amp; Funnel</h1>
          <p className="text-sm text-muted-foreground">
            Progres prospek dari lead baru hingga menang, lengkap dengan bagan funnel dan kanban per tahap.
          </p>
        </div>
        <Button variant="outline" size="sm" className="w-fit rounded-xl" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          Muat Ulang
        </Button>
      </div>

      {loading ? (
        <PipelineSkeleton />
      ) : error && !data ? (
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <AlertTriangle className="size-10 text-amber-500" aria-hidden="true" />
            <p className="text-sm font-semibold text-slate-800">Gagal memuat pipeline</p>
            <p className="max-w-sm text-xs text-muted-foreground">{error}</p>
            <Button className="mt-1 rounded-xl" onClick={() => void load()}>
              <RefreshCw className="size-4" />
              Coba Lagi
            </Button>
          </CardContent>
        </Card>
      ) : stats ? (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              icon={Filter}
              iconWrapClass="bg-slate-100 text-slate-700"
              label="Pipeline Terbuka"
              value={String(stats.totalOpen)}
              sub={`${formatRupiah(stats.totalValueOpen)} potensi nilai`}
            />
            <KpiCard
              icon={Trophy}
              iconWrapClass="bg-emerald-100 text-emerald-700"
              label="Menang"
              value={String(stats.wonCount)}
              sub={`${formatRupiah(stats.wonValue)} nilai dimenangkan`}
            />
            <KpiCard
              icon={Percent}
              iconWrapClass="bg-violet-100 text-violet-700"
              label="Konversi"
              value={`${stats.conversionPct}%`}
              sub="dari lead yang sudah ditutup"
            />
            <KpiCard
              icon={Banknote}
              iconWrapClass="bg-teal-100 text-teal-700"
              label="Rata-rata Deal"
              value={formatRupiah(stats.avgDealSize)}
              sub="per deal yang dimenangkan"
            />
          </div>

          {/* Bagan Funnel */}
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">Bagan Funnel Penjualan</CardTitle>
              <CardDescription>
                Jumlah lead dan akumulasi nilai per tahap; lebar bar proporsional terhadap tahap terbesar.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FunnelChart stats={stats} />
            </CardContent>
          </Card>

          {/* Kanban board */}
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">Kanban Lead per Tahap</CardTitle>
              <CardDescription>
                Geser horizontal untuk melihat semua tahap. Gunakan tombol &quot;Pindah&quot; atau &quot;Nilai&quot; pada kartu lead.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto pb-2">
                <div className="flex min-w-max gap-4">
                  {LEAD_STAGES.map((stage) => (
                    <KanbanColumn
                      key={stage}
                      stage={stage}
                      leads={leadsByStage.get(stage) ?? []}
                      busyId={busyId}
                      onPickStage={handlePickStage}
                      onOpenValue={openValueDialog}
                    />
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Dialog: Tandai Hilang (wajib pilih alasan) */}
          <Dialog open={lostTarget !== null} onOpenChange={(open) => !open && setLostTarget(null)}>
            <DialogContent className="max-w-md rounded-2xl">
              <DialogHeader>
                <DialogTitle>Tandai Lead Hilang</DialogTitle>
                <DialogDescription>
                  {lostTarget ? `${lostTarget.code} — ${lostTarget.subject}` : ""}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="lost-reason">Alasan hilang (wajib)</Label>
                <Select value={lostReason || undefined} onValueChange={setLostReason}>
                  <SelectTrigger id="lost-reason" aria-label="Pilih alasan lead hilang">
                    <SelectValue placeholder="Pilih alasan…" />
                  </SelectTrigger>
                  <SelectContent>
                    {LOST_REASONS.map((reason) => (
                      <SelectItem key={reason} value={reason}>
                        {reason}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button variant="outline" className="rounded-xl" onClick={() => setLostTarget(null)} disabled={busy}>
                  Batal
                </Button>
                <Button variant="destructive" className="rounded-xl" onClick={() => void confirmLost()} disabled={busy || !lostReason}>
                  {busy && <Loader2 className="size-4 animate-spin" />}
                  Tandai Hilang
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Dialog: Atur nilai deal */}
          <Dialog open={valueTarget !== null} onOpenChange={(open) => !open && setValueTarget(null)}>
            <DialogContent className="max-w-md rounded-2xl">
              <DialogHeader>
                <DialogTitle>Atur Nilai Deal</DialogTitle>
                <DialogDescription>
                  {valueTarget ? `${valueTarget.code} — ${valueTarget.subject}` : ""}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="est-value">Estimasi nilai (Rp)</Label>
                <Input
                  id="est-value"
                  type="number"
                  min={0}
                  step={500000}
                  inputMode="numeric"
                  placeholder="mis. 12500000"
                  value={valueInput}
                  onChange={(e) => setValueInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveValue();
                  }}
                  aria-label="Estimasi nilai deal dalam rupiah"
                />
                <p className="text-xs text-muted-foreground">
                  {valueInput.trim() !== "" && valuePreview ? `Pratinjau: ${valuePreview}` : "Masukkan angka tanpa titik, mis. 12500000."}
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" className="rounded-xl" onClick={() => setValueTarget(null)} disabled={busy}>
                  Batal
                </Button>
                <Button className="rounded-xl" onClick={() => void saveValue()} disabled={busy}>
                  {busy && <Loader2 className="size-4 animate-spin" />}
                  Simpan Nilai
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </div>
  );
}
