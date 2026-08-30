"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import type { BriefDTO, QuotationDTO } from "@/lib/crm-types";

/** Data minimum lead untuk dialog — dipenuhi oleh LeadDTO di inbox. */
export interface LeadRef {
  id: string;
  code: string;
  subject: string;
  contact: { name: string; company?: string | null };
}

const rp = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
function fmtRp(n: number): string {
  return rp.format(n);
}

type ItemRow = { desc: string; qty: string; price: string };

/**
 * Dialog "Buat Brief dari percakapan lead".
 * onCreated dipanggil dengan brief hasil (dipakai untuk membuka pratinjau dokumen).
 */
export function CreateBriefFromLeadDialog({
  open,
  onOpenChange,
  lead,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lead: LeadRef;
  onCreated: (brief: BriefDTO) => void;
}) {
  const [fTitle, setFTitle] = useState("");
  const [fObjective, setFObjective] = useState("");
  const [fAudience, setFAudience] = useState("");
  const [fDeliverables, setFDeliverables] = useState("");
  const [fReferences, setFReferences] = useState("");
  const [fDeadline, setFDeadline] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Prefill judul dari subjek lead saat dialog dibuka
  useEffect(() => {
    if (open) {
      setFTitle(`Brief — ${lead.subject}`);
      setFObjective("");
      setFAudience("");
      setFDeliverables("");
      setFReferences("");
      setFDeadline("");
    }
  }, [open, lead.subject]);

  async function submit() {
    if (!fTitle.trim()) {
      toast.error("Judul brief wajib diisi");
      return;
    }
    if (!fObjective.trim()) {
      toast.error("Tujuan brief wajib diisi");
      return;
    }
    setSubmitting(true);
    try {
      const { brief } = await api.createBrief({
        leadId: lead.id,
        title: fTitle.trim(),
        objective: fObjective.trim(),
        audience: fAudience.trim() || undefined,
        deliverables: fDeliverables.trim() || undefined,
        references: fReferences.trim() || undefined,
        deadline: fDeadline ? new Date(fDeadline).toISOString() : undefined,
      });
      toast.success(`Brief ${brief.code} dibuat dari ${lead.code}`);
      onOpenChange(false);
      onCreated(brief);
    } catch (e) {
      toast.error((e as Error).message || "Gagal membuat brief");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Buat Brief dari Lead</DialogTitle>
          <DialogDescription>
            Brief untuk {lead.contact.name}
            {lead.contact.company ? ` (${lead.contact.company})` : ""} — bisa langsung dicetak dengan kop surat brand.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bf-title">Judul brief *</Label>
            <Input id="bf-title" value={fTitle} onChange={(e) => setFTitle(e.target.value)} placeholder="cth: Brief Konten Sosial Media Ramadan" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bf-objective">Latar &amp; tujuan *</Label>
            <Textarea
              id="bf-objective"
              rows={3}
              value={fObjective}
              onChange={(e) => setFObjective(e.target.value)}
              placeholder="Apa yang ingin dicapai dari pekerjaan ini?"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bf-audience">Target audiens</Label>
            <Input id="bf-audience" value={fAudience} onChange={(e) => setFAudience(e.target.value)} placeholder="cth: Ibu 25-40 th, pengguna skincare aktif" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bf-deliverables">Deliverables (satu baris = satu item)</Label>
            <Textarea
              id="bf-deliverables"
              rows={3}
              value={fDeliverables}
              onChange={(e) => setFDeliverables(e.target.value)}
              placeholder={"12 desain feed Instagram\n4 video reels\n1 landing page"}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="bf-references">Referensi (link)</Label>
              <Input id="bf-references" type="url" value={fReferences} onChange={(e) => setFReferences(e.target.value)} placeholder="https://…" inputMode="url" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bf-deadline">Deadline</Label>
              <Input id="bf-deadline" type="date" value={fDeadline} onChange={(e) => setFDeadline(e.target.value)} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Batal
          </Button>
          <Button onClick={() => void submit()} disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
            Buat Brief
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Dialog "Buat Penawaran dari percakapan lead" — item dinamis + diskon/PPN
 * dengan ringkasan total langsung. onCreated dipanggil dengan penawaran hasil.
 */
export function CreateQuotationFromLeadDialog({
  open,
  onOpenChange,
  lead,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lead: LeadRef;
  onCreated: (quotation: QuotationDTO) => void;
}) {
  const [fTitle, setFTitle] = useState("");
  const [items, setItems] = useState<ItemRow[]>([{ desc: "", qty: "1", price: "0" }]);
  const [fDiscount, setFDiscount] = useState("0");
  const [fPpn, setFPpn] = useState("11");
  const [fNotes, setFNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setFTitle(`Penawaran — ${lead.subject}`);
      setItems([{ desc: "", qty: "1", price: "0" }]);
      setFDiscount("0");
      setFPpn("11");
      setFNotes("");
    }
  }, [open, lead.subject]);

  const subtotal = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
  const discountPct = Math.min(100, Math.max(0, Number(fDiscount) || 0));
  const ppnPct = Math.min(50, Math.max(0, Number(fPpn) || 0));
  const afterDiscount = Math.round(subtotal * (1 - discountPct / 100));
  const grandTotal = Math.round(afterDiscount * (1 + ppnPct / 100));

  function setRow(i: number, patch: Partial<ItemRow>) {
    setItems((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function submit() {
    const valid = items.filter((it) => it.desc.trim());
    if (!fTitle.trim()) {
      toast.error("Judul penawaran wajib diisi");
      return;
    }
    if (valid.length === 0) {
      toast.error("Isi minimal 1 item pekerjaan");
      return;
    }
    setSubmitting(true);
    try {
      const { quotation } = await api.createQuotation({
        leadId: lead.id,
        title: fTitle.trim(),
        items: valid.map((it) => ({ desc: it.desc.trim(), qty: Math.max(1, Number(it.qty) || 1), price: Math.max(0, Number(it.price) || 0) })),
        discountPct,
        ppnPct,
        notes: fNotes.trim() || undefined,
      });
      toast.success(`Penawaran ${quotation.number} dibuat dari ${lead.code}`);
      onOpenChange(false);
      onCreated(quotation);
    } catch (e) {
      toast.error((e as Error).message || "Gagal membuat penawaran");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Buat Penawaran dari Lead</DialogTitle>
          <DialogDescription>
            Untuk {lead.contact.name}
            {lead.contact.company ? ` (${lead.contact.company})` : ""} — dokumen otomatis pakai kop surat brand {lead.code}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="qt-title">Judul penawaran *</Label>
            <Input id="qt-title" value={fTitle} onChange={(e) => setFTitle(e.target.value)} placeholder="cth: Paket Konten Sosial Media 3 Bulan" />
          </div>

          {/* Item pekerjaan */}
          <div className="space-y-2">
            <Label>Item pekerjaan *</Label>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-[1fr_64px_110px_32px] items-center gap-1.5 sm:grid-cols-[1fr_64px_130px_32px]">
                  <Input
                    aria-label={`Uraian item ${i + 1}`}
                    value={it.desc}
                    onChange={(e) => setRow(i, { desc: e.target.value })}
                    placeholder={i === 0 ? "cth: Desain feed 12 post" : "Item lain…"}
                    className="h-9 text-xs"
                  />
                  <Input
                    aria-label={`Jumlah item ${i + 1}`}
                    type="number" min={1}
                    value={it.qty}
                    onChange={(e) => setRow(i, { qty: e.target.value })}
                    className="h-9 text-xs"
                  />
                  <Input
                    aria-label={`Harga item ${i + 1}`}
                    type="number" min={0} step={1000}
                    value={it.price}
                    onChange={(e) => setRow(i, { price: e.target.value })}
                    className="h-9 text-xs tabular-nums"
                  />
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Hapus item ${i + 1}`}
                    className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                    disabled={items.length === 1}
                    onClick={() => setItems((rows) => rows.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                </div>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={() => setItems((r) => [...r, { desc: "", qty: "1", price: "0" }])}>
              <Plus className="size-3.5" /> Tambah Item
            </Button>
          </div>

          {/* Diskon & PPN */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="qt-discount">Diskon (%)</Label>
              <Input id="qt-discount" type="number" min={0} max={100} value={fDiscount} onChange={(e) => setFDiscount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qt-ppn">PPN (%)</Label>
              <Input id="qt-ppn" type="number" min={0} max={50} value={fPpn} onChange={(e) => setFPpn(e.target.value)} />
            </div>
          </div>

          {/* Ringkasan total langsung */}
          <div className="space-y-1 rounded-xl bg-slate-50 px-4 py-3 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium tabular-nums">{fmtRp(subtotal)}</span>
            </div>
            {discountPct > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Diskon {discountPct}%</span>
                <span className="font-medium tabular-nums text-rose-600">-{fmtRp(subtotal - afterDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">PPN {ppnPct}%</span>
              <span className="font-medium tabular-nums">{fmtRp(Math.round(afterDiscount * (ppnPct / 100)))}</span>
            </div>
            <div className="flex justify-between border-t pt-1.5 text-sm font-bold">
              <span>Total</span>
              <span className="tabular-nums">{fmtRp(grandTotal)}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qt-notes">Catatan (opsional)</Label>
            <Textarea id="qt-notes" rows={2} value={fNotes} onChange={(e) => setFNotes(e.target.value)} placeholder="cth: Termasuk 2x revisi, biaya boosting terpisah" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Batal
          </Button>
          <Button onClick={() => void submit()} disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
            Buat Penawaran
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
