"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  Calculator,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock3,
  FileText,
  FolderKanban,
  Hourglass,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Timer,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BrandDocDialog } from "@/components/brand-document";
import { BriefDocContent } from "@/components/doc-content";
import { api } from "@/lib/api-client";
import {
  BRAND_LABEL,
  BRIEF_STATUS_BADGE,
  BRIEF_STATUS_LABEL,
  LEAD_STAGE_BADGE,
  LEAD_STAGE_LABEL,
  type BriefDTO,
  type EstimateItemDTO,
  type LeadDTO,
  type LeadStage,
  type SessionUser,
} from "@/lib/crm-types";
import { cn } from "@/lib/utils";

/* ---------------- helper format lokal ---------------- */

const numberFmt = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

function formatRupiah(n: number): string {
  return `Rp ${numberFmt.format(Number.isFinite(n) ? Math.round(n) : 0)}`;
}

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

/** Lewat deadline = tanggal deadline sebelum hari ini & brief belum ditawarkan. */
function isOverdue(deadline: string, status: BriefDTO["status"], nowTs: number | null): boolean {
  if (!nowTs || status === "QUOTED") return false;
  const startOfToday = new Date(nowTs);
  startOfToday.setHours(0, 0, 0, 0);
  return new Date(deadline).getTime() < startOfToday.getTime();
}

const UNITS = ["jam", "hari", "unit", "paket", "orang"] as const;

type EstimateRow = { task: string; qty: string; unit: string; hours: string; cost: string };
const emptyEstimateRow = (): EstimateRow => ({ task: "", qty: "1", unit: "jam", hours: "0", cost: "" });

/* ---------------- flow strip (alur 4 langkah) ---------------- */

const FLOW_TONES = {
  slate: { card: "border-slate-200 bg-slate-50", chip: "bg-slate-200 text-slate-700" },
  amber: { card: "border-amber-200 bg-amber-50", chip: "bg-amber-100 text-amber-800" },
  teal: { card: "border-teal-200 bg-teal-50", chip: "bg-teal-100 text-teal-800" },
  emerald: { card: "border-emerald-200 bg-emerald-50", chip: "bg-emerald-100 text-emerald-800" },
} as const;

type FlowTone = keyof typeof FLOW_TONES;

/* ---------------- kartu brief ---------------- */

