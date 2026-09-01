/* ============ Multi-Brand CRM — Shared Types (API contract) ============ */

export type Role = 'SUPER_ADMIN' | 'DIREKTUR' | 'MANAJER' | 'MARKETING' | 'KEUANGAN' | 'PRODUKSI' | 'HR' | 'CLIENT'

export type Stage =
  | 'NEW' | 'CONTACT_ATTEMPTED' | 'CONNECTED' | 'QUALIFIED' | 'DISCOVERY'
  | 'ESTIMATION' | 'PROPOSAL_SENT' | 'NEGOTIATION' | 'VERBAL_AGREEMENT'
  | 'WON' | 'LOST' | 'NURTURE'

export type Channel = 'WHATSAPP' | 'EMAIL' | 'INSTAGRAM' | 'THREADS' | 'WEBSITE' | 'PHONE' | 'MEETING'

export type Temperature = 'HOT' | 'WARM' | 'COLD'
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'

export interface SessionUser {
  id: string
  name: string
  email: string
  role: Role
  title?: string | null
  avatarColor: string
  brandIds: string[]
  companyId?: string | null
}

export interface ServiceDTO {
  id: string
  name: string
  category: string
  brandId: string
}

export interface BrandDTO {
  id: string
  name: string
  slug: string
  tagline?: string | null
  description?: string | null
  color: string
  website?: string | null
  /* Identitas kontak brand — kop dokumen & identifikasi kanal (R15) */
  email?: string | null
  phone?: string | null
  instagram?: string | null
  address?: string | null
  /* Logo brand — dua varian data-URL (R19): persegi 1:1 & lebar horizontal utk kop */
  logoSquare?: string | null
  logoWide?: string | null
  primaryCurrency: string
  invoicePrefix: string
  quotationPrefix: string
  slaHours: number
  workflowType: string
  services: ServiceDTO[]
}

export interface UserDTO {
  id: string
  name: string
  email: string
  role: Role
  title?: string | null
  avatarColor: string
  isActive: boolean
  brandIds: string[]
  companyId?: string | null
}

export interface ContactDTO {
  id: string
  companyId?: string | null
  firstName: string
  lastName?: string | null
  fullName: string
  position?: string | null
  email?: string | null
  altEmail?: string | null
  whatsapp?: string | null
  phone?: string | null
  country: string
  city?: string | null
  timezone: string
  language: string
  preferredChannel: string
  instagram?: string | null
  threads?: string | null
  linkedin?: string | null
  consentStatus: string
  tags: string[]
  isPrimary: boolean
  createdAt: string
  company?: { id: string; name: string; country: string } | null
}

export interface CompanyDTO {
  id: string
  name: string
  industry?: string | null
  website?: string | null
  country: string
  city?: string | null
  address?: string | null
  size?: string | null
  taxId?: string | null
  currency: string
  tags: string[]
  notes?: string | null
  ownerId?: string | null
  ownerName?: string | null
  createdAt: string
  contactsCount: number
  opportunitiesCount: number
  totalValue: number
  wonValue: number
}

export interface OpportunityDTO {
  id: string
  code: string
  title: string
  stage: Stage
  temperature: Temperature
  priority: Priority
  estimatedValue: number
  currency: string
  probability: number
  expectedCloseDate?: string | null
  nextAction?: string | null
  nextActionDate?: string | null
  lostReason?: string | null
  lostNotes?: string | null
  competitorName?: string | null
  lastOfferValue?: number | null
  reactivation?: string | null
  followUpDate?: string | null
  nurtureTrack?: string | null
  wonAt?: string | null
  lostAt?: string | null
  leadSource: string
  channel: string
  campaign?: string | null
  brief?: string | null
  needs?: string | null
  targetAudience?: string | null
  deliverables?: string | null
  deadline?: string | null
  /** Estimasi timeline produksi (teks bebas) — sumber variabel {{estimated_timeline}} */
  estimatedTimeline?: string | null
  companyId: string
  companyName: string
  companyCountry: string
  contactId: string
  contactName: string
  sourceBrandId: string
  executingBrandId: string
  brandName: string
  brandColor: string
  serviceId?: string | null
  serviceName?: string | null
  ownerId: string
  ownerName: string
  ownerColor: string
  interactionsCount: number
  tasksCount: number
  openTasksCount: number
  lastInteractionAt?: string | null
  /** interaksi IN terakhir — basis presisi chip SLA di inbox (fallback createdAt) */
  lastInboundAt?: string | null
  stageUpdatedAt: string
  createdAt: string
}

