import { createHash, randomBytes } from "crypto";
import { db } from "@/lib/db";
import type { ChannelConfigDTO, ChannelField, ChannelType } from "@/lib/crm-types";

export function generateApiKey(): string {
  return `gk_${randomBytes(16).toString("hex")}`;
}

export function generateVerifyToken(): string {
  return randomBytes(12).toString("hex");
}

export function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export function maskSecret(value?: string | null): string {
  if (!value) return "";
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••••••${value.slice(-4)}`;
}

/** Definisi field konfigurasi per kanal — dipakai oleh form Pengaturan Kanal. */
export const CHANNEL_CONFIG_FIELDS: Record<ChannelType, ChannelField[]> = {
  whatsapp: [
    { key: "displayName", label: "Nama Tampilan Nomor", placeholder: "Grupa Kreasi WA Bisnis", required: true },
    { key: "phoneNumber", label: "Nomor WhatsApp Bisnis", placeholder: "+62 812-3456-7890", required: true },
    { key: "phoneNumberId", label: "Phone Number ID (Meta Cloud API)", placeholder: "123456789012345", required: true, hint: "Ambil dari Meta Business Suite → WhatsApp → API Setup." },
    { key: "accessToken", label: "Access Token (permanen)", type: "password", placeholder: "EAAG...", required: true, secret: true, hint: "Token sistem pengguna dengan izin whatsapp_business_messaging." },
    { key: "apiVersion", label: "Versi Graph API", placeholder: "v21.0", hint: "Kosongkan untuk default v21.0." },
  ],
  email: [
    { key: "displayName", label: "Nama Tampilan", placeholder: "Sales & Inquiry Grupa Kreasi", required: true },
    { key: "inboundAddress", label: "Alamat Email Masuk", placeholder: "leads@grupakreasi.id", required: true, hint: "Semua inquiry dari website/kartu nama diarahkan ke alamat ini." },
    { key: "forwardingRule", label: "Aturan Forwarding / Auto-BCC", placeholder: "forward → webhook CRM", hint: "Set mail server untuk meneruskan (parse) email ke Webhook URL di bawah." },
    { key: "smtpHost", label: "SMTP Host (balasan)", placeholder: "smtp.grupakreasi.id" },
    { key: "smtpUser", label: "SMTP User", placeholder: "crm@grupakreasi.id" },
  ],
  instagram: [
    { key: "displayName", label: "Nama Tampilan", placeholder: "DM @grupakreasi", required: true },
    { key: "igUsernames", label: "Akun IG Bisnis (pisahkan koma)", placeholder: "@unimasi_id, @segiatech, @erfomultimedia, @unicamstudio", required: true, hint: "DM masuk ke akun manapun akan ditarik ke Inbox Lead." },
    { key: "igAccountId", label: "IG Business Account ID", placeholder: "1784xxxxxxxxxxx", required: true },
    { key: "accessToken", label: "Access Token (Meta)", type: "password", placeholder: "IGQVJ...", required: true, secret: true },
  ],
  web: [
    { key: "displayName", label: "Nama Tampilan", placeholder: "Form Website grupakreasi.id", required: true },
    { key: "siteUrls", label: "URL Situs Sumber (pisahkan koma)", placeholder: "https://grupakreasi.id, https://unimasi.id", required: true },
    { key: "defaultBrand", label: "Brand Default (jika form tidak mengirim brand)", placeholder: "unimasi", hint: "unimasi | segia | erfo | unicam" },
  ],
};

const DEFAULT_CHANNEL_NAMES: Record<ChannelType, string> = {
  whatsapp: "WhatsApp Business",
  email: "Email Inquiry",
  instagram: "Instagram DM",
  web: "Form Kontak Web",
};

/** Pastikan 4 baris konfigurasi kanal tersedia (idempotent). */
export async function ensureChannelConfigs() {
  const types: ChannelType[] = ["whatsapp", "email", "instagram", "web"];
  for (const type of types) {
    const existing = await db.channelConfig.findUnique({ where: { type } });
    if (!existing) {
      await db.channelConfig.create({
        data: {
          type,
          name: DEFAULT_CHANNEL_NAMES[type],
          configJson: "{}",
          apiKey: type === "web" ? generateApiKey() : null,
          webhookSecret: generateVerifyToken(),
        },
      });
    }
  }
}

export function webhookUrlFor(type: ChannelType): string {
  return type === "web" ? "/api/webhooks/web-form" : `/api/webhooks/${type}`;
}

export function toChannelDTO(row: {
  type: string;
  name: string;
  enabled: boolean;
  configJson: string;
  apiKey: string | null;
  webhookSecret: string | null;
  lastEventAt: Date | null;
  eventCount: number;
}): ChannelConfigDTO {
  const type = row.type as ChannelType;
  let config: Record<string, string> = {};
  try {
    config = JSON.parse(row.configJson || "{}");
  } catch {
    config = {};
  }
  return {
    type,
    name: row.name,
    enabled: row.enabled,
    config,
    configFields: CHANNEL_CONFIG_FIELDS[type],
    apiKey: row.apiKey,
    webhookSecret: row.webhookSecret,
    webhookUrl: webhookUrlFor(type),
    lastEventAt: row.lastEventAt ? row.lastEventAt.toISOString() : null,
    eventCount: row.eventCount,
  };
}
