/**
 * Kontrak tipe bersama untuk UDP CRM — PT. Unicam Digital Pictvres.
 * Dipakai oleh backend (route handlers) dan frontend (views).
 */

export type Role = "OWNER" | "MANAGER" | "MARKETER" | "PRODUCTION" | "FINANCE" | "CLIENT";

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Owner / Dirut",
  MANAGER: "Manajer",
  MARKETER: "Marketing",
  PRODUCTION: "Produksi",
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

/** Tahapan funnel penjualan (stage detail). `status` adalah ringkasan yang tersinkron otomatis. */
export type LeadStage = "NEW" | "QUALIFIED" | "PROPOSAL" | "NEGOTIATION" | "WON" | "LOST";

export const LEAD_STAGES: LeadStage[] = ["NEW", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"];

export const LEAD_STAGE_LABEL: Record<LeadStage, string> = {
  NEW: "Lead Baru",
  QUALIFIED: "Terkualifikasi",
  PROPOSAL: "Usulan Penawaran",
  NEGOTIATION: "Negosiasi",
  WON: "Menang",
  LOST: "Hilang",
};

export const LEAD_STAGE_BADGE: Record<LeadStage, string> = {
  NEW: "bg-amber-100 text-amber-800 border-amber-200",
  QUALIFIED: "bg-teal-100 text-teal-800 border-teal-200",
  PROPOSAL: "bg-violet-100 text-violet-800 border-violet-200",
  NEGOTIATION: "bg-orange-100 text-orange-800 border-orange-200",
  WON: "bg-emerald-100 text-emerald-800 border-emerald-200",
  LOST: "bg-rose-100 text-rose-700 border-rose-200",
};

/** Pemetaan stage → status ringkasan (untuk sinkronisasi kolom lama). */
export const STAGE_TO_STATUS: Record<LeadStage, LeadStatus> = {
  NEW: "NEW",
  QUALIFIED: "FOLLOW_UP",
  PROPOSAL: "QUOTED",
  NEGOTIATION: "QUOTED",
  WON: "WON",
  LOST: "LOST",
};

export const LOST_REASONS = ["Harga", "Kompetitor", "Budget tidak ada", "Timing", "Tidak ada balasan", "Lainnya"] as const;

export type ProjectStatus = "PLANNED" | "BRIEFED" | "IN_PROGRESS" | "REVIEW" | "DONE";

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  PLANNED: "Perencanaan",
  BRIEFED: "Brief Masuk",
  IN_PROGRESS: "Dikerjakan",
  REVIEW: "Review Klien",
  DONE: "Selesai",
};

export const PROJECT_STATUS_BADGE: Record<ProjectStatus, string> = {
  PLANNED: "bg-stone-200 text-stone-700 border-stone-300",
  BRIEFED: "bg-amber-100 text-amber-800 border-amber-200",
  IN_PROGRESS: "bg-teal-100 text-teal-800 border-teal-200",
  REVIEW: "bg-violet-100 text-violet-800 border-violet-200",
  DONE: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

export type QuotationStatus = "DRAFT" | "SENT" | "APPROVED" | "REJECTED";

export const QUOTATION_STATUS_LABEL: Record<QuotationStatus, string> = {
  DRAFT: "Draf",
  SENT: "Terkirim",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
};

export const QUOTATION_STATUS_BADGE: Record<QuotationStatus, string> = {
  DRAFT: "bg-stone-200 text-stone-700 border-stone-300",
  SENT: "bg-amber-100 text-amber-800 border-amber-200",
  APPROVED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  REJECTED: "bg-rose-100 text-rose-700 border-rose-200",
};

export type InvoiceStatus = "UNPAID" | "PARTIAL" | "PAID" | "OVERDUE";

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  UNPAID: "Belum Dibayar",
  PARTIAL: "Dibayar Sebagian",
  PAID: "Lunas",
  OVERDUE: "Jatuh Tempo",
};

export const INVOICE_STATUS_BADGE: Record<InvoiceStatus, string> = {
  UNPAID: "bg-stone-200 text-stone-700 border-stone-300",
  PARTIAL: "bg-amber-100 text-amber-800 border-amber-200",
  PAID: "bg-emerald-100 text-emerald-800 border-emerald-200",
  OVERDUE: "bg-rose-100 text-rose-700 border-rose-200",
};

// ============ BRIEF & ESTIMASI ============

export type BriefStatus = "DRAFT" | "SUBMITTED" | "ESTIMATED" | "QUOTED";

export const BRIEF_STATUS_LABEL: Record<BriefStatus, string> = {
  DRAFT: "Draf",
  SUBMITTED: "Menunggu Estimasi",
  ESTIMATED: "Sudah Ters Estimasi",
  QUOTED: "Sudah Ditawarkan",
};

