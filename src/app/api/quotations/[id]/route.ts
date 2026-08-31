/* ============ /api/quotations/[id] — detail + partial update + delete ============ */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  getSessionUser, parseDate,
  quotationInclude, mapQuotationDetail,
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

function computeTotals(items: ItemInput[], discountPct: number, taxPct: number) {
  const subtotal = Math.round(items.reduce((sum, it) => sum + it.qty * it.unitPrice, 0))
  const discountAmount = Math.round((subtotal * discountPct) / 100)
  const taxAmount = Math.round(((subtotal - discountAmount) * taxPct) / 100)
  const total = subtotal - discountAmount + taxAmount
  return { subtotal, discountAmount, taxAmount, total }
}

const detailInclude = { ...quotationInclude, items: { orderBy: { sortOrder: 'asc' as const } } }

/** GET → QuotationDetailDTO (items asc sortOrder, lineTotal = round(qty*unitPrice)). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const { id } = await ctx.params
  const quotation = await db.quotation.findFirst({
    where: { id },
    include: detailInclude,
  })
  if (!quotation) return NextResponse.json({ error: 'Penawaran tidak ditemukan' }, { status: 404 })

  return NextResponse.json(mapQuotationDetail(quotation))
}

/**
 * PATCH — allowed only while DRAFT or SENT (else 400 'Penawaran final tidak dapat diubah').
 * Body: { title?, items?, discountPct?, taxPct?, validUntil?, notes? }
 * When items/discountPct/taxPct are provided totals are recomputed; when the quotation
 * is SENT and totals actually changed, version is incremented.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const { id } = await ctx.params
  const quotation = await db.quotation.findFirst({
    where: { id },
    include: { items: { orderBy: { sortOrder: 'asc' as const } } },
  })
  if (!quotation) return NextResponse.json({ error: 'Penawaran tidak ditemukan' }, { status: 404 })
  if (quotation.status !== 'DRAFT' && quotation.status !== 'SENT') {
    return NextResponse.json({ error: 'Penawaran final tidak dapat diubah' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body tidak valid' }, { status: 400 })

  const data: Record<string, unknown> = {}
  const oldValue: Record<string, unknown> = {
    subtotal: quotation.subtotal,
    discountAmount: quotation.discountAmount,
    taxAmount: quotation.taxAmount,
    total: quotation.total,
    version: quotation.version,
  }
  const newValue: Record<string, unknown> = {}

  /* --- simple scalar fields --- */
  if (typeof body.title === 'string' && body.title.trim() && body.title.trim() !== quotation.title) {
    data.title = body.title.trim()
    oldValue.title = quotation.title
    newValue.title = data.title
  }
  if (body.notes !== undefined) {
    const nextNotes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null
    if (nextNotes !== quotation.notes) {
      data.notes = nextNotes
      oldValue.notes = quotation.notes
      newValue.notes = nextNotes
    }
  }
  if (body.validUntil !== undefined) {
    const nextValid = parseDate(body.validUntil)
    if ((nextValid?.getTime() ?? null) !== (quotation.validUntil?.getTime() ?? null)) {
      data.validUntil = nextValid
      oldValue.validUntil = quotation.validUntil?.toISOString() ?? null
      newValue.validUntil = nextValid?.toISOString() ?? null
    }
  }

  /* --- totals-affecting fields --- */
  let newItems: ItemInput[] | null = null
  if (body.items !== undefined) {
    const parsed = parseItems(body.items)
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
    newItems = parsed.items
  }

  let discountPct = quotation.discountPct
  let taxPct = quotation.taxPct
  let totalsTouched = false

  if (body.discountPct !== undefined) {
    const raw = Number(body.discountPct)
    if (!Number.isFinite(raw) || raw < 0 || raw > 100) {
      return NextResponse.json({ error: 'Diskon harus antara 0 dan 100 persen' }, { status: 400 })
    }
    if (raw !== quotation.discountPct) totalsTouched = true
    discountPct = raw
  }
  if (body.taxPct !== undefined) {
    const raw = Number(body.taxPct)
    if (!Number.isFinite(raw) || raw < 0 || raw > 100) {
      return NextResponse.json({ error: 'Pajak harus antara 0 dan 100 persen' }, { status: 400 })
    }
    if (raw !== quotation.taxPct) totalsTouched = true
    taxPct = raw
  }
  if (newItems) totalsTouched = true

  if (newItems || body.discountPct !== undefined || body.taxPct !== undefined) {
    const source = newItems
      ? newItems
      : quotation.items.map((it) => ({ description: it.description, qty: it.qty, unitPrice: it.unitPrice }))
    const totals = computeTotals(source, discountPct, taxPct)
    if (
      totals.subtotal !== quotation.subtotal ||
      totals.discountAmount !== quotation.discountAmount ||
      totals.taxAmount !== quotation.taxAmount ||
      totals.total !== quotation.total
    ) {
      totalsTouched = true
    }
    data.subtotal = totals.subtotal
    data.discountPct = discountPct
    data.discountAmount = totals.discountAmount
    data.taxPct = taxPct
    data.taxAmount = totals.taxAmount
    data.total = totals.total
    newValue.subtotal = totals.subtotal
    newValue.discountAmount = totals.discountAmount
    newValue.taxAmount = totals.taxAmount
    newValue.total = totals.total
  }

  /* --- replace items when a new list is provided --- */
  if (newItems) {
    data.items = {
      deleteMany: {},
      create: newItems.map((it, index) => ({
        description: it.description,
        qty: it.qty,
        unitPrice: it.unitPrice,
        sortOrder: index,
      })),
    }
  }

  /* --- version bump when a SENT quotation's totals changed --- */
  if (totalsTouched && quotation.status === 'SENT') {
    data.version = quotation.version + 1
    newValue.version = data.version
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Tidak ada perubahan' }, { status: 400 })
  }

  await db.quotation.update({ where: { id }, data })

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'QUOTATION_UPDATE',
    entityType: 'Quotation',
    entityId: id,
    entityLabel: `${quotation.code} — ${quotation.title}`,
    oldValue,
    newValue,
    req,
  })

  const updated = await db.quotation.findFirst({ where: { id }, include: detailInclude })
  return NextResponse.json(mapQuotationDetail(updated!))
}

/** DELETE — hard delete, allowed only while DRAFT (else 400). */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const { id } = await ctx.params
  const quotation = await db.quotation.findFirst({ where: { id } })
  if (!quotation) return NextResponse.json({ error: 'Penawaran tidak ditemukan' }, { status: 404 })
  if (quotation.status !== 'DRAFT') {
    return NextResponse.json({ error: 'Hanya penawaran DRAFT yang dapat dihapus' }, { status: 400 })
  }

  await db.quotationItem.deleteMany({ where: { quotationId: id } })
  await db.quotation.delete({ where: { id } })

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'QUOTATION_DELETE',
    entityType: 'Quotation',
    entityId: id,
    entityLabel: `${quotation.code} — ${quotation.title}`,
    oldValue: { code: quotation.code, status: quotation.status, total: quotation.total },
    req,
  })

  return NextResponse.json({ ok: true })
}
