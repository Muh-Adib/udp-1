/* ============ /api/quotations/[id]/status — status transitions ============ */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, quotationInclude, mapQuotation } from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/**
 * POST — { status: 'SENT' | 'ACCEPTED' | 'REJECTED' }
 * SENT: only from DRAFT, sets sentAt. ACCEPTED/REJECTED: only from SENT, sets decidedAt;
 * ACCEPTED also finalizes the opportunity estimatedValue to the quotation total.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const { id } = await ctx.params
  const quotation = await db.quotation.findFirst({ where: { id }, include: quotationInclude })
  if (!quotation) return NextResponse.json({ error: 'Penawaran tidak ditemukan' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const nextStatus = typeof body?.status === 'string' ? body.status : ''
  if (!['SENT', 'ACCEPTED', 'REJECTED'].includes(nextStatus)) {
    return NextResponse.json({ error: 'Status tidak valid' }, { status: 400 })
  }

  const now = new Date()

  if (nextStatus === 'SENT') {
    if (quotation.status !== 'DRAFT') {
      return NextResponse.json({ error: 'Hanya penawaran DRAFT yang dapat dikirim' }, { status: 400 })
    }
    await db.quotation.update({
      where: { id },
      data: { status: 'SENT', sentAt: now },
    })
    await logAudit({
      userId: session.id,
      userName: session.name,
      action: 'QUOTATION_SENT',
      entityType: 'Quotation',
      entityId: id,
      entityLabel: `${quotation.code} — ${quotation.title}`,
      oldValue: { status: quotation.status },
      newValue: { status: 'SENT', sentAt: now.toISOString() },
      req,
    })
  } else {
    if (quotation.status !== 'SENT') {
      return NextResponse.json({ error: 'Hanya penawaran terkirim yang dapat diputuskan' }, { status: 400 })
    }

    await db.quotation.update({
      where: { id },
      data: { status: nextStatus, decidedAt: now },
    })

    if (nextStatus === 'ACCEPTED') {
      // Finalize opportunity value from the accepted quotation total.
      if (quotation.opportunity.estimatedValue !== quotation.total) {
        await db.opportunity.update({
          where: { id: quotation.opportunityId },
          data: { estimatedValue: quotation.total },
        })
        await logAudit({
          userId: session.id,
          userName: session.name,
          action: 'UPDATE',
          entityType: 'Opportunity',
          entityId: quotation.opportunityId,
          entityLabel: `${quotation.opportunity.code} — ${quotation.opportunity.title}`,
          oldValue: { estimatedValue: quotation.opportunity.estimatedValue },
          newValue: { estimatedValue: quotation.total },
          req,
        })
      }
    }

    await logAudit({
      userId: session.id,
      userName: session.name,
      action: nextStatus === 'ACCEPTED' ? 'QUOTATION_ACCEPTED' : 'QUOTATION_REJECTED',
      entityType: 'Quotation',
      entityId: id,
      entityLabel: `${quotation.code} — ${quotation.title}`,
      oldValue: { status: quotation.status },
      newValue: { status: nextStatus, decidedAt: now.toISOString() },
      req,
    })
  }

  const updated = await db.quotation.findFirst({ where: { id }, include: quotationInclude })
  return NextResponse.json(mapQuotation(updated!))
}
