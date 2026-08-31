/* ============ /api/opportunities/[id]/estimation — GET + PUT (upsert) ============ */
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'
import type { EstimationDTO, EstimationCategory } from '@/lib/crm-types'

export const dynamic = 'force-dynamic'

const INTERNAL_ROLES = ['SUPER_ADMIN', 'DIREKTUR', 'MARKETING', 'KEUANGAN', 'PRODUKSI']
const ESTIMATION_STATUSES = ['DRAFT', 'FINAL']
const CATEGORIES = [
  'INTERNAL', 'FREELANCE', 'EQUIPMENT', 'TRANSPORT', 'ACCOMMODATION',
  'TALENT', 'LOCATION', 'SOFTWARE', 'HOSTING', 'OTHER',
]

const estimationInclude = {
  items: { orderBy: { sortOrder: 'asc' as const } },
  createdBy: { select: { name: true } },
} satisfies Prisma.EstimationInclude

type EstimationWithRelations = Prisma.EstimationGetPayload<{ include: typeof estimationInclude }>

interface ReferenceInfo {
  referenceValue: number
  referenceSource: 'QUOTATION' | 'OPPORTUNITY' | 'NONE'
}

/** Nilai referensi margin: quotation SENT/ACCEPTED terbaru → estimatedValue → 0. */
async function resolveReference(opportunityId: string, estimatedValue: number): Promise<ReferenceInfo> {
  const quotation = await db.quotation.findFirst({
    where: { opportunityId, status: { in: ['SENT', 'ACCEPTED'] } },
    orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
    select: { total: true },
  })
  if (quotation) return { referenceValue: quotation.total, referenceSource: 'QUOTATION' }
  if (estimatedValue > 0) return { referenceValue: estimatedValue, referenceSource: 'OPPORTUNITY' }
  return { referenceValue: 0, referenceSource: 'NONE' }
}

function mapEstimation(e: EstimationWithRelations, ref: ReferenceInfo): EstimationDTO {
  const items = [...e.items]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((it) => ({
      id: it.id,
      category: it.category as EstimationCategory,
      description: it.description,
      qty: it.qty,
      unit: it.unit,
      unitCost: it.unitCost,
      days: it.days,
      lineTotal: it.qty * it.unitCost * (it.days ?? 1),
      sortOrder: it.sortOrder,
    }))
  const actualMarginAmount = ref.referenceValue - e.totalCost
  const actualMarginPct = ref.referenceValue > 0 ? (actualMarginAmount / ref.referenceValue) * 100 : 0
  return {
    id: e.id,
    opportunityId: e.opportunityId,
    currency: e.currency,
    status: e.status as EstimationDTO['status'],
    internalCost: e.internalCost,
    externalCost: e.externalCost,
    subtotalCost: e.subtotalCost,
    contingencyPct: e.contingencyPct,
    contingencyAmount: e.contingencyAmount,
    managementFeePct: e.managementFeePct,
    managementFeeAmount: e.managementFeeAmount,
    totalCost: e.totalCost,
    targetMarginPct: e.targetMarginPct,
    sellingPrice: e.sellingPrice,
    taxPct: e.taxPct,
    taxAmount: e.taxAmount,
    priceWithTax: e.priceWithTax,
    notes: e.notes,
    createdById: e.createdById,
    createdByName: e.createdBy?.name ?? null,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
    items,
    referenceValue: ref.referenceValue,
    referenceSource: ref.referenceSource,
    actualMarginAmount,
    actualMarginPct,
    priceGap: e.sellingPrice - ref.referenceValue,
  }
}

interface ItemInput {
  category: string
  description: string
  qty: number
  unit: string
  unitCost: number
  days: number | null
}

/** Parse & validate estimation items payload. Returns items or an error message. */
function parseItems(raw: unknown): { items: ItemInput[] } | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: 'Minimal 1 baris biaya diperlukan' }
  }
  const items: ItemInput[] = []
  for (const entry of raw) {
    const rec = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>
    const description = typeof rec.description === 'string' ? rec.description.trim() : ''
    if (!description) return { error: 'Deskripsi item wajib diisi' }
    const category = typeof rec.category === 'string' ? rec.category.trim().toUpperCase() : ''
    if (!CATEGORIES.includes(category)) {
      return { error: `Kategori item tidak valid (pilih salah satu: ${CATEGORIES.join(', ')})` }
    }
    const qty = Number(rec.qty)
    const unitCost = Number(rec.unitCost)
    if (!Number.isFinite(qty) || qty < 0) return { error: 'Qty harus berupa angka lebih dari atau sama dengan 0' }
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      return { error: 'Biaya satuan harus berupa angka lebih dari atau sama dengan 0' }
    }
    let days: number | null = null
    if (rec.days !== undefined && rec.days !== null && rec.days !== '') {
      const n = Number(rec.days)
      if (!Number.isFinite(n) || n < 0) {
        return { error: 'Durasi (hari) harus berupa angka lebih dari atau sama dengan 0' }
      }
      days = n
    }
    const unit = typeof rec.unit === 'string' && rec.unit.trim() ? rec.unit.trim() : 'unit'
    items.push({ category, description, qty, unit, unitCost, days })
  }
  return { items }
}

