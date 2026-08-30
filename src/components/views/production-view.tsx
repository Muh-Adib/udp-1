"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Circle,
  CircleDashed,
  ClipboardList,
  Download,
  ExternalLink,
  Factory,
  FileText,
  FolderOpen,
  Gauge,
  Info,
  KeyRound,
  Link2,
  ListChecks,
  ListPlus,
  Loader2,
  Plus,
  RefreshCw,
  ReceiptText,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { SecureLinkDialog } from "@/components/secure-link-dialog";
import { api } from "@/lib/api-client";
import {
  BRAND_LABEL,
  PROJECT_STATUS_BADGE,
  PROJECT_STATUS_LABEL,
  type DeliverableDTO,
  type MilestoneDTO,
  type OverviewStats,
  type ProductionStats,
  type ProjectDTO,
  type ProjectStatus,
  type SecureTargetType,
  type SessionUser,
} from "@/lib/crm-types";
import { cn } from "@/lib/utils";

type MilestoneStatus = MilestoneDTO["status"];

type DeliverableWithProject = DeliverableDTO & { projectCode: string; projectName: string };

/** Target tetap secure link untuk satu deliverable produksi. */
interface SecureTarget {
  targetType: SecureTargetType;
  targetId: string;
  title?: string;
  projectId?: string;
  label?: string;
}

interface DeliverableGroup {
  projectId: string;
  code: string;
  name: string;
  status: ProjectStatus | null;
  items: DeliverableWithProject[];
}

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

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const rpFmt = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" });

function fmtRp(n: number): string {
  return rpFmt.format(n);
}

