"use client";

import { useEffect, useMemo, useState } from "react";
import { AtSign, Building2, ClipboardPaste, Globe, Hash, Loader2, Mail, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import { COUNTRIES, DEFAULT_COUNTRY, findCountry, formatPhoneDisplay } from "@/lib/countries";
import { BRANDS, type BrandProfileDTO, type ChannelType, type IntakeLeadResult } from "@/lib/crm-types";
import { ChannelIcon } from "@/lib/channel-meta";

const SOURCE_OPTIONS: { value: ChannelType | "manual"; label: string; hint: string }[] = [
  { value: "whatsapp", label: "WhatsApp", hint: "Chat WA yang benar-benar diterima" },
  { value: "instagram", label: "Instagram DM", hint: "DM dari akun bisnis brand" },
  { value: "email", label: "Email", hint: "Inquiry / RFP masuk inbox" },
  { value: "web", label: "Form Web", hint: "Kontak dari website brand" },
  { value: "manual", label: "Manual", hint: "Telepon / event / referral" },
];

function combinePhone(dial: string, raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (!digits) return "";
  if (trimmed.startsWith("+")) return digits;
  if (digits.startsWith("0") && dial === "62") return digits;
  if (digits.startsWith(dial)) return digits;
  return dial + digits;
}

export interface IntakeLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dipanggil setelah lead tercatat — parent me-reload daftar dan membuka lead tsb. */
  onCreated: (result: IntakeLeadResult) => void;
}

/**
 * Form "Lead Masuk" — pintu masuk lead REAL menggantikan data dummy.
 * Identitas kontak lengkap (nama, perusahaan, jabatan, negara, semua kanal)
 * + isi percakapan. Melewati pipeline dedupe yang sama dengan webhook kanal:
 * kontak ganda otomatis dikenali, pesan nyambung ke lead terbuka yang sama.
 */
