/* ============ /api/portal — Client Portal read-only (role CLIENT, terikat companyId) ============ */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, fullNameOf, iso } from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'
import type { PortalDTO, PortalProjectDTO, PortalQuotationDTO, PortalInvoiceDTO } from '@/lib/crm-types'

export const dynamic = 'force-dynamic'

/** GET → PortalDTO. Draft quotations disembunyikan; invoice CANCELLED tetap tampil (klien melihat kondisi sebenarnya). */
export async function GET(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })
  if (session.role !== 'CLIENT') {
    return NextResponse.json({ error: 'Hanya client yang dapat mengakses portal' }, { status: 403 })
  }
  if (!session.companyId) {
    return NextResponse.json({ error: 'Akun client belum terhubung ke perusahaan manapun' }, { status: 400 })
  }

  try {
    const companyId = session.companyId

    const [company, projects, quotations, invoices] = await Promise.all([
      db.company.findUnique({
        where: { id: companyId },
        select: {
          id: true,
          name: true,
          industry: true,
          country: true,
          city: true,
          contacts: {
            where: { isDeleted: false },
            select: { id: true, firstName: true, lastName: true, position: true, email: true, whatsapp: true },
            orderBy: [{ isPrimary: 'desc' as const }, { firstName: 'asc' as const }],
          },
        },
      }),
      db.project.findMany({
        where: { companyId },
        orderBy: { createdAt: 'asc' },
        include: {
          milestones: { orderBy: { stepOrder: 'asc' as const } },
          brand: { select: { name: true, color: true } },
          manager: { select: { name: true } },
        },
      }),
      // DRAFT = dokumen internal — tidak pernah tampil di portal klien.
      db.quotation.findMany({
        where: { companyId, status: { not: 'DRAFT' } },
        orderBy: { createdAt: 'desc' as const },
        include: {
          items: { orderBy: { sortOrder: 'asc' as const } },
          brand: { select: { name: true, color: true } },
        },
      }),
      // Semua status invoice (termasuk CANCELLED) — transparansi penuh untuk klien.
      db.invoice.findMany({
        where: { companyId },
        orderBy: { issuedAt: 'desc' as const },
        include: {
          payments: { orderBy: { paidAt: 'desc' as const } },
          brand: { select: { name: true, color: true } },
          project: { select: { code: true } },
        },
      }),
    ])

    if (!company) return NextResponse.json({ error: 'Perusahaan tidak ditemukan' }, { status: 404 })

    /* --- Projects (tanpa budget — data internal) --- */
    const portalProjects: PortalProjectDTO[] = projects.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      status: p.status,
      progress: p.progress,
      workflowType: p.workflowType,
      brandName: p.brand.name,
      brandColor: p.brand.color,
      managerName: p.manager?.name ?? null,
      startDate: iso(p.startDate),
      endDate: iso(p.endDate),
      milestones: p.milestones.map((m) => ({
        id: m.id,
        name: m.name,
        stepOrder: m.stepOrder,
        status: m.status,
        dueDate: iso(m.dueDate),
      })),
    }))

    /* --- Quotations (non-DRAFT; tanpa notes/createdByName/opportunityCode) --- */
    const portalQuotations: PortalQuotationDTO[] = quotations.map((q) => ({
      id: q.id,
      code: q.code,
      title: q.title,
      status: q.status as PortalQuotationDTO['status'],
      version: q.version,
      currency: q.currency,
      subtotal: q.subtotal,
      discountPct: q.discountPct,
      discountAmount: q.discountAmount,
      taxPct: q.taxPct,
      taxAmount: q.taxAmount,
      total: q.total,
      validUntil: iso(q.validUntil),
      sentAt: iso(q.sentAt),
      decidedAt: iso(q.decidedAt),
      createdAt: q.createdAt.toISOString(),
      brandName: q.brand.name,
      brandColor: q.brand.color,
      items: q.items.map((it) => ({
        id: it.id,
        description: it.description,
        qty: it.qty,
        unitPrice: it.unitPrice,
        lineTotal: Math.round(it.qty * it.unitPrice),
      })),
    }))

    /* --- Invoices (semua status; tanpa notes) --- */
    const portalInvoices: PortalInvoiceDTO[] = invoices.map((inv) => ({
      id: inv.id,
      code: inv.code,
      title: inv.title,
      status: inv.status as PortalInvoiceDTO['status'],
      currency: inv.currency,
      amount: inv.amount,
      taxPct: inv.taxPct,
      total: inv.total,
      paidAmount: inv.paidAmount,
      dueDate: iso(inv.dueDate),
      issuedAt: inv.issuedAt.toISOString(),
      brandName: inv.brand.name,
      brandColor: inv.brand.color,
      projectCode: inv.project?.code ?? null,
      payments: inv.payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        method: p.method,
        paidAt: p.paidAt.toISOString(),
        reference: p.reference,
      })),
    }))

    /* --- Summary --- */
    const NOT_ACTIVE = ['COMPLETED', 'CANCELLED']
    const activeProjects = portalProjects.filter((p) => !NOT_ACTIVE.includes(p.status)).length
    const openQuotations = portalQuotations.filter((q) => q.status === 'SENT').length

    let outstandingTotal = 0
    let nextDueDate: string | null = null
    for (const inv of invoices) {
      if (inv.status === 'CANCELLED') continue
      const remaining = Math.max(0, Math.round(inv.total - inv.paidAmount))
      if (remaining <= 0) continue
      outstandingTotal += remaining
      if (inv.dueDate && (!nextDueDate || inv.dueDate.getTime() < new Date(nextDueDate).getTime())) {
        nextDueDate = inv.dueDate.toISOString()
      }
    }

    const data: PortalDTO = {
      company: {
        id: company.id,
        name: company.name,
        industry: company.industry,
        country: company.country,
        city: company.city,
        contacts: company.contacts.map((c) => ({
          id: c.id,
          name: fullNameOf(c.firstName, c.lastName),
          position: c.position,
          email: c.email,
          phone: c.whatsapp,
        })),
      },
      projects: portalProjects,
      quotations: portalQuotations,
      invoices: portalInvoices,
      summary: {
        activeProjects,
        openQuotations,
        outstandingTotal: Math.round(outstandingTotal),
        nextDueDate,
      },
    }

    await logAudit({
      userId: session.id,
      userName: session.name,
      action: 'PORTAL_VIEWED',
      entityType: 'Portal',
      entityId: company.id,
      entityLabel: `Portal — ${company.name}`,
      newValue: {
        projects: portalProjects.length,
        quotations: portalQuotations.length,
        invoices: portalInvoices.length,
      },
      req,
    })

    return NextResponse.json(data)
  } catch (err) {
    console.error('[portal] gagal memuat data portal:', err)
    return NextResponse.json({ error: 'Gagal memuat data portal' }, { status: 500 })
  }
}
