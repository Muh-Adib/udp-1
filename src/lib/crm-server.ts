/* ============ Multi-Brand CRM — Shared server helpers ============ *
 * Session helper + Prisma→DTO mappers shared across all API routes.   */
import { cookies } from 'next/headers'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import type {
  SessionUser, UserDTO, BrandDTO, ContactDTO, CompanyDTO, OpportunityDTO,
  InteractionDTO, TaskDTO, NoteDTO, ProjectDTO, TemplateDTO, AuditLogDTO,
  Stage, Temperature, Priority, Role,
  QuotationDTO, QuotationDetailDTO, QuotationItemDTO, InvoiceDTO, PaymentDTO,
} from './crm-types'

/* ---------------- Session ---------------- */

export function toSessionUser(u: {
  id: string; name: string; email: string; role: string
  title?: string | null; avatarColor: string; companyId?: string | null
  brandAccess?: { brandId: string }[]
}): SessionUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as Role,
    title: u.title ?? null,
    avatarColor: u.avatarColor,
    brandIds: u.brandAccess?.map((ba) => ba.brandId) ?? [],
    companyId: u.companyId ?? null,
  }
}

/** Reads the `crm_session` cookie, resolves the active user (with brandAccess).
 *  Returns null when missing/inactive → routes respond 401. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies()
  const userId = store.get('crm_session')?.value
  if (!userId) return null
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { brandAccess: { select: { brandId: true } } },
  })
  if (!user || !user.isActive) return null
  return toSessionUser(user)
}

/* ---------------- Small utils ---------------- */

export const fullNameOf = (firstName: string, lastName?: string | null) =>
  [firstName, lastName].filter(Boolean).join(' ').trim()

export const splitTags = (tags?: string | null): string[] =>
  (tags ?? '').split(',').map((t) => t.trim()).filter(Boolean)

export function parseDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === '') return null
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value
  const d = new Date(String(value))
  return isNaN(d.getTime()) ? null : d
}

export const iso = (d?: Date | null): string | null => (d ? d.toISOString() : null)

/** Default probability per stage (mirrors STAGES metadata, hardcoded server-side). */
export const STAGE_DEFAULT_PROBABILITY: Record<string, number> = {
  NEW: 10,
  CONTACT_ATTEMPTED: 15,
  CONNECTED: 25,
  QUALIFIED: 35,
  DISCOVERY: 45,
  ESTIMATION: 55,
  PROPOSAL_SENT: 60,
  NEGOTIATION: 70,
  VERBAL_AGREEMENT: 85,
  NURTURE: 25,
}

/* ---------------- Code generators ---------------- */

/** OPP-2025-0001 — sequence = count of existing 2025 codes + 1. */
export async function generateOppCode(): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `OPP-${year}-`
  let seq = (await db.opportunity.count({ where: { code: { startsWith: prefix } } })) + 1
  let code = `${prefix}${String(seq).padStart(4, '0')}`
  while (await db.opportunity.findUnique({ where: { code }, select: { id: true } })) {
    seq += 1
    code = `${prefix}${String(seq).padStart(4, '0')}`
  }
  return code
}

/** PRJ-2025-001 — sequence = count of existing 2025 codes + 1. */
export async function generateProjectCode(): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `PRJ-${year}-`
  let seq = (await db.project.count({ where: { code: { startsWith: prefix } } })) + 1
  let code = `${prefix}${String(seq).padStart(3, '0')}`
  while (await db.project.findUnique({ where: { code }, select: { id: true } })) {
    seq += 1
    code = `${prefix}${String(seq).padStart(3, '0')}`
  }
  return code
}

/* ---------------- Includes ---------------- */

export const opportunityInclude = {
  company: { select: { id: true, name: true, country: true } },
  contact: { select: { id: true, firstName: true, lastName: true } },
  executingBrand: { select: { id: true, name: true, color: true } },
  service: { select: { name: true } },
  owner: { select: { id: true, name: true, avatarColor: true } },
  _count: { select: { interactions: true, tasks: true } },
  tasks: { where: { status: { in: ['OPEN', 'IN_PROGRESS'] } }, select: { id: true } },
  // ambil beberapa terakhir (desc) supaya lastInboundAt (direction IN) bisa dihitung presisi
  interactions: { orderBy: { sentAt: 'desc' as const }, take: 10, select: { sentAt: true, direction: true } },
} satisfies Prisma.OpportunityInclude

