"use client";

import { useEffect, useState } from "react";
import { Banknote, Building2, Circle, CircleDashed, CheckCircle2, FileText, FolderOpen, Inbox, Link2, Phone, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChannelBadge } from "@/components/channel-badge";
import { toast } from "@/components/ui/sonner";
import { api } from "@/lib/api-client";
import {
  BRAND_LABEL,
  INVOICE_STATUS_BADGE,
  INVOICE_STATUS_LABEL,
  LEAD_STATUS_BADGE,
  LEAD_STATUS_LABEL,
  PROJECT_STATUS_BADGE,
  PROJECT_STATUS_LABEL,
  QUOTATION_STATUS_BADGE,
  QUOTATION_STATUS_LABEL,
  type InvoiceDTO,
  type LeadDTO,
  type LeadStatus,
  type PortalSummaryDTO,
  type ProjectDTO,
  type QuotationDTO,
  type SessionUser,
} from "@/lib/crm-types";

const ACTIVE_STATUSES: LeadStatus[] = ["NEW", "FOLLOW_UP", "QUOTED"];

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

function truncate(text: string, max = 120) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function PortalSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-36 animate-pulse rounded-2xl bg-slate-200/70" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-200/70" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-200/70" />
        ))}
      </div>
    </div>
  );
}

