"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ClipboardCopy,
  Dices,
  ExternalLink,
  FileText,
  KeyRound,
  Loader2,
  Power,
  SendHorizonal,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api-client";
import { SECURE_TARGET_LABEL, type SecureLinkCreateInput, type SecureLinkDTO, type SecureTargetType } from "@/lib/crm-types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/** Pasangan dokumen yang bisa dipilih pada mode "dari lead". */
interface DocOption {
  key: string;
  targetType: SecureTargetType;
  targetId: string;
  label: string;
  sublabel: string;
}

export interface SecureLinkDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Target tetap — dipakai produksi (kirim 1 file deliverable). */
  target?: { targetType: SecureTargetType; targetId: string; title?: string; leadId?: string; projectId?: string; brand?: string; label?: string } | null;
  /** Mode pilih dokumen milik lead — dipakai Inbox. */
  lead?: { id: string; code: string; subject: string; contactName: string } | null;
  /** Riwayat tautan dimuat berdasar leadId/projectId ini. */
  historyFor?: { leadId?: string; projectId?: string } | null;
  onCreated?: () => void;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomPassword(): string {
  let out = "";
  for (let i = 0; i < 8; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

function CopyField({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const el = document.createElement("textarea");
      el.value = value;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    toast.success(`${label} disalin`);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs text-slate-600">{label}</Label>
        <Button type="button" size="sm" variant="ghost" className="h-6 gap-1 px-2 text-xs text-teal-700 hover:bg-teal-50 hover:text-teal-800" onClick={() => void copy()}>
          {copied ? <Check className="size-3" aria-hidden /> : <ClipboardCopy className="size-3" aria-hidden />}
          {copied ? "Tersalin" : "Salin"}
        </Button>
      </div>
      {multiline ? (
        <Textarea readOnly value={value} rows={5} className="resize-none bg-slate-50 text-xs" onFocus={(e) => e.currentTarget.select()} aria-label={label} />
      ) : (
        <Input readOnly value={value} className="bg-slate-50 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} aria-label={label} />
      )}
    </div>
  );
}

/**
 * Dialog "Kirim Dokumen (Secure Link)" — distribusi dokumen aman + password.
 * Dua mode: target tetap (produksi) atau pilih dokumen milik lead (inbox).
 */
export function SecureLinkDialog({ open, onOpenChange, target, lead, historyFor, onCreated }: SecureLinkDialogProps) {
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [options, setOptions] = useState<DocOption[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [password, setPassword] = useState("");
  const [expiry, setExpiry] = useState("30");
  const [busy, setBusy] = useState(false);

  const [created, setCreated] = useState<{ url: string; password: string; shareMessage: string } | null>(null);

  const [history, setHistory] = useState<SecureLinkDTO[]>([]);
  const [busyLinkId, setBusyLinkId] = useState<string | null>(null);

  const fixed = !!target;
  const historyQuery = historyFor ?? (target ? { leadId: target.leadId, projectId: target.projectId } : null);
  const historyKey = `${historyQuery?.leadId ?? ""}:${historyQuery?.projectId ?? ""}`;

  // Muat daftar dokumen milik lead (mode pilih)
  useEffect(() => {
    if (!open || fixed || !lead) return;
    let alive = true;
    setLoadingDocs(true);
    setOptions([]);
    setSelected("");
    Promise.all([api.quotations(), api.briefs(), api.projects()])
      .then(async ([qs, bs, ps]) => {
        if (!alive) return;
        const opts: DocOption[] = [];
        for (const q of qs.quotations.filter((x) => x.leadId === lead.id)) {
          opts.push({ key: `QT:${q.id}`, targetType: "QUOTATION", targetId: q.id, label: `${q.number} — ${q.title}`, sublabel: `${SECURE_TARGET_LABEL.QUOTATION} · Total Rp ${q.grandTotal.toLocaleString("id-ID")}` });
        }
        for (const b of bs.briefs.filter((x) => x.leadId === lead.id)) {
          opts.push({ key: `BRF:${b.id}`, targetType: "BRIEF", targetId: b.id, label: `${b.code} — ${b.title}`, sublabel: `${SECURE_TARGET_LABEL.BRIEF} · ${b.status}` });
        }
        // File produksi: proyek yang berasal dari lead ini (ProjectDTO.leadCode)
        const leadProjects = ps.projects.filter((p) => p.leadCode === lead.code);
        for (const p of leadProjects) {
          const d = await api.deliverables(p.id).catch(() => null);
          if (!alive) return;
          for (const file of d?.deliverables ?? []) {
            opts.push({ key: `DLV:${file.id}`, targetType: "DELIVERABLE", targetId: file.id, label: file.name, sublabel: `${SECURE_TARGET_LABEL.DELIVERABLE} · ${p.code}${file.sizeLabel ? ` · ${file.sizeLabel}` : ""}` });
          }
        }
        setOptions(opts);
        if (opts.length > 0) setSelected(opts[0].key);
      })
      .catch(() => {
        if (alive) toast.error("Gagal memuat daftar dokumen");
      })
      .finally(() => {
        if (alive) setLoadingDocs(false);
      });
    return () => {
      alive = false;
    };
  }, [open, fixed, lead]);

  // Muat riwayat tautan
  useEffect(() => {
    if (!open || !historyQuery || (!historyQuery.leadId && !historyQuery.projectId)) return;
    let alive = true;
    api
      .secureLinks({ leadId: historyQuery.leadId, projectId: historyQuery.projectId })
      .then((r) => {
        if (alive) setHistory(r.links);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [open, historyKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedOption = useMemo(() => options.find((o) => o.key === selected) ?? null, [options, selected]);

  function resetPanel() {
    setCreated(null);
    setPassword("");
    setExpiry("30");
  }

  async function submit() {
    if (busy) return;
    let input: SecureLinkCreateInput | null = null;
    if (fixed) {
      input = {
        targetType: target!.targetType,
        targetId: target!.targetId,
        title: target!.title,
        leadId: target!.leadId,
        projectId: target!.projectId,
        brand: target!.brand,
      };
    } else if (selectedOption) {
      input = { targetType: selectedOption.targetType, targetId: selectedOption.targetId };
    }
    if (!input) {
      toast.error("Pilih dokumen terlebih dahulu");
      return;
    }
    if (password.trim() && password.trim().length < 4) {
      toast.error("Password minimal 4 karakter");
      return;
    }
    input.password = password.trim() || undefined;
    input.expiresInDays = expiry === "none" ? null : Number(expiry);

    setBusy(true);
    try {
      const r = await api.createSecureLink(input);
      setCreated({ url: r.link.url, password: r.password, shareMessage: r.shareMessage });
      setHistory((h) => [r.link, ...h]);
      toast.success("Tautan aman dibuat — siap dikirim ke klien");
      onCreated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membuat tautan aman");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(link: SecureLinkDTO) {
    setBusyLinkId(link.id);
    try {
      await api.updateSecureLink(link.id, { active: !link.active });
      setHistory((h) => h.map((l) => (l.id === link.id ? { ...l, active: !link.active } : l)));
      toast.success(link.active ? "Tautan dinonaktifkan — penerima tidak bisa membuka lagi" : "Tautan diaktifkan kembali");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengubah tautan");
    } finally {
      setBusyLinkId(null);
    }
  }

  async function resetPassword(link: SecureLinkDTO) {
    if (!window.confirm(`Reset password untuk "${link.title}"? Password lama tidak berlaku.`)) return;
    setBusyLinkId(link.id);
    try {
      const r = await api.updateSecureLink(link.id, { password: randomPassword() });
      setCreated({ url: r.link.url, password: r.password ?? "", shareMessage: "" });
      toast.success("Password direset — kirim password baru ke klien");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal reset password");
    } finally {
      setBusyLinkId(null);
    }
  }

  async function removeLink(link: SecureLinkDTO) {
    if (!window.confirm(`Hapus permanen tautan "${link.title}"?`)) return;
    setBusyLinkId(link.id);
    try {
      await api.deleteSecureLink(link.id);
      setHistory((h) => h.filter((l) => l.id !== link.id));
      toast.success("Tautan dihapus");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menghapus tautan");
    } finally {
      setBusyLinkId(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) resetPanel();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4 text-teal-600" aria-hidden /> Kirim Dokumen — Secure Link
          </DialogTitle>
          <DialogDescription>
            {lead
              ? `Bagikan dokumen administratif kepada ${lead.contactName} (${lead.code}) via tautan aman berpassword — penerima buka tanpa login.`
              : "Bagikan dokumen via tautan aman berpassword — penerima buka tanpa login."}
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3">
              <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
              <p className="text-xs leading-relaxed text-emerald-800">
                Tautan aman aktif. Kirim <strong>tautan</strong> dan <strong>password</strong> lewat kanal yang sama dengan
                lead (WhatsApp/IG/Email) — password tidak dikirim otomatis oleh sistem.
              </p>
            </div>
            <CopyField label="Tautan aman" value={created.url} />
            {created.password && <CopyField label="Password dokumen" value={created.password} />}
            {created.shareMessage && <CopyField label="Pesan siap kirim" value={created.shareMessage} multiline />}
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  resetPanel();
                }}
              >
                Buat Tautan Lain
              </Button>
              <Button size="sm" onClick={() => onOpenChange(false)}>
                Selesai
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* ---------- Pilih dokumen ---------- */}
            {fixed ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
                <p className="text-xs font-medium text-slate-500">Dokumen yang dibagikan</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800 break-words">{target!.label ?? target!.title ?? target!.targetId}</p>
                <Badge variant="outline" className="mt-1.5 text-[10px]">
                  {SECURE_TARGET_LABEL[target!.targetType]}
                </Badge>
              </div>
            ) : loadingDocs ? (
              <div className="flex items-center gap-2 rounded-xl border px-3.5 py-4 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Memuat dokumen lead…
              </div>
            ) : options.length === 0 ? (
              <p className="rounded-xl border border-dashed px-3.5 py-4 text-center text-xs text-muted-foreground">
                Belum ada dokumen (penawaran / brief / file produksi) pada lead ini. Buat dulu lewat tombol “Buat Brief”
                atau “Buat Penawaran”.
              </p>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="sl-doc" className="text-xs">
                  Pilih dokumen
                </Label>
                <Select value={selected} onValueChange={setSelected}>
                  <SelectTrigger id="sl-doc" aria-label="Pilih dokumen untuk secure link">
                    <SelectValue placeholder="Pilih dokumen" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((o) => (
                      <SelectItem key={o.key} value={o.key}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedOption && <p className="text-[11px] text-muted-foreground">{selectedOption.sublabel}</p>}
              </div>
            )}

            {/* ---------- Password + kedaluwarsa ---------- */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sl-password" className="text-xs">
                  Password (opsional)
                </Label>
                <div className="flex gap-1.5">
                  <Input
                    id="sl-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Otomatis bila kosong"
                    className="font-mono text-xs"
                    autoComplete="off"
                  />
                  <Button type="button" size="icon" variant="outline" aria-label="Buat password otomatis" className="size-9 shrink-0" onClick={() => setPassword(randomPassword())}>
                    <Dices className="size-4" aria-hidden />
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sl-expiry" className="text-xs">
                  Masa berlaku
                </Label>
                <Select value={expiry} onValueChange={setExpiry}>
                  <SelectTrigger id="sl-expiry" aria-label="Pilih masa berlaku tautan">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 hari</SelectItem>
                    <SelectItem value="30">30 hari</SelectItem>
                    <SelectItem value="90">90 hari</SelectItem>
                    <SelectItem value="none">Tanpa kedaluwarsa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button size="sm" disabled={busy || (!fixed && !selectedOption)} className="w-full gap-2" onClick={() => void submit()}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <SendHorizonal className="size-4" aria-hidden />}
              {busy ? "Membuat tautan…" : "Buat Secure Link + Password"}
            </Button>

            {/* ---------- Riwayat tautan ---------- */}
            {history.length > 0 && (
              <div className="space-y-2 rounded-xl border border-slate-200 p-3">
                <p className="text-xs font-semibold text-slate-600">Riwayat tautan aman ({history.length})</p>
                <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                  {history.map((l) => (
                    <div key={l.id} className="rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-slate-800">{l.title}</p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                            <span className="font-mono">{l.url}</span>
                            <span>· {l.accessCount}× dibuka</span>
                            {l.expiresAt && <span>· s.d. {new Date(l.expiresAt).toLocaleDateString("id-ID")}</span>}
                            {l.targetLabel && <span>· {l.targetLabel}</span>}
                          </p>
                        </div>
                        <Badge variant="outline" className={cn("shrink-0 px-1.5 py-0 text-[10px]", l.active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-stone-200 bg-stone-100 text-stone-600")}>
                          {l.active ? "Aktif" : "Mati"}
                        </Badge>
                      </div>
                      <div className="mt-1.5 flex items-center gap-1">
                        <Button type="button" size="sm" variant="ghost" className="h-6 gap-1 px-1.5 text-[11px]" onClick={() => void toggleActive(l)} disabled={busyLinkId === l.id}>
                          <Power className="size-3" aria-hidden /> {l.active ? "Nonaktifkan" : "Aktifkan"}
                        </Button>
                        <Button type="button" size="sm" variant="ghost" className="h-6 gap-1 px-1.5 text-[11px]" onClick={() => void resetPassword(l)} disabled={busyLinkId === l.id}>
                          <KeyRound className="size-3" aria-hidden /> Reset Password
                        </Button>
                        <Button type="button" size="sm" variant="ghost" className="h-6 gap-1 px-1.5 text-[11px] text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => void removeLink(l)} disabled={busyLinkId === l.id}>
                          <Trash2 className="size-3" aria-hidden /> Hapus
                        </Button>
                        <a href={l.url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] text-slate-500 hover:bg-accent" aria-label={`Uji buka ${l.title}`}>
                          <ExternalLink className="size-3" aria-hidden /> Uji
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
                {history.some((l) => l.targetType === "DELIVERABLE") && (
                  <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <FileText className="size-3" aria-hidden /> Tautan file produksi tetap butuh password saat penerima membuka.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