export function IntakeLeadDialog({ open, onOpenChange, onCreated }: IntakeLeadDialogProps) {
  const [channel, setChannel] = useState<ChannelType | "manual">("whatsapp");
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [position, setPosition] = useState("");
  const [country, setCountry] = useState<string>(DEFAULT_COUNTRY);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [igUsername, setIgUsername] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [brand, setBrand] = useState(""); // WAJIB dipilih eksplisit — tanpa default senyap
  const [sourceRef, setSourceRef] = useState("");
  const [brandProfiles, setBrandProfiles] = useState<BrandProfileDTO[]>([]);
  const [busy, setBusy] = useState(false);

  const countryInfo = useMemo(() => findCountry(country), [country]);
  const selectedBrand = useMemo(() => brandProfiles.find((b) => b.brand === brand) ?? null, [brandProfiles, brand]);

  useEffect(() => {
    if (!open) return;
    setChannel("whatsapp");
    setName("");
    setCompanyName("");
    setPosition("");
    setCountry(DEFAULT_COUNTRY);
    setPhone("");
    setEmail("");
    setIgUsername("");
    setSubject("");
    setBody("");
    setBrand("");
    setSourceRef("");
    setBusy(false);
    // Muat identitas kanal tiap brand (IG/email/web asli) untuk bantuan pemilihan brand
    api
      .brands()
      .then((r) => setBrandProfiles(r.brands))
      .catch(() => setBrandProfiles([]));
  }, [open]);

  // Pra-isi subjek otomatis bila kosong sesuai kanal
  useEffect(() => {
    setSubject((cur) => (cur ? cur : ""));
  }, [channel]);

  const canSubmit =
    name.trim() &&
    subject.trim() &&
    body.trim() &&
    !!brand &&
    (phone.trim() || email.trim() || igUsername.trim() || channel === "web" || channel === "manual") &&
    !busy;

  async function submit() {
    setBusy(true);
    try {
      const result = await api.intakeLead({
        channel,
        name: name.trim(),
        company: companyName.trim() || undefined,
        position: position.trim() || undefined,
        country,
        phone: phone.trim() ? combinePhone(countryInfo.dial, phone) : undefined,
        email: email.trim() || undefined,
        igUsername: igUsername.trim() || undefined,
        subject: subject.trim(),
        body: body.trim(),
        brand,
        sourceRef: sourceRef.trim() || undefined,
      });

      if (!result.isNewLead) {
        toast.success(`Pesan dicatat ke percakapan terbuka ${result.leadCode}`, {
          description: result.matchedBy
            ? `Kontak dikenali dari ${result.matchedBy === "phone" ? "nomor telepon" : result.matchedBy === "email" ? "email" : "Instagram"} — tanpa duplikat data.`
            : "Lead pada kanal yang sama masih terbuka (≤14 hari).",
        });
      } else if (!result.newContact) {
        toast.success(`Lead baru ${result.leadCode} dibuat`, {
          description: `Kontak sudah terdaftar (cocok via ${result.matchedBy === "phone" ? "nomor telepon" : result.matchedBy === "email" ? "email" : "Instagram"}) — data tidak diduplikasi.`,
        });
      } else {
        toast.success(`Lead baru ${result.leadCode} dibuat`, { description: "Kontak baru tersimpan ke basis data kontak." });
      }

      onCreated(result);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const placeholderBody: Record<ChannelType | "manual", string> = {
    whatsapp: "Tempel isi chat WhatsApp yang masuk, mis. \"Halo, saya mau tanya jasa booth untuk event Juli…\"",
    instagram: "Tempel isi DM Instagram yang masuk…",
    email: "Tempel isi email inquiry yang masuk…",
    web: "Isi formulir web yang dikirim pengunjung…",
    manual: "Ringkasan percakapan telepon / pertemuan…",
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardPaste className="size-4 text-primary" /> Catat Lead Masuk
          </DialogTitle>
          <DialogDescription>
            Pencatatan percakapan lead yang benar-benar terjadi. Kontak dicek otomatis agar tidak duplikat, dan balasan nanti
            diarahkan ke kanal yang tepat.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Kanal sumber percakapan</Label>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
              {SOURCE_OPTIONS.map((opt) => {
                const Icon = opt.value === "manual" ? Hash : ChannelIcon[opt.value as ChannelType];
                const active = channel === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={active}
                    title={opt.hint}
                    onClick={() => setChannel(opt.value)}
                    className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-medium transition-colors cursor-pointer ${
                      active ? "border-primary bg-accent text-foreground" : "bg-card text-muted-foreground hover:bg-accent/60"
                    }`}
                  >
                    <Icon className="size-3.5" aria-hidden /> {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="in-name">
              Nama lengkap <span className="text-rose-600">*</span>
            </Label>
            <div className="relative">
              <UserRound className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="in-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama lead (mis. Sarah Johnson)" className="pl-8" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="in-company">Perusahaan</Label>
            <div className="relative">
              <Building2 className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="in-company" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="mis. Horizon Exhibits" className="pl-8" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="in-position">Jabatan</Label>
            <Input id="in-position" value={position} onChange={(e) => setPosition(e.target.value)} placeholder="mis. Marketing Manager" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="in-country">Negara</Label>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger id="in-country" aria-label="Negara">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {COUNTRIES.map((c) => (
                  <SelectItem key={c.code} value={c.name}>
                    <span aria-hidden>{c.flag}</span> {c.name} <span className="text-muted-foreground">(+{c.dial})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="in-phone">WhatsApp / Telepon</Label>
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 rounded-md border bg-muted px-2 py-2 font-mono text-xs text-muted-foreground" aria-label={`Kode negara +${countryInfo.dial}`}>
                +{countryInfo.dial}
              </span>
              <Input id="in-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="8123456789" inputMode="tel" className="font-mono" />
            </div>
            {phone.trim() && (
              <p className="text-[11px] text-muted-foreground">Tersimpan sebagai {formatPhoneDisplay(combinePhone(countryInfo.dial, phone))}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="in-email">
              Email {channel === "email" && <span className="text-rose-600">*</span>}
            </Label>
            <div className="relative">
              <Mail className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="in-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@perusahaan.com" className="pl-8" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="in-ig">
              Instagram {channel === "instagram" && <span className="text-rose-600">*</span>}
            </Label>
            <div className="relative">
              <AtSign className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="in-ig" value={igUsername} onChange={(e) => setIgUsername(e.target.value)} placeholder="username.ig" className="pl-8" />
            </div>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="in-subject">
              Subjek <span className="text-rose-600">*</span>
            </Label>
            <Input id="in-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="mis. Inquiry booth pameran Juli 2025" />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="in-body">
              Isi pesan masuk <span className="text-rose-600">*</span>
            </Label>
            <Textarea id="in-body" value={body} onChange={(e) => setBody(e.target.value)} placeholder={placeholderBody[channel]} className="min-h-24" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="in-brand">
              Brand yang dituju <span className="text-rose-600">*</span>
            </Label>
            <Select value={brand} onValueChange={setBrand} required>
              <SelectTrigger id="in-brand" aria-label="Brand yang dituju (wajib)">
                <SelectValue placeholder="Pilih brand…" />
              </SelectTrigger>
              <SelectContent>
                {(brandProfiles.length > 0
                  ? brandProfiles.map((b) => ({ key: b.brand, name: b.name }))
                  : BRANDS.map((b) => ({ key: b.key as string, name: b.name }))
                )
                  .filter((b) => b.key)
                  .map((b) => (
                    <SelectItem key={b.key} value={b.key}>
                      {b.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {selectedBrand ? (
              <div className="rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] leading-relaxed text-slate-600">
                <p className="font-medium text-slate-700">Percakapan tercatat atas akun resmi brand ini:</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  {selectedBrand.instagram ? (
                    <span className="inline-flex items-center gap-1">
                      <AtSign className="size-3 text-slate-400" aria-hidden /> {selectedBrand.instagram}
                    </span>
                  ) : null}
                  {selectedBrand.email ? (
                    <span className="inline-flex items-center gap-1">
                      <Mail className="size-3 text-slate-400" aria-hidden /> {selectedBrand.email}
                    </span>
                  ) : null}
                  {selectedBrand.website ? (
                    <span className="inline-flex items-center gap-1">
                      <Globe className="size-3 text-slate-400" aria-hidden /> {selectedBrand.website}
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 italic text-slate-400">Kop dokumen (penawaran/brief) otomatis mengikuti identitas brand ini.</p>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">Wajib dipilih — lead tidak boleh menggantung tanpa brand.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="in-ref">Sumber detail (opsional)</Label>
            <Input
              id="in-ref"
              value={sourceRef}
              onChange={(e) => setSourceRef(e.target.value)}
              placeholder={
                selectedBrand
                  ? channel === "instagram"
                    ? `mis. DM masuk ke ${selectedBrand.instagram}`
                    : channel === "email"
                      ? `mis. masuk ke ${selectedBrand.email}`
                      : channel === "web"
                        ? `mis. form di ${selectedBrand.website}`
                        : channel === "whatsapp"
                          ? selectedBrand.phone
                            ? `mis. WA bisnis ${selectedBrand.phone}`
                            : "mis. WA bisnis brand"
                          : "mis. event / referral / telepon"
                  : "Pilih brand dulu untuk saran akun"
              }
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Batal
          </Button>
          <Button onClick={() => void submit()} disabled={!canSubmit}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ClipboardPaste className="size-4" />}
            Catat Lead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
