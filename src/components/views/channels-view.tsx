"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  BellRing,
  CheckCheck,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Link2,
  Loader2,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { ChannelBadge } from "@/components/channel-badge";
import { api } from "@/lib/api-client";
import { CHANNEL_DESC, CHANNEL_LABEL, type ChannelConfigDTO, type ChannelType, type SessionUser } from "@/lib/crm-types";
import { ChannelIcon } from "@/lib/channel-meta";
import { cn } from "@/lib/utils";

function timeAgo(iso?: string | null): string {
  if (!iso) return "belum ada";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "baru saja";
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

/** Langkah setup per kanal — ditampilkan di dialog agar admin tahu harus setup apa di sisi provider. */
const SETUP_STEPS: Record<ChannelType, string[]> = {
  whatsapp: [
    "Buat akun WhatsApp Business Platform di Meta Business Suite (business.facebook.com).",
    "Di menu WhatsApp → API Setup, salin Phone Number ID dan buat Access Token permanen (System User, izin whatsapp_business_messaging).",
    "Di menu WhatsApp → Configuration, isi Webhook URL di bawah dengan Verify Token dari CRM, lalu subscribe ke field messages.",
  ],
  email: [
    "Siapkan alamat email khusus lead (mis. leads@udp.co.id).",
    "Di mail server (cPanel/Zoho/Google Workspace), buat forwarding / auto-BCC ke layanan email parser (Zapier, Make, Mailgun Routes).",
    "Arahkan parser untuk POST JSON ke Webhook URL di bawah dengan header X-UDP-Webhook-Token = token CRM.",
  ],
  instagram: [
    "Konversi akun IG brand ke Professional (Business) dan hubungkan ke Page Facebook.",
    "Di developer.facebook.com buat app, tambah produk Instagram → Messaging, salin IG Account ID & Access Token.",
    "Di Webhooks produk, isi Webhook URL + Verify Token dari CRM, subscribe ke field messages.",
  ],
  web: [
    "Tambahkan snippet embed (di bawah) ke website tiap brand, atau kirim form dengan fetch POST ke endpoint.",
    "Sertakan X-UDP-Api-Key (atau query ?key=) dari panel kanal ini.",
    "Field wajib: name, (email atau phone), message; opsional: brand, page.",
  ],
};

export function ChannelsView({ user }: { user: SessionUser }) {
  const [channels, setChannels] = useState<ChannelConfigDTO[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<ChannelConfigDTO | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [snippetFor, setSnippetFor] = useState<ChannelType | null>(null);

  const load = useCallback(async () => {
    try {
      const { channels: rows } = await api.channels();
      setChannels(rows);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const canEdit = user.role === "OWNER" || user.role === "MANAGER";
  const sorted = useMemo(
    () => (channels ? [...channels].sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.type.localeCompare(b.type)) : []),
    [channels]
  );

  const activeCount = channels?.filter((c) => c.enabled).length ?? 0;

  async function toggleEnabled(ch: ChannelConfigDTO, next: boolean) {
    if (!canEdit) {
      toast.error("Hanya Owner/Manajer yang dapat mengubah kanal");
      return;
    }
    if (next) {
      const missing = ch.configFields.filter((f) => f.required && !ch.config[f.key]?.trim());
      if (missing.length > 0) {
        toast.error(`Lengkapi dulu: ${missing.map((m) => m.label).join(", ")}`);
        return;
      }
    }
    setBusy(`toggle-${ch.type}`);
    try {
      const { channel } = await api.updateChannel(ch.type, { enabled: next });
      setChannels((prev) => prev?.map((c) => (c.type === channel.type ? channel : c)) ?? [channel]);
      toast.success(`${CHANNEL_LABEL[channel.type]} ${next ? "diaktifkan" : "dinonaktifkan"}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function openEdit(ch: ChannelConfigDTO) {
    setEditing(ch);
    setForm({ ...ch.config });
  }

  async function saveEdit() {
    if (!editing) return;
    setBusy("save");
    try {
      const { channel } = await api.updateChannel(editing.type, { config: form, name: form.displayName || editing.name });
      setChannels((prev) => prev?.map((c) => (c.type === channel.type ? channel : c)) ?? [channel]);
      toast.success("Konfigurasi kanal tersimpan");
      setEditing(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function simulate(ch: ChannelConfigDTO) {
    setBusy(`sim-${ch.type}`);
    try {
      const r = await api.simulateChannel(ch.type);
      toast.success(`Pesan masuk diproses → ${r.leadCode}${r.isNewLead ? " (lead baru)" : " (lanjutan percakapan)"}`);
      void load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function rotateKey(ch: ChannelConfigDTO) {
    if (!canEdit) {
      toast.error("Hanya Owner/Manajer yang dapat regenerasi kredensial");
      return;
    }
    setBusy(`key-${ch.type}`);
    try {
      const { channel } = await api.regenerateChannelKey(ch.type);
      setChannels((prev) => prev?.map((c) => (c.type === channel.type ? channel : c)) ?? [channel]);
      toast.success("Kredensial baru dibuat — jangan lupa diperbarui di provider");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const embedSnippet = (key: string) =>
    `<form id="udp-lead-form">\n  <input name="name" placeholder="Nama" required />\n  <input name="email" type="email" placeholder="Email" required />\n  <input name="phone" placeholder="No. WhatsApp" />\n  <select name="brand">\n    <option value="unimasi">Unimasi</option>\n    <option value="segia">Segia Tech</option>\n    <option value="erfo">Erfo Multimedia</option>\n    <option value="unicam">Unicam Studio</option>\n  </select>\n  <textarea name="message" placeholder="Kebutuhan Anda" required></textarea>\n  <button type="submit">Kirim</button>\n</form>\n<script>\n  document.getElementById("udp-lead-form").addEventListener("submit", async (e) => {\n    e.preventDefault();\n    const data = Object.fromEntries(new FormData(e.target));\n    const res = await fetch("${typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/web-form", {\n      method: "POST",\n      headers: { "Content-Type": "application/json", "X-UDP-Api-Key": "${key}" },\n      body: JSON.stringify({ ...data, page: location.href }),\n    });\n    alert((await res.json()).ok ? "Terima kasih! Tim kami akan menghubungi Anda." : "Gagal mengirim.");\n  });\n</script>`;

  function copy(text: string, label: string) {
    void navigator.clipboard.writeText(text).then(() => toast.success(`${label} disalin`));
  }

  if (!channels) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="p-5">
            <div className="animate-pulse space-y-3">
              <div className="h-5 w-40 rounded bg-muted" />
              <div className="h-3 w-full rounded bg-muted" />
              <div className="h-3 w-2/3 rounded bg-muted" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header ringkasan */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Pengaturan Kanal</h2>
          <p className="text-sm text-muted-foreground">
            Hubungkan WhatsApp, Email, Instagram, dan Form Web — semua pesan masuk otomatis terkonsolidasi ke Inbox Lead.
          </p>
        </div>
        <Badge variant={activeCount === 4 ? "success" : "warning"} className="h-fit gap-1.5 px-3 py-1">
          <BadgeCheck className="size-3.5" />
          {activeCount}/4 kanal aktif
        </Badge>
      </div>

      {/* Petunjuk alur */}
      <Card className="border-dashed bg-muted/40">
        <CardContent className="flex flex-col gap-2 pt-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:gap-4">
          <span className="flex items-center gap-2 font-medium text-foreground">
            <Link2 className="size-4 shrink-0" /> Cara kerjanya:
          </span>
          <span>
            Provider (Meta / mail server / website) mengirim event ke <span className="font-mono text-xs">/api/webhooks/…</span> → CRM membuat kontak +
            lead baru (atau melanjutkan percakapan yang ada) → tim diberi notifikasi & SLA respons mulai dihitung.
          </span>
        </CardContent>
      </Card>

      {/* Kartu kanal */}
      <div className="grid gap-4 lg:grid-cols-2">
        {sorted.map((ch) => {
          const Icon = ChannelIcon[ch.type];
          const missingRequired = ch.configFields.filter((f) => f.required && !ch.config[f.key]?.trim());
          const ready = missingRequired.length === 0;
          return (
            <Card key={ch.type} className={cn("transition-shadow hover:shadow-md", ch.enabled && "border-emerald-200")}>
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "flex size-10 items-center justify-center rounded-xl",
                      ch.type === "whatsapp" && "bg-emerald-100 text-emerald-700",
                      ch.type === "email" && "bg-amber-100 text-amber-700",
                      ch.type === "instagram" && "bg-rose-100 text-rose-700",
                      ch.type === "web" && "bg-stone-200 text-stone-700"
                    )}
                  >
                    <Icon className="size-5" />
                  </span>
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      {CHANNEL_LABEL[ch.type]}
                      {ch.enabled ? (
                        <Badge variant="success" className="gap-1">
                          <CheckCheck className="size-3" /> Aktif
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Nonaktif
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="mt-1 line-clamp-2">{CHANNEL_DESC[ch.type]}</CardDescription>
                  </div>
                </div>
                <Switch
                  checked={ch.enabled}
                  disabled={busy === `toggle-${ch.type}`}
                  onCheckedChange={(v) => void toggleEnabled(ch, v)}
                  aria-label={`Aktifkan ${CHANNEL_LABEL[ch.type]}`}
                />
              </CardHeader>
              <CardContent className="space-y-3">
                {/* status kesiapan */}
                {!ready && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Menunggu konfigurasi: {missingRequired.map((m) => m.label).join(", ")}.
                  </div>
                )}

                {/* ringkasan identitas kanal */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-muted/60 px-2.5 py-1.5">
                    <span className="text-muted-foreground">Identitas</span>
                    <p className="truncate font-medium">{ch.config.displayName || ch.config.phoneNumber || ch.config.inboundAddress || ch.config.igUsernames || "—"}</p>
                  </div>
                  <div className="rounded-lg bg-muted/60 px-2.5 py-1.5">
                    <span className="text-muted-foreground">Event terakhir</span>
                    <p className="truncate font-medium">{timeAgo(ch.lastEventAt)}</p>
                  </div>
                </div>

                {/* webhook url */}
                <div className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5">
                  <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
                  <code className="flex-1 truncate text-xs">{ch.webhookUrl}</code>
                  <Button variant="ghost" size="icon-sm" onClick={() => copy(`${typeof window !== "undefined" ? window.location.origin : ""}${ch.webhookUrl}`, "Webhook URL")} aria-label="Salin webhook URL">
                    <Copy className="size-3.5" />
                  </Button>
                </div>

                {/* token/secret */}
                <div className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5">
                  <ShieldCheck className="size-3.5 shrink-0 text-muted-foreground" />
                  <code className="flex-1 truncate text-xs">
                    {ch.type === "web"
                      ? ch.apiKey
                        ? showSecrets[ch.type]
                          ? ch.apiKey
                          : `${ch.apiKey.slice(0, 8)}••••••••${ch.apiKey.slice(-4)}`
                        : "—"
                      : ch.webhookSecret
                        ? showSecrets[ch.type]
                          ? ch.webhookSecret
                          : `${ch.webhookSecret.slice(0, 6)}••••••••`
                        : "—"}
                  </code>
                  <Button variant="ghost" size="icon-sm" onClick={() => setShowSecrets((p) => ({ ...p, [ch.type]: !p[ch.type] }))} aria-label="Tampilkan/sembunyikan token">
                    {showSecrets[ch.type] ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => copy(ch.type === "web" ? ch.apiKey ?? "" : ch.webhookSecret ?? "", "Kredensial")} aria-label="Salin kredensial">
                    <Copy className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => void rotateKey(ch)} aria-label="Regenerasi kredensial" title="Regenerasi kredensial">
                    <RefreshCw className={cn("size-3.5", busy === `key-${ch.type}` && "animate-spin")} />
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => openEdit(ch)} disabled={!canEdit}>
                    <KeyRound className="size-3.5" /> Konfigurasi
                  </Button>
                  {ch.type === "web" && (
                    <Button size="sm" variant="outline" onClick={() => setSnippetFor(ch.type)}>
                      <Copy className="size-3.5" /> Snippet Embed
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => void simulate(ch)} disabled={busy === `sim-${ch.type}`}>
                    {busy === `sim-${ch.type}` ? <Loader2 className="size-3.5 animate-spin" /> : <PlayCircle className="size-3.5" />}
                    Uji Pesan Masuk
                  </Button>
                  <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                    <BellRing className="size-3" /> {ch.eventCount} event
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Dialog konfigurasi */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editing && <ChannelBadge channel={editing.type} />}
              Konfigurasi {editing && CHANNEL_LABEL[editing.type]}
            </DialogTitle>
            <DialogDescription>Isi kredensial dari provider. Data disimpan di server CRM dan hanya dipakai untuk memproses pesan masuk.</DialogDescription>
          </DialogHeader>

          {editing && (
            <div className="space-y-4">
              <ol className="list-decimal space-y-1.5 rounded-xl bg-muted/60 p-3 pl-7 text-xs leading-relaxed text-muted-foreground">
                {SETUP_STEPS[editing.type].map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
              <Separator />
              {editing.configFields.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={`cfg-${f.key}`}>
                    {f.label}
                    {f.required && <span className="ml-1 text-rose-500">*</span>}
                  </Label>
                  {f.type === "textarea" ? (
                    <textarea
                      id={`cfg-${f.key}`}
                      className="min-h-20 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      placeholder={f.placeholder}
                      value={form[f.key] ?? ""}
                      onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                    />
                  ) : (
                    <Input
                      id={`cfg-${f.key}`}
                      type={f.type === "password" && !showSecrets[`f-${f.key}`] ? "password" : "text"}
                      placeholder={f.placeholder}
                      value={form[f.key] ?? ""}
                      onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                    />
                  )}
                  {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Batal
            </Button>
            <Button onClick={() => void saveEdit()} disabled={busy === "save"}>
              {busy === "save" && <Loader2 className="size-4 animate-spin" />} Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog snippet embed (kanal web) */}
      <Dialog open={snippetFor === "web"} onOpenChange={(o) => !o && setSnippetFor(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Snippet Embed Form Web</DialogTitle>
            <DialogDescription>
              Tempel kode ini di website brand Anda. Setiap submit otomatis masuk ke Inbox Lead dengan kanal &ldquo;Form Web&rdquo;.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <pre className="max-h-72 overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-relaxed text-slate-200">
              <code>{snippetFor && embedSnippet(sorted.find((c) => c.type === "web")?.apiKey ?? "UDP_API_KEY")}</code>
            </pre>
            <Button
              size="sm"
              variant="secondary"
              className="absolute right-2 top-2"
              onClick={() => snippetFor && copy(embedSnippet(sorted.find((c) => c.type === "web")?.apiKey ?? "UDP_API_KEY"), "Snippet")}
            >
              <Copy className="size-3.5" /> Salin
            </Button>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Timer className="size-3.5" /> Ganti API key otomatis diperbarui di snippet saat disalin ulang.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