export interface InteractionDTO {
  id: string
  opportunityId?: string | null
  opportunityTitle?: string | null
  contactId: string
  contactName: string
  companyName?: string | null
  brandId: string
  brandName: string
  brandColor: string
  channel: string
  direction: string
  subject?: string | null
  body: string
  sentAt: string
  status: string
  respondedBy?: string | null
  externalMessageId?: string | null
  attachmentName?: string | null
  originalLink?: string | null
  replied?: boolean
}

export interface TaskDTO {
  id: string
  title: string
  description?: string | null
  status: string
  priority: Priority
  type: string
  dueDate?: string | null
  assigneeId: string
  assigneeName?: string | null
  assigneeColor?: string | null
  opportunityId?: string | null
  opportunityTitle?: string | null
  companyName?: string | null
  completedAt?: string | null
  createdAt: string
}

export interface NoteDTO {
  id: string
  body: string
  authorId: string
  authorName: string
  authorColor: string
  visibility: string
  createdAt: string
}

export interface MilestoneDTO {
  id: string
  name: string
  stepOrder: number
  status: string
  dueDate?: string | null
}

export interface ProjectDTO {
  id: string
  name: string
  code: string
  status: string
  progress: number
  workflowType: string
  budget: number
  brandId: string
  brandName: string
  brandColor: string
  companyId: string
  companyName: string
  managerName?: string | null
  opportunityCode: string
  startDate?: string | null
  endDate?: string | null
  milestones: MilestoneDTO[]
}

export interface OpportunityDetailDTO extends OpportunityDTO {
  interactions: InteractionDTO[]
  tasks: TaskDTO[]
  notes: NoteDTO[]
  related: OpportunityDTO[]
  projects: ProjectDTO[]
}

export interface DashboardDTO {
  kpis: {
    totalOpenLeads: number
    newThisWeek: number
    unreadInbound: number
    pipelineValue: number
    weightedPipeline: number
    winRate: number
    avgResponseHours: number
    avgSalesCycleDays: number
    forecast30: number
    forecast60: number
    forecast90: number
    overdueTasks: number
    activeProjects: number
  }
  leadsByBrand: { brandId: string; name: string; color: string; count: number; value: number }[]
  leadsByChannel: { channel: string; count: number }[]
  leadsByCountry: { country: string; count: number }[]
  funnel: { stage: Stage; count: number; value: number }[]
  lostReasons: { reason: string; count: number }[]
  wonLost: { won: number; lost: number }
  marketingPerf: { userId: string; name: string; color: string; open: number; won: number; lost: number; avgResponseHours: number }[]
  upcomingTasks: TaskDTO[]
  recentInteractions: InteractionDTO[]
  topCompanies: { companyId: string; name: string; country: string; openOpps: number; totalValue: number }[]
  projectsStatus: { status: string; count: number }[]
  /** Fase 3 — lead belum dibalas melewati SLA jam brand (stage NEW/CONTACT_ATTEMPTED), terlama dulu */
  slaBreaches: {
    opportunityId: string
    code: string
    title: string
    companyName: string
    brandName: string
    brandColor: string
    ownerName?: string | null
    /** R14 — id pemilik opp (eskalasi tak perlu resolve via users store lagi) */
    ownerId?: string | null
    slaHours: number
    waitingHours: number
    waitingSince: string
  }[]
}