export default function ClientPortalView({ user }: { user: SessionUser }) {
  const [leads, setLeads] = useState<LeadDTO[] | null>(null);
  const [summary, setSummary] = useState<PortalSummaryDTO | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.leads().then((r) => r.leads).catch(() => []),
      api.portalSummary().catch(() => null),
    ])
      .then(([leadList, sum]) => {
        if (cancelled) return;
        setLeads(leadList);
        setSummary(sum);
      })
      .catch(() => {
        if (!cancelled) toast.error("Gagal memuat data portal.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <PortalSkeleton />;

  const total = leads?.length ?? 0;
  const inProgress = leads?.filter((l) => ACTIVE_STATUSES.includes(l.status)).length ?? 0;
  const projects = summary?.projects ?? [];
  const invoices = summary?.invoices ?? [];
  const quotations = summary?.quotations ?? [];
  const activeProjects = projects.filter((p) => p.status !== "DONE").length;
  const unpaidInvoices = invoices.filter((i) => i.status !== "PAID");

  const statCards = [
    { label: "Total Pengajuan", value: String(total), valueClass: "text-slate-900", ring: "border-slate-200 bg-slate-50" },
    { label: "Sedang Diproses", value: String(inProgress), valueClass: "text-amber-600", ring: "border-amber-200 bg-amber-50" },
    { label: "Proyek Berjalan", value: String(activeProjects), valueClass: "text-teal-600", ring: "border-teal-200 bg-teal-50" },
    { label: "Tagihan Belum Lunas", value: String(unpaidInvoices.length), valueClass: "text-rose-600", ring: "border-rose-200 bg-rose-50" },
  ];

  return (
    <div className="space-y-6">
      {/* Header portal */}
      <Card className="rounded-2xl border-emerald-200 bg-emerald-50/60">
        <CardContent className="flex items-start gap-4 px-5 py-5">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
            <Building2 className="size-6" />
          </div>
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-lg text-slate-900">
              Portal {summary?.company?.name ?? "Klien"} — UDP
            </CardTitle>
            <CardDescription>
              Pantau pengajuan, proyek produksi, penawaran, dan tagihan Anda dalam satu halaman.
            </CardDescription>
            <p className="text-xs text-emerald-800">
              Masuk sebagai <span className="font-semibold">{user.name}</span> · Portal Klien
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Statistik */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {statCards.map((s) => (
          <Card key={s.label} className={`rounded-2xl ${s.ring}`}>
            <CardContent className="px-3 py-4 sm:px-5">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-2xl font-bold tabular-nums sm:text-3xl ${s.valueClass}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Proyek produksi */}
      {projects.length > 0 && (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Proyek Produksi Anda</CardTitle>
            <CardDescription>Progres pengerjaan berdasarkan milestone yang diselesaikan tim UDP.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 px-5 pb-5">
            <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
              {projects.map((p: ProjectDTO) => (
                <div key={p.id} className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-slate-500">{p.code}</span>
                    <Badge variant="outline" className={PROJECT_STATUS_BADGE[p.status]}>
                      {PROJECT_STATUS_LABEL[p.status]}
                    </Badge>
                    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                      {BRAND_LABEL[p.brand] ?? p.brand}
                    </Badge>
                    <span className="ml-auto text-xs text-muted-foreground">Target {formatDate(p.dueDate)}</span>
                  </div>
                  <p className="text-sm font-medium text-slate-900">{p.name}</p>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-semibold tabular-nums text-emerald-700">{p.progress}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${p.progress}%` }} />
                    </div>
                  </div>
                  <div className="space-y-1.5 pt-1">
                    {p.milestones.map((m) => (
                      <div key={m.id} className="flex items-center gap-2 text-xs">
                        {m.status === "DONE" ? (
                          <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" />
                        ) : m.status === "IN_PROGRESS" ? (
                          <CircleDashed className="size-3.5 shrink-0 text-amber-500" />
                        ) : (
                          <Circle className="size-3.5 shrink-0 text-slate-300" />
                        )}
                        <span className={m.status === "DONE" ? "text-slate-500 line-through" : "text-slate-700"}>{m.title}</span>
                        <span className="ml-auto text-[10px] text-muted-foreground">{m.weight}%</span>
                      </div>
                    ))}
                  </div>
                  {/* File dari Tim Produksi (read-only — tanpa aksi hapus untuk klien) */}
                  <div className="border-t border-slate-100 pt-2.5">
                    <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <FolderOpen className="size-3.5 shrink-0" aria-hidden /> File dari Tim Produksi
                    </p>
                    {p.deliverables.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Belum ada file yang dibagikan.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {p.deliverables.map((d) => (
                          <div
                            key={d.id}
                            className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2 text-xs"
                          >
                            {d.type === "LINK" ? (
                              <Link2 className="size-3.5 shrink-0 text-amber-600" aria-hidden />
                            ) : (
                              <FileText className="size-3.5 shrink-0 text-teal-600" aria-hidden />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium text-slate-800">{d.name}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {d.type === "FILE" && d.sizeLabel ? `${d.sizeLabel} · ` : ""}
                                {formatDate(d.createdAt)}
                              </p>
                            </div>
                            {d.type === "LINK" ? (
                              <a
                                href={d.url ?? "#"}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={`Buka tautan ${d.name}`}
                                className="shrink-0 font-medium text-emerald-700 hover:underline"
                              >
                                Buka
                              </a>
                            ) : (
                              <a
                                href={`/api/deliverables/${d.id}/download`}
                                download
                                aria-label={`Unduh ${d.name}`}
                                className="shrink-0 font-medium text-teal-700 hover:underline"
                              >
                                Unduh
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tagihan */}
      {invoices.length > 0 && (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5 text-base">
              <Banknote className="size-4 text-emerald-600" /> Tagihan Anda
            </CardTitle>
            <CardDescription>Invoice untuk proyek yang sedang atau sudah dikerjakan.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 px-5 pb-5">
            <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
              {invoices.map((inv: InvoiceDTO) => (
                <div key={inv.id} className="space-y-1.5 rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-slate-500">{inv.number}</span>
                    <Badge variant="outline" className={INVOICE_STATUS_BADGE[inv.status]}>
                      {INVOICE_STATUS_LABEL[inv.status]}
                    </Badge>
                    <span className="ml-auto text-xs text-muted-foreground">Jatuh tempo {formatDate(inv.dueDate)}</span>
                  </div>
                  <p className="text-sm font-medium text-slate-900">{inv.title}</p>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-bold tabular-nums text-slate-900">{formatRupiah(inv.grandTotal)}</span>
                    <span className="text-muted-foreground">
                      Terbayar {formatRupiah(inv.paidAmount)}
                      {inv.projectCode ? ` · proyek ${inv.projectCode}` : ""}
                    </span>
                  </div>
                  {inv.grandTotal > inv.paidAmount && (
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, Math.round((inv.paidAmount / inv.grandTotal) * 100))}%` }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Penawaran */}
      {quotations.length > 0 && (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5 text-base">
              <FileText className="size-4 text-violet-600" /> Penawaran Anda
            </CardTitle>
            <CardDescription>Status penawaran harga yang pernah kami kirimkan.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 px-5 pb-5">
            <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
              {quotations.map((q: QuotationDTO) => (
                <div key={q.id} className="space-y-1 rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-slate-500">{q.number}</span>
                    <Badge variant="outline" className={QUOTATION_STATUS_BADGE[q.status]}>
                      {QUOTATION_STATUS_LABEL[q.status]}
                    </Badge>
                    {q.projectCode && (
                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                        Proyek {q.projectCode}
                      </Badge>
                    )}
                    <span className="ml-auto text-xs font-bold tabular-nums text-slate-900">{formatRupiah(q.grandTotal)}</span>
                  </div>
                  <p className="text-sm font-medium text-slate-900">{q.title}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Daftar lead */}
      <Card className="rounded-2xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Pengajuan Anda</CardTitle>
            {total > 0 && (
              <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-500">
                {total} pengajuan
              </Badge>
            )}
          </div>
          <CardDescription>Paling baru berada di urutan atas.</CardDescription>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          {!leads || leads.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Inbox className="size-10 text-slate-300" />
              <p className="text-sm font-medium text-slate-700">Belum ada pengajuan</p>
              <p className="text-xs text-muted-foreground">
                Permintaan Anda yang masuk lewat kanal mana pun akan tampil di sini.
              </p>
            </div>
          ) : (
            <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
              {leads.map((lead) => (
                <div key={lead.id} className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-slate-500">{lead.code}</span>
                    <Badge variant="outline" className={LEAD_STATUS_BADGE[lead.status]}>
                      {LEAD_STATUS_LABEL[lead.status]}
                    </Badge>
                    <ChannelBadge channel={lead.channel} />
                    <span className="ml-auto text-xs text-muted-foreground">
                      {timeAgo(lead.lastMessage?.createdAt ?? lead.updatedAt)}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-900">{lead.subject}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                      {BRAND_LABEL[lead.brand] ?? lead.brand}
                    </Badge>
                    <span>·</span>
                    <span>{lead.contact.name}</span>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {lead.lastMessage ? (
                      <>
                        <span className="font-medium text-slate-600">Pesan terakhir:</span> {truncate(lead.lastMessage.body)}
                      </>
                    ) : (
                      "Belum ada pesan pada pengajuan ini."
                    )}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info bantuan */}
      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <Phone className="mt-0.5 size-4 shrink-0" />
        <span>
          Butuh bantuan? Hubungi tim kami via WhatsApp{" "}
          <span className="font-semibold">+62 811-2200-345</span>.
        </span>
      </div>

      {/* Ringkasan tagihan kecil */}
      {unpaidInvoices.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <Wallet className="mt-0.5 size-4 shrink-0" />
          <span>
            Total tagihan belum lunas:{" "}
            <span className="font-semibold">{formatRupiah(unpaidInvoices.reduce((s, i) => s + (i.grandTotal - i.paidAmount), 0))}</span>
            {" "}— pembayaran dapat ditransfer ke rekening resmi UDP.
          </span>
        </div>
      )}
    </div>
  );
}