export type OpportunityWithRelations = Prisma.OpportunityGetPayload<{ include: typeof opportunityInclude }>

export const interactionInclude = {
  contact: { select: { id: true, firstName: true, lastName: true } },
  company: { select: { id: true, name: true } },
  brand: { select: { id: true, name: true, color: true } },
  opportunity: { select: { id: true, title: true } },
  responder: { select: { id: true, name: true } },
} satisfies Prisma.InteractionInclude

export type InteractionWithRelations = Prisma.InteractionGetPayload<{ include: typeof interactionInclude }>

export const taskInclude = {
  assignee: { select: { id: true, name: true, avatarColor: true } },
  opportunity: { select: { id: true, title: true, company: { select: { name: true } } } },
} satisfies Prisma.TaskInclude

export type TaskWithRelations = Prisma.TaskGetPayload<{ include: typeof taskInclude }>

export const projectInclude = {
  brand: { select: { id: true, name: true, color: true } },
  company: { select: { id: true, name: true } },
  manager: { select: { id: true, name: true } },
  opportunity: { select: { id: true, code: true } },
  milestones: { orderBy: { stepOrder: 'asc' as const } },
} satisfies Prisma.ProjectInclude

export type ProjectWithRelations = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>

export const noteInclude = {
  author: { select: { id: true, name: true, avatarColor: true } },
} satisfies Prisma.NoteInclude

export type NoteWithRelations = Prisma.NoteGetPayload<{ include: typeof noteInclude }>

export const contactInclude = {
  company: { select: { id: true, name: true, country: true } },
} satisfies Prisma.ContactInclude

export type ContactWithRelations = Prisma.ContactGetPayload<{ include: typeof contactInclude }>

export const companyInclude = {
  owner: { select: { id: true, name: true } },
  contacts: { where: { isDeleted: false }, select: { id: true } },
  opportunities: { where: { isDeleted: false }, select: { stage: true, estimatedValue: true } },
} satisfies Prisma.CompanyInclude

export type CompanyWithRelations = Prisma.CompanyGetPayload<{ include: typeof companyInclude }>

/* ---------------- Mappers ---------------- */

export function mapUser(u: {
  id: string; name: string; email: string; role: string
  title?: string | null; avatarColor: string; isActive: boolean; companyId?: string | null
  brandAccess?: { brandId: string }[]
}): UserDTO {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as Role,
    title: u.title ?? null,
    avatarColor: u.avatarColor,
    isActive: u.isActive,
    brandIds: u.brandAccess?.map((b) => b.brandId) ?? [],
    companyId: u.companyId ?? null,
  }
}

export function mapBrand(b: {
  id: string; name: string; slug: string; tagline?: string | null
  description?: string | null; color: string; website?: string | null
  email?: string | null; phone?: string | null; instagram?: string | null
  address?: string | null; logoSquare?: string | null; logoWide?: string | null
  primaryCurrency: string; invoicePrefix: string; quotationPrefix: string
  slaHours: number; workflowType: string
  services?: { id: string; name: string; category: string; brandId: string }[]
}): BrandDTO {
  return {
    id: b.id,
    name: b.name,
    slug: b.slug,
    tagline: b.tagline ?? null,
    description: b.description ?? null,
    color: b.color,
    website: b.website ?? null,
    email: b.email ?? null,
    phone: b.phone ?? null,
    instagram: b.instagram ?? null,
    address: b.address ?? null,
    logoSquare: b.logoSquare ?? null,
    logoWide: b.logoWide ?? null,
    primaryCurrency: b.primaryCurrency,
    invoicePrefix: b.invoicePrefix,
    quotationPrefix: b.quotationPrefix,
    slaHours: b.slaHours,
    workflowType: b.workflowType,
    services: (b.services ?? []).map((s) => ({
      id: s.id, name: s.name, category: s.category, brandId: s.brandId,
    })),
  }
}

