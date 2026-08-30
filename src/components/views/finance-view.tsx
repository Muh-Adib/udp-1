"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlarmClock,
  Banknote,
  CheckCircle2,
  ClipboardList,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { BrandDocDialog } from "@/components/brand-document";
import { QuotationDocContent } from "@/components/doc-content";
import { api } from "@/lib/api-client";
import {
  BRAND_LABEL,
  INVOICE_STATUS_BADGE,
  INVOICE_STATUS_LABEL,
  QUOTATION_STATUS_BADGE,
  QUOTATION_STATUS_LABEL,
  type BriefDTO,
  type FinanceStats,
  type InvoiceDTO,
  type LeadDTO,
  type QuotationDTO,
  type SessionUser,
} from "@/lib/crm-types";
import { cn } from "@/lib/utils";

/* ---------------- helper format lokal ---------------- */

const rpFormatter = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

function formatRp(n: number): string {
  return rpFormatter.format(Number.isFinite(n) ? Math.round(n) : 0);
}

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

const BRAND_BAR_CLASS = ["bg-slate-500", "bg-emerald-500", "bg-amber-400", "bg-rose-500"];

const PAY_METHOD_LABEL: Record<string, string> = {
  TRANSFER: "Transfer Bank",
  CASH: "Tunai",
  QRIS: "QRIS",
  OTHER: "Lainnya",
};

type DraftItem = { desc: string; qty: string; price: string };
const emptyDraftItem = (): DraftItem => ({ desc: "", qty: "1", price: "" });

const paidPct = (inv: InvoiceDTO) =>
  inv.grandTotal > 0 ? Math.min(100, Math.round((inv.paidAmount / inv.grandTotal) * 100)) : 100;

/* ---------------- view utama ---------------- */

