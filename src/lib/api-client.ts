"use client";

import type {
  BriefDTO,
  BrandProfileDTO,
  ChannelConfigDTO,
  ContactDTO,
  DashboardStats,
  DeliverableDTO,
  EstimateItemDTO,
  FinanceStats,
  IntakeLeadInput,
  IntakeLeadResult,
  InvoiceDTO,
  LeadDTO,
  LeadMessageDTO,
  MilestoneDTO,
  NotificationDTO,
  OverviewStats,
  PipelineLeadDTO,
  PipelineStats,
  PortalSummaryDTO,
  ProductionStats,
  ProjectDTO,
  QuotationDTO,
  QuotationItemDTO,
  SecureAccessResult,
  SecureLinkCreateInput,
  SecureLinkDTO,
  SessionUser,
  WorkEstimateDTO,
} from "@/lib/crm-types";

export interface ContactDuplicateInfo {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  igUsername?: string | null;
}

export type CreateContactResult =
  | { ok: true; contactId: string }
  | { ok: false; error: string; existing?: ContactDuplicateInfo };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  // FormData (upload file) tidak boleh diberi Content-Type manual — biarkan browser set multipart boundary
  const isForm = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const res = await fetch(url, {
    ...init,
    headers: isForm ? init?.headers : { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Permintaan gagal (${res.status})`);
  }
  return data as T;
}

export const api = {
  // ---------- auth ----------
  login: (email: string, password: string) =>
    request<{ user: SessionUser }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  me: () => request<{ user: SessionUser }>("/api/auth/me"),

  // ---------- leads ----------
  leads: (params?: { status?: string; channel?: string; q?: string }) => {
    const sp = new URLSearchParams();
    if (params?.status) sp.set("status", params.status);
    if (params?.channel) sp.set("channel", params.channel);
    if (params?.q) sp.set("q", params.q);
    const qs = sp.toString();
    return request<{ leads: LeadDTO[]; slaHours: number }>(`/api/leads${qs ? `?${qs}` : ""}`);
  },
  leadDetail: (id: string) =>
    request<{ lead: LeadDTO & { lostReason?: string | null }; messages: LeadMessageDTO[] }>(`/api/leads/${id}`),
  updateLead: (id: string, patch: { status?: string; assigneeId?: string | null; brand?: string; lostReason?: string }) =>
    request<{ ok: true }>(`/api/leads/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  sendLeadMessage: (id: string, body: string, direction: "OUT" | "NOTE", channel?: string) =>
    request<{ message: LeadMessageDTO }>(`/api/leads/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ body, direction, ...(direction === "OUT" && channel ? { channel } : {}) }),
    }),
  /** Pintu masuk lead REAL (bukan dummy): identitas kontak lengkap + dedupe otomatis. */
  intakeLead: (input: IntakeLeadInput) =>
    request<IntakeLeadResult>("/api/leads/intake", { method: "POST", body: JSON.stringify(input) }),
  createLead: (input: {
    contactName: string;
    subject: string;
    email?: string;
    phone?: string;
    igUsername?: string;
    company?: string;
    position?: string;
    country?: string;
    brand?: string;
  }) => request<{ lead: { id: string; code: string } }>("/api/leads", { method: "POST", body: JSON.stringify(input) }),

  // ---------- kanal ----------
  channels: () => request<{ channels: ChannelConfigDTO[] }>("/api/channels"),
  updateChannel: (type: string, patch: { enabled?: boolean; config?: Record<string, string>; name?: string }) =>
    request<{ channel: ChannelConfigDTO }>("/api/channels", { method: "PUT", body: JSON.stringify({ type, ...patch }) }),
  simulateChannel: (type: string) =>
    request<{ ok: true; leadId: string; leadCode: string; isNewLead: boolean; body: string }>(`/api/channels/${type}/simulate`, { method: "POST" }),
  regenerateChannelKey: (type: string) =>
    request<{ channel: ChannelConfigDTO }>(`/api/channels/${type}/regenerate-key`, { method: "POST" }),

  // ---------- dashboard ----------
  dashboard: () => request<{ stats: DashboardStats }>("/api/dashboard"),

  // ---------- notifikasi ----------
  notifications: (markAll = false) =>
    request<{ notifications: NotificationDTO[]; unread: number }>(`/api/notifications${markAll ? "?markAll=1" : ""}`),

  // ---------- kontak ----------
  contacts: (q?: string) => request<{ contacts: ContactDTO[] }>(`/api/contacts${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  /** Tambah kontak nyata dgn dedupe — hasil 409 berisi kontak existing agar UI menawarkan merge. */
  createContact: async (input: {
    name: string;
    position?: string;
    companyName?: string;
    country?: string;
    phone?: string;
    email?: string;
    igUsername?: string;
    notes?: string;
  }): Promise<CreateContactResult> => {
    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = (await res.json().catch(() => ({}))) as { contact?: { id: string }; error?: string; existing?: ContactDuplicateInfo };
    if (res.ok && data.contact) return { ok: true, contactId: data.contact.id };
    return { ok: false, error: data.error ?? "Permintaan gagal", existing: data.existing };
  },
  /** Edit kontak (identitas, jabatan, perusahaan, negara, kanal). */
  updateContact: (
    id: string,
    patch: {
      name?: string;
      position?: string | null;
      companyName?: string | null;
      country?: string;
      phone?: string | null;
      email?: string | null;
      igUsername?: string | null;
      notes?: string | null;
    },
  ) => request<{ contact: { id: string } }>("/api/contacts", { method: "PUT", body: JSON.stringify({ id, ...patch }) }),

  // ---------- pengaturan ----------
  getSettings: () => request<{ firstResponseSlaHours: number }>("/api/settings"),
  updateSettings: (firstResponseSlaHours: number) =>
    request<{ ok: true }>("/api/settings", { method: "PUT", body: JSON.stringify({ firstResponseSlaHours }) }),

  // ---------- pipeline / funnel ----------
  pipeline: () => request<{ stats: PipelineStats; leads: PipelineLeadDTO[] }>("/api/pipeline"),
  updateLeadStage: (id: string, patch: { stage?: string; estValue?: number; lostReason?: string }) =>
    request<{ ok: true; stage: string; status: string }>(`/api/leads/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  // ---------- keuangan ----------
  quotations: () => request<{ quotations: QuotationDTO[] }>("/api/quotations"),
  createQuotation: (input: {
    leadId: string;
    title: string;
    items: QuotationItemDTO[];
    discountPct?: number;
    ppnPct?: number;
    notes?: string;
  }) => request<{ quotation: QuotationDTO }>("/api/quotations", { method: "POST", body: JSON.stringify(input) }),
  updateQuotationStatus: (id: string, action: "send" | "approve" | "reject", decidedNote?: string) =>
    request<{ ok: true; projectCode?: string | null; invoiceNumber?: string | null }>(`/api/quotations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ action, decidedNote }),
    }),
  invoices: () => request<{ invoices: InvoiceDTO[] }>("/api/invoices"),
  addPayment: (invoiceId: string, input: { amount: number; method?: string; note?: string }) =>
    request<{ invoice: InvoiceDTO }>(`/api/invoices/${invoiceId}/payments`, { method: "POST", body: JSON.stringify(input) }),
  financeStats: () => request<{ stats: FinanceStats }>("/api/reports/finance"),
  productionStats: () => request<{ stats: ProductionStats }>("/api/reports/production"),
  overviewStats: () => request<{ stats: OverviewStats }>("/api/reports/overview"),

  // ---------- produksi ----------
  projects: () => request<{ projects: ProjectDTO[] }>("/api/projects"),
  updateProject: (id: string, patch: { status?: string; progress?: number; milestoneId?: string; milestoneStatus?: string }) =>
    request<{ ok: true }>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  // ---------- brief & estimasi produksi ----------
  briefs: () => request<{ briefs: BriefDTO[] }>("/api/briefs"),
  createBrief: (input: {
    leadId: string;
    title: string;
    objective: string;
    audience?: string;
    deliverables?: string;
    references?: string;
    deadline?: string;
    notes?: string;
  }) => request<{ brief: BriefDTO }>("/api/briefs", { method: "POST", body: JSON.stringify(input) }),
  updateBrief: (id: string, action: "submit", notes?: string) =>
    request<{ ok: true; brief: BriefDTO }>(`/api/briefs/${id}`, { method: "PATCH", body: JSON.stringify({ action, notes }) }),
  createEstimate: (input: { briefId: string; items: EstimateItemDTO[]; notes?: string }) =>
    request<{ estimate: WorkEstimateDTO; briefCode: string }>("/api/estimates", { method: "POST", body: JSON.stringify(input) }),

  // ---------- deliverable (file produksi / Google Drive) ----------
  deliverables: (projectId?: string) =>
    request<{ deliverables: DeliverableDTO[] }>(`/api/deliverables${projectId ? `?projectId=${projectId}` : ""}`),
  addDeliverableLink: (input: { projectId: string; name: string; url: string; note?: string; milestoneLabel?: string }) =>
    request<{ deliverable: DeliverableDTO }>("/api/deliverables", { method: "POST", body: JSON.stringify({ type: "LINK", ...input }) }),
  uploadDeliverableFile: (form: FormData) =>
    request<{ deliverable: DeliverableDTO }>("/api/deliverables", { method: "POST", body: form }),
  deleteDeliverable: (id: string) => request<{ ok: true }>(`/api/deliverables/${id}`, { method: "DELETE" }),

  // ---------- identitas brand ----------
  brands: () => request<{ brands: BrandProfileDTO[] }>("/api/brands"),
  updateBrand: (
    brand: string,
    patch: {
      name?: string;
      tagline?: string;
      address?: string;
      phone?: string;
      email?: string;
      instagram?: string;
      website?: string;
      primaryColor?: string;
      letterheadNote?: string;
      footerNote?: string;
      bankInfo?: string;
    }
  ) => request<{ brand: BrandProfileDTO }>("/api/brands", { method: "PUT", body: JSON.stringify({ brand, ...patch }) }),
  uploadBrandLogo: (brand: string, form: FormData) =>
    request<{ brand: BrandProfileDTO }>(`/api/brands/${brand}/logo`, { method: "POST", body: form }),

  // ---------- portal klien ----------
  portalSummary: () => request<PortalSummaryDTO>("/api/portal"),

  // ---------- secure link (distribusi dokumen aman) ----------
  secureLinks: (params?: { leadId?: string; projectId?: string }) => {
    const sp = new URLSearchParams();
    if (params?.leadId) sp.set("leadId", params.leadId);
    if (params?.projectId) sp.set("projectId", params.projectId);
    const qs = sp.toString();
    return request<{ links: SecureLinkDTO[] }>(`/api/secure-links${qs ? `?${qs}` : ""}`);
  },
  /** Buat tautan aman — password PLAIN hanya dikembalikan sekali di respons. */
  createSecureLink: (input: SecureLinkCreateInput) =>
    request<{ link: SecureLinkDTO; password: string; shareMessage: string }>("/api/secure-links", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  /** Nonaktifkan/aktifkan kembali, atau reset password. */
  updateSecureLink: (id: string, patch: { active?: boolean; password?: string }) =>
    request<{ link: SecureLinkDTO; password?: string }>(`/api/secure-links/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deleteSecureLink: (id: string) => request<{ ok: true }>(`/api/secure-links/${id}`, { method: "DELETE" }),
  /** Publik (tanpa login): buka dokumen dengan password. Dipakai halaman /s/<token>. */
  secureAccess: (token: string, password: string) =>
    request<SecureAccessResult>("/api/secure/access", { method: "POST", body: JSON.stringify({ token, password }) }),

  // ---------- milestone (buat & kelola manual) ----------
  createMilestone: (projectId: string, input: { title: string; weight?: number; dueDate?: string }) =>
    request<{ milestone: MilestoneDTO }>(`/api/projects/${projectId}/milestones`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateMilestone: (
    id: string,
    patch: { title?: string; weight?: number; dueDate?: string | null; status?: string }
  ) => request<{ milestone: MilestoneDTO }>(`/api/milestones/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteMilestone: (id: string) => request<{ ok: true }>(`/api/milestones/${id}`, { method: "DELETE" }),
};