export function mapContact(c: ContactWithRelations): ContactDTO {
  return {
    id: c.id,
    companyId: c.companyId,
    firstName: c.firstName,
    lastName: c.lastName,
    fullName: fullNameOf(c.firstName, c.lastName),
    position: c.position,
    email: c.email,
    altEmail: c.altEmail,
    whatsapp: c.whatsapp,
    phone: c.phone,
    country: c.country,
    city: c.city,
    timezone: c.timezone,
    language: c.language,
    preferredChannel: c.preferredChannel,
    linkedin: c.linkedin,
    consentStatus: c.consentStatus,
    tags: splitTags(c.tags),
    isPrimary: c.isPrimary,
    createdAt: c.createdAt.toISOString(),
    company: c.company ? { id: c.company.id, name: c.company.name, country: c.company.country } : null,
  }
}

export function mapCompany(c: CompanyWithRelations): CompanyDTO {
  const nonLost = c.opportunities.filter((o) => o.stage !== 'LOST')
  const won = c.opportunities.filter((o) => o.stage === 'WON')
  return {
    id: c.id,
    name: c.name,
    industry: c.industry,
    website: c.website,
    country: c.country,
    city: c.city,
    address: c.address,
    size: c.size,
    taxId: c.taxId,
    currency: c.currency,
    tags: splitTags(c.tags),
    notes: c.notes,
    ownerId: c.ownerId,
    ownerName: c.owner?.name ?? null,
    createdAt: c.createdAt.toISOString(),
    contactsCount: c.contacts.length,
    opportunitiesCount: c.opportunities.length,
    totalValue: nonLost.reduce((sum, o) => sum + o.estimatedValue, 0),
    wonValue: won.reduce((sum, o) => sum + o.estimatedValue, 0),
  }
}

export function mapOpportunity(o: OpportunityWithRelations): OpportunityDTO {
  return {
    id: o.id,
    code: o.code,
    title: o.title,
    stage: o.stage as Stage,
    temperature: o.temperature as Temperature,
    priority: o.priority as Priority,
    estimatedValue: o.estimatedValue,
    currency: o.currency,
    probability: o.probability,
    expectedCloseDate: iso(o.expectedCloseDate),
    nextAction: o.nextAction,
    nextActionDate: iso(o.nextActionDate),
    lostReason: o.lostReason,
    lostNotes: o.lostNotes,
    competitorName: o.competitorName,
    lastOfferValue: o.lastOfferValue,
    reactivation: o.reactivation,
    followUpDate: iso(o.followUpDate),
    nurtureTrack: o.nurtureTrack,
    wonAt: iso(o.wonAt),
    lostAt: iso(o.lostAt),
    leadSource: o.leadSource,
    channel: o.channel,
    campaign: o.campaign,
    brief: o.brief,
    needs: o.needs,
    targetAudience: o.targetAudience,
    deliverables: o.deliverables,
    deadline: iso(o.deadline),
    companyId: o.companyId,
    companyName: o.company.name,
    companyCountry: o.company.country,
    contactId: o.contactId,
    contactName: fullNameOf(o.contact.firstName, o.contact.lastName),
    sourceBrandId: o.sourceBrandId,
    executingBrandId: o.executingBrandId,
    brandName: o.executingBrand.name,
    brandColor: o.executingBrand.color,
    serviceId: o.serviceId,
    serviceName: o.service?.name ?? null,
    ownerId: o.ownerId,
    ownerName: o.owner.name,
    ownerColor: o.owner.avatarColor,
    interactionsCount: o._count.interactions,
    tasksCount: o._count.tasks,
    openTasksCount: o.tasks.length,
    lastInteractionAt: iso(o.interactions[0]?.sentAt ?? null),
    lastInboundAt: iso(o.interactions.find((i) => i.direction === 'IN')?.sentAt ?? null),
    stageUpdatedAt: o.stageUpdatedAt.toISOString(),
    createdAt: o.createdAt.toISOString(),
  }
}

export function mapInteraction(i: InteractionWithRelations, replied?: boolean): InteractionDTO {
  return {
    id: i.id,
    opportunityId: i.opportunityId,
    opportunityTitle: i.opportunity?.title ?? null,
    contactId: i.contactId,
    contactName: fullNameOf(i.contact.firstName, i.contact.lastName),
    companyName: i.company?.name ?? null,
    brandId: i.brandId,
    brandName: i.brand.name,
    brandColor: i.brand.color,
    channel: i.channel,
    direction: i.direction,
    subject: i.subject,
    body: i.body,
    sentAt: i.sentAt.toISOString(),
    status: i.status,
    respondedBy: i.responder?.name ?? null,
    externalMessageId: i.externalMessageId,
    attachmentName: i.attachmentName,
    originalLink: i.originalLink,
    ...(replied !== undefined ? { replied } : {}),
  }
}