export interface AuditLogDTO {
  id: string
  userName?: string | null
  action: string
  entityType: string
  entityId?: string | null
  entityLabel?: string | null
  oldValue?: string | null
  newValue?: string | null
  ip?: string | null
  userAgent?: string | null
  createdAt: string
}

/* Template balasan cepat inbox (dipanggil via /keyword di composer) */
export interface QuickTemplateDTO {
  id: string
  keyword: string
  body: string
  description?: string | null
  creatorId?: string | null
  creatorName?: string | null
  isActive: boolean
  createdAt: string
}

export interface TemplateDTO {
  id: string
  brandId: string
  name: string
  step: number
  delayDays: number
  channel: string
  language: string
  subject?: string | null
  body: string
  purpose?: string | null
  isActive: boolean
}

export interface DuplicateCandidate {
  contactA: ContactDTO
  contactB: ContactDTO
  matchType: 'EMAIL' | 'WHATSAPP' | 'PHONE'
  matchValue: string
}

/* ============ FASE 2 — Quotations, Invoices, Payments ============ */

export type QuotationStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED'
export type InvoiceStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED'

export interface QuotationItemDTO {
  id: string
  description: string
  qty: number
  unitPrice: number
  sortOrder: number
  lineTotal: number
}

export interface QuotationDTO {
  id: string
  code: string
  title: string
  status: QuotationStatus
  version: number
  currency: string
  subtotal: number
  discountPct: number
  discountAmount: number
  taxPct: number
  taxAmount: number
  total: number
  validUntil?: string | null
  notes?: string | null
  discountApprovedById?: string | null
  discountApprovedByName?: string | null
  discountApprovedAt?: string | null
  sentAt?: string | null
  decidedAt?: string | null
  createdById: string
  createdByName?: string | null
  createdAt: string
  opportunityId: string
  opportunityCode: string
  opportunityTitle: string
  opportunityStage: string
  brandId: string
  brandName: string
  brandColor: string
  /* Logo utk kop dokumen cetak (R19) — lebar dipakai di letterhead, persegi fallback stempel */
  brandLogoSquare?: string | null
  brandLogoWide?: string | null
  companyId: string
  companyName: string
  itemsCount: number
}

export interface QuotationDetailDTO extends QuotationDTO {
  items: QuotationItemDTO[]
}

export interface PaymentDTO {
  id: string
  amount: number
  method: string
  reference?: string | null
  paidAt: string
  note?: string | null
  recordedByName?: string | null
}

export interface InvoiceDTO {
  id: string
  code: string
  title: string
  status: InvoiceStatus
  currency: string
  amount: number
  taxPct: number
  total: number
  paidAmount: number
  dueDate?: string | null
  issuedAt: string
  notes?: string | null
  opportunityId: string
  opportunityCode: string
  opportunityTitle: string
  projectId?: string | null
  projectCode?: string | null
  brandId: string
  brandName: string
  brandColor: string
  brandLogoSquare?: string | null
  brandLogoWide?: string | null
  companyId: string
  companyName: string
  payments: PaymentDTO[]
  createdAt: string
}

export interface FinanceSummaryDTO {
  outstandingTotal: number
  overdueTotal: number
  overdueCount: number
  paidThisMonth: number
  invoicedTotal: number
  unpaidCount: number
  aging: { bucket: string; count: number; value: number }[]
  byBrand: { brandId: string; name: string; color: string; invoiced: number; paid: number; outstanding: number }[]
  recentPayments: (PaymentDTO & { invoiceCode: string; invoiceTitle: string; companyName: string })[]
}

/* ============ FASE 2 — Brief & Estimation ============ */

export interface BriefDTO {
  id?: string
  opportunityId: string
  serviceScope?: string | null
  objectives?: string | null
  targetAudience?: string | null
  keyMessages?: string | null
  deliverables?: string | null
  timeline?: string | null
  references?: string | null
  budgetRange?: string | null
  constraints?: string | null
  status: 'DRAFT' | 'FINAL'
  preparedById?: string | null
  preparedByName?: string | null
  updatedAt?: string | null
}

