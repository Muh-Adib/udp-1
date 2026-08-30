"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  FileText,
  Globe,
  Info,
  Landmark,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  RefreshCw,
  StickyNote,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import type { BrandProfileDTO, SessionUser } from "@/lib/crm-types";
import { cn } from "@/lib/utils";

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ACCEPTED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

interface BrandFormState {
  name: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  primaryColor: string;
  letterheadNote: string;
  footerNote: string;
  bankInfo: string;
}

function toFormState(b: BrandProfileDTO): BrandFormState {
  return {
    name: b.name,
    tagline: b.tagline,
    address: b.address,
    phone: b.phone,
    email: b.email,
    website: b.website,
    primaryColor: b.primaryColor,
    letterheadNote: b.letterheadNote,
    footerNote: b.footerNote,
    bankInfo: b.bankInfo,
  };
}

/** Logo brand dengan fallback monogram huruf pertama berlatar warna utama. */
function BrandLogo({ name, color, logoUrl, size = "md" }: { name: string; color: string; logoUrl: string | null; size?: "sm" | "md" }) {
  const box = size === "sm" ? "size-10 rounded-lg text-base" : "size-12 rounded-xl text-lg";
  if (logoUrl) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt={`Logo ${name}`} className={cn("shrink-0 bg-white object-contain p-0.5", box)} />
      </>
    );
  }
  return (
    <span
      className={cn("flex shrink-0 items-center justify-center font-black text-white", box)}
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {(name || "?").slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Pratinjau MINI KOP SURAT — dipakai di kartu daftar & live preview dialog edit. */
function LetterheadPreview({
  name,
  tagline,
  address,
  phone,
  email,
  website,
  color,
  logoUrl,
  note,
  showNote = true,
}: {
  name: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  color: string;
  logoUrl: string | null;
  note: string;
  showNote?: boolean;
}) {
  const c = HEX_RE.test(color) ? color : "#059669";
  const contactLines = [
    [address, [phone, email].filter(Boolean).join(" · ")].filter(Boolean).join(" — "),
    website,
  ].filter(Boolean);
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <BrandLogo name={name} color={c} logoUrl={logoUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-black tracking-tight sm:text-xl" style={{ color: c }}>
            {name || "Nama Brand"}
          </p>
          {tagline ? (
            <p className="truncate text-[10px] font-medium uppercase tracking-widest text-slate-500">{tagline}</p>
          ) : null}
        </div>
        {contactLines.length > 0 && (
          <div className="hidden max-w-40 shrink-0 text-right text-[10px] leading-relaxed text-slate-500 sm:block">
            {contactLines.map((l) => (
              <p key={l} className="truncate">
                {l}
              </p>
            ))}
          </div>
        )}
      </div>
      {contactLines.length > 0 && (
        <div className="mt-2 space-y-0.5 text-[10px] leading-relaxed text-slate-500 sm:hidden">
          {contactLines.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
      )}
      {showNote && note ? <p className="mt-1.5 text-center text-[10px] italic text-slate-500">{note}</p> : null}
      <div className="mt-2.5 h-1.5 rounded-full" style={{ backgroundColor: c }} aria-hidden />
    </div>
  );
}

/** Baris field identitas di kartu — label kecil + isi (boleh panjang, scroll bila melebihi). */
function FieldRow({ icon: Icon, label, value }: { icon: typeof FileText; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-slate-50 px-2.5 py-2">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-slate-400" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className={cn("text-xs leading-relaxed", value ? "text-slate-700" : "italic text-slate-400")}>{value || "Belum diisi"}</p>
      </div>
    </div>
  );
}

export default function BrandView({ user }: { user: SessionUser }) {
  const [brands, setBrands] = useState<BrandProfileDTO[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<BrandProfileDTO | null>(null);
  const [form, setForm] = useState<BrandFormState | null>(null);
  const [colorText, setColorText] = useState("");
  const [colorError, setColorError] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canEdit = user.role === "OWNER" || user.role === "MANAGER";

  const load = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const r = await api.brands();
      setBrands(r.brands);
    } catch {
      /* biarkan brands null → kartu error + Coba Lagi */
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  function openEdit(b: BrandProfileDTO) {
    setEditing(b);
    setForm(toFormState(b));
    setColorText(b.primaryColor);
    setColorError(null);
    setLogoFile(null);
    setLogoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function closeEdit() {
    setEditing(null);
    setForm(null);
    setLogoFile(null);
    setLogoPreview(null);
  }

  function setField<K extends keyof BrandFormState>(key: K, value: BrandFormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function handleColorPicker(next: string) {
    // Pemilih warna selalu menghasilkan #rrggbb — sinkronkan teks hex.
    setField("primaryColor", next);
    setColorText(next);
    setColorError(null);
  }

  function handleColorText(next: string) {
    setColorText(next);
    if (HEX_RE.test(next)) {
      setField("primaryColor", next);
      setColorError(null);
    } else {
      setColorError("Format warna harus #RRGGBB — contoh: #059669");
    }
  }

  async function handleUploadLogo() {
    if (!editing || !logoFile) return;
    if (!ACCEPTED_LOGO_TYPES.includes(logoFile.type)) {
      toast.error("Format logo harus PNG, JPG, WEBP, atau SVG");
      return;
    }
    if (logoFile.size > MAX_LOGO_BYTES) {
      toast.error("Ukuran logo maksimal 2 MB");
      return;
    }
    setLogoBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", logoFile);
      const { brand } = await api.uploadBrandLogo(editing.brand, fd);
      const url = brand.logoUrl;
      // Cache-bust agar <img> memuat ulang file logo terbaru dari respons server.
      setLogoPreview(url ? `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}` : null);
      setBrands((prev) => (prev ? prev.map((b) => (b.brand === brand.brand ? brand : b)) : prev));
      toast.success(`Logo ${brand.name} berhasil diunggah`);
      setLogoFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLogoBusy(false);
    }
  }

  async function handleSave() {
    if (!editing || !form) return;
    if (!HEX_RE.test(form.primaryColor)) {
      setColorError("Format warna harus #RRGGBB — contoh: #059669");
      return;
    }
    setSaving(true);
    try {
      const { brand } = await api.updateBrand(editing.brand, {
        name: form.name,
        tagline: form.tagline,
        address: form.address,
        phone: form.phone,
        email: form.email,
        website: form.website,
        primaryColor: form.primaryColor,
        letterheadNote: form.letterheadNote,
        footerNote: form.footerNote,
        bankInfo: form.bankInfo,
      });
      toast.success(`Identitas ${brand.name} tersimpan`);
      closeEdit();
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* ===== HEADER ===== */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Identitas Brand</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Data kop surat untuk dokumen Penawaran, Brief, dan Invoice — logo, warna, kontak, dan rekening tiap brand.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load(true)} disabled={loading} className="shrink-0 gap-1.5">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Muat Ulang
        </Button>
      </div>

      {/* ===== INFO BOX ===== */}
      <div className="flex items-start gap-2.5 rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs leading-relaxed text-teal-900 sm:p-4">
        <Info className="mt-0.5 size-4 shrink-0 text-teal-600" aria-hidden />
        <p>Identitas ini otomatis dipakai pada dokumen Surat Penawaran &amp; Brief Proyek (kop surat, warna, logo, rekening).</p>
      </div>

      {/* ===== SKELETON ===== */}
      {loading && !brands ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} className="rounded-2xl">
              <CardContent className="space-y-3 p-4 sm:p-6">
                <div className="flex items-center gap-3">
                  <div className="size-12 animate-pulse rounded-xl bg-slate-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
                    <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
                  </div>
                </div>
                <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
                <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-3/4 animate-pulse rounded bg-slate-100" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {/* ===== ERROR ===== */}
      {!loading && !brands ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center sm:p-8">
          <AlertTriangle className="mx-auto size-8 text-rose-500" aria-hidden />
          <p className="mt-3 text-sm font-semibold text-rose-900">Gagal memuat identitas brand</p>
          <p className="mt-1 text-xs text-rose-700">Periksa koneksi lalu coba lagi.</p>
          <Button variant="outline" onClick={() => void load(true)} className="mt-4 gap-1.5 border-rose-300 text-rose-800 hover:bg-rose-100">
            <RefreshCw className="size-4" /> Coba Lagi
          </Button>
        </div>
      ) : null}

      {/* ===== GRID KARTU BRAND ===== */}
      {brands ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {brands.map((b) => (
            <Card key={b.brand} className="rounded-2xl">
              <CardContent className="space-y-4 p-4 sm:p-6">
                {/* Kepala kartu: badge kode + aksi */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Badge variant="outline" className="shrink-0 font-mono text-[10px] uppercase">
                      {b.brand}
                    </Badge>
                    <span className="truncate text-sm font-semibold text-slate-700">{b.tagline || "—"}</span>
                  </div>
                  {canEdit ? (
                    <Button size="sm" variant="outline" onClick={() => openEdit(b)} className="shrink-0 gap-1.5">
                      <Pencil className="size-3.5" /> Edit
                    </Button>
                  ) : (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">
                      Hanya Owner/Manajer dapat mengubah
                    </span>
                  )}
                </div>

                {/* Pratinjau mini kop surat */}
                <LetterheadPreview
                  name={b.name}
                  tagline={b.tagline}
                  address={b.address}
                  phone={b.phone}
                  email={b.email}
                  website={b.website}
                  color={b.primaryColor}
                  logoUrl={b.logoUrl}
                  note={b.letterheadNote}
                />

                {/* Detail kontak kecil */}
                <div className="grid grid-cols-1 gap-1.5 text-xs text-slate-600 sm:grid-cols-2">
                  <p className="flex items-center gap-1.5 truncate">
                    <MapPin className="size-3.5 shrink-0 text-slate-400" aria-hidden /> <span className="truncate">{b.address || "—"}</span>
                  </p>
                  <p className="flex items-center gap-1.5 truncate">
                    <Phone className="size-3.5 shrink-0 text-slate-400" aria-hidden /> <span className="truncate">{b.phone || "—"}</span>
                  </p>
                  <p className="flex items-center gap-1.5 truncate">
                    <Mail className="size-3.5 shrink-0 text-slate-400" aria-hidden /> <span className="truncate">{b.email || "—"}</span>
                  </p>
                  <p className="flex items-center gap-1.5 truncate">
                    <Globe className="size-3.5 shrink-0 text-slate-400" aria-hidden /> <span className="truncate">{b.website || "—"}</span>
                  </p>
                </div>

                {/* Daftar field dokumen */}
                <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
                  <FieldRow icon={FileText} label="Baris legal (kop)" value={b.letterheadNote} />
                  <FieldRow icon={StickyNote} label="Footer dokumen" value={b.footerNote} />
                  <FieldRow icon={Landmark} label="Rekening pembayaran" value={b.bankInfo} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {/* ===== DIALOG EDIT ===== */}
      <Dialog open={editing !== null} onOpenChange={(o) => (!o ? closeEdit() : undefined)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Identitas — {editing?.name}</DialogTitle>
            <DialogDescription>
              Perubahan langsung terlihat pada kop surat Penawaran, Brief, dan Invoice brand ini.
            </DialogDescription>
          </DialogHeader>

          {form && editing ? (
            <div className="space-y-5">
              {/* Pratinjau kop surat LIVE */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Pratinjau Kop Surat (langsung)</p>
                <LetterheadPreview
                  name={form.name}
                  tagline={form.tagline}
                  address={form.address}
                  phone={form.phone}
                  email={form.email}
                  website={form.website}
                  color={form.primaryColor}
                  logoUrl={logoPreview ?? editing.logoUrl}
                  note={form.letterheadNote}
                />
              </div>

              {/* ===== FORM ===== */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="bf-name">Nama Brand</Label>
                  <Input id="bf-name" value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="Nama brand" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bf-tagline">Tagline</Label>
                  <Input id="bf-tagline" value={form.tagline} onChange={(e) => setField("tagline", e.target.value)} placeholder="Tagline singkat" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="bf-address">Alamat</Label>
                  <Textarea id="bf-address" rows={2} value={form.address} onChange={(e) => setField("address", e.target.value)} placeholder="Alamat lengkap kantor" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bf-phone">Telepon</Label>
                  <Input id="bf-phone" value={form.phone} onChange={(e) => setField("phone", e.target.value)} placeholder="+62 ..." />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bf-email">Email</Label>
                  <Input id="bf-email" type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} placeholder="halo@brand.co.id" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="bf-website">Website</Label>
                  <Input id="bf-website" value={form.website} onChange={(e) => setField("website", e.target.value)} placeholder="https://brand.co.id" />
                </div>

                {/* Warna utama: color picker + hex tersinkronisasi dua arah */}
                <div className="space-y-1.5">
                  <Label htmlFor="bf-color">Warna Utama</Label>
                  <div className="flex items-center gap-2">
                    <input
                      id="bf-color"
                      type="color"
                      value={HEX_RE.test(form.primaryColor) ? form.primaryColor : "#059669"}
                      onChange={(e) => handleColorPicker(e.target.value)}
                      className="h-10 w-14 shrink-0 cursor-pointer rounded-lg border border-input bg-transparent p-1"
                      aria-label="Pilih warna utama brand"
                    />
                    <Input
                      value={colorText}
                      onChange={(e) => handleColorText(e.target.value)}
                      placeholder="#059669"
                      aria-invalid={colorError ? true : undefined}
                      className="font-mono"
                    />
                  </div>
                  {colorError ? <p className="text-xs font-medium text-rose-600">{colorError}</p> : null}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="bf-letterhead">Baris Legal (kop surat)</Label>
                  <Textarea
                    id="bf-letterhead"
                    rows={2}
                    value={form.letterheadNote}
                    onChange={(e) => setField("letterheadNote", e.target.value)}
                    placeholder="Contoh: PT. Unicam Digital Pictvres · Terdaftar di ..."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bf-footer">Footer Dokumen</Label>
                  <Textarea
                    id="bf-footer"
                    rows={2}
                    value={form.footerNote}
                    onChange={(e) => setField("footerNote", e.target.value)}
                    placeholder="Teks footer di bawah dokumen"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bf-bank">Rekening Pembayaran</Label>
                  <Textarea
                    id="bf-bank"
                    rows={2}
                    value={form.bankInfo}
                    onChange={(e) => setField("bankInfo", e.target.value)}
                    placeholder="Contoh: BCA 1234567890 a.n. PT. Unicam Digital Pictvres"
                  />
                </div>
              </div>

              {/* ===== LOGO ===== */}
              <div className="space-y-3 rounded-xl border bg-slate-50/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Logo Brand</p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">
                      {logoPreview || editing.logoUrl ? "Logo aktif saat ini" : "Belum ada logo — kop memakai monogram huruf pertama"}
                    </p>
                  </div>
                  <BrandLogo name={form.name} color={form.primaryColor} logoUrl={logoPreview ?? editing.logoUrl} size="sm" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bf-logo">Ganti Logo (PNG/JPG/WEBP/SVG)</Label>
                  <Input
                    id="bf-logo"
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                    className="cursor-pointer bg-white file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200"
                  />
                  {logoFile ? (
                    <p className="text-[11px] text-slate-500">
                      Terpilih: <span className="font-medium text-slate-700">{logoFile.name}</span> · {(logoFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  ) : null}
                  <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-800">
                    <Info className="size-3.5 shrink-0" aria-hidden /> Maks 2 MB — format PNG, JPG, WEBP, atau SVG
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleUploadLogo()}
                  disabled={!logoFile || logoBusy}
                  className="gap-1.5"
                >
                  {logoBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />} Unggah Logo
                </Button>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="ghost" onClick={closeEdit} disabled={saving}>
              Batal
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving || (form ? !HEX_RE.test(form.primaryColor) : false)} className="gap-1.5">
              {saving ? <Loader2 className="size-4 animate-spin" /> : null} Simpan Perubahan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