function fmtDate(iso?: string | null): string {
  return iso ? dateFmt.format(new Date(iso)) : "—";
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** Tanggal relatif id-ID (butuh `now` dari state agar purity-safe saat render). */
function timeAgoId(iso: string, now: number): string {
  if (!now) return fmtDate(iso);
  const diff = now - new Date(iso).getTime();
  if (diff < 60_000) return "baru saja";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} hari lalu`;
  return fmtDate(iso);
}

function groupDeliverables(list: DeliverableWithProject[], projects: ProjectDTO[]): DeliverableGroup[] {
  const projById = new Map(projects.map((p) => [p.id, p]));
  const groups: DeliverableGroup[] = [];
  for (const d of list) {
    let g = groups.find((x) => x.projectId === d.projectId);
    if (!g) {
      const proj = projById.get(d.projectId);
      g = {
        projectId: d.projectId,
        code: d.projectCode,
        name: d.projectName,
        status: proj?.status ?? null,
        items: [],
      };
      groups.push(g);
    }
    g.items.push(d);
  }
  return groups;
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
      <SkeletonBlock className="h-10 w-full sm:w-72" />
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

/** Baris deliverable dipakai bersama: overview file & detail proyek. */
function DeliverableRow({
  d,
  nowMs,
  canDelete,
  canShareSecure,
  busy,
  onRemove,
  onShareSecure,
}: {
  d: DeliverableDTO;
  nowMs: number;
  canDelete: boolean;
  canShareSecure: boolean;
  busy: boolean;
  onRemove: (d: DeliverableDTO) => void;
  onShareSecure: (d: DeliverableDTO) => void;
}) {
  const Icon = d.type === "LINK" ? Link2 : FileText;
  const iconBox = d.type === "LINK" ? "bg-amber-100 text-amber-600" : "bg-teal-100 text-teal-600";
  return (
    <div className="flex flex-col gap-2.5 px-4 py-3 sm:flex-row sm:items-start sm:gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", iconBox)}>
          <Icon className="size-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-bold text-slate-900">{d.name}</p>
          {d.type === "FILE" && (d.fileName || d.sizeLabel) && (
            <p className="truncate text-xs text-muted-foreground">
              {[d.fileName, d.sizeLabel].filter(Boolean).join(" · ")}
            </p>
          )}
          {d.note && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{d.note}</p>}
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            {d.milestoneLabel && (
              <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                {d.milestoneLabel}
              </Badge>
            )}
            <span>
              oleh {d.uploadedByName} · {timeAgoId(d.createdAt, nowMs)}
            </span>
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 sm:shrink-0 sm:self-start">
        {d.type === "LINK" ? (
          <Button asChild size="sm" variant="outline">
            <a href={d.url ?? "#"} target="_blank" rel="noreferrer" aria-label={`Buka tautan ${d.name}`}>
              <ExternalLink className="size-3.5" /> Buka Tautan
            </a>
          </Button>
        ) : (
          <Button asChild size="sm" variant="outline">
            <a href={`/api/deliverables/${d.id}/download`} download aria-label={`Unduh ${d.name}`}>
              <Download className="size-3.5" /> Unduh
            </a>
          </Button>
        )}
        {canShareSecure && (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Kirim secure link untuk ${d.name}`}
            className="text-teal-700 hover:bg-teal-50 hover:text-teal-800"
            onClick={() => onShareSecure(d)}
          >
            <KeyRound className="size-3.5" aria-hidden />
          </Button>
        )}
        {canDelete && (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Hapus ${d.name}`}
            className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
            disabled={busy}
            onClick={() => onRemove(d)}
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Trash2 className="size-3.5" aria-hidden />}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Box info brief proyek — slate, objective line-clamp + expand sederhana. */
function BriefBox({ brief }: { brief: NonNullable<ProjectDTO["brief"]> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-start gap-2">
        <ClipboardList className="mt-0.5 size-4 shrink-0 text-slate-500" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-800">
            Brief {brief.code}: {brief.title}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
            <CalendarDays className="size-3 shrink-0" aria-hidden />
            Deadline: {fmtDate(brief.deadline)}
          </p>
          {brief.objective && (
            <>
              <p className={cn("mt-1 text-xs leading-relaxed text-slate-600", !open && "line-clamp-2")}>
                {brief.objective}
              </p>
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                className="mt-0.5 cursor-pointer text-[11px] font-medium text-teal-700 hover:text-teal-800 hover:underline"
              >
                {open ? "Sembunyikan" : "Selengkapnya"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   DETAIL PROYEK — drill-down dari daftar proyek.
   Semua pekerjaan produksi dilakukan DI SINI:
   toggle milestone, kirim file/link per milestone, lihat brief.
   ========================================================= */
function ProjectDetailView({
  project,
  user,
  nowMs,
  busyMsKey,
  busyDelKey,
  busyMsDelId,
  canToggleMilestone,
  canChangeStatus,
  canSendDeliverable,
  canShareSecure,
  onBack,
  onCycleMilestone,
  onCreateMilestone,
  onRemoveMilestone,
  onChangeStatus,
  onRemoveDeliverable,
  onOpenDialog,
  onSecureCreated,
}: {
  project: ProjectDTO;
  user: SessionUser;
  nowMs: number;
  busyMsKey: string | null;
  busyDelKey: string | null;
  busyMsDelId: string | null;
  canToggleMilestone: boolean;
  canChangeStatus: boolean;
  canSendDeliverable: boolean;
  canShareSecure: boolean;
  onBack: () => void;
  onCycleMilestone: (p: ProjectDTO, ms: MilestoneDTO) => void;
  onCreateMilestone: (input: { title: string; weight?: number; dueDate?: string }) => Promise<boolean>;
  onRemoveMilestone: (ms: MilestoneDTO) => void;
  onChangeStatus: (p: ProjectDTO, s: ProjectStatus) => void;
  onRemoveDeliverable: (d: DeliverableDTO) => void;
  onOpenDialog: (projectId: string, milestoneLabel?: string) => void;
  onSecureCreated: () => void;
}) {
  const isLate = Boolean(project.dueDate) && project.status !== "DONE" && new Date(project.dueDate!).getTime() < nowMs;
  const msDone = project.milestones.filter((m) => m.status === "DONE").length;
  const msTotal = project.milestones.length;

  // Kelompokkan deliverable per milestone (urutan milestone), sisanya "Tanpa milestone".
  const perMilestone = project.milestones.map((ms) => ({
    ms,
    items: project.deliverables.filter((d) => d.milestoneLabel === ms.title),
  }));
  const milestoneTitles = new Set(project.milestones.map((m) => m.title));
  const loose = project.deliverables.filter((d) => !d.milestoneLabel || !milestoneTitles.has(d.milestoneLabel));

  const canDeleteDeliverable = (d: DeliverableDTO) =>
    ["OWNER", "MANAGER"].includes(user.role) || d.uploadedByName === user.name;

  // Hapus milestone hanya OWNER/MANAGER (MARKETER/PRODUCTION/FINANCE/CLIENT tidak melihat tombol).
  const canDeleteMilestone = ["OWNER", "MANAGER"].includes(user.role);

  // ---- dialog tambah milestone ----
  const [msDlgOpen, setMsDlgOpen] = useState(false);
  const [msSubmitting, setMsSubmitting] = useState(false);
  const [msTitle, setMsTitle] = useState("");
  const [msWeight, setMsWeight] = useState("10");
  const [msDue, setMsDue] = useState("");

  // ---- secure link: SATU instance dialog untuk semua deliverable proyek ini ----
  const [secureOpen, setSecureOpen] = useState(false);
  const [secureTarget, setSecureTarget] = useState<SecureTarget | null>(null);

  function openSecure(d: DeliverableDTO) {
    setSecureTarget({ targetType: "DELIVERABLE", targetId: d.id, title: d.name, projectId: d.projectId, label: d.name });
    setSecureOpen(true);
  }

  function openMilestoneDialog() {
    setMsTitle("");
    setMsWeight("10");
    setMsDue("");
    setMsDlgOpen(true);
  }

  async function submitMilestone() {
    const title = msTitle.trim();
    if (!title) {
      toast.error("Isi judul milestone terlebih dahulu");
      return;
    }
    const weightNum = Number(msWeight);
    const weight =
      msWeight.trim() !== "" && Number.isFinite(weightNum)
        ? Math.min(100, Math.max(0, Math.round(weightNum)))
        : undefined;
    const dueDate = msDue ? new Date(msDue).toISOString() : undefined;
    setMsSubmitting(true);
    try {
      const ok = await onCreateMilestone({ title, weight, dueDate });
      if (!ok) return; // gagal → dialog tetap terbuka, input tidak hilang
      setMsDlgOpen(false);
      setMsTitle("");
      setMsWeight("10");
      setMsDue("");
    } finally {
      setMsSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header detail + tombol kembali */}
      <Card className="rounded-2xl">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2">
              <Button
                size="icon"
                variant="outline"
                aria-label="Kembali ke daftar proyek"
                onClick={onBack}
                className="mt-0.5 shrink-0"
              >
                <ArrowLeft className="size-4" aria-hidden />
              </Button>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {project.code}
                  </Badge>
                  <Badge variant="outline" className={PROJECT_STATUS_BADGE[project.status]}>
                    {PROJECT_STATUS_LABEL[project.status]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{BRAND_LABEL[project.brand] ?? project.brand}</span>
                </div>
                <h3 className="mt-1 text-base font-bold text-slate-900 sm:text-lg">{project.name}</h3>
              </div>
            </div>
            {canChangeStatus && (
              <Select
                value={project.status}
                onValueChange={(v) => void onChangeStatus(project, v as ProjectStatus)}
              >
                <SelectTrigger className="h-8 w-[150px] shrink-0" aria-label={`Ubah status proyek ${project.code}`}>
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
              <span className="text-muted-foreground">
                Progress proyek · {msDone}/{msTotal} milestone selesai
              </span>
              <span className="font-semibold tabular-nums text-slate-700">{project.progress}%</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${project.progress}%` }} />
            </div>
          </div>

          {/* Meta */}
          <div className="grid gap-1.5 text-xs text-muted-foreground sm:grid-cols-2">
            <span className="flex items-center gap-1.5">
              <Wallet className="size-3.5 shrink-0" aria-hidden />
              Budget: <span className="font-medium tabular-nums text-slate-700">{fmtRp(project.budget)}</span>
            </span>
            <span className="flex min-w-0 items-center gap-1.5">
              <Building2 className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{project.companyName ?? "—"}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-3.5 shrink-0" aria-hidden />
              Deadline: {fmtDate(project.dueDate)}
              {isLate && (
                <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">
                  Terlambat
                </Badge>
              )}
            </span>
            <span className="flex items-center gap-1.5">
              <ReceiptText className="size-3.5 shrink-0" aria-hidden />
              Terbit invoice: <span className="font-medium tabular-nums text-slate-700">{fmtRp(project.billedAmount)}</span>
            </span>
          </div>

          {project.brief && <BriefBox brief={project.brief} />}
        </CardContent>
      </Card>

      {/* Milestone & Deliverable — inti alur kerja produksi */}
      <Card className="rounded-2xl">
        <CardHeader className="flex flex-col gap-2 px-5 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Milestone &amp; Deliverable</CardTitle>
            <CardDescription>
              Klik milestone untuk ubah status, lalu kirim file/tautan langsung pada milestone terkait.
            </CardDescription>
          </div>
          {(canSendDeliverable || canToggleMilestone) && (
            <div className="flex flex-col gap-2 sm:flex-row">
              {canSendDeliverable && (
                <Button size="sm" onClick={() => onOpenDialog(project.id)}>
                  <Plus className="size-4" aria-hidden /> Tambah File / Tautan
                </Button>
              )}
              {canToggleMilestone && (
                <Button size="sm" variant="outline" onClick={openMilestoneDialog}>
                  <ListPlus className="size-4" aria-hidden /> Tambah Milestone
                </Button>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-3 px-5 pb-5">
          {msTotal === 0 && (
            <p className="rounded-xl border border-dashed px-3 py-3 text-center text-xs text-muted-foreground">
              Belum ada milestone pada proyek ini.
            </p>
          )}

          {perMilestone.map(({ ms, items }) => {
            const Icon = MS_ICON[ms.status];
            const busy = busyMsKey === `${project.id}:${ms.id}`;
            const next = NEXT_MS[ms.status];
            return (
              <div key={ms.id} className="overflow-hidden rounded-xl border">
                <div className="flex flex-wrap items-center gap-2 border-b bg-slate-50/70 px-3 py-2">
                  {canToggleMilestone ? (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={ms.status === "DONE"}
                      aria-label={`Milestone ${ms.title}, status ${MS_LABEL[ms.status]}. Klik untuk ubah menjadi ${MS_LABEL[next]}`}
                      disabled={busy}
                      onClick={() => void onCycleMilestone(project, ms)}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md py-1 text-left text-xs transition-colors hover:bg-accent/60 disabled:opacity-60"
                    >
                      {busy ? (
                        <Loader2 className="size-4 shrink-0 animate-spin text-slate-400" aria-hidden />
                      ) : (
                        <Icon className={cn("size-4 shrink-0", MS_ICON_CLASS[ms.status])} aria-hidden />
                      )}
                      <span className={cn("min-w-0 flex-1 font-medium text-slate-800 sm:truncate", ms.status === "DONE" && "text-muted-foreground line-through")}>
                        {ms.title}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "shrink-0 px-1.5 py-0 text-[10px]",
                          ms.status === "DONE" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                          ms.status === "IN_PROGRESS" && "border-amber-200 bg-amber-50 text-amber-700"
                        )}
                      >
                        {MS_LABEL[ms.status]}
                      </Badge>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{ms.weight}%</span>
                    </button>
                  ) : (
                    <div className="flex min-w-0 flex-1 items-center gap-2 text-xs">
                      <Icon className={cn("size-4 shrink-0", MS_ICON_CLASS[ms.status])} aria-hidden />
                      <span className={cn("min-w-0 flex-1 font-medium text-slate-800 sm:truncate", ms.status === "DONE" && "text-muted-foreground line-through")}>
                        {ms.title}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{ms.weight}%</span>
                    </div>
                  )}
                  {items.length > 0 && (
                    <Badge variant="outline" className="shrink-0 border-teal-200 bg-teal-50 px-1.5 py-0 text-[10px] text-teal-700">
                      {items.length} file
                    </Badge>
                  )}
                  {canSendDeliverable && (
                    <Button
                      size="icon-sm"
                      variant="outline"
                      aria-label={`Tambah file atau tautan untuk milestone ${ms.title}`}
                      className="shrink-0"
                      onClick={() => onOpenDialog(project.id, ms.title)}
                    >
                      <Plus className="size-3.5" aria-hidden />
                    </Button>
                  )}
                  {canDeleteMilestone && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Hapus milestone ${ms.title}`}
                      className="shrink-0 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                      disabled={busyMsDelId === ms.id}
                      onClick={() => onRemoveMilestone(ms)}
                    >
                      {busyMsDelId === ms.id ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Trash2 className="size-3.5" aria-hidden />
                      )}
                    </Button>
                  )}
                </div>
                {items.length > 0 ? (
                  <div className="divide-y">
                    {items.map((d) => (
                      <DeliverableRow
                        key={d.id}
                        d={d}
                        nowMs={nowMs}
                        canDelete={canDeleteDeliverable(d)}
                        canShareSecure={canShareSecure}
                        busy={busyDelKey === d.id}
                        onRemove={onRemoveDeliverable}
                        onShareSecure={openSecure}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="px-4 py-2.5 text-xs text-muted-foreground">
                    Belum ada file/tautan untuk milestone ini.
                    {canSendDeliverable && " Klik tombol + di atas untuk menambahkan."}
                  </p>
                )}
              </div>
            );
          })}

          {/* Deliverable tanpa milestone */}
          {loose.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-dashed">
              <div className="flex items-center justify-between border-b bg-stone-50/70 px-3 py-2">
                <span className="text-xs font-medium text-slate-600">Tanpa milestone</span>
                <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                  {loose.length} file
                </Badge>
              </div>
              <div className="divide-y">
                {loose.map((d) => (
                  <DeliverableRow
                    key={d.id}
                    d={d}
                    nowMs={nowMs}
                    canDelete={canDeleteDeliverable(d)}
                    canShareSecure={canShareSecure}
                    busy={busyDelKey === d.id}
                    onRemove={onRemoveDeliverable}
                    onShareSecure={openSecure}
                  />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog Tambah Milestone — label selalu tampil di semua breakpoint */}
      <Dialog open={msDlgOpen} onOpenChange={setMsDlgOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah Milestone</DialogTitle>
            <DialogDescription>Milestone baru menambah tahapan pekerjaan proyek ini.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ms-title">Judul milestone</Label>
              <Input
                id="ms-title"
                value={msTitle}
                onChange={(e) => setMsTitle(e.target.value)}
                placeholder="mis. Desain Konsep 3D"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ms-weight">Bobot (%)</Label>
              <Input
                id="ms-weight"
                type="number"
                min={0}
                max={100}
                value={msWeight}
                onChange={(e) => setMsWeight(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Total bobot semua milestone menjadi 100% progress.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ms-due">Tenggat (opsional)</Label>
              <Input id="ms-due" type="date" value={msDue} onChange={(e) => setMsDue(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMsDlgOpen(false)} disabled={msSubmitting}>
              Batal
            </Button>
            <Button onClick={() => void submitMilestone()} disabled={msSubmitting || !msTitle.trim()}>
              {msSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ListPlus className="size-4" aria-hidden />}
              Tambah Milestone
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Secure link — satu instance untuk semua deliverable proyek ini */}
      <SecureLinkDialog open={secureOpen} onOpenChange={setSecureOpen} target={secureTarget} onCreated={onSecureCreated} />
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

  // ---- role gating ----
  const canToggleMilestone = ["OWNER", "MANAGER", "MARKETER", "PRODUCTION"].includes(user.role);
  const canChangeStatus = ["OWNER", "MANAGER", "MARKETER"].includes(user.role);
  const canSendDeliverable = ["OWNER", "MANAGER", "MARKETER", "PRODUCTION"].includes(user.role);
  // Secure link: semua role internal (bukan CLIENT)
  const canShareSecure = ["OWNER", "MANAGER", "MARKETER", "FINANCE", "PRODUCTION"].includes(user.role);
  // Chart gabungan hanya utk role yang diizinkan API /api/reports/overview
  const canSeeOverview = ["OWNER", "MANAGER", "FINANCE"].includes(user.role);

  // ---- tab + drill-down detail proyek ----
  const [tab, setTab] = useState("proyek");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ---- deliverables (lazy load saat tab pertama dibuka, cache di state) ----
  const [deliverables, setDeliverables] = useState<DeliverableWithProject[] | null>(null);
  const [delLoading, setDelLoading] = useState(false);
  const [delFailed, setDelFailed] = useState(false);
  const [busyDelKey, setBusyDelKey] = useState<string | null>(null);
  const [msBusyId, setMsBusyId] = useState<string | null>(null); // milestone yang sedang dihapus

  // ---- secure link (tab File & Google Drive) — satu instance dialog ----
  const [secureOpen, setSecureOpen] = useState(false);
  const [secureTarget, setSecureTarget] = useState<SecureTarget | null>(null);

  // ---- dialog kirim file / link ----
  const [dlgOpen, setDlgOpen] = useState(false);
  const [mode, setMode] = useState<"LINK" | "FILE">("LINK");
  const [fProjectId, setFProjectId] = useState("");
  const [fProjectLocked, setFProjectLocked] = useState(false); // dibuka dari detail proyek → proyek terkunci
  const [fName, setFName] = useState("");
  const [fUrl, setFUrl] = useState("");
  const [fMilestone, setFMilestone] = useState("none");
  const [fNote, setFNote] = useState("");
  const [fFile, setFFile] = useState<File | null>(null);
  const [urlErr, setUrlErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Waktu "sekarang" dihitung di efek (react-hooks/purity: Date.now tidak boleh dipanggil saat render)
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    setNowMs(Date.now());
  }, [projects, deliverables]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, pj, ov] = await Promise.all([
        api.productionStats(),
        api.projects(),
        canSeeOverview ? api.overviewStats().catch(() => null) : Promise.resolve(null),
      ]);
      setStats(s.stats);
      setProjects(pj.projects);
      setOverview(ov ? ov.stats : null);
      setFailed(false);
    } catch (e) {
      toast.error((e as Error).message || "Gagal memuat data produksi");
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [canSeeOverview]);

  const fetchDeliverables = useCallback(async () => {
    setDelLoading(true);
    setDelFailed(false);
    try {
      const r = await api.deliverables();
      setDeliverables(r.deliverables as DeliverableWithProject[]);
    } catch (e) {
      toast.error((e as Error).message || "Gagal memuat file produksi");
      setDelFailed(true);
    } finally {
      setDelLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Lazy-load tab File & Google Drive saat pertama kali dibuka
  useEffect(() => {
    if (tab === "files" && deliverables === null && !delLoading && !delFailed) {
      void fetchDeliverables();
    }
  }, [tab, deliverables, delLoading, delFailed, fetchDeliverables]);

  function reloadAll() {
    void load();
    if (deliverables !== null) void fetchDeliverables();
  }

  /** Buka dialog deliverable. Dari detail proyek → proyek terkunci (+ milestone opsional terisi). */
  function openDeliverableDialog(projectId: string | null, milestoneLabel?: string) {
    setMode("LINK");
    setFName("");
    setFUrl("");
    setFMilestone(milestoneLabel ?? "none");
    setFNote("");
    setFFile(null);
    setUrlErr(null);
    if (projectId) {
      setFProjectId(projectId);
      setFProjectLocked(true);
    } else {
      setFProjectId("");
      setFProjectLocked(false);
    }
    setDlgOpen(true);
  }

  /** Buka secure link utk satu deliverable — dipakai baris di tab File & Google Drive. */
  function openSecureDialogFor(d: DeliverableDTO) {
    setSecureTarget({ targetType: "DELIVERABLE", targetId: d.id, title: d.name, projectId: d.projectId, label: d.name });
    setSecureOpen(true);
  }

  /** Tambah milestone manual — return true bila sukses (dialog bisa menutup & reset). */
  async function createMilestone(
    project: ProjectDTO,
    input: { title: string; weight?: number; dueDate?: string }
  ): Promise<boolean> {
    try {
      await api.createMilestone(project.id, input);
      toast.success(`Milestone "${input.title}" ditambahkan`);
      await load(); // refresh list & detail sekaligus
      return true;
    } catch (e) {
      toast.error((e as Error).message || "Gagal menambah milestone");
      return false;
    }
  }

  async function removeMilestone(project: ProjectDTO, ms: MilestoneDTO) {
    if (!window.confirm(`Hapus milestone "${ms.title}"? File/tautan terkait tetap tersimpan di 'Tanpa milestone'.`)) return;
    setMsBusyId(ms.id);
    try {
      await api.deleteMilestone(ms.id);
      toast.success(`Milestone "${ms.title}" dihapus`);
      await load(); // refresh list & detail sekaligus
    } catch (e) {
      toast.error((e as Error).message || "Gagal menghapus milestone");
    } finally {
      setMsBusyId(null);
    }
  }

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

  async function removeDeliverable(d: DeliverableDTO) {
    setBusyDelKey(d.id);
    try {
      await api.deleteDeliverable(d.id);
      toast.success(`"${d.name}" dihapus`);
      // refresh overview file + proyek (deliverable ikut payload projects)
      await Promise.all([fetchDeliverables(), load()]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyDelKey(null);
    }
  }

  async function submitDeliverable() {
    if (!fProjectId) {
      toast.error("Pilih proyek tujuan terlebih dahulu");
      return;
    }
    if (!fName.trim()) {
      toast.error("Isi nama deliverable terlebih dahulu");
      return;
    }
    if (mode === "LINK" && !/^https?:\/\/.+/i.test(fUrl.trim())) {
      setUrlErr("URL harus diawali http:// atau https://");
      return;
    }
    if (mode === "FILE") {
      if (!fFile) {
        toast.error("Pilih file yang akan diunggah");
        return;
      }
      if (fFile.size > MAX_UPLOAD_BYTES) {
        toast.error("Ukuran file maksimal 10 MB — gunakan link Google Drive untuk file besar");
        return;
      }
    }

    const milestoneLabel = fMilestone !== "none" ? fMilestone : undefined;
    setSubmitting(true);
    try {
      if (mode === "LINK") {
        await api.addDeliverableLink({
          projectId: fProjectId,
          name: fName.trim(),
          url: fUrl.trim(),
          note: fNote.trim() || undefined,
          milestoneLabel,
        });
      } else if (fFile) {
        const fd = new FormData();
        fd.set("projectId", fProjectId);
        fd.set("name", fName.trim());
        fd.set("note", fNote.trim());
        if (milestoneLabel) fd.set("milestoneLabel", milestoneLabel);
        fd.set("file", fFile);
        await api.uploadDeliverableFile(fd);
      }
      const code = projects?.find((p) => p.id === fProjectId)?.code ?? "proyek";
      toast.success(mode === "LINK" ? `Tautan terkirim ke ${code}` : `File terkirim ke ${code}`);
      setDlgOpen(false);
      setMode("LINK");
      setFName("");
      setFUrl("");
      setFMilestone("none");
      setFNote("");
      setFFile(null);
      setUrlErr(null);
      setFProjectLocked(false);
      // refresh overview file + proyek agar detail proyek langsung menampilkan item baru
      await Promise.all([fetchDeliverables(), load()]);
    } catch (e) {
      toast.error((e as Error).message || "Gagal mengirim deliverable");
    } finally {
      setSubmitting(false);
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

  if (!stats || !projects) return <ProductionSkeleton />;

  const selectedProject = selectedId ? (projects.find((p) => p.id === selectedId) ?? null) : null;

  // ---- agregat chart gabungan (bila overview tersedia) ----
  const monthly = overview?.monthly ?? [];
  const maxRevenue = Math.max(...monthly.map((m) => m.revenue), 1);
  const maxDone = Math.max(...monthly.map((m) => m.projectsCompleted), 1);
  const maxStatusCount = Math.max(...stats.byStatus.map((s) => s.count), 1);

  // ---- agregat deliverables ----
  const delList = deliverables ?? [];
  const linkCount = delList.filter((d) => d.type === "LINK").length;
  const fileCount = delList.filter((d) => d.type === "FILE").length;
  const delProjectCount = new Set(delList.map((d) => d.projectId)).size;
  const deliverableGroups = deliverables ? groupDeliverables(deliverables, projects) : [];

  const delSummary = [
    { label: "Total File / Tautan", value: delList.length, icon: FolderOpen, iconBox: "bg-slate-100 text-slate-600" },
    { label: "Proyek dengan File", value: delProjectCount, icon: Factory, iconBox: "bg-emerald-100 text-emerald-600" },
    { label: "Tautan (LINK)", value: linkCount, icon: Link2, iconBox: "bg-amber-100 text-amber-600" },
    { label: "File Unggahan", value: fileCount, icon: FileText, iconBox: "bg-teal-100 text-teal-600" },
  ];

  const kpis = [
    { label: "Proyek Aktif", value: String(stats.activeCount), icon: Factory, iconBox: "bg-slate-100 text-slate-600" },
    { label: "Selesai", value: String(stats.doneCount), icon: CheckCircle2, iconBox: "bg-emerald-100 text-emerald-600" },
    { label: "Progress Rata-rata", value: `${stats.avgProgress}%`, icon: Gauge, iconBox: "bg-teal-100 text-teal-600" },
    { label: "Milestone Selesai", value: `${stats.milestoneDonePct}%`, icon: ListChecks, iconBox: "bg-amber-100 text-amber-600" },
  ];

  const segBtnCls = (active: boolean) =>
    cn(
      "flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors",
      active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
    );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Produksi</h2>
          <p className="text-sm text-muted-foreground">
            Proyek, milestone, file produksi, dan keterkaitan produksi dengan keuangan.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={reloadAll} disabled={loading || delLoading}>
          <RefreshCw className={cn("size-3.5", (loading || delLoading) && "animate-spin")} /> Muat ulang
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="gap-5">
        <TabsList className="h-10 w-full rounded-xl bg-slate-100 p-1 sm:w-auto">
          <TabsTrigger value="proyek" className="gap-1.5 px-3 sm:px-4">
            <Factory className="size-4" aria-hidden /> Proyek
          </TabsTrigger>
          <TabsTrigger value="files" className="gap-1.5 px-3 sm:px-4">
            <FolderOpen className="size-4" aria-hidden /> File &amp; Google Drive
          </TabsTrigger>
        </TabsList>

        {/* ================= TAB PROYEK ================= */}
        <TabsContent value="proyek" className="mt-0 space-y-6">
          {selectedProject ? (
            /* ---------- DETAIL PROYEK (drill-down) ---------- */
            <ProjectDetailView
              project={selectedProject}
              user={user}
              nowMs={nowMs}
              busyMsKey={busyKey}
              busyDelKey={busyDelKey}
              busyMsDelId={msBusyId}
              canToggleMilestone={canToggleMilestone}
              canChangeStatus={canChangeStatus}
              canSendDeliverable={canSendDeliverable}
              canShareSecure={canShareSecure}
              onBack={() => setSelectedId(null)}
              onCycleMilestone={(p, ms) => void cycleMilestone(p, ms)}
              onCreateMilestone={(input) => createMilestone(selectedProject, input)}
              onRemoveMilestone={(ms) => void removeMilestone(selectedProject, ms)}
              onChangeStatus={(p, s) => void changeStatus(p, s)}
              onRemoveDeliverable={(d) => void removeDeliverable(d)}
              onOpenDialog={(pid, ms) => openDeliverableDialog(pid, ms)}
              onSecureCreated={reloadAll}
            />
          ) : (
            /* ---------- DAFTAR PROYEK ---------- */
            <>
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

              {/* Bagan gabungan Keuangan × Produksi (hanya OWNER/MANAGER/FINANCE) */}
              {overview && (
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
                      {monthly.map((m) => {
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
              )}

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
                              {canChangeStatus && (
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

                            {/* Meta (budget read-only untuk semua role, termasuk PRODUCTION) */}
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

                            {/* Info brief */}
                            {p.brief && <BriefBox brief={p.brief} />}

                            {/* Ringkas milestone */}
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
                                    const fileCountMs = p.deliverables.filter((d) => d.milestoneLabel === ms.title).length;
                                    if (!canToggleMilestone) {
                                      return (
                                        <div key={ms.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                                          <Icon className={cn("size-4 shrink-0", MS_ICON_CLASS[ms.status])} aria-hidden />
                                          <span className={cn("min-w-0 flex-1 sm:truncate", ms.status === "DONE" && "text-muted-foreground line-through")}>
                                            {ms.title}
                                          </span>
                                          {fileCountMs > 0 && (
                                            <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px] text-teal-700">
                                              {fileCountMs} file
                                            </Badge>
                                          )}
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
                                        <span className={cn("min-w-0 flex-1 sm:truncate", ms.status === "DONE" && "text-muted-foreground line-through")}>
                                          {ms.title}
                                        </span>
                                        {fileCountMs > 0 && (
                                          <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px] text-teal-700">
                                            {fileCountMs} file
                                          </Badge>
                                        )}
                                        <span className="shrink-0 tabular-nums text-muted-foreground">{ms.weight}%</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            {/* Footer: ringkasan file + aksi masuk detail */}
                            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <FolderOpen className="size-3.5 shrink-0" aria-hidden />
                                {p.deliverables.length} file/tautan produksi
                              </span>
                              <Button size="sm" onClick={() => setSelectedId(p.id)} aria-label={`Buka detail proyek ${p.code}`}>
                                Detail Proyek <ChevronRight className="size-4" aria-hidden />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </TabsContent>

        {/* ================= TAB FILE & GOOGLE DRIVE ================= */}
        <TabsContent value="files" className="mt-0 space-y-4">
          {delLoading && deliverables === null ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonBlock key={i} className="h-24" />
                ))}
              </div>
              <SkeletonBlock className="h-64" />
            </div>
          ) : deliverables === null ? (
            <Card className="rounded-2xl">
              <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
                <AlertTriangle className="size-8 text-rose-500" />
                <p className="text-sm font-semibold text-slate-900">Gagal memuat file produksi</p>
                <Button size="sm" onClick={() => void fetchDeliverables()}>
                  <RefreshCw className="size-3.5" /> Coba Lagi
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Ringkasan ringkas */}
              {delList.length > 0 && (
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {delSummary.map((s) => (
                    <Card key={s.label} className="rounded-2xl">
                      <CardContent className="flex items-center gap-3 px-4 py-4 sm:px-5">
                        <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", s.iconBox)}>
                          <s.icon className="size-5" aria-hidden />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs text-muted-foreground">{s.label}</p>
                          <p className="text-2xl font-bold tabular-nums text-slate-900 sm:text-3xl">{s.value}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              <Card className="rounded-2xl">
                <CardHeader className="flex flex-col gap-2 px-5 pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-base">File &amp; Google Drive</CardTitle>
                    <CardDescription>
                      Semua file produksi lintas proyek. Untuk menambah file, buka detail proyek — file otomatis terlihat klien di Portal.
                    </CardDescription>
                  </div>
                  {canSendDeliverable && projects.length > 0 && (
                    <Button size="sm" variant="outline" onClick={() => openDeliverableDialog(null)}>
                      <Plus className="size-4" /> Kirim ke Proyek Lain
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  {delList.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-12 text-center">
                      <FolderOpen className="size-10 text-slate-300" aria-hidden />
                      <p className="text-sm font-semibold text-slate-900">Belum ada file produksi</p>
                      <p className="max-w-md text-xs text-muted-foreground">
                        Buka tab Proyek → Detail Proyek, lalu tambahkan file atau link Google Drive per milestone.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {deliverableGroups.map((g) => (
                        <div key={g.projectId} className="overflow-hidden rounded-xl border">
                          <div className="flex flex-wrap items-center gap-1.5 border-b bg-slate-50/70 px-4 py-2.5">
                            <Badge variant="outline" className="font-mono text-[10px]">
                              {g.code}
                            </Badge>
                            <span className="text-sm font-semibold text-slate-900">{g.name}</span>
                            {g.status && (
                              <Badge variant="outline" className={PROJECT_STATUS_BADGE[g.status]}>
                                {PROJECT_STATUS_LABEL[g.status]}
                              </Badge>
                            )}
                            <span className="ml-auto flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
                              {g.items.length} file/tautan
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs text-teal-700 hover:text-teal-800"
                                aria-label={`Buka detail proyek ${g.code}`}
                                onClick={() => {
                                  setTab("proyek");
                                  setSelectedId(g.projectId);
                                }}
                              >
                                Detail
                              </Button>
                            </span>
                          </div>
                          <div className="divide-y">
                            {g.items.map((d) => (
                              <DeliverableRow
                                key={d.id}
                                d={d}
                                nowMs={nowMs}
                                canDelete={["OWNER", "MANAGER"].includes(user.role) || d.uploadedByName === user.name}
                                canShareSecure={canShareSecure}
                                busy={busyDelKey === d.id}
                                onRemove={(x) => void removeDeliverable(x)}
                                onShareSecure={openSecureDialogFor}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog Kirim File / Link */}
      <Dialog
        open={dlgOpen}
        onOpenChange={(o) => {
          setDlgOpen(o);
          if (!o) setUrlErr(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {fProjectLocked && selectedProject
                ? `Kirim File / Link — ${selectedProject.code}`
                : "Kirim File / Link ke Proyek"}
            </DialogTitle>
            <DialogDescription>
              File final atau tautan Google Drive akan langsung terlihat oleh klien di Portal.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Proyek tujuan (terkunci bila dibuka dari detail proyek) */}
            <div className="space-y-1.5">
              <Label htmlFor="dl-project">Proyek tujuan</Label>
              {fProjectLocked ? (
                <div className="flex items-center gap-2 rounded-xl border bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  <Factory className="size-3.5 shrink-0 text-slate-500" aria-hidden />
                  <span className="truncate font-medium">
                    {selectedProject ? `${selectedProject.code} · ${selectedProject.name}` : "Proyek terpilih"}
                  </span>
                </div>
              ) : (
                <Select
                  value={fProjectId}
                  onValueChange={(v) => {
                    setFProjectId(v);
                    setFMilestone("none");
                  }}
                >
                  <SelectTrigger id="dl-project" aria-label="Pilih proyek tujuan">
                    <SelectValue placeholder="Pilih proyek" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.code} · {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Mode: tautan vs file */}
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label="Jenis pengiriman">
              <button type="button" aria-pressed={mode === "LINK"} onClick={() => setMode("LINK")} className={segBtnCls(mode === "LINK")}>
                <Link2 className="size-4" aria-hidden /> Tautan (Drive dll)
              </button>
              <button type="button" aria-pressed={mode === "FILE"} onClick={() => setMode("FILE")} className={segBtnCls(mode === "FILE")}>
                <FileText className="size-4" aria-hidden /> Unggah File
              </button>
            </div>

            {/* Nama */}
            <div className="space-y-1.5">
              <Label htmlFor="dl-name">Nama deliverable</Label>
              <Input
                id="dl-name"
                value={fName}
                onChange={(e) => setFName(e.target.value)}
                placeholder={mode === "LINK" ? "cth: Moodboard & Referensi" : "cth: Desain 3D Booth (rev. 3)"}
              />
            </div>

            {mode === "LINK" ? (
              <div className="space-y-1.5">
                <Label htmlFor="dl-url">URL tautan</Label>
                <Input
                  id="dl-url"
                  value={fUrl}
                  onChange={(e) => {
                    setFUrl(e.target.value);
                    if (urlErr) setUrlErr(null);
                  }}
                  placeholder="https://drive.google.com/..."
                  inputMode="url"
                  aria-invalid={Boolean(urlErr)}
                />
                {urlErr ? (
                  <p className="text-xs text-rose-600">{urlErr}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Wajib diawali http:// atau https://</p>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="dl-file">Pilih file</Label>
                <Input
                  id="dl-file"
                  type="file"
                  onChange={(e) => setFFile(e.target.files?.[0] ?? null)}
                  className="cursor-pointer file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200"
                />
                {fFile && (
                  <p className="text-xs text-muted-foreground">
                    {fFile.name} · {formatBytes(fFile.size)}
                  </p>
                )}
                <p className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
                  <Info className="size-3.5 shrink-0" aria-hidden />
                  Maks 10 MB — file besar gunakan link Google Drive
                </p>
              </div>
            )}

            {/* Milestone terkait */}
            <div className="space-y-1.5">
              <Label htmlFor="dl-milestone">Milestone terkait (opsional)</Label>
              <Select value={fMilestone} onValueChange={setFMilestone}>
                <SelectTrigger id="dl-milestone" aria-label="Pilih milestone terkait">
                  <SelectValue placeholder="— Tanpa milestone —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Tanpa milestone —</SelectItem>
                  {(projects.find((p) => p.id === fProjectId)?.milestones ?? []).map((m) => (
                    <SelectItem key={m.id} value={m.title}>
                      {m.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Catatan */}
            <div className="space-y-1.5">
              <Label htmlFor="dl-note">Catatan (opsional)</Label>
              <Textarea
                id="dl-note"
                rows={3}
                value={fNote}
                onChange={(e) => setFNote(e.target.value)}
                placeholder="cth: Revisi ke-3, sudah disetujui klien via WhatsApp"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgOpen(false)} disabled={submitting}>
              Batal
            </Button>
            <Button onClick={() => void submitDeliverable()} disabled={submitting}>
              {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
              {mode === "LINK" ? "Kirim Tautan" : "Unggah File"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Secure link — satu instance untuk tab File & Google Drive */}
      <SecureLinkDialog open={secureOpen} onOpenChange={setSecureOpen} target={secureTarget} onCreated={reloadAll} />
    </div>
  );
}