export const BRIEF_STATUS_BADGE: Record<BriefStatus, string> = {
  DRAFT: "bg-stone-200 text-stone-700 border-stone-300",
  SUBMITTED: "bg-amber-100 text-amber-800 border-amber-200",
  ESTIMATED: "bg-teal-100 text-teal-800 border-teal-200",
  QUOTED: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

export interface EstimateItemDTO {
  task: string;
  qty: number;
  unit: string; // jam | unit | orang dsb
  hours: number;
  cost: number;
}

export interface WorkEstimateDTO {
  id: string;
  briefId: string;
  items: EstimateItemDTO[];
  totalHours: number;
  totalCost: number;
  notes?: string | null;
  createdByName?: string | null;
  createdAt: string;
}

export interface BriefDTO {
  id: string;
  code: string;
  leadId: string;
  brand: string;
  title: string;
  objective: string;
  audience?: string | null;
  deliverables: string;
  references?: string | null;
  deadline?: string | null;
  notes?: string | null;
  status: BriefStatus;
  createdByName?: string | null;
  createdAt: string;
  lead?: { code: string; subject: string; stage?: LeadStage; contactName: string; companyName?: string | null; estValue?: number } | null;
  estimates: WorkEstimateDTO[];
  projectCode?: string | null;
}

export type DeliverableType = "FILE" | "LINK";

export interface DeliverableDTO {
  id: string;
  projectId: string;
  name: string;
  type: DeliverableType;
  url?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  sizeLabel?: string | null;
  milestoneLabel?: string | null;
  note?: string | null;
  uploadedByName: string;
  createdAt: string;
}

export const DELIVERABLE_TYPE_LABEL: Record<DeliverableType, string> = {
  FILE: "File",
  LINK: "Tautan",
};

export interface QuotationItemDTO {
  desc: string;
  qty: number;
  price: number;
}

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
  /** Untuk pesan OUT: tujuan nyata balasan (nomor WA / email / @handle). */
  destination?: string | null;
}

/** Kanal balasan keluar — balasan WA harus ke nomor WA, DM ke IG, dsb. */
export type ReplyChannel = ChannelType | "internal";

export const REPLY_CHANNEL_LABEL: Record<ReplyChannel, string> = {
  whatsapp: "WhatsApp",
  email: "Email",
  instagram: "Instagram DM",
  web: "Form Web",
  internal: "Catatan internal",
};

/** Kanal mana yang benar-benar bisa dipakai membalas, berdasarkan data kontak yang tersedia. */
export interface ChannelAvailability {
  channel: ChannelType;
  available: boolean;
  destination?: string | null; // nomor / email / handle yang dipakai
  missingLabel?: string | null; // "nomor WhatsApp" bila tidak tersedia
}

/** Input form "Lead Masuk" — pintu masuk real (bukan dummy) dengan dedupe kontak. */
export interface IntakeLeadInput {
  channel: ChannelType | "manual";
  name: string;
  company?: string;
  position?: string;
  country?: string;
  phone?: string;
  email?: string;
  igUsername?: string;
  subject: string;
  body: string;
  brand?: string;
  sourceRef?: string;
  contactNotes?: string;
}

export interface IntakeLeadResult {
  leadId: string;
  leadCode: string;
  isNewLead: boolean;
  contactId: string;
  contactName: string;
  newContact: boolean;
  /** Field yang mencocokkan kontak existing (dedupe): phone | email | instagram | null */
  matchedBy: "phone" | "email" | "instagram" | null;
}

export interface LeadDTO {
  id: string;
  code: string;
  subject: string;
  brand: string;
  channel: ChannelType | "manual";
  status: LeadStatus;
  stage?: LeadStage;
  estValue?: number;
  score: number;
  sourceRef?: string | null;
  lostReason?: string | null;
  createdAt: string;
  updatedAt: string;
  slaOverdue?: boolean;
  contact: {
    id: string;
    name: string;
    position?: string | null;
    companyName?: string | null;
    country?: string;
    email?: string | null;
    phone?: string | null;
    igUsername?: string | null;
    company?: string | null;
    notes?: string | null;
  };
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
  position?: string | null;
  companyName?: string | null;
  country: string;
  email?: string | null;
  phone?: string | null;
  igUsername?: string | null;
  source: string;
  company?: string | null; // nama tampil: companyName ?? perusahaan terhubung
  notes?: string | null;
  createdAt: string;
  leadCount: number;
}