export type EstimationCategory =
  | 'INTERNAL' | 'FREELANCE' | 'EQUIPMENT' | 'TRANSPORT' | 'ACCOMMODATION'
  | 'TALENT' | 'LOCATION' | 'SOFTWARE' | 'HOSTING' | 'OTHER'

export interface EstimationItemDTO {
  id?: string
  category: EstimationCategory
  description: string
  qty: number
  unit: string
  unitCost: number
  days?: number | null
  lineTotal: number
  sortOrder: number
}

export interface EstimationDTO {
  id: string
  opportunityId: string
  currency: string
  status: 'DRAFT' | 'FINAL'
  internalCost: number
  externalCost: number
  subtotalCost: number
  contingencyPct: number
  contingencyAmount: number
  managementFeePct: number
  managementFeeAmount: number
  totalCost: number
  targetMarginPct: number
  sellingPrice: number
  taxPct: number
  taxAmount: number
  priceWithTax: number
  notes?: string | null
  createdById?: string | null
  createdByName?: string | null
  createdAt: string
  updatedAt: string
  items: EstimationItemDTO[]
  /** Nilai referensi margin: total quotation terakhir (SENT/ACCEPTED) atau estimatedValue opportunity */
  referenceValue: number
  referenceSource: 'QUOTATION' | 'OPPORTUNITY' | 'NONE'
  /** Margin aktual vs referenceValue: (reference - totalCost) / reference */
  actualMarginAmount: number
  actualMarginPct: number
  /** Selisih harga jual estimasi vs nilai referensi */
  priceGap: number
}

export interface EstimationSaveInput {
  currency?: string
  status?: 'DRAFT' | 'FINAL'
  items: Array<Pick<EstimationItemDTO, 'category' | 'description' | 'qty' | 'unit' | 'unitCost' | 'days'>>
  contingencyPct?: number
  managementFeePct?: number
  taxPct?: number
  targetMarginPct?: number
  notes?: string | null
}

/* ============ FASE 2 — Client Portal (read-only per company) ============ */

export interface PortalProjectDTO {
  id: string
  code: string
  name: string
  status: string
  progress: number
  workflowType: string
  brandName: string
  brandColor: string
  managerName?: string | null
  startDate?: string | null
  endDate?: string | null
  milestones: MilestoneDTO[]
}

export interface PortalQuotationDTO {
  id: string
  code: string
  title: string
  status: QuotationStatus
  version: number
  currency: string
  subtotal: number
  discountPct: number
  discountAmount: number
  taxPct: number
  taxAmount: number
  total: number
  validUntil?: string | null
  sentAt?: string | null
  decidedAt?: string | null
  createdAt: string
  brandName: string
  brandColor: string
  items: { id: string; description: string; qty: number; unitPrice: number; lineTotal: number }[]
}

export interface PortalInvoiceDTO {
  id: string
  code: string
  title: string
  status: InvoiceStatus
  currency: string
  amount: number
  taxPct: number
  total: number
  paidAmount: number
  dueDate?: string | null
  issuedAt: string
  brandName: string
  brandColor: string
  projectCode?: string | null
  payments: { id: string; amount: number; method: string; paidAt: string; reference?: string | null }[]
}

export interface PortalDTO {
  company: {
    id: string
    name: string
    industry?: string | null
    country: string
    city?: string | null
    contacts: { id: string; name: string; position?: string | null; email?: string | null; phone?: string | null }[]
  }
  projects: PortalProjectDTO[]
  quotations: PortalQuotationDTO[]
  invoices: PortalInvoiceDTO[]
  summary: {
    activeProjects: number
    openQuotations: number      // SENT menunggu keputusan
    outstandingTotal: number    // sisa tagihan (semua invoice non-CANCELLED)
    nextDueDate?: string | null // jatuh tempo terdekat invoice outstanding
  }
}

/* ---------------- Notification center (R10) ---------------- */