function BriefCard({
  brief,
  nowTs,
  canSubmit,
  canEstimate,
  openEstimateId,
  onToggleEstimate,
  onAskSubmit,
  onOpenEstimate,
  onOpenDoc,
}: {
  brief: BriefDTO;
  nowTs: number | null;
  canSubmit: boolean;
  canEstimate: boolean;
  openEstimateId: string | null;
  onToggleEstimate: (estimateId: string) => void;
  onAskSubmit: (brief: BriefDTO) => void;
  onOpenEstimate: (brief: BriefDTO) => void;
  onOpenDoc: (brief: BriefDTO) => void;
}) {
  const lead = brief.lead;
  const overdue = brief.deadline ? isOverdue(brief.deadline, brief.status, nowTs) : false;

  const deliverableLines = brief.deliverables.split("\n").map((s) => s.trim()).filter(Boolean);
  const shownDeliverables = deliverableLines.slice(0, 3);
  const restDeliverables = deliverableLines.length - shownDeliverables.length;

  const refLines = (brief.references ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
  const isUrl = (s: string) => /^https?:\/\//i.test(s) || /^www\./i.test(s);

  const showSubmit = brief.status === "DRAFT" && canSubmit;
  const showEstimate = brief.status !== "QUOTED" && canEstimate;
  const showHint = brief.status === "ESTIMATED" && canSubmit;
  const hasFooter = true; // tombol Dokumen selalu tersedia

  return (
    <Card className="flex flex-col rounded-2xl transition-shadow hover:shadow-md">
      <CardContent className="flex flex-1 flex-col gap-2.5 pt-5">
        {/* kode + status + brand */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-xs font-semibold text-slate-500">{brief.code}</span>
          <Badge variant="outline" className={BRIEF_STATUS_BADGE[brief.status]}>
            {BRIEF_STATUS_LABEL[brief.status]}
          </Badge>
          <Badge variant="outline" className="ml-auto border-stone-200 bg-stone-100 text-stone-700">
            {BRAND_LABEL[brief.brand] ?? brief.brand}
          </Badge>
        </div>

        {/* judul */}
        <p className="text-sm font-bold leading-snug text-slate-900">{brief.title}</p>

        {/* info lead */}
        {lead && (
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
            <span className="font-mono">{lead.code}</span>
            <span aria-hidden="true">·</span>
            <span className="font-medium text-slate-700">{lead.contactName}</span>
            {lead.companyName && (
              <>
                <span aria-hidden="true">·</span>
                <span className="truncate">{lead.companyName}</span>
              </>
            )}
            {lead.stage && (
              <Badge variant="outline" className={cn("px-1.5 py-0 text-[10px]", LEAD_STAGE_BADGE[lead.stage as LeadStage])}>
                {LEAD_STAGE_LABEL[lead.stage as LeadStage]}
              </Badge>
            )}
          </div>
        )}

        {/* tujuan */}
        <p className="line-clamp-2 text-xs leading-relaxed text-slate-600">
          <span className="font-semibold text-slate-800">Tujuan: </span>
          {brief.objective}
        </p>

        {/* deadline */}
        {brief.deadline && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3.5" /> Deadline {formatDate(brief.deadline)}
            </span>
            {overdue && <Badge className="border-rose-200 bg-rose-100 text-rose-700">Lewat deadline</Badge>}
          </div>
        )}

        {/* deliverables (maks 3 baris) */}
        {shownDeliverables.length > 0 && (
          <ul className="space-y-1">
            {shownDeliverables.map((d, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                <span className="min-w-0">{d}</span>
              </li>
            ))}
            {restDeliverables > 0 && (
              <li className="pl-5 text-xs text-muted-foreground">+{restDeliverables} lainnya</li>
            )}
          </ul>
        )}

        {/* referensi */}
        {refLines.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {refLines.map((ref, i) =>
              isUrl(ref) ? (
                <a
                  key={i}
                  href={ref.startsWith("www.") ? `https://${ref}` : ref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline"
                >
                  <Link2 className="size-3" aria-hidden="true" /> Referensi{refLines.length > 1 ? ` ${i + 1}` : ""}
                </a>
              ) : (
                <span key={i} className="inline-flex items-center gap-1 truncate text-xs text-muted-foreground">
                  <Link2 className="size-3 shrink-0" aria-hidden="true" /> {ref}
                </span>
              )
            )}
          </div>
        )}

        {/* estimasi produksi (accordion) */}
        {brief.estimates.map((est) => {
          const open = openEstimateId === est.id;
          return (
            <div key={est.id} className="rounded-xl border border-teal-200 bg-teal-50/70 p-3">
              <button
                type="button"
                onClick={() => onToggleEstimate(est.id)}
                aria-expanded={open}
                className="flex w-full items-center gap-2 text-left"
              >
                <Clock3 className="size-4 shrink-0 text-teal-600" aria-hidden="true" />
                <span className="text-sm font-semibold text-teal-900">
                  Estimasi: {est.totalHours} jam · {formatRupiah(est.totalCost)}
                </span>
                <ChevronDown
                  className={cn("ml-auto size-4 shrink-0 text-teal-600 transition-transform", open && "rotate-180")}
                  aria-hidden="true"
                />
              </button>
              {est.createdByName && <p className="mt-0.5 pl-6 text-[11px] text-teal-700">Dihitung oleh {est.createdByName}</p>}
              {open && (
                <div className="mt-2.5 space-y-1.5 border-t border-teal-200/80 pt-2.5">
                  {est.items.map((item, i) => (
                    <div key={i} className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="min-w-0 flex-1 truncate text-slate-700" title={item.task}>
                        {item.task}
                      </span>
                      <span className="shrink-0 whitespace-nowrap text-muted-foreground">
                        {item.qty} {item.unit} · {item.hours} jam
                      </span>
                      <span className="w-24 shrink-0 text-right font-medium text-teal-900">
                        {formatRupiah(item.qty * item.cost)}
                      </span>
                    </div>
                  ))}
                  {est.notes && <p className="pt-1 text-xs italic text-teal-800/80">{est.notes}</p>}
                </div>
              )}
            </div>
          );
        })}

        {/* aksi per role */}
        {hasFooter && (
          <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
            {brief.projectCode && (
              <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800">
                <FolderKanban className="size-3" aria-hidden="true" /> Proyek: {brief.projectCode}
              </Badge>
            )}
            {showSubmit && (
              <Button size="sm" variant="outline" onClick={() => onAskSubmit(brief)}>
                <Send className="size-3.5" /> Kirim untuk Estimasi
              </Button>
            )}
            {showEstimate && (
              <Button size="sm" onClick={() => onOpenEstimate(brief)}>
                <Calculator className="size-3.5" /> Buat Estimasi
              </Button>
            )}
            {showHint && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-800">
                <CheckCircle2 className="size-3.5" aria-hidden="true" /> Siap dibuatkan penawaran di menu Keuangan
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => onOpenDoc(brief)}
              aria-label={`Buka dokumen ${brief.code}`}
            >
              <FileText className="size-3.5" /> Dokumen
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- view utama ---------------- */

export default function BriefView({ user }: { user: SessionUser }) {
  const [briefs, setBriefs] = useState<BriefDTO[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // "sekarang" dihitung di effect agar aman dari aturan purity saat render
  const [nowTs, setNowTs] = useState<number | null>(null);
  useEffect(() => {
    setNowTs(Date.now());
  }, []);

  // accordion estimasi
  const [openEstimateId, setOpenEstimateId] = useState<string | null>(null);

  // dialog buat brief
  const [createOpen, setCreateOpen] = useState(false);
  const [leadsCache, setLeadsCache] = useState<LeadDTO[] | null>(null);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [formLeadId, setFormLeadId] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formObjective, setFormObjective] = useState("");
  const [formAudience, setFormAudience] = useState("");
  const [formDeliverables, setFormDeliverables] = useState("");
  const [formReferences, setFormReferences] = useState("");
  const [formDeadline, setFormDeadline] = useState("");
  const [formNotes, setFormNotes] = useState("");

  // dialog kirim untuk estimasi
  const [submitTarget, setSubmitTarget] = useState<BriefDTO | null>(null);
  const [submitNote, setSubmitNote] = useState("");

  // dialog buat estimasi
  const [estimateTarget, setEstimateTarget] = useState<BriefDTO | null>(null);
  const [estRows, setEstRows] = useState<EstimateRow[]>([emptyEstimateRow()]);
  const [estNotes, setEstNotes] = useState("");

  // pratinjau dokumen brief (kop surat brand)
  const [docBrief, setDocBrief] = useState<BriefDTO | null>(null);

  const role = user.role;
  const canCreateBrief = role === "OWNER" || role === "MANAGER" || role === "MARKETER";
  const canSubmit = canCreateBrief;
  const canEstimate = role === "PRODUCTION" || role === "OWNER" || role === "MANAGER";

  /* ---------- load ---------- */

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { briefs: data } = await api.briefs();
      setBriefs(data);
    } catch (e) {
      const msg = (e as Error).message || "Gagal memuat data brief";
      setError(msg);
      if (briefs) toast.error(msg);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshData = useCallback(async () => {
    try {
      const { briefs: data } = await api.briefs();
      setBriefs(data);
    } catch (e) {
      toast.error((e as Error).message || "Gagal memuat ulang data");
    }
  }, []);

  /* ---------- aksi kirim brief ---------- */

  async function submitBrief() {
    if (!submitTarget) return;
    setBusy("submit");
    try {
      await api.updateBrief(submitTarget.id, "submit", submitNote.trim() || undefined);
      toast.success(`Brief ${submitTarget.code} dikirim ke tim Produksi untuk estimasi`);
      setSubmitTarget(null);
      setSubmitNote("");
      await refreshData();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  /* ---------- dialog buat brief ---------- */

  function openCreate() {
    setCreateOpen(true);
    if (leadsCache === null) {
      setLeadsLoading(true);
      api
        .leads()
        .then(({ leads }) => setLeadsCache(leads))
        .catch((e) => toast.error((e as Error).message))
        .finally(() => setLeadsLoading(false));
    }
  }

  function resetCreateForm() {
    setFormLeadId("");
    setFormTitle("");
    setFormObjective("");
    setFormAudience("");
    setFormDeliverables("");
    setFormReferences("");
    setFormDeadline("");
    setFormNotes("");
  }

  // lead yang bisa dibuatkan brief: bukan LOST & bukan WON
  const eligibleLeads = (leadsCache ?? []).filter(
    (l) => l.stage !== "LOST" && l.stage !== "WON" && l.status !== "LOST" && l.status !== "WON"
  );

  async function submitCreate() {
    if (!formLeadId) {
      toast.error("Pilih lead terlebih dahulu");
      return;
    }
    const title = formTitle.trim();
    if (!title) {
      toast.error("Judul brief wajib diisi");
      return;
    }
    const objective = formObjective.trim();
    if (!objective) {
      toast.error("Tujuan brief wajib diisi");
      return;
    }
    setBusy("create");
    try {
      const { brief } = await api.createBrief({
        leadId: formLeadId,
        title,
        objective,
        audience: formAudience.trim() || undefined,
        deliverables: formDeliverables.trim() || undefined,
        references: formReferences.trim() || undefined,
        deadline: formDeadline ? new Date(formDeadline).toISOString() : undefined,
        notes: formNotes.trim() || undefined,
      });
      toast.success(`Brief ${brief.code} dibuat — siap dikirim ke tim Produksi`);
      setCreateOpen(false);
      resetCreateForm();
      await refreshData();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  /* ---------- dialog buat estimasi ---------- */

  function openEstimate(brief: BriefDTO) {
    setEstimateTarget(brief);
    setEstRows([emptyEstimateRow()]);
    setEstNotes("");
  }

  const liveHours = estRows.reduce((s, r) => s + (Number(r.hours) || 0), 0);
  const liveCost = estRows.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.cost) || 0), 0);

  async function submitEstimate() {
    const target = estimateTarget;
    if (!target) return;
    const items: EstimateItemDTO[] = estRows
      .map((r) => ({
        task: r.task.trim(),
        qty: Math.max(0, Math.round(Number(r.qty) || 0)),
        unit: r.unit,
        hours: Math.max(0, Math.round(Number(r.hours) || 0)),
        cost: Math.max(0, Math.round(Number(r.cost) || 0)),
      }))
      .filter((it) => it.task && it.qty > 0);
    if (items.length === 0) {
      toast.error("Minimal satu baris pekerjaan valid (nama pekerjaan + qty > 0)");
      return;
    }
    setBusy("estimate");
    try {
      const { estimate } = await api.createEstimate({
        briefId: target.id,
        items,
        notes: estNotes.trim() || undefined,
      });
      toast.success(
        `Estimasi ${target.code} tersimpan — ${estimate.totalHours} jam · ${formatRupiah(estimate.totalCost)}`
      );
      setEstimateTarget(null);
      await refreshData();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  /* ---------- render: error ---------- */

  if (error && !briefs) {
    return (
      <Card className="mx-auto max-w-md border-rose-200">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
            <TriangleAlert className="size-6" />
          </span>
          <div>
            <p className="font-semibold">Gagal memuat data brief</p>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
          <Button onClick={() => void load()}>
            <RefreshCw className="size-4" /> Coba Lagi
          </Button>
        </CardContent>
      </Card>
    );
  }

  /* ---------- render: skeleton ---------- */

  if (loading || !briefs) {
    return (
      <div className="space-y-5">
        <Card>
          <CardContent className="animate-pulse space-y-3 pt-5">
            <div className="h-6 w-56 rounded bg-muted" />
            <div className="h-3 w-80 max-w-full rounded bg-muted" />
          </CardContent>
        </Card>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[62px] animate-pulse rounded-xl bg-muted sm:flex-1" />
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="animate-pulse space-y-3 pt-5">
                <div className="h-3 w-24 rounded bg-muted" />
                <div className="h-7 w-20 rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="animate-pulse space-y-2.5 pt-5">
                <div className="h-3 w-36 rounded bg-muted" />
                <div className="h-4 w-3/4 rounded bg-muted" />
                <div className="h-3 w-1/2 rounded bg-muted" />
                <div className="h-16 rounded-xl bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  /* ---------- data siap ---------- */

  const briefAktifCount = briefs.filter((b) => b.status !== "QUOTED").length; // DRAFT + SUBMITTED + ESTIMATED
  const menungguEstimasiCount = briefs.filter((b) => b.status === "SUBMITTED").length;
  const totalJam = briefs.reduce((s, b) => s + b.estimates.reduce((t, e) => t + e.totalHours, 0), 0);
  const estimatedCount = briefs.filter((b) => b.status === "ESTIMATED").length;
  const readyToQuoteCount = estimatedCount; // ESTIMATED = belum QUOTED

  const flowSteps: { n: number; label: string; count: number; tone: FlowTone }[] = [
    { n: 1, label: "Lead Terpilih", count: briefs.length, tone: "slate" },
    { n: 2, label: "Brief", count: briefs.length, tone: "amber" },
    { n: 3, label: "Estimasi Produksi", count: estimatedCount, tone: "teal" },
    { n: 4, label: "Siap Ditawarkan", count: readyToQuoteCount, tone: "emerald" },
  ];

  const kpis = [
    {
      key: "aktif",
      label: "Brief Aktif",
      value: String(briefAktifCount),
      sub: "Draf + dikirim + ters estimasi",
      icon: FileText,
      iconClass: "bg-slate-100 text-slate-700",
    },
    {
      key: "menunggu",
      label: "Menunggu Estimasi",
      value: String(menungguEstimasiCount),
      sub: menungguEstimasiCount > 0 ? "Segera dihitung tim Produksi" : "Tidak ada antrean estimasi",
      icon: Hourglass,
      iconClass: "bg-amber-100 text-amber-700",
    },
    {
      key: "jam",
      label: "Total Jam Ters Estimasi",
      value: numberFmt.format(totalJam),
      sub: "Akumulasi seluruh estimasi produksi",
      icon: Timer,
      iconClass: "bg-teal-100 text-teal-700",
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header card */}
      <Card className="rounded-2xl">
        <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight">Brief &amp; Estimasi Produksi</h2>
            <p className="text-sm text-muted-foreground">
              Lead terpilih → dibuat Brief → tim Produksi menghitung Estimasi → lalu jadi dasar Penawaran.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {canCreateBrief && (
              <Button size="sm" onClick={openCreate}>
                <Plus className="size-4" /> Buat Brief dari Lead
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn("size-4", loading && "animate-spin")} /> Muat Ulang
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Alur strip */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-1.5" aria-label="Alur Brief dan Estimasi">
        {flowSteps.map((step, i) => (
          <Fragment key={step.n}>
            <div className={cn("flex items-center gap-2.5 rounded-xl border p-3 sm:flex-1", FLOW_TONES[step.tone].card)}>
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
                  FLOW_TONES[step.tone].chip
                )}
              >
                {step.n}
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-600">{step.label}</p>
                <p className="text-lg font-bold leading-tight text-slate-900">{step.count}</p>
              </div>
            </div>
            {i < flowSteps.length - 1 && (
              <ArrowRight className="hidden size-4 shrink-0 text-slate-400 sm:block" aria-hidden="true" />
            )}
          </Fragment>
        ))}
      </div>

      {/* KPI ringkas */}
      <div className="grid gap-3 sm:grid-cols-3">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.key} className="transition-shadow hover:shadow-md">
              <CardContent className="flex items-start justify-between gap-3 pt-5">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm text-muted-foreground">{k.label}</p>
                  <p className="truncate text-xl font-bold tracking-tight sm:text-2xl">{k.value}</p>
                  <p className="text-xs text-muted-foreground">{k.sub}</p>
                </div>
                <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", k.iconClass)}>
                  <Icon className="size-5" aria-hidden="true" />
                </span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Daftar brief */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800">Daftar Brief</h3>
          <p className="text-xs text-muted-foreground">{briefs.length} brief tercatat</p>
        </div>

        {briefs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                <ClipboardList className="size-6" />
              </span>
              <div>
                <p className="font-semibold">Belum ada brief</p>
                <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                  Buat brief dari lead yang sudah terkualifikasi untuk menghubungkan Marketing → Produksi → Keuangan.
                </p>
              </div>
              {canCreateBrief && (
                <Button size="sm" onClick={openCreate}>
                  <Plus className="size-4" /> Buat Brief dari Lead
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="max-h-[680px] overflow-y-auto pr-1">
            <div className="grid gap-3 md:grid-cols-2">
              {briefs.map((brief) => (
                <BriefCard
                  key={brief.id}
                  brief={brief}
                  nowTs={nowTs}
                  canSubmit={canSubmit}
                  canEstimate={canEstimate}
                  openEstimateId={openEstimateId}
                  onToggleEstimate={(id) => setOpenEstimateId((p) => (p === id ? null : id))}
                  onAskSubmit={(b) => {
                    setSubmitTarget(b);
                    setSubmitNote("");
                  }}
                  onOpenEstimate={openEstimate}
                  onOpenDoc={setDocBrief}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Dialog Buat Brief dari Lead */}
      <Dialog open={createOpen} onOpenChange={(o) => !o && setCreateOpen(false)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Buat Brief dari Lead</DialogTitle>
            <DialogDescription>
              Susun brief produksi dari lead yang sudah terkualifikasi. Brief draf bisa dikirim ke tim Produksi untuk
              diestimasi.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="brf-lead">
                Lead <span className="text-rose-500">*</span>
              </Label>
              <Select value={formLeadId} onValueChange={setFormLeadId} disabled={leadsLoading}>
                <SelectTrigger id="brf-lead" className="w-full">
                  <SelectValue placeholder={leadsLoading ? "Memuat daftar lead…" : "Pilih lead…"} />
                </SelectTrigger>
                <SelectContent>
                  {eligibleLeads.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.code} · {l.subject}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!leadsLoading && eligibleLeads.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Belum ada lead yang bisa dibuatkan brief (lead LOST/WON dikecualikan).
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="brf-title">
                Judul Brief <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="brf-title"
                placeholder="mis. Redesign Website Corporate Sinar Jaya"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="brf-objective">
                Tujuan Brief <span className="text-rose-500">*</span>
              </Label>
              <Textarea
                id="brf-objective"
                placeholder="Apa yang ingin dicapai dari pekerjaan ini?"
                value={formObjective}
                onChange={(e) => setFormObjective(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="brf-audience">Audiens (opsional)</Label>
              <Input
                id="brf-audience"
                placeholder="mis. Procurement & manajemen B2B"
                value={formAudience}
                onChange={(e) => setFormAudience(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="brf-deliverables">Deliverables (opsional — satu baris per item)</Label>
              <Textarea
                id="brf-deliverables"
                placeholder={"Desain UI 12 halaman\nDevelopment WordPress custom\nCopywriting"}
                value={formDeliverables}
                onChange={(e) => setFormDeliverables(e.target.value)}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="brf-references">Referensi (opsional)</Label>
                <Input
                  id="brf-references"
                  type="url"
                  placeholder="https://drive.google.com/…"
                  value={formReferences}
                  onChange={(e) => setFormReferences(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="brf-deadline">Deadline (opsional)</Label>
                <Input
                  id="brf-deadline"
                  type="date"
                  value={formDeadline}
                  onChange={(e) => setFormDeadline(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="brf-notes">Catatan (opsional)</Label>
              <Textarea
                id="brf-notes"
                placeholder="Konteks tambahan untuk tim produksi"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Batal
            </Button>
            <Button onClick={() => void submitCreate()} disabled={busy === "create"}>
              {busy === "create" && <Loader2 className="size-4 animate-spin" />} Simpan Brief
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog konfirmasi Kirim untuk Estimasi */}
      <Dialog open={!!submitTarget} onOpenChange={(o) => !o && setSubmitTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Kirim untuk Estimasi</DialogTitle>
            <DialogDescription>
              Brief {submitTarget?.code} — {submitTarget?.title} akan dikirim ke tim Produksi untuk dihitung estimasi
              pengerjaannya.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="submit-note">Catatan untuk tim produksi (opsional)</Label>
            <Textarea
              id="submit-note"
              placeholder="mis. Prioritaskan halaman utama, klien minta review minggu depan"
              value={submitNote}
              onChange={(e) => setSubmitNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitTarget(null)}>
              Batal
            </Button>
            <Button onClick={() => void submitBrief()} disabled={busy === "submit"}>
              {busy === "submit" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Kirim ke
              Produksi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Buat Estimasi */}
      <Dialog open={!!estimateTarget} onOpenChange={(o) => !o && setEstimateTarget(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Buat Estimasi Pengerjaan</DialogTitle>
            <DialogDescription>
              {estimateTarget?.code} — {estimateTarget?.title}
            </DialogDescription>
          </DialogHeader>

          {estimateTarget && (
            <div className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <p className="font-semibold text-slate-800">
                {BRAND_LABEL[estimateTarget.brand] ?? estimateTarget.brand}
                {estimateTarget.lead ? ` · ${estimateTarget.lead.code} · ${estimateTarget.lead.contactName}` : ""}
              </p>
              <p className="line-clamp-2">
                <span className="font-medium">Tujuan: </span>
                {estimateTarget.objective}
              </p>
              {estimateTarget.deadline && (
                <p>
                  <span className="font-medium">Deadline: </span>
                  {formatDate(estimateTarget.deadline)}
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Baris Pekerjaan</Label>
            <div className="hidden grid-cols-[1fr_62px_100px_66px_120px_36px] gap-2 px-0.5 text-xs text-muted-foreground sm:grid">
              <span>Pekerjaan</span>
              <span>Qty</span>
              <span>Satuan</span>
              <span>Jam</span>
              <span>Biaya/Unit (Rp)</span>
              <span />
            </div>
            {estRows.map((row, idx) => (
              <div
                key={idx}
                className="space-y-2 rounded-xl border border-border/70 bg-slate-50/60 p-3 sm:grid sm:grid-cols-[1fr_62px_100px_66px_120px_36px] sm:items-center sm:gap-2 sm:space-y-0 sm:border-0 sm:bg-transparent sm:p-0"
              >
                <Input
                  placeholder={`Pekerjaan ${idx + 1} — mis. Desain UI 12 halaman`}
                  value={row.task}
                  onChange={(e) =>
                    setEstRows((p) => p.map((r, i) => (i === idx ? { ...r, task: e.target.value } : r)))
                  }
                />
                <div className="grid grid-cols-3 gap-2 sm:contents">
                  <Input
                    type="number"
                    min={1}
                    value={row.qty}
                    onChange={(e) =>
                      setEstRows((p) => p.map((r, i) => (i === idx ? { ...r, qty: e.target.value } : r)))
                    }
                    aria-label="Qty"
                  />
                  <Select
                    value={row.unit}
                    onValueChange={(v) => setEstRows((p) => p.map((r, i) => (i === idx ? { ...r, unit: v } : r)))}
                  >
                    <SelectTrigger aria-label="Satuan" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNITS.map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={0}
                    value={row.hours}
                    onChange={(e) =>
                      setEstRows((p) => p.map((r, i) => (i === idx ? { ...r, hours: e.target.value } : r)))
                    }
                    aria-label="Jam kerja"
                  />
                </div>
                <div className="flex items-center gap-2 sm:contents">
                  <Input
                    type="number"
                    min={0}
                    step={1000}
                    placeholder="0"
                    value={row.cost}
                    onChange={(e) =>
                      setEstRows((p) => p.map((r, i) => (i === idx ? { ...r, cost: e.target.value } : r)))
                    }
                    aria-label="Biaya per unit"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="sm:hidden"
                    disabled={estRows.length <= 1}
                    onClick={() => setEstRows((p) => p.filter((_, i) => i !== idx))}
                    aria-label="Hapus baris"
                  >
                    <Trash2 className="size-4 text-rose-500" />
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="hidden sm:inline-flex"
                  disabled={estRows.length <= 1}
                  onClick={() => setEstRows((p) => p.filter((_, i) => i !== idx))}
                  aria-label="Hapus baris"
                >
                  <Trash2 className="size-4 text-rose-500" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEstRows((p) => [...p, emptyEstimateRow()])}
            >
              <Plus className="size-3.5" /> Tambah Baris
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="est-notes">Catatan (opsional)</Label>
            <Textarea
              id="est-notes"
              placeholder="mis. Butuh 1 desainer + 1 programmer, durasi 3 minggu"
              value={estNotes}
              onChange={(e) => setEstNotes(e.target.value)}
            />
          </div>

          {/* Total live */}
          <div className="space-y-1 rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Jam Kerja</span>
              <span className="font-semibold text-teal-900">{numberFmt.format(liveHours)} jam</span>
            </div>
            <div className="flex justify-between border-t border-teal-200 pt-2">
              <span className="font-semibold">Total Biaya Produksi</span>
              <span className="font-bold text-teal-900">{formatRupiah(liveCost)}</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEstimateTarget(null)}>
              Batal
            </Button>
            <Button onClick={() => void submitEstimate()} disabled={busy === "estimate"}>
              {busy === "estimate" && <Loader2 className="size-4 animate-spin" />} Simpan Estimasi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pratinjau Dokumen Brief (kop surat brand) */}
      <BrandDocDialog
        open={!!docBrief}
        onOpenChange={(o) => !o && setDocBrief(null)}
        brandKey={docBrief?.brand ?? "unimasi"}
        docLabel="BRIEF PROYEK"
        docNumber={docBrief?.code ?? ""}
        dateIso={docBrief?.createdAt ?? new Date().toISOString()}
        toName={docBrief?.lead?.contactName}
        toCompany={docBrief?.lead?.companyName}
        signatureName={docBrief?.createdByName}
      >
        {docBrief ? <BriefDocContent b={docBrief} /> : null}
      </BrandDocDialog>
    </div>
  );
}
