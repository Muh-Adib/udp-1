/* ============ /api/quotations — list + filters + auto-expire, create ============ */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  getSessionUser, generateQuotationCode, parseDate,
  quotationInclude, mapQuotationDetail, mapQuotation,
} from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

interface ItemInput { description: string; qty: number; unitPrice: number }

/** Parse & validate quotation items payload. Returns items or an error message. */
function parseItems(raw: unknown): { items: ItemInput[] } | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: 'Minimal satu item penawaran wajib diisi' }
  }
  const items: ItemInput[] = []
  for (const entry of raw) {
    const description = typeof entry?.description === 'string' ? entry.description.trim() : ''
    const qty = Number(entry?.qty)
    const unitPrice = Number(entry?.unitPrice)
    if (!description) return { error: 'Deskripsi item wajib diisi' }
    if (!Number.isFinite(qty) || qty <= 0) return { error: 'Qty setiap item harus lebih dari 0' }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return { error: 'Harga satuan tidak boleh negatif' }
    items.push({ description, qty, unitPrice })
  }
  return { items }
}

/** Compute quotation totals (money rounded to integer). */
function computeTotals(items: ItemInput[], discountPct: number, taxPct: number) {
  const subtotal = Math.round(items.reduce((sum, it) => sum + it.qty * it.unitPrice, 0))
  const discountAmount = Math.round((subtotal * discountPct) / 100)
  const taxAmount = Math.round(((subtotal - discountAmount) * taxPct) / 100)
  const total = subtotal - discountAmount + taxAmount
  return { subtotal, discountAmount, taxAmount, total }
}

/** GET ?status=&brandId=&opportunityId= → QuotationDTO[] (desc createdAt).
 *  Auto-expires SENT quotations whose validUntil has passed before mapping. */
export async function GET(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') ?? ''
  const brandId = searchParams.get('brandId') ?? ''
  const opportunityId = searchParams.get('opportunityId') ?? ''

  /* --- auto-expire pass (global, before listing/mapping) --- */
  const now = new Date()
  const stale = await db.quotation.findMany({
    where: { status: 'SENT', validUntil: { lt: now } },
    select: { id: true, code: true, title: true },
  })
  for (const q of stale) {
    await db.quotation.update({ where: { id: q.id }, data: { status: 'EXPIRED' } })
    await logAudit({
      userId: session.id,
      userName: session.name,
      action: 'QUOTATION_EXPIRED',
      entityType: 'Quotation',
      entityId: q.id,
      entityLabel: `${q.code} — ${q.title}`,
      oldValue: { status: 'SENT' },
      newValue: { status: 'EXPIRED' },
      req,
    })
  }

  const quotations = await db.quotation.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(brandId ? { brandId } : {}),
      ...(opportunityId ? { opportunityId } : {}),
    },
    include: quotationInclude,
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(quotations.map(mapQuotation))
}

/**
 * POST — create quotation from an opportunity.
 * Body: { opportunityId, title?, items: [{description, qty, unitPrice}],
 *         discountPct?, taxPct?, validUntil?, notes? }
 * brandId/companyId/currency inherit from the opportunity.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const opportunityId = typeof body?.opportunityId === 'string' ? body.opportunityId : ''
  if (!opportunityId) return NextResponse.json({ error: 'Opportunity wajib dipilih' }, { status: 400 })

  const opp = await db.opportunity.findFirst({ where: { id: opportunityId, isDeleted: false } })
  if (!opp) return NextResponse.json({ error: 'Opportunity tidak ditemukan' }, { status: 404 })

  const parsedItems = parseItems(body?.items)
  if ('error' in parsedItems) return NextResponse.json({ error: parsedItems.error }, { status: 400 })

  const rawDiscount = Number(body?.discountPct ?? 0)
  const rawTax = Number(body?.taxPct ?? 11)
  const discountPct = Number.isFinite(rawDiscount) ? Math.min(100, Math.max(0, rawDiscount)) : 0
  const taxPct = Number.isFinite(rawTax) ? Math.min(100, Math.max(0, rawTax)) : 11
  const title = typeof body?.title === 'string' && body.title.trim() ? body.title.trim() : opp.title
  const notes = typeof body?.notes === 'string' && body.notes.trim() ? body.notes.trim() : null
  const validUntil = parseDate(body?.validUntil)

  const totals = computeTotals(parsedItems.items, discountPct, taxPct)
  const code = await generateQuotationCode()

  const created = await db.quotation.create({
    data: {
      code,
      opportunityId: opp.id,
      brandId: opp.executingBrandId,
      companyId: opp.companyId,
      title,
      status: 'DRAFT',
      currency: opp.currency,
      subtotal: totals.subtotal,
      discountPct,
      discountAmount: totals.discountAmount,
      taxPct,
      taxAmount: totals.taxAmount,
      total: totals.total,
      validUntil,
      notes,
      createdById: session.id,
      items: {
        create: parsedItems.items.map((it, index) => ({
          description: it.description,
          qty: it.qty,
          unitPrice: it.unitPrice,
          sortOrder: index,
        })),
      },
    },
    include: { ...quotationInclude, items: { orderBy: { sortOrder: 'asc' as const } } },
  })

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'QUOTATION_CREATE',
    entityType: 'Quotation',
    entityId: created.id,
    entityLabel: `${code} — ${title}`,
    newValue: { code, total: totals.total },
    req,
  })

  return NextResponse.json(mapQuotationDetail(created))
}
