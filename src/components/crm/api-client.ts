/* ============ CRM API Client (frontend) ============ */
'use client'

import type {
  SessionUser, UserDTO, BrandDTO, CompanyDTO, ContactDTO, OpportunityDTO, OpportunityDetailDTO,
  InteractionDTO, TaskDTO, DashboardDTO, AuditLogDTO, TemplateDTO, DuplicateCandidate, ProjectDTO, NoteDTO, Stage,
  QuotationStatus, QuotationDTO, QuotationDetailDTO, InvoiceStatus, InvoiceDTO, FinanceSummaryDTO,
  QuickTemplateDTO,
  BriefDTO, EstimationDTO, EstimationSaveInput, PortalDTO, NotificationsResponseDTO,
  PortalCommentEntity, PortalCommentDTO, PortalDecisionResultDTO, ConversationAnalyticsDTO,
  ConversationListItemDTO, OpportunityAiSummaryDTO, BriefingDTO, ForecastDTO,
} from '@/lib/crm-types'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    cache: 'no-store',
  })
  if (!res.ok) {
    let msg = `Request gagal (${res.status})`
    try {
      const body = await res.json()
      if (body?.error) msg = body.error
    } catch { /* ignore */ }
    throw new Error(msg)
  }
  return res.json() as Promise<T>
}

