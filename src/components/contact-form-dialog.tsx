"use client";

import { useEffect, useMemo, useState } from "react";
import { AtSign, Building2, Loader2, Mail, Phone, TriangleAlert, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, type ContactDuplicateInfo } from "@/lib/api-client";
import { COUNTRIES, DEFAULT_COUNTRY, findCountry, formatPhoneDisplay } from "@/lib/countries";
import type { ContactDTO } from "@/lib/crm-types";

/** Gabungkan dial code negara dengan nomor yang diketik user menjadi digit internasional. */
function combinePhone(dial: string, raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (!digits) return "";
  if (trimmed.startsWith("+")) return digits; // sudah format internasional penuh
  if (digits.startsWith("0") && dial === "62") return digits; // format lokal Indonesia → server ubah ke 62
  if (digits.startsWith(dial)) return digits; // sudah memuat dial code
  return dial + digits;
}

export interface ContactFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = tambah kontak baru; terisi = edit kontak ini */
  contact?: ContactDTO | null;
  onSaved?: (contactId: string) => void;
  /** Dipanggil bila user memilih memakai kontak existing hasil dedupe (khusus mode tambah). */
  onUseExisting?: (existingId: string) => void;
}

/**
 * Form kontak NYATA (bukan dummy): nama lengkap, perusahaan, jabatan, negara,
 * dan semua kanal kontak (WhatsApp, email, Instagram) — dengan peringatan dedupe.
 * Dipakai di modul Kontak dan di detail lead (Inbox).
 */
export function ContactFormDialog({ open, onOpenChange, contact, onSaved, onUseExisting }: ContactFormDialogProps) {
  const editing = Boolean(contact);
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [position, setPosition] = useState("");
  const [country, setCountry] = useState<string>(DEFAULT_COUNTRY);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [igUsername, setIgUsername] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [dupe, setDupe] = useState<{ error: string; existing?: ContactDuplicateInfo } | null>(null);

  const countryInfo = useMemo(() => findCountry(country), [country]);

  useEffect(() => {
    if (!open) return;
    setDupe(null);
    if (contact) {
      setName(contact.name);
      setCompanyName(contact.companyName ?? contact.company ?? "");
      setPosition(contact.position ?? "");
      setCountry(contact.country || DEFAULT_COUNTRY);
      setPhone(contact.phone ?? "");
      setEmail(contact.email ?? "");
      setIgUsername(contact.igUsername ?? "");
      setNotes(contact.notes ?? "");
    } else {
      setName("");
      setCompanyName("");
      setPosition("");
      setCountry(DEFAULT_COUNTRY);
      setPhone("");
      setEmail("");
      setIgUsername("");
      setNotes("");
    }
  }, [open, contact]);

  async function submit() {
    if (!name.trim()) {
      toast.error("Nama lengkap wajib diisi");
      return;
    }
    setBusy(true);
    setDupe(null);
    try {
      if (contact) {
        await api.updateContact(contact.id, {
          name: name.trim(),
          position: position.trim() || null,
          companyName: companyName.trim() || null,
          country,
          phone: phone.trim() ? combinePhone(countryInfo.dial, phone) : null,
          email: email.trim() || null,
          igUsername: igUsername.trim() || null,
          notes: notes.trim() || null,
        });
        toast.success(`Kontak ${name.trim()} diperbarui`);
        onSaved?.(contact.id);
        onOpenChange(false);
      } else {
        const res = await api.createContact({
          name: name.trim(),
          position: position.trim() || undefined,
          companyName: companyName.trim() || undefined,
          country,
          phone: phone.trim() ? combinePhone(countryInfo.dial, phone) : undefined,
          email: email.trim() || undefined,
          igUsername: igUsername.trim() || undefined,
          notes: notes.trim() || undefined,
        });
        if (res.ok) {
          toast.success("Kontak baru tersimpan");
          onSaved?.(res.contactId);
          onOpenChange(false);
        } else {
          setDupe({ error: res.error, existing: res.existing });
        }
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const dupeExisting = dupe?.existing;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Kontak" : "Tambah Kontak"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Perbarui identitas dan kanal kontak. Data ini menentukan ke kanal mana balasan bisa dikirim."
              : "Identitas lengkap untuk mencegah data ganda — nomor/email/IG yang sudah terdaftar akan terdeteksi otomatis."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ct-name">
              Nama lengkap <span className="text-rose-600">*</span>
            </Label>
            <div className="relative">
              <UserRound className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="ct-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Sarah Johnson" className="pl-8" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ct-company">Perusahaan</Label>
            <div className="relative">
              <Building2 className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="ct-company" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="mis. Kopi Kita" className="pl-8" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ct-position">Jabatan</Label>
            <Input id="ct-position" value={position} onChange={(e) => setPosition(e.target.value)} placeholder="mis. Purchasing Manager" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ct-country">Negara</Label>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger id="ct-country" aria-label="Negara">
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
            <Label htmlFor="ct-phone">WhatsApp / Telepon</Label>
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 rounded-md border bg-muted px-2 py-2 font-mono text-xs text-muted-foreground" aria-label={`Kode negara +${countryInfo.dial}`}>
                +{countryInfo.dial}
              </span>
              <Input
                id="ct-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="8123456789"
                inputMode="tel"
                className="font-mono"
              />
            </div>
            {phone.trim() && (
              <p className="text-[11px] text-muted-foreground">Tersimpan sebagai {formatPhoneDisplay(combinePhone(countryInfo.dial, phone))}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ct-email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="ct-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@perusahaan.com" className="pl-8" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ct-ig">Instagram</Label>
            <div className="relative">
              <AtSign className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="ct-ig" value={igUsername} onChange={(e) => setIgUsername(e.target.value)} placeholder="username.ig" className="pl-8" />
            </div>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ct-notes">Catatan</Label>
            <Textarea id="ct-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Konteks kontak (mis. sumber kenal, kebiasaan follow-up)…" className="min-h-16" />
          </div>
        </div>

        {/* Peringatan dedupe */}
        {dupe && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
            <div className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">Tidak jadi duplikat — kontak ini sudah ada</p>
                <p className="mt-0.5 text-xs text-amber-800">{dupe.error}</p>
                {dupeExisting && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
                      onClick={() => {
                        onUseExisting?.(dupeExisting.id);
                        onOpenChange(false);
                      }}
                    >
                      <Phone className="size-3.5" /> Gunakan kontak &quot;{dupeExisting.name}&quot;
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Batal
          </Button>
          <Button onClick={() => void submit()} disabled={busy || !name.trim()}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {editing ? "Simpan Perubahan" : "Simpan Kontak"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