export interface QuotationDTO {
  id: string;
  number: string;
  leadId: string;
  brand: string;
  title: string;
  items: QuotationItemDTO[];
  subtotal: number;
  discountPct: number;
  ppnPct: number;
  grandTotal: number;
  status: QuotationStatus;
  notes?: string | null;
  sentAt?: string | null;
  decidedAt?: string | null;
  decidedNote?: string | null;
  createdAt: string;
  lead?: { code: string; subject: string; contactName: string; companyName?: string | null } | null;
  projectCode?: string | null; // terisi bila proyek produksi sudah dibuat
}

export interface InvoiceDTO {
  id: string;
  number: string;
  brand: string;
  title: string;
  amount: number;
  ppnPct: number;
  grandTotal: number;
  paidAmount: number;
  dueDate?: string | null;
  status: InvoiceStatus;
  issuedAt: string;
  projectCode?: string | null;
  quotationNumber?: string | null;
  companyName?: string | null;
  payments: { id: string; amount: number; method: string; paidAt: string; note?: string | null }[];
}

export interface MilestoneDTO {
  id: string;
  title: string;
  orderIdx: number;
  weight: number;
  status: "PENDING" | "IN_PROGRESS" | "DONE";
  dueDate?: string | null;
  doneAt?: string | null;
}

export interface ProjectDTO {
  id: string;
  code: string;
  name: string;
  brand: string;
  status: ProjectStatus;
  progress: number;
  budget: number;
  managerName?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  companyName?: string | null;
  leadCode?: string | null;
  quotationNumber?: string | null;
  billedAmount: number; // total invoice terkait proyek
  milestones: MilestoneDTO[];
  deliverables: DeliverableDTO[]; // file produksi / link Google Drive
  brief?: { code: string; title: string; objective: string; deliverables: string; deadline?: string | null } | null;
}

export interface PipelineStageStat {
  stage: LeadStage;
  count: number;
  value: number; // akumulasi estValue
  pctOfWon: number; // konversi terhadap total lead masuk (won+lost)
}

export interface PipelineStats {
  stages: PipelineStageStat[];
  totalOpen: number;
  totalValueOpen: number;
  wonCount: number;
  wonValue: number;
  lostCount: number;
  conversionPct: number; // won / (won+lost)
  avgDealSize: number;
}

export interface PipelineLeadDTO extends LeadDTO {
  stage: LeadStage;
  estValue: number;
  quotationCount?: number;
}

export interface FinanceStats {
  revenuePaid: number; // total pembayaran masuk
  outstanding: number; // belum dibayar (termasuk sebagian)
  overdueCount: number;
  invoiceCount: number;
  quotationCount: number;
  quotationApprovedPct: number;
  monthly: { month: string; label: string; revenue: number; invoiced: number }[]; // 6 bulan terakhir
  byBrand: { brand: string; revenue: number; outstanding: number }[];
  statusBreakdown: { status: InvoiceStatus; count: number; amount: number }[];
}

export interface ProductionStats {
  totalProjects: number;
  activeCount: number; // belum DONE
  doneCount: number;
  avgProgress: number;
  milestoneDonePct: number;
  byStatus: { status: ProjectStatus; count: number }[];
  monthly: { month: string; label: string; completed: number; started: number }[]; // 6 bulan terakhir
  byBrand: { brand: string; active: number; done: number; budget: number }[];
}

/** Gabungan keuangan + produksi — "bagan keuangan dan produksi bekerja sama". */
export interface OverviewStats {
  monthly: { month: string; label: string; revenue: number; projectsCompleted: number; leadsWon: number }[];
  perBrand: { brand: string; revenue: number; activeProjects: number; doneProjects: number; pipelineValue: number }[];
  totals: { revenue: number; projectsDone: number; projectsActive: number; pipelineValue: number; avgProjectValue: number };
}

export interface PortalSummaryDTO {
  company: { name: string } | null;
  projects: ProjectDTO[];
  invoices: InvoiceDTO[];
  quotations: QuotationDTO[];
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

// ============ IDENTITAS BRAND & DOKUMEN ============

/** Profil identitas brand — dipakai kop surat dokumen (penawaran, brief, invoice). */
export interface BrandProfileDTO {
  brand: string; // unimasi | segia | erfo | unicam
  name: string;
  tagline: string;
  logoUrl: string | null; // null = belum ada logo (fallback monogram)
  address: string;
  phone: string;
  email: string;
  website: string;
  primaryColor: string; // hex
  letterheadNote: string; // baris legal di bawah kop
  footerNote: string; // teks footer dokumen
  bankInfo: string; // rekening pembayaran
}

/** Jenis dokumen terformat yang bisa dicetak dengan kop brand. */
export type BrandDocType = "QUOTATION" | "BRIEF";