export type NotificationType =
  | 'SLA'            // lead NEW/CONTACT_ATTEMPTED melewati SLA respons brand
  | 'APPROVAL'       // quotation menunggu persetujuan diskon
  | 'INVOICE_DUE'    // invoice jatuh tempo / lewat tempo dengan sisa tagihan
  | 'TASK_DUE'       // task milik saya overdue / jatuh tempo ≤48 jam
  | 'QUOTATION_EXPIRY' // quotation SENT mendekati masa berlaku habis (≤7 hari)
  | 'PORTAL_COMMENT' // R12: komentar/keputusan baru dari client portal (belum ditindaklanjuti staff)

export type NotificationSeverity = 'critical' | 'warning' | 'info'

export interface NotificationDTO {
  /** key stabil utk dedup + mark-as-read di sisi client (localStorage) */
  key: string
  type: NotificationType
  severity: NotificationSeverity
  title: string
  description: string
  /** meta angka tambahan, sudah diformat ringkas (mis. "7,6 jam / SLA 4 jam") */
  metric?: string
  opportunityId?: string | null
  /** view tujuan saat item diklik */
  targetView: 'inbox' | 'pipeline' | 'quotations' | 'finance' | 'followup'
  createdAt: string
}

export interface NotificationsResponseDTO {
  items: NotificationDTO[]
  counts: { total: number; critical: number }
}

/* ============ R11 — Portal actions (decision + comments) & conversation analytics ============ */

export type PortalCommentEntity = 'QUOTATION' | 'INVOICE' | 'PROJECT'

export interface PortalCommentDTO {
  id: string
  entityType: PortalCommentEntity
  entityId: string
  userName: string
  userRole: string
  /** true bila penulis adalah user role CLIENT (menentukan posisi bubble chat) */
  isClient: boolean
  body: string
  createdAt: string
}

export interface PortalDecisionResultDTO {
  quotation: PortalQuotationDTO
  message: string
}

/** Analitik percakapan omnichannel (Fase 3 awal) — role internal saja */
export interface ConversationAnalyticsDTO {
  generatedAt: string
  kpi: {
    /** opportunity dengan ≥1 interaksi dalam 90 hari terakhir */
    totalConversations: number
    /** rata-rata jam dari interaksi IN pertama → OUT pertama per opportunity */
    avgFirstResponseHours: number | null
    medianFirstResponseHours: number | null
    /** % opportunity dengan first response ≤ SLA brand (fallback 24 jam) */
    slaCompliancePct: number | null
    /** percakapan aktif (stage bukan WON/LOST) yang pesan terakhirnya IN dan belum dibalas */
    unansweredNow: number
  }
  perBrand: {
    brandId: string
    brandName: string
    brandColor: string
    firstResponseHours: number | null
    slaPct: number | null
    interactions: number
  }[]
  perMarketer: {
    userId: string
    userName: string
    avatarColor?: string | null
    replies: number
    avgResponseHours: number | null
  }[]
  channelMix: { channel: string; count: number }[]
  /** 8 minggu terakhir, inbound = interaksi IN, outbound = interaksi OUT */
  weekly: { weekStart: string; label: string; inbound: number; outbound: number }[]
}

/* ============ R13 — Conversation list (server-side) & AI summary (Phase 4) ============ */

/** Baris daftar percakapan inbox — digroup server-side agar preview/lastMessage akurat */
export interface ConversationListItemDTO {
  opportunityId: string
  opportunityCode: string
  opportunityTitle: string
  stage: string
  contactName: string
  companyName?: string | null
  brandId?: string | null
  brandName: string
  brandColor: string
  lastDirection: 'IN' | 'OUT'
  /** body pesan terakhir, dipotong server ~140 char */
  lastBody: string
  lastSentAt: string
  lastChannel: string
  /** jumlah interaksi dalam window analisis (60 hari) */
  messageCount: number
  /** pesan terakhir IN & stage aktif (belum ditutup) */
  unanswered: boolean
  /** jam kelebihan SLA bila breach, null bila tidak */
  slaOverHours?: number | null
  /** SLA jam brand (fallback 24) — utk tooltip chip */
  slaHours?: number | null
  /** slaOverHours > slaHours → eskalasi 2× SLA */
  escalated: boolean
  ownerName?: string | null
  /* Kanal kontak — dipakai utk memfilter opsi kanal balasan di composer inbox:
     hanya kanal yang benar-benar dimiliki kontak yang bisa dipilih. */
  contactId: string
  contactEmail?: string | null
  contactWhatsapp?: string | null
  contactInstagram?: string | null
  contactThreads?: string | null
  contactPreferredChannel?: string | null
}

