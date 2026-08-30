/**
 * Kontrak tipe bersama untuk Grupa Kreasi CRM.
 * Dipakai oleh backend (route handlers) dan frontend (views).
 */

export type Role = "OWNER" | "MANAGER" | "MARKETER" | "FINANCE" | "CLIENT";

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Owner / Dirut",
  MANAGER: "Manajer",
  MARKETER: "Marketing",
  FINANCE: "Finance",
  CLIENT: "Klien",
};

export type ChannelType = "whatsapp" | "email" | "instagram" | "web";

export const CHANNELS: ChannelType[] = ["whatsapp", "email", "instagram", "web"];

export const CHANNEL_LABEL: Record<ChannelType, string> = {
  whatsapp: "WhatsApp Business",
  email: "Email",
  instagram: "Instagram DM",
  web: "Form Web",
};

export const CHANNEL_DESC: Record<ChannelType, string> = {
  whatsapp: "Chat langsung via WhatsApp Cloud API (Meta Business). Pesan masuk otomatis masuk ke Inbox Lead.",
  email: "Inbound email (inquiry, RFP, vendor registration) diteruskan otomatis ke CRM lewat webhook forwarding.",
  instagram: "Direct Message dari akun bisnis Instagram tiap brand, via Instagram Messaging API.",
  web: "Form kontak / pop-up di website tiap brand, dikirim langsung ke endpoint CRM.",
};

/** Varian warna badge per kanal (tanpa biru/indigo). */
export const CHANNEL_BADGE_CLASS: Record<ChannelType, string> = {
  whatsapp: "bg-emerald-100 text-emerald-800 border-emerald-200",
  email: "bg-amber-100 text-amber-800 border-amber-200",
  instagram: "bg-rose-100 text-rose-800 border-rose-200",
  web: "bg-stone-200 text-stone-800 border-stone-300",
};

export type BrandKey = "unimasi" | "segia" | "erfo" | "unicam";

export const BRANDS: { key: BrandKey; name: string }[] = [
  { key: "unimasi", name: "Unimasi" },
  { key: "segia", name: "Segia Tech" },
  { key: "erfo", name: "Erfo Multimedia" },
  { key: "unicam", name: "Unicam Studio" },
];

export const BRAND_LABEL: Record<string, string> = Object.fromEntries(BRANDS.map((b) => [b.key, b.name]));

export type LeadStatus = "NEW" | "FOLLOW_UP" | "QUOTED" | "WON" | "LOST";

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: "Baru",
  FOLLOW_UP: "Diikuti",
  QUOTED: "Penawaran",
  WON: "Menang",
  LOST: "Hilang",
};

export const LEAD_STATUS_BADGE: Record<LeadStatus, string> = {
  NEW: "bg-amber-100 text-amber-800 border-amber-200",
  FOLLOW_UP: "bg-stone-200 text-stone-700 border-stone-300",
  QUOTED: "bg-violet-100 text-violet-800 border-violet-200",
  WON: "bg-emerald-100 text-emerald-800 border-emerald-200",
  LOST: "bg-rose-100 text-rose-700 border-rose-200",
};

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  companyId?: string | null;
}

export interface LeadMessageDTO {
  id: string;
  direction: "IN" | "OUT" | "NOTE";
  channel: string;
  body: string;
  senderName: string;
  createdAt: string;
}

export interface LeadDTO {
  id: string;
  code: string;
  subject: string;
  brand: string;
  channel: ChannelType | "manual";
  status: LeadStatus;
  score: number;
  sourceRef?: string | null;
  lostReason?: string | null;
  createdAt: string;
  updatedAt: string;
  slaOverdue?: boolean;
  contact: { id: string; name: string; email?: string | null; phone?: string | null; igUsername?: string | null; company?: string | null };
  assignee?: { id: string; name: string } | null;
  lastMessage?: { body: string; direction: string; createdAt: string; channel: string } | null;
  messageCount?: number;
}

export interface ChannelConfigDTO {
  type: ChannelType;
  name: string;
  enabled: boolean;
  config: Record<string, string>;
  configFields: ChannelField[];
  apiKey?: string | null;
  webhookSecret?: string | null;
  webhookUrl: string;
  lastEventAt?: string | null;
  eventCount: number;
}

export interface ChannelField {
  key: string;
  label: string;
  type?: "text" | "password" | "textarea";
  placeholder?: string;
  required?: boolean;
  secret?: boolean;
  hint?: string;
}

export interface DashboardStats {
  totals: { all: number; new: number; followUp: number; quoted: number; won: number; lost: number };
  channelBreakdown: { channel: ChannelType | "manual"; count: number; pct: number }[];
  channelHealth: { type: ChannelType; name: string; enabled: boolean; lastEventAt: string | null; eventCount: number }[];
  recentLeads: LeadDTO[];
  responseRatePct: number;
  avgFirstResponseMins: number | null;
  slaHours: number;
}

export interface NotificationDTO {
  id: string;
  title: string;
  body: string;
  type: string;
  link?: string | null;
  read: boolean;
  createdAt: string;
}

export interface ContactDTO {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  igUsername?: string | null;
  source: string;
  company?: string | null;
  createdAt: string;
  leadCount: number;
}

export const SLA_KEY = "firstResponseSlaHours";

/** Skor awal per kanal — chat personal dinilai lebih hangat daripada form pasif. */
export const CHANNEL_BASE_SCORE: Record<ChannelType | "manual", number> = {
  whatsapp: 35,
  instagram: 30,
  email: 25,
  web: 20,
  manual: 15,
};
