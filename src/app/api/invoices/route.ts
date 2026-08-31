/* ============ /api/invoices — list + filters, create ============ */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  getSessionUser, generateInvoiceCode, parseDate,
  invoiceInclude, mapInvoice,
} from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/** GET ?status=&brandId= → InvoiceDTO[] desc issuedAt (payments desc paidAt). */
export async function GET(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') ?? ''
  const brandId = searchParams.get('brandId') ?? ''

  const invoices = await db.invoice.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(brandId ? { brandId } : {}),
    },
    include: invoiceInclude,
    orderBy: { issuedAt: 'desc' },
  })

  return NextResponse.json(invoices.map(mapInvoice))
}

/**
 * POST — create invoice from an opportunity.
 * Body: { opportunityId, quotationId?, projectId?, title, amount, taxPct?, dueDate?, notes? }
 * brand/company/currency inherit from the opportunity. total = round(amount * (1 + taxPct/100)).
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const opportunityId = typeof body?.opportunityId === 'string' ? body.opportunityId : ''
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const amount = Number(body?.amount)

  if (!opportunityId) return NextResponse.json({ error: 'Opportunity wajib dipilih' }, { status: 400 })
  if (!title) return NextResponse.json({ error: 'Judul invoice wajib diisi' }, { status: 400 })
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Nilai invoice harus lebih dari 0' }, { status: 400 })
  }

  const opp = await db.opportunity.findFirst({ where: { id: opportunityId, isDeleted: false } })
  if (!opp) return NextResponse.json({ error: 'Opportunity tidak ditemukan' }, { status: 404 })

  const quotationId = typeof body?.quotationId === 'string' && body.quotationId ? body.quotationId : null
  if (quotationId) {
    const quotation = await db.quotation.findUnique({ where: { id: quotationId }, select: { id: true } })
    if (!quotation) return NextResponse.json({ error: 'Quotation tidak ditemukan' }, { status: 404 })
  }
  const projectId = typeof body?.projectId === 'string' && body.projectId ? body.projectId : null
  if (projectId) {
    const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } })
    if (!project) return NextResponse.json({ error: 'Project tidak ditemukan' }, { status: 404 })
  }

  const rawTax = Number(body?.taxPct ?? 0)
  const taxPct = Number.isFinite(rawTax) ? Math.min(100, Math.max(0, rawTax)) : 0
  const total = Math.round(amount * (1 + taxPct / 100))
  const dueDate = parseDate(body?.dueDate)
  const notes = typeof body?.notes === 'string' && body.notes.trim() ? body.notes.trim() : null

  const code = await generateInvoiceCode()

  const created = await db.invoice.create({
    data: {
      code,
      opportunityId: opp.id,
      quotationId,
      projectId,
      brandId: opp.executingBrandId,
      companyId: opp.companyId,
      title,
      status: 'UNPAID',
      currency: opp.currency,
      amount,
      taxPct,
      total,
      paidAmount: 0,
      dueDate,
      notes,
    },
    include: invoiceInclude,
  })

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'INVOICE_CREATE',
    entityType: 'Invoice',
    entityId: created.id,
    entityLabel: `${code} — ${title}`,
    newValue: { code, title, total, opportunityId: opp.id },
    req,
  })

  return NextResponse.json(mapInvoice(created))
}
