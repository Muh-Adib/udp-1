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
  InvoiceDTO,
  LeadDTO,
  LeadMessageDTO,
  NotificationDTO,
  OverviewStats,
  PipelineLeadDTO,
  PipelineStats,
  PortalSummaryDTO,
  ProductionStats,
  ProjectDTO,
  QuotationDTO,
  QuotationItemDTO,
  SessionUser,
  WorkEstimateDTO,
} from "@/lib/crm-types";

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
  sendLeadMessage: (id: string, body: string, direction: "OUT" | "NOTE") =>
    request<{ message: LeadMessageDTO }>(`/api/leads/${id}/messages`, { method: "POST", body: JSON.stringify({ body, direction }) }),
  createLead: (input: { contactName: string; subject: string; email?: string; phone?: string; brand?: string }) =>
    request<{ lead: { id: string; code: string } }>("/api/leads", { method: "POST", body: JSON.stringify(input) }),

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
};