/** Persen di-clamp ke [min, max]; nilai tidak valid → fallback. */
function clampPct(raw: unknown, fallback: number, min: number, max: number): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/** GET → EstimationDTO | null (200). Internal team only. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })
  if (!INTERNAL_ROLES.includes(session.role)) {
    return NextResponse.json({ error: 'Hanya tim internal yang dapat mengakses brief' }, { status: 403 })
  }

  const { id } = await ctx.params
  const opportunity = await db.opportunity.findUnique({
    where: { id },
    select: { id: true, estimatedValue: true },
  })
  if (!opportunity) return NextResponse.json({ error: 'Opportunity tidak ditemukan' }, { status: 404 })

  const estimation = await db.estimation.findUnique({
    where: { opportunityId: id },
    include: estimationInclude,
  })
  if (!estimation) return NextResponse.json(null)

  const ref = await resolveReference(id, opportunity.estimatedValue)
  return NextResponse.json(mapEstimation(estimation, ref))
}

/**
 * PUT — upsert estimation. Body: EstimationSaveInput.
 * Server-side computation (transaction): lineTotal = qty × unitCost × (days ?? 1);
 * internal/external/subtotal → contingency + management fee → totalCost →
 * sellingPrice = round(totalCost / (1 − targetMargin/100)) → PPN → priceWithTax.
 * Audit: ESTIMATION_SAVED. createdById asli dipertahankan saat update.
 */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })
  if (!INTERNAL_ROLES.includes(session.role)) {
    return NextResponse.json({ error: 'Hanya tim internal yang dapat mengakses brief' }, { status: 403 })
  }

  const { id } = await ctx.params
  const opportunity = await db.opportunity.findUnique({
    where: { id },
    select: { id: true, code: true, currency: true, estimatedValue: true },
  })
  if (!opportunity) return NextResponse.json({ error: 'Opportunity tidak ditemukan' }, { status: 404 })

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Body tidak valid' }, { status: 400 })
  }

  let status = 'DRAFT'
  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !ESTIMATION_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: 'Status harus DRAFT atau FINAL' }, { status: 400 })
    }
    status = body.status
  }

  const parsed = parseItems(body.items)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const contingencyPct = clampPct(body.contingencyPct, 5, 0, 100)
  const managementFeePct = clampPct(body.managementFeePct, 10, 0, 100)
  const targetMarginPct = clampPct(body.targetMarginPct, 30, 0, 95)
  const taxPct = clampPct(body.taxPct, 11, 0, 100)

  /* --- komputasi server-side --- */
  let internalCost = 0
  let externalCost = 0
  for (const it of parsed.items) {
    const lineTotal = it.qty * it.unitCost * (it.days ?? 1)
    if (it.category === 'INTERNAL') internalCost += lineTotal
    else externalCost += lineTotal
  }
  const subtotalCost = internalCost + externalCost
  const contingencyAmount = (subtotalCost * contingencyPct) / 100
  const managementFeeAmount = (subtotalCost * managementFeePct) / 100
  const totalCost = subtotalCost + contingencyAmount + managementFeeAmount
  const sellingPrice = targetMarginPct < 100 ? Math.round(totalCost / (1 - targetMarginPct / 100)) : totalCost
  const taxAmount = (sellingPrice * taxPct) / 100
  const priceWithTax = sellingPrice + taxAmount

  const currency = typeof body.currency === 'string' && body.currency.trim()
    ? body.currency.trim()
    : (opportunity.currency || 'IDR')
  const notes = body.notes !== undefined
    ? (typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null)
    : undefined

  const existing = await db.estimation.findUnique({ where: { opportunityId: id } })

  const estimation = await db.$transaction(async (tx) => {
    const row = existing
      ? await tx.estimation.update({
          where: { id: existing.id },
          data: {
            currency, status, internalCost, externalCost, subtotalCost,
            contingencyPct, contingencyAmount, managementFeePct, managementFeeAmount,
            totalCost, targetMarginPct, sellingPrice, taxPct, taxAmount, priceWithTax,
            notes,
            // createdById sengaja tidak diubah — pembuat asli dipertahankan
          },
        })
      : await tx.estimation.create({
          data: {
            opportunityId: id, currency, status, internalCost, externalCost, subtotalCost,
            contingencyPct, contingencyAmount, managementFeePct, managementFeeAmount,
            totalCost, targetMarginPct, sellingPrice, taxPct, taxAmount, priceWithTax,
            notes, createdById: session.id,
          },
        })
    await tx.estimationItem.deleteMany({ where: { estimationId: row.id } })
    await tx.estimationItem.createMany({
      data: parsed.items.map((it, index) => ({
        estimationId: row.id,
        category: it.category,
        description: it.description,
        qty: it.qty,
        unit: it.unit,
        unitCost: it.unitCost,
        days: it.days,
        sortOrder: index,
      })),
    })
    return row
  })

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'ESTIMATION_SAVED',
    entityType: 'Estimation',
    entityId: estimation.id,
    entityLabel: `${opportunity.code} — Estimasi`,
    newValue: { totalCost, sellingPrice, status },
    req,
  })

  const saved = await db.estimation.findUnique({
    where: { opportunityId: id },
    include: estimationInclude,
  })
  const ref = await resolveReference(id, opportunity.estimatedValue)
  return NextResponse.json(mapEstimation(saved!, ref))
}