export default function FinanceView({ user }: { user: SessionUser }) {
  const [stats, setStats] = useState<FinanceStats | null>(null);
  const [quotations, setQuotations] = useState<QuotationDTO[] | null>(null);
  const [invoices, setInvoices] = useState<InvoiceDTO[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // dialog tolak penawaran
  const [rejectTarget, setRejectTarget] = useState<QuotationDTO | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  // pratinjau dokumen penawaran (kop surat brand)
  const [docQuotation, setDocQuotation] = useState<QuotationDTO | null>(null);

  // dialog buat penawaran
  const [createOpen, setCreateOpen] = useState(false);
  const [leadsCache, setLeadsCache] = useState<LeadDTO[] | null>(null);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [briefsCache, setBriefsCache] = useState<BriefDTO[] | null>(null);
  const [formLeadId, setFormLeadId] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formItems, setFormItems] = useState<DraftItem[]>([emptyDraftItem()]);
  const [formDiscount, setFormDiscount] = useState("0");
  const [formPpn, setFormPpn] = useState("11");
  const [formNotes, setFormNotes] = useState("");

  // dialog catat pembayaran
  const [payTarget, setPayTarget] = useState<InvoiceDTO | null>(null);
  const [payAmount, setPayAmount] = useState("0");
  const [payMethod, setPayMethod] = useState("TRANSFER");
  const [payNote, setPayNote] = useState("");

  const role = user.role;
  const canCreate = role === "OWNER" || role === "MANAGER" || role === "MARKETER";
  const canSend = canCreate;
  const canDecide = role === "OWNER" || role === "MANAGER" || role === "FINANCE";
  const canPay = role === "OWNER" || role === "FINANCE";

  /* ---------- load paralel saat mount ---------- */

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, q, i] = await Promise.all([api.financeStats(), api.quotations(), api.invoices()]);
      setStats(s.stats);
      setQuotations(q.quotations);
      setInvoices(i.invoices);
    } catch (e) {
      const msg = (e as Error).message || "Gagal memuat data keuangan";
      setError(msg);
      if (stats || quotations || invoices) toast.error(msg);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Refetch ringan setelah aksi (quotations + invoices + stats) tanpa skeleton penuh. */
  const refreshData = useCallback(async () => {
    try {
      const [s, q, i] = await Promise.all([api.financeStats(), api.quotations(), api.invoices()]);
      setStats(s.stats);
      setQuotations(q.quotations);
      setInvoices(i.invoices);
    } catch (e) {
      toast.error((e as Error).message || "Gagal memuat ulang data");
    }
  }, []);

  /* ---------- aksi penawaran ---------- */

  async function sendQuotation(q: QuotationDTO) {
    setBusy(`send-${q.id}`);
    try {
      await api.updateQuotationStatus(q.id, "send");
      toast.success(`Penawaran ${q.number} dikirim ke klien`);
      await refreshData();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function approveQuotation(q: QuotationDTO) {
    setBusy(`approve-${q.id}`);
    try {
      const r = await api.updateQuotationStatus(q.id, "approve");
      if (r.projectCode && r.invoiceNumber) {
        toast.success(`Penawaran disetujui — Proyek ${r.projectCode} & invoice ${r.invoiceNumber} otomatis dibuat`);
      } else {
        toast.success(`Penawaran ${q.number} disetujui`);
      }
      await refreshData();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function openReject(q: QuotationDTO) {
    setRejectTarget(q);
    setRejectNote("");
  }

  async function submitReject() {
    if (!rejectTarget) return;
    setBusy("reject");
    try {
      await api.updateQuotationStatus(rejectTarget.id, "reject", rejectNote.trim() || undefined);
      toast.success(`Penawaran ${rejectTarget.number} ditolak`);
      setRejectTarget(null);
      await refreshData();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  /* ---------- dialog buat penawaran ---------- */

  function openCreate() {
    setCreateOpen(true);
    // fetch sekali saat dialog pertama kali dibuka (lead + brief utk referensi estimasi)
    if (leadsCache === null) {
      setLeadsLoading(true);
      api
        .leads()
        .then(({ leads }) => setLeadsCache(leads))
        .catch((e) => toast.error((e as Error).message))
        .finally(() => setLeadsLoading(false));
    }
    if (briefsCache === null) {
      api
        .briefs()
        .then(({ briefs }) => setBriefsCache(briefs))
        .catch(() => setBriefsCache([]));
    }
  }

  function resetCreateForm() {
    setFormLeadId("");
    setFormTitle("");
    setFormItems([emptyDraftItem()]);
    setFormDiscount("0");
    setFormPpn("11");
    setFormNotes("");
  }

  const formSubtotal = formItems.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
  const formDiscountVal = formSubtotal * ((Number(formDiscount) || 0) / 100);
  const formAfterDiscount = formSubtotal - formDiscountVal;
  const formPpnVal = formAfterDiscount * ((Number(formPpn) || 0) / 100);
  const formGrandTotal = formAfterDiscount + formPpnVal;

  async function submitCreate() {
    if (!formLeadId) {
      toast.error("Pilih lead terlebih dahulu");
      return;
    }
    const title = formTitle.trim();
    if (!title) {
      toast.error("Judul penawaran wajib diisi");
      return;
    }
    const items = formItems.map((it) => ({
      desc: it.desc.trim(),
      qty: Math.max(0, Math.floor(Number(it.qty) || 0)),
      price: Math.max(0, Math.round(Number(it.price) || 0)),
    }));
    if (items.some((it) => !it.desc)) {
      toast.error("Deskripsi setiap item wajib diisi");
      return;
    }
    if (items.some((it) => it.qty < 1)) {
      toast.error("Qty setiap item minimal 1");
      return;
    }
    if (formSubtotal <= 0) {
      toast.error("Total penawaran harus lebih dari 0");
      return;
    }
    setBusy("create");
    try {
      const { quotation } = await api.createQuotation({
        leadId: formLeadId,
        title,
        items,
        discountPct: Number(formDiscount) || 0,
        ppnPct: Number(formPpn) || 0,
        notes: formNotes.trim() || undefined,
      });
      toast.success(`Penawaran ${quotation.number} dibuat (draf)`);
      setCreateOpen(false);
      resetCreateForm();
      await refreshData();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  /* ---------- dialog catat pembayaran ---------- */

  function openPay(inv: InvoiceDTO) {
    setPayTarget(inv);
    setPayAmount(String(Math.max(0, inv.grandTotal - inv.paidAmount)));
    setPayMethod("TRANSFER");
    setPayNote("");
  }

  async function submitPay() {
    if (!payTarget) return;
    const amount = Math.round(Number(payAmount) || 0);
    const remaining = payTarget.grandTotal - payTarget.paidAmount;
    if (amount <= 0) {
      toast.error("Nominal pembayaran tidak valid");
      return;
    }
    if (amount > remaining) {
      toast.error(`Nominal melebihi sisa tagihan (${formatRp(remaining)})`);
      return;
    }
    setBusy(`pay-${payTarget.id}`);
    try {
      await api.addPayment(payTarget.id, { amount, method: payMethod, note: payNote.trim() || undefined });
      toast.success(`Pembayaran ${formatRp(amount)} untuk ${payTarget.number} tercatat`);
      setPayTarget(null);
      await refreshData();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  /* ---------- render: error ---------- */

  if (error && (!stats || !quotations || !invoices)) {
    return (
      <Card className="mx-auto max-w-md border-rose-200">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
            <TriangleAlert className="size-6" />
          </span>
          <div>
            <p className="font-semibold">Gagal memuat data keuangan</p>
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

  if (loading || !stats || !quotations || !invoices) {
    return (
      <div className="space-y-5">
        <div className="animate-pulse space-y-2">
          <div className="h-6 w-40 rounded bg-muted" />
          <div className="h-3 w-72 rounded bg-muted" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="animate-pulse space-y-3 pt-5">
                <div className="h-3 w-24 rounded bg-muted" />
                <div className="h-7 w-36 rounded bg-muted" />
                <div className="h-3 w-28 rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardContent className="animate-pulse space-y-3 pt-5">
              <div className="h-4 w-44 rounded bg-muted" />
              <div className="h-40 rounded-xl bg-muted" />
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardContent className="animate-pulse space-y-3 pt-5">
              <div className="h-4 w-40 rounded bg-muted" />
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-8 rounded-lg bg-muted" />
              ))}
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardContent className="animate-pulse space-y-3 pt-5">
            <div className="h-9 w-56 rounded-lg bg-muted" />
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 rounded-lg bg-muted" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ---------- data siap ---------- */

  const maxCash = Math.max(1, ...stats.monthly.map((m) => Math.max(m.revenue, m.invoiced)));
  const barHeight = (v: number) => {
    const px = Math.round((v / maxCash) * 160);
    return `${Math.max(v > 0 ? 6 : 3, px)}px`;
  };
  const maxBrandRevenue = Math.max(1, ...stats.byBrand.map((b) => b.revenue));

  const kpis = [
    {
      key: "revenue",
      label: "Pendapatan",
      value: formatRp(stats.revenuePaid),
      sub: "Total pembayaran masuk",
      icon: Banknote,
      iconClass: "bg-emerald-100 text-emerald-700",
      alert: false,
    },
    {
      key: "outstanding",
      label: "Outstanding",
      value: formatRp(stats.outstanding),
      sub: `Belum dibayar dari ${stats.invoiceCount} invoice`,
      icon: Wallet,
      iconClass: "bg-amber-100 text-amber-700",
      alert: false,
    },
    {
      key: "overdue",
      label: "Invoice Jatuh Tempo",
      value: String(stats.overdueCount),
      sub: stats.overdueCount > 0 ? "Segera tindak lanjuti penagihan" : "Semua tagihan terkendali",
      icon: AlarmClock,
      iconClass: stats.overdueCount > 0 ? "bg-rose-100 text-rose-600" : "bg-stone-200 text-stone-600",
      alert: stats.overdueCount > 0,
    },
    {
      key: "approval",
      label: "Tingkat Persetujuan",
      value: `${Math.round(stats.quotationApprovedPct)}%`,
      sub: `Dari ${stats.quotationCount} penawaran`,
      icon: CheckCircle2,
      iconClass: "bg-emerald-100 text-emerald-700",
      alert: false,
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Keuangan</h2>
          <p className="text-sm text-muted-foreground">
            Penawaran, invoice, dan arus kas — gabungan seluruh brand PT. Unicam Digital Pictvres.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("size-4", loading && "animate-spin")} /> Muat Ulang
        </Button>
      </div>

      {/* KPI row */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.key} className={cn("transition-shadow hover:shadow-md", k.alert && "border-rose-300")}>
              <CardContent className="flex items-start justify-between gap-3 pt-5">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm text-muted-foreground">{k.label}</p>
                  <p className="truncate text-xl font-bold tracking-tight sm:text-2xl">{k.value}</p>
                  <p className="text-xs text-muted-foreground">{k.sub}</p>
                  {k.alert && (
                    <Badge className="mt-1 border-rose-200 bg-rose-100 text-rose-700">Perlu tindakan</Badge>
                  )}
                </div>
                <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", k.iconClass)}>
                  <Icon className="size-5" />
                </span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Cashflow 6 bulan — grouped bar CSS murni */}
        <Card className="lg:col-span-3">
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-base">Arus Kas 6 Bulan</CardTitle>
              <CardDescription>Pembayaran diterima vs nilai invoice yang ditagihkan</CardDescription>
            </div>
            <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-emerald-500" /> Diterima
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-amber-400" /> Ditagihkan
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2 sm:gap-4">
              {stats.monthly.map((m) => (
                <div key={m.month} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex h-40 w-full items-end justify-center gap-1 border-b border-border/70">
                    <div
                      title={`${m.label} — Diterima: ${formatRp(m.revenue)}`}
                      className={cn("w-1/2 max-w-[26px] rounded-t-md bg-emerald-500", m.revenue === 0 && "opacity-30")}
                      style={{ height: barHeight(m.revenue) }}
                    />
                    <div
                      title={`${m.label} — Ditagihkan: ${formatRp(m.invoiced)}`}
                      className={cn("w-1/2 max-w-[26px] rounded-t-md bg-amber-400", m.invoiced === 0 && "opacity-30")}
                      style={{ height: barHeight(m.invoiced) }}
                    />
                  </div>
                  <span className="text-[11px] text-muted-foreground">{m.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Revenue per brand — bar horizontal */}
        <Card className="lg:col-span-2">
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">Pendapatan per Brand</CardTitle>
            <CardDescription>Revenue terkumpul + outstanding tiap brand</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {stats.byBrand.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Belum ada data per brand.</p>
            )}
            {stats.byBrand.map((b, i) => {
              const name = BRAND_LABEL[b.brand] ?? b.brand;
              const width = Math.max(b.revenue > 0 ? 4 : 0, Math.round((b.revenue / maxBrandRevenue) * 100));
              return (
                <div key={b.brand} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{name}</span>
                    <span className="shrink-0 font-semibold">{formatRp(b.revenue)}</span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", BRAND_BAR_CLASS[i % BRAND_BAR_CLASS.length])}
                      style={{ width: `${width}%` }}
                      title={`${name}: ${formatRp(b.revenue)}`}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Outstanding:{" "}
                    <span className={cn("font-medium", b.outstanding > 0 && "text-rose-600")}>
                      {formatRp(b.outstanding)}
                    </span>
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Tabs Penawaran / Invoice */}
      <Tabs defaultValue="penawaran" className="gap-4">
        <TabsList>
          <TabsTrigger value="penawaran">Penawaran</TabsTrigger>
          <TabsTrigger value="invoice">Invoice</TabsTrigger>
        </TabsList>

        {/* ---------- Tab Penawaran ---------- */}
        <TabsContent value="penawaran" className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">{quotations.length} penawaran tercatat</p>
            {canCreate && (
              <Button size="sm" onClick={openCreate}>
                <Plus className="size-4" /> Buat Penawaran
              </Button>
            )}
          </div>

          <Card>
            <CardContent className="px-0 pb-3">
              <div className="max-h-[480px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur">
                    <TableRow>
                      <TableHead>Nomor</TableHead>
                      <TableHead>Judul</TableHead>
                      <TableHead>Klien</TableHead>
                      <TableHead className="text-right">Nilai</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Proyek</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quotations.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                          <CheckCircle2 className="mx-auto mb-2 size-8 text-muted-foreground/40" />
                          Belum ada penawaran. Klik &ldquo;Buat Penawaran&rdquo; untuk membuat baru.
                        </TableCell>
                      </TableRow>
                    )}
                    {quotations.map((q) => {
                      return (
                        <TableRow key={q.id}>
                          <TableCell className="whitespace-nowrap font-mono text-xs">{q.number}</TableCell>
                          <TableCell className="max-w-[220px]">
                            <p className="truncate font-medium" title={q.title}>{q.title}</p>
                            <p className="text-xs text-muted-foreground">{BRAND_LABEL[q.brand] ?? q.brand}</p>
                          </TableCell>
                          <TableCell>
                            <p className="font-medium">{q.lead?.contactName ?? "—"}</p>
                            {q.lead?.companyName && (
                              <p className="text-xs text-muted-foreground">{q.lead.companyName}</p>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right font-medium">{formatRp(q.grandTotal)}</TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={QUOTATION_STATUS_BADGE[q.status]}
                              title={q.decidedNote ?? undefined}
                            >
                              {QUOTATION_STATUS_LABEL[q.status]}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {q.projectCode ? (
                              <span className="font-mono text-xs">{q.projectCode}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center justify-end gap-1.5">
                              {canSend && q.status === "DRAFT" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busy === `send-${q.id}`}
                                  onClick={() => void sendQuotation(q)}
                                >
                                  {busy === `send-${q.id}` ? (
                                    <Loader2 className="size-3.5 animate-spin" />
                                  ) : (
                                    <Send className="size-3.5" />
                                  )}
                                  Kirim
                                </Button>
                              )}
                              {canDecide && (q.status === "DRAFT" || q.status === "SENT") && (
                                <Button
                                  size="sm"
                                  disabled={busy === `approve-${q.id}`}
                                  onClick={() => void approveQuotation(q)}
                                >
                                  {busy === `approve-${q.id}` ? (
                                    <Loader2 className="size-3.5 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="size-3.5" />
                                  )}
                                  Setujui
                                </Button>
                              )}
                              {canDecide && (q.status === "DRAFT" || q.status === "SENT") && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-rose-200 text-rose-600 hover:bg-rose-50"
                                  onClick={() => openReject(q)}
                                >
                                  Tolak
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setDocQuotation(q)}
                                aria-label={`Buka dokumen ${q.number}`}
                              >
                                <FileText className="size-3.5" /> Dokumen
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- Tab Invoice ---------- */}
        <TabsContent value="invoice" className="space-y-3">
          <p className="text-sm text-muted-foreground">{invoices.length} invoice terbit</p>

          <Card>
            <CardContent className="px-0 pb-3">
              <div className="max-h-[480px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur">
                    <TableRow>
                      <TableHead>Nomor</TableHead>
                      <TableHead>Judul</TableHead>
                      <TableHead>Perusahaan</TableHead>
                      <TableHead>Proyek</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Terbayar</TableHead>
                      <TableHead>Jatuh Tempo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                          <Wallet className="mx-auto mb-2 size-8 text-muted-foreground/40" />
                          Belum ada invoice terbit.
                        </TableCell>
                      </TableRow>
                    )}
                    {invoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="whitespace-nowrap font-mono text-xs">{inv.number}</TableCell>
                        <TableCell className="max-w-[200px]">
                          <p className="truncate font-medium" title={inv.title}>{inv.title}</p>
                          <p className="text-xs text-muted-foreground">{BRAND_LABEL[inv.brand] ?? inv.brand}</p>
                        </TableCell>
                        <TableCell className="max-w-[160px]">
                          {inv.companyName ? (
                            <p className="truncate" title={inv.companyName}>{inv.companyName}</p>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {inv.projectCode ? (
                            <span className="font-mono text-xs">{inv.projectCode}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-medium">{formatRp(inv.grandTotal)}</TableCell>
                        <TableCell className="text-right">
                          <p className="whitespace-nowrap font-medium">{formatRp(inv.paidAmount)}</p>
                          <div
                            className="ml-auto mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-muted"
                            title={`${paidPct(inv)}% terbayar`}
                          >
                            <div
                              className={cn("h-full rounded-full", paidPct(inv) >= 100 ? "bg-emerald-500" : "bg-amber-400")}
                              style={{ width: `${paidPct(inv)}%` }}
                            />
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{formatDate(inv.dueDate)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={INVOICE_STATUS_BADGE[inv.status]}>
                            {INVOICE_STATUS_LABEL[inv.status]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end">
                            {canPay && inv.paidAmount < inv.grandTotal ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy === `pay-${inv.id}`}
                                onClick={() => openPay(inv)}
                              >
                                Catat Pembayaran
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog Tolak Penawaran */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tolak Penawaran</DialogTitle>
            <DialogDescription>
              {rejectTarget?.number} — {rejectTarget?.title} ({rejectTarget ? formatRp(rejectTarget.grandTotal) : ""})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reject-note">Alasan penolakan (opsional)</Label>
            <Textarea
              id="reject-note"
              placeholder="mis. Harga di atas anggaran klien"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>
              Batal
            </Button>
            <Button variant="destructive" onClick={() => void submitReject()} disabled={busy === "reject"}>
              {busy === "reject" && <Loader2 className="size-4 animate-spin" />} Tolak
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Buat Penawaran */}
      <Dialog open={createOpen} onOpenChange={(o) => !o && setCreateOpen(false)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Buat Penawaran</DialogTitle>
            <DialogDescription>
              Susun penawaran baru dari lead yang ada. Setelah disetujui, proyek produksi &amp; invoice DP otomatis dibuat.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Lead</Label>
              <Select value={formLeadId} onValueChange={setFormLeadId} disabled={leadsLoading}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={leadsLoading ? "Memuat daftar lead…" : "Pilih lead…"} />
                </SelectTrigger>
                <SelectContent>
                  {(leadsCache ?? []).map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.code} · {l.subject}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!leadsLoading && (leadsCache ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">Belum ada lead tersedia.</p>
              )}
              {(() => {
                const leadBriefs = (briefsCache ?? []).filter((b) => b.leadId === formLeadId && b.estimates.length > 0);
                const est = leadBriefs[0]?.estimates[0];
                if (!est || !leadBriefs[0]) return null;
                return (
                  <div className="flex items-start gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2.5 text-xs text-teal-900">
                    <ClipboardList className="mt-0.5 size-4 shrink-0 text-teal-600" />
                    <div>
                      <p className="font-semibold">
                        Estimasi produksi tersedia — {leadBriefs[0].code}
                      </p>
                      <p>
                        {est.totalHours} jam kerja · biaya produksi {formatRp(est.totalCost)} (oleh {est.createdByName ?? "tim produksi"}). Gunakan sebagai dasar penentuan harga penawaran.
                      </p>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="qt-title">
                Judul Penawaran <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="qt-title"
                placeholder="mis. Produksi Video Profil Perusahaan"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Item Penawaran</Label>
              <div className="hidden grid-cols-[1fr_72px_136px_36px] gap-2 px-0.5 text-xs text-muted-foreground sm:grid">
                <span>Deskripsi</span>
                <span>Qty</span>
                <span>Harga (Rp)</span>
                <span />
              </div>
              {formItems.map((it, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_72px_136px_36px] items-center gap-2">
                  <Input
                    placeholder={`Item ${idx + 1} — mis. Produksi video 3 menit`}
                    value={it.desc}
                    onChange={(e) =>
                      setFormItems((p) => p.map((row, i) => (i === idx ? { ...row, desc: e.target.value } : row)))
                    }
                  />
                  <Input
                    type="number"
                    min={1}
                    value={it.qty}
                    onChange={(e) =>
                      setFormItems((p) => p.map((row, i) => (i === idx ? { ...row, qty: e.target.value } : row)))
                    }
                    aria-label="Qty"
                  />
                  <Input
                    type="number"
                    min={0}
                    step={1000}
                    placeholder="0"
                    value={it.price}
                    onChange={(e) =>
                      setFormItems((p) => p.map((row, i) => (i === idx ? { ...row, price: e.target.value } : row)))
                    }
                    aria-label="Harga"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={formItems.length <= 1}
                    onClick={() => setFormItems((p) => p.filter((_, i) => i !== idx))}
                    aria-label="Hapus baris"
                  >
                    <Trash2 className="size-4 text-rose-500" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setFormItems((p) => [...p, emptyDraftItem()])}>
                <Plus className="size-3.5" /> Tambah Baris
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="qt-discount">Diskon (%)</Label>
                <Input
                  id="qt-discount"
                  type="number"
                  min={0}
                  max={100}
                  value={formDiscount}
                  onChange={(e) => setFormDiscount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qt-ppn">PPN (%)</Label>
                <Input
                  id="qt-ppn"
                  type="number"
                  min={0}
                  max={100}
                  value={formPpn}
                  onChange={(e) => setFormPpn(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="qt-notes">Catatan (opsional)</Label>
              <Textarea
                id="qt-notes"
                placeholder="Syarat pembayaran, masa pengerjaan, dsb."
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
              />
            </div>

            {/* Ringkasan total live */}
            <div className="space-y-1 rounded-xl bg-muted/60 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{formatRp(formSubtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Diskon ({Number(formDiscount) || 0}%)</span>
                <span className="font-medium text-rose-600">−{formatRp(formDiscountVal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">PPN ({Number(formPpn) || 0}%)</span>
                <span className="font-medium">+{formatRp(formPpnVal)}</span>
              </div>
              <div className="mt-1 flex justify-between border-t border-border pt-2 text-base">
                <span className="font-semibold">Grand Total</span>
                <span className="font-bold">{formatRp(formGrandTotal)}</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Batal
            </Button>
            <Button onClick={() => void submitCreate()} disabled={busy === "create"}>
              {busy === "create" && <Loader2 className="size-4 animate-spin" />} Simpan Penawaran
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Catat Pembayaran */}
      <Dialog open={!!payTarget} onOpenChange={(o) => !o && setPayTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Catat Pembayaran</DialogTitle>
            <DialogDescription>
              {payTarget?.number} — {payTarget?.title}
            </DialogDescription>
          </DialogHeader>
          {payTarget && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-muted/60 px-2.5 py-1.5">
                  <span className="text-muted-foreground">Total Tagihan</span>
                  <p className="font-medium">{formatRp(payTarget.grandTotal)}</p>
                </div>
                <div className="rounded-lg bg-muted/60 px-2.5 py-1.5">
                  <span className="text-muted-foreground">Sisa Tagihan</span>
                  <p className="font-medium">{formatRp(payTarget.grandTotal - payTarget.paidAmount)}</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pay-amount">Nominal Pembayaran (Rp)</Label>
                <Input
                  id="pay-amount"
                  type="number"
                  min={1}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Metode Pembayaran</Label>
                <Select value={payMethod} onValueChange={setPayMethod}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PAY_METHOD_LABEL).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pay-note">Catatan (opsional)</Label>
                <Input
                  id="pay-note"
                  placeholder="mis. Transfer BCA a/n PT Maju"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayTarget(null)}>
              Batal
            </Button>
            <Button onClick={() => void submitPay()} disabled={busy === `pay-${payTarget?.id ?? ""}`}>
              {busy === `pay-${payTarget?.id ?? ""}` && <Loader2 className="size-4 animate-spin" />} Simpan Pembayaran
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pratinjau Dokumen Penawaran (kop surat brand) */}
      <BrandDocDialog
        open={!!docQuotation}
        onOpenChange={(o) => !o && setDocQuotation(null)}
        brandKey={docQuotation?.brand ?? "unimasi"}
        docLabel="SURAT PENAWARAN"
        docNumber={docQuotation?.number ?? ""}
        dateIso={docQuotation?.createdAt ?? new Date().toISOString()}
        toName={docQuotation?.lead?.contactName}
        toCompany={docQuotation?.lead?.companyName}
        showBankInfo
        signatureName={user.name}
      >
        {docQuotation ? <QuotationDocContent q={docQuotation} /> : null}
      </BrandDocDialog>
    </div>
  );
}