export function mapTask(t: TaskWithRelations): TaskDTO {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority as Priority,
    type: t.type,
    dueDate: iso(t.dueDate),
    assigneeId: t.assigneeId,
    assigneeName: t.assignee.name,
    assigneeColor: t.assignee.avatarColor,
    opportunityId: t.opportunityId,
    opportunityTitle: t.opportunity?.title ?? null,
    companyName: t.opportunity?.company?.name ?? null,
    completedAt: iso(t.completedAt),
    createdAt: t.createdAt.toISOString(),
  }
}

export function mapNote(n: NoteWithRelations): NoteDTO {
  return {
    id: n.id,
    body: n.body,
    authorId: n.authorId,
    authorName: n.author.name,
    authorColor: n.author.avatarColor,
    visibility: n.visibility,
    createdAt: n.createdAt.toISOString(),
  }
}

export function mapProject(p: ProjectWithRelations): ProjectDTO {
  return {
    id: p.id,
    name: p.name,
    code: p.code,
    status: p.status,
    progress: p.progress,
    workflowType: p.workflowType,
    budget: p.budget,
    brandId: p.brandId,
    brandName: p.brand.name,
    brandColor: p.brand.color,
    companyId: p.companyId,
    companyName: p.company.name,
    managerName: p.manager?.name ?? null,
    opportunityCode: p.opportunity.code,
    startDate: iso(p.startDate),
    endDate: iso(p.endDate),
    milestones: p.milestones.map((m) => ({
      id: m.id,
      name: m.name,
      stepOrder: m.stepOrder,
      status: m.status,
      dueDate: iso(m.dueDate),
    })),
  }
}

export function mapTemplate(t: {
  id: string; brandId: string; name: string; step: number; delayDays: number
  channel: string; language: string; subject?: string | null; body: string
  purpose?: string | null; isActive: boolean
}): TemplateDTO {
  return {
    id: t.id,
    brandId: t.brandId,
    name: t.name,
    step: t.step,
    delayDays: t.delayDays,
    channel: t.channel,
    language: t.language,
    subject: t.subject,
    body: t.body,
    purpose: t.purpose,
    isActive: t.isActive,
  }
}

export function mapAuditLog(l: {
  id: string; userName?: string | null; action: string; entityType: string
  entityId?: string | null; entityLabel?: string | null; oldValue?: string | null
  newValue?: string | null; ip?: string | null; userAgent?: string | null
  createdAt: Date
  user?: { name: string } | null
}): AuditLogDTO {
  return {
    id: l.id,
    userName: l.user?.name ?? l.userName,
    action: l.action,
    entityType: l.entityType,
    entityId: l.entityId,
    entityLabel: l.entityLabel,
    oldValue: l.oldValue,
    newValue: l.newValue,
    ip: l.ip,
    userAgent: l.userAgent,
    createdAt: l.createdAt.toISOString(),
  }
}

/* ============ Fase 2 — Quotation / Invoice / Payment helpers ============ */

/** QUO-2025-0001 — sequence = count of existing same-year codes + 1, collision-checked. */
export async function generateQuotationCode(): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `QUO-${year}-`
  let seq = (await db.quotation.count({ where: { code: { startsWith: prefix } } })) + 1
  let code = `${prefix}${String(seq).padStart(4, '0')}`
  while (await db.quotation.findUnique({ where: { code }, select: { id: true } })) {
    seq += 1
    code = `${prefix}${String(seq).padStart(4, '0')}`
  }
  return code
}

/** INV-2025-0001 — sequence = count of existing same-year codes + 1, collision-checked. */
export async function generateInvoiceCode(): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `INV-${year}-`
  let seq = (await db.invoice.count({ where: { code: { startsWith: prefix } } })) + 1
  let code = `${prefix}${String(seq).padStart(4, '0')}`
  while (await db.invoice.findUnique({ where: { code }, select: { id: true } })) {
    seq += 1
    code = `${prefix}${String(seq).padStart(4, '0')}`
  }
  return code
}

/* ----- Quotation ----- */

export const quotationInclude = {
  opportunity: { select: { id: true, code: true, title: true, stage: true, estimatedValue: true } },
  brand: { select: { id: true, name: true, color: true, logoSquare: true, logoWide: true } },
  company: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
  _count: { select: { items: true } },
} satisfies Prisma.QuotationInclude

