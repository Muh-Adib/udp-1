/* ============ /api/quotations/[id]/approve-discount — Direktur approval ============ */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, quotationInclude, mapQuotation } from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/** POST — approve a pending discount. Only DIREKTUR / SUPER_ADMIN. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })
  if (!['DIREKTUR', 'SUPER_ADMIN', 'MANAJER'].includes(session.role)) {
    return NextResponse.json({ error: 'Hanya Direktur/Manajer yang dapat menyetujui diskon' }, { status: 403 })
  }

  const { id } = await ctx.params
  const quotation = await db.quotation.findFirst({ where: { id }, include: quotationInclude })
  if (!quotation) return NextResponse.json({ error: 'Penawaran tidak ditemukan' }, { status: 404 })

  if (quotation.discountPct <= 0) {
    return NextResponse.json({ error: 'Tidak ada diskon untuk disetujui' }, { status: 400 })
  }
  if (quotation.discountApprovedById) {
    return NextResponse.json({ error: 'Diskon sudah disetujui' }, { status: 400 })
  }

  const now = new Date()
  await db.quotation.update({
    where: { id },
    data: { discountApprovedById: session.id, discountApprovedAt: now },
  })

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'APPROVE_DISCOUNT',
    entityType: 'Quotation',
    entityId: id,
    entityLabel: `${quotation.code} — ${quotation.title}`,
    oldValue: { discountApprovedById: null },
    newValue: { discountPct: quotation.discountPct, total: quotation.total },
    req,
  })

  const updated = await db.quotation.findFirst({ where: { id }, include: quotationInclude })
  return NextResponse.json(mapQuotation(updated!))
}