export type AiSentiment = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'MIXED'

export interface OpportunityAiSummaryDTO {
  generatedAt: string
  /** ringkasan 2-4 kalimat kondisi deal */
  summary: string
  sentiment: AiSentiment
  interests: string[]
  risks: string[]
  /** 2-3 aksi lanjutan yang disarankan */
  suggestedActions: string[]
  /** draft pesan balasan siap kirim (ID, sopan, singkat) */
  suggestedFollowUp?: string | null
  messageCount: number
  model: string
}

/* ============ R14 — Briefing Pagi (AI digest) & Proyeksi Forecast ============ */

/** Satu item prioritas dalam briefing pagi — diklik → buka drawer opportunity bila opportunityId ada. */
export interface BriefingPriorityItemDTO {
  title: string
  reason: string
  action: string
  /** SLA | LEAD | TASK | QUOTATION | INVOICE | OTHER */
  source: string
  opportunityId?: string | null
}

/** Statistik mini briefing — tone menentukan warna chip (default/good/warn/bad). */
export interface BriefingStatDTO {
  label: string
  value: string
  tone: 'default' | 'good' | 'warn' | 'bad'
}

/** Digest pagi AI — digenerate dari snapshot kondisi CRM saat ini (cache server 10 menit). */
export interface BriefingDTO {
  greeting: string
  headline: string
  priorities: BriefingPriorityItemDTO[]
  risks: string[]
  focus: string
  stats: BriefingStatDTO[]
  /** angka mentah dasar briefing (transparansi — user bisa cek sumber) */
  basis: {
    slaBreaches: number
    hotLeads: number
    unanswered: number
    tasksDue: number
    quotationsAwaiting: number
    invoicesOverdue: number
  }
  generatedAt: string
  model: string
  /** true bila disajikan dari cache server (≤10 menit) */
  cached: boolean
}

/** Satu deal dalam proyeksi — weight = blended probability (60% stage + 40% lead score). */
export interface ForecastDealDTO {
  opportunityId: string
  code: string
  title: string
  companyName: string
  brandName: string
  brandColor: string
  ownerName: string
  stage: Stage
  value: number
  currency: string
  /** 0-1, sudah di-clamp 0.05-0.95 */
  weight: number
  weightedValue: number
  score: number
  grade: 'A' | 'B' | 'C' | 'D'
  /** expectedCloseDate ?? createdAt+45 hari (fallback) — ISO */
  expectedClose: string | null
}

/** Proyeksi pipeline berbobot — penjumlahan hanya IDR (non-IDR dilaporkan terpisah). */
export interface ForecastDTO {
  scenarios: { conservative: number; realistic: number; optimistic: number }
  /** 6 bulan ke depan mulai bulan berjalan — bucket by expectedClose (fallback createdAt+45d) */
  monthly: { month: string; label: string; count: number; total: number; weighted: number }[]
  byBrand: { brandId: string; name: string; color: string; count: number; total: number; weighted: number }[]
  topDeals: ForecastDealDTO[]
  baseline: { won90dCount: number; won90dValue: number; winRate: number; avgDealSize: number }
  /** deal non-IDR tidak masuk penjumlahan (mata uang tercampur = menyesatkan) */
  excludedNonIdr: { currency: string; count: number; total: number }[]
  openDealsCount: number
  generatedAt: string
}