export type QuotationWithRelations = Prisma.QuotationGetPayload<{ include: typeof quotationInclude }>

export type QuotationWithItems = QuotationWithRelations & {
  items: { id: string; description: string; qty: number; unitPrice: number; sortOrder: number }[]
}

export function mapQuotationItems(items: QuotationWithItems['items']): QuotationItemDTO[] {
  return [...items]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((it) => ({
      id: it.id,
      description: it.description,
      qty: it.qty,
      unitPrice: it.unitPrice,
      sortOrder: it.sortOrder,
      lineTotal: Math.round(it.qty * it.unitPrice),
    }))
}

export function mapQuotation(q: QuotationWithRelations): QuotationDTO {
  return {
    id: q.id,
    code: q.code,
    title: q.title,
    status: q.status as QuotationDTO['status'],
    version: q.version,
    currency: q.currency,
    subtotal: q.subtotal,
    discountPct: q.discountPct,
    discountAmount: q.discountAmount,
    taxPct: q.taxPct,
    taxAmount: q.taxAmount,
    total: q.total,
    validUntil: iso(q.validUntil),
    notes: q.notes,
    discountApprovedById: q.discountApprovedById,
    discountApprovedByName: q.approvedBy?.name ?? null,
    discountApprovedAt: iso(q.discountApprovedAt),
    sentAt: iso(q.sentAt),
    decidedAt: iso(q.decidedAt),
    createdById: q.createdById,
    createdByName: q.createdBy?.name ?? null,
    createdAt: q.createdAt.toISOString(),
    opportunityId: q.opportunityId,
    opportunityCode: q.opportunity.code,
    opportunityTitle: q.opportunity.title,
    opportunityStage: q.opportunity.stage,
    brandId: q.brandId,
    brandName: q.brand.name,
    brandColor: q.brand.color,
    brandLogoSquare: q.brand.logoSquare ?? null,
    brandLogoWide: q.brand.logoWide ?? null,
    companyId: q.companyId,
    companyName: q.company.name,
    itemsCount: q._count.items,
  }
}

export function mapQuotationDetail(q: QuotationWithItems): QuotationDetailDTO {
  return { ...mapQuotation(q), items: mapQuotationItems(q.items) }
}

/* ----- Invoice / Payment ----- */

export const invoiceInclude = {
  opportunity: { select: { id: true, code: true, title: true } },
  project: { select: { id: true, code: true } },
  brand: { select: { id: true, name: true, color: true, logoSquare: true, logoWide: true } },
  company: { select: { id: true, name: true } },
  payments: {
    orderBy: { paidAt: 'desc' as const },
    include: { recordedBy: { select: { id: true, name: true } } },
  },
} satisfies Prisma.InvoiceInclude

export type InvoiceWithRelations = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>

export type PaymentWithRecorder = InvoiceWithRelations['payments'][number]

export function mapPayment(p: PaymentWithRecorder): PaymentDTO {
  return {
    id: p.id,
    amount: p.amount,
    method: p.method,
    reference: p.reference,
    paidAt: p.paidAt.toISOString(),
    note: p.note,
    recordedByName: p.recordedBy?.name ?? null,
  }
}

export function mapInvoice(i: InvoiceWithRelations): InvoiceDTO {
  return {
    id: i.id,
    code: i.code,
    title: i.title,
    status: i.status as InvoiceDTO['status'],
    currency: i.currency,
    amount: i.amount,
    taxPct: i.taxPct,
    total: i.total,
    paidAmount: i.paidAmount,
    dueDate: iso(i.dueDate),
    issuedAt: i.issuedAt.toISOString(),
    notes: i.notes,
    opportunityId: i.opportunityId,
    opportunityCode: i.opportunity.code,
    opportunityTitle: i.opportunity.title,
    projectId: i.projectId,
    projectCode: i.project?.code ?? null,
    brandId: i.brandId,
    brandName: i.brand.name,
    brandColor: i.brand.color,
    brandLogoSquare: i.brand.logoSquare ?? null,
    brandLogoWide: i.brand.logoWide ?? null,
    companyId: i.companyId,
    companyName: i.company.name,
    payments: i.payments.map(mapPayment),
    createdAt: i.createdAt.toISOString(),
  }
}