export const api = {
  get: <T,>(url: string) => request<T>(url),
  post: <T,>(url: string, body: unknown) => request<T>(url, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T,>(url: string, body: unknown) => request<T>(url, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T,>(url: string, body: unknown) => request<T>(url, { method: 'PUT', body: JSON.stringify(body) }),
  del: <T,>(url: string) => request<T>(url, { method: 'DELETE' }),
}

export interface BootstrapDTO { user: SessionUser | null; users: UserDTO[]; brands: BrandDTO[] }

export const crmApi = {
  bootstrap: () => api.get<BootstrapDTO>('/api/bootstrap'),
  login: (email: string) => api.post<{ user: SessionUser }>('/api/session', { email }),
  logout: () => api.del<{ ok: boolean }>('/api/session'),

  companies: (params = '') => api.get<CompanyDTO[]>(`/api/companies${params ? `?${params}` : ''}`),
  company: (id: string) => api.get<CompanyDTO & { contacts: ContactDTO[]; opportunities: OpportunityDTO[]; projects: ProjectDTO[] }>(`/api/companies/${id}`),
  createCompany: (body: unknown) => api.post<CompanyDTO>('/api/companies', body),
  updateCompany: (id: string, body: unknown) => api.patch<CompanyDTO>(`/api/companies/${id}`, body),

  /* R15 — pengaturan brand (SUPER_ADMIN & DIREKTUR): identitas kontak, warna, SLA, prefix dokumen */
  updateBrand: (id: string, body: unknown) => api.patch<BrandDTO>(`/api/brands/${id}`, body),

  contacts: (params = '') => api.get<ContactDTO[]>(`/api/contacts${params ? `?${params}` : ''}`),
  createContact: (body: unknown) => api.post<ContactDTO>('/api/contacts', body),
  updateContact: (id: string, body: unknown) => api.patch<ContactDTO>(`/api/contacts/${id}`, body),

  /* Template balasan cepat inbox — dipanggil via "/keyword" di composer (tidak tampil sbg chip) */
  quickTemplates: () => api.get<QuickTemplateDTO[]>('/api/quick-templates'),
  createQuickTemplate: (body: { keyword: string; body: string; description?: string }) =>
    api.post<QuickTemplateDTO>('/api/quick-templates', body),
  updateQuickTemplate: (id: string, body: { keyword?: string; body?: string; description?: string | null }) =>
    api.patch<QuickTemplateDTO>(`/api/quick-templates/${id}`, body),
  deleteQuickTemplate: (id: string) => api.del<{ ok: boolean }>(`/api/quick-templates/${id}`),

  opportunities: (params = '') => api.get<OpportunityDTO[]>(`/api/opportunities${params ? `?${params}` : ''}`),
  opportunity: (id: string) => api.get<OpportunityDetailDTO>(`/api/opportunities/${id}`),
  createOpportunity: (body: unknown) => api.post<OpportunityDTO>('/api/opportunities', body),
  updateOpportunity: (id: string, body: unknown) => api.patch<OpportunityDTO>(`/api/opportunities/${id}`, body),
  changeStage: (id: string, body: { stage: Stage; lostReason?: string; lostNotes?: string; competitorName?: string; lastOfferValue?: number; reactivation?: string; followUpDate?: string }) =>
    api.post<OpportunityDTO>(`/api/opportunities/${id}/stage`, body),
  addInteraction: (id: string, body: { channel: string; direction: string; body: string; subject?: string }) =>
    api.post<InteractionDTO>(`/api/opportunities/${id}/interactions`, body),
  addNote: (id: string, body: { body: string; visibility?: string }) => api.post<NoteDTO>(`/api/opportunities/${id}/notes`, body),
  deleteOpportunity: (id: string) => api.del<{ ok: boolean }>(`/api/opportunities/${id}`),

  interactions: (params = '') => api.get<InteractionDTO[]>(`/api/interactions${params ? `?${params}` : ''}`),
  logInteraction: (body: unknown) => api.post<InteractionDTO>('/api/interactions', body),
  websiteForm: (body: { websiteForm: { name: string; email: string; whatsapp?: string; message: string; brandId: string; serviceId?: string } }) =>
    api.post<{ opportunityId: string; contactId: string; created: boolean }>('/api/interactions', body),

  tasks: (params = '') => api.get<TaskDTO[]>(`/api/tasks${params ? `?${params}` : ''}`),
  createTask: (body: unknown) => api.post<TaskDTO>(`/api/tasks`, body),
  updateTask: (id: string, body: unknown) => api.patch<TaskDTO>(`/api/tasks/${id}`, body),

  dashboard: () => api.get<DashboardDTO>('/api/dashboard'),

  auditLogs: (params = '') => api.get<AuditLogDTO[]>(`/api/audit-logs${params ? `?${params}` : ''}`),

  duplicates: () => api.get<DuplicateCandidate[]>('/api/duplicates'),
  merge: (body: { keepId: string; mergeId: string }) => api.post<{ ok: boolean }>('/api/merge', body),

  projects: (params = '') => api.get<ProjectDTO[]>(`/api/projects${params ? `?${params}` : ''}`),
  updateProject: (id: string, body: unknown) => api.patch<ProjectDTO>(`/api/projects/${id}`, body),

  templates: (params = '') => api.get<TemplateDTO[]>(`/api/templates${params ? `?${params}` : ''}`),
  /** Thread lengkap IN+OUT satu opportunity (chat view inbox) — asc by sentAt. */
  opportunityThread: (id: string) => api.get<InteractionDTO[]>(`/api/opportunities/${id}/thread`),
  /** Daftar percakapan digroup server-side (lastMessage akurat, SLA, eskalasi). */
  conversations: () => api.get<ConversationListItemDTO[]>('/api/conversations'),
  /** Ringkasan AI sebuah opportunity (LLM, on-demand). */
  aiSummary: (opportunityId: string) =>
    api.post<OpportunityAiSummaryDTO>(`/api/opportunities/${opportunityId}/ai-summary`, {}),
  createTemplate: (body: unknown) => api.post<TemplateDTO>('/api/templates', body),
  updateTemplate: (id: string, body: unknown) => api.patch<TemplateDTO>(`/api/templates/${id}`, body),

  users: () => api.get<UserDTO[]>('/api/users'),
  createUser: (body: unknown) => api.post<UserDTO>('/api/users', body),
  updateUser: (id: string, body: unknown) => api.patch<UserDTO>(`/api/users/${id}`, body),
}

/* ============ Fase 2 — Quotations & Finance ============ */
import type { PaymentDTO } from '@/lib/crm-types'

export interface QuotationItemInput { description: string; qty: number; unitPrice: number }

export const financeApi = {
  quotations: (params = '') => api.get<QuotationDTO[]>(`/api/quotations${params ? `?${params}` : ''}`),
  quotation: (id: string) => api.get<QuotationDetailDTO>(`/api/quotations/${id}`),
  createQuotation: (body: { opportunityId: string; title?: string; items: QuotationItemInput[]; discountPct?: number; taxPct?: number; validUntil?: string; notes?: string }) =>
    api.post<QuotationDetailDTO>('/api/quotations', body),
  updateQuotation: (id: string, body: { title?: string; items?: QuotationItemInput[]; discountPct?: number; taxPct?: number; validUntil?: string | null; notes?: string }) =>
    api.patch<QuotationDetailDTO>(`/api/quotations/${id}`, body),
  changeQuotationStatus: (id: string, status: QuotationStatus) =>
    api.post<QuotationDTO>(`/api/quotations/${id}/status`, { status }),
  approveDiscount: (id: string) =>
    api.post<QuotationDTO>(`/api/quotations/${id}/approve-discount`, {}),
  deleteQuotation: (id: string) =>
    api.del<{ ok: boolean }>(`/api/quotations/${id}`),

  invoices: (params = '') => api.get<InvoiceDTO[]>(`/api/invoices${params ? `?${params}` : ''}`),
  createInvoice: (body: { opportunityId: string; quotationId?: string; projectId?: string; title: string; amount: number; taxPct?: number; dueDate?: string; notes?: string }) =>
    api.post<InvoiceDTO>('/api/invoices', body),
  addPayment: (invoiceId: string, body: { amount: number; method?: string; reference?: string; paidAt?: string; note?: string }) =>
    api.post<InvoiceDTO>(`/api/invoices/${invoiceId}/payments`, body),
  updateInvoice: (id: string, body: { status?: InvoiceStatus; dueDate?: string | null; notes?: string; title?: string }) =>
    api.patch<InvoiceDTO>(`/api/invoices/${id}`, body),

  financeSummary: () => api.get<FinanceSummaryDTO>('/api/finance/summary'),
}

export const estimationApi = {
  brief: (opportunityId: string) =>
    api.get<BriefDTO | null>(`/api/opportunities/${opportunityId}/brief`),
  saveBrief: (opportunityId: string, body: Partial<BriefDTO>) =>
    api.put<BriefDTO>(`/api/opportunities/${opportunityId}/brief`, body),
  estimation: (opportunityId: string) =>
    api.get<EstimationDTO | null>(`/api/opportunities/${opportunityId}/estimation`),
  saveEstimation: (opportunityId: string, body: EstimationSaveInput) =>
    api.put<EstimationDTO>(`/api/opportunities/${opportunityId}/estimation`, body),
}

export const portalApi = {
  /** Read-only data Client Portal — hanya untuk role CLIENT, terikat companyId session. */
  get: () => api.get<PortalDTO>('/api/portal'),
  /** Keputusan client atas penawaran (hanya status SENT boleh diputuskan). */
  decide: (quotationId: string, body: { decision: 'ACCEPTED' | 'REJECTED'; note?: string }) =>
    api.post<PortalDecisionResultDTO>(`/api/portal/quotations/${quotationId}/decision`, body),
  /** Thread komentar per dokumen (CLIENT = perusahaannya sendiri; staff internal juga boleh). */
  comments: (entityType: PortalCommentEntity, entityId: string) =>
    api.get<PortalCommentDTO[]>(`/api/portal/comments?entityType=${entityType}&entityId=${entityId}`),
  addComment: (body: { entityType: PortalCommentEntity; entityId: string; body: string }) =>
    api.post<PortalCommentDTO>('/api/portal/comments', body),
}

export const analyticsApi = {
  /** Analitik percakapan omnichannel — role internal saja. */
  conversations: () => api.get<ConversationAnalyticsDTO>('/api/analytics/conversations'),
}

export const notificationsApi = {
  /** Agregat notifikasi in-app (SLA, approval, invoice due, task due, quotation expiry). */
  list: () => api.get<NotificationsResponseDTO>('/api/notifications'),
}

export const insightApi = {
  /** Briefing pagi AI — digest prioritas harian (cache server 10 menit; refresh=true utk paksa baru). */
  briefing: (refresh = false) => api.post<BriefingDTO>('/api/briefing', { refresh }),
  /** Proyeksi pipeline berbobot (60% stage probability + 40% lead score). */
  forecast: () => api.get<ForecastDTO>('/api/forecast'),
}
