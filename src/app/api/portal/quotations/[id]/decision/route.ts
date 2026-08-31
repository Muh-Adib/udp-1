/* ============ /api/portal/quotations/[id]/decision — keputusan client (R11) ============ *
 * POST { decision: 'ACCEPTED' | 'REJECTED', note?: string }
 * Hanya role CLIENT, hanya quotation milik company-nya, hanya saat status SENT.
 * Efek: status+decidedAt quotation diupdate, audit PORTAL_QUOTATION_DECISION dicatat,
 * dan PortalComment otomatis dibuat (catatan keputusan masuk thread diskusi).
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, iso } from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'
import type { PortalDecisionResultDTO, PortalQuotationDTO } from '@/lib/crm-types'

export const dynamic = 'force-dynamic'

/** Mapper PortalQuotationDTO — identik dengan gaya mapping di src/app/api/portal/route.ts */
function mapPortalQuotation(
  q: {
    id: string; code: string; title: string; status: string; version: number
    currency: string; subtotal: number; discountPct: number; discountAmount: number
    taxPct: number; taxAmount: number; total: number
    validUntil: Date | null; sentAt: Date | null; decidedAt: Date | null
    createdAt: Date
    brand: { name: string; color: string }
    items: { id: string; description: string; qty: number; unitPrice: number }[]
  },
): PortalQuotationDTO {
  return {
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
  }
}

/** POST → PortalDecisionResultDTO */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })
  if (session.role !== 'CLIENT') {
    return NextResponse.json(
      { error: 'Hanya client yang dapat memberi keputusan melalui portal' },
      { status: 403 },
    )
  }

  const { id } = await ctx.params

  try {
    let body: { decision?: unknown; note?: unknown } = {}
    try {
      body = await req.json()
    } catch {
      body = {}
    }

    const quotation = await db.quotation.findUnique({
      where: { id },
      include: {
        items: { orderBy: { sortOrder: 'asc' as const } },
        brand: { select: { name: true, color: true } },
      },
    })
    if (!quotation) {
      return NextResponse.json({ error: 'Penawaran tidak ditemukan' }, { status: 404 })
    }
    if (quotation.companyId !== session.companyId) {
      return NextResponse.json({ error: 'Penawaran bukan milik perusahaan Anda' }, { status: 403 })
    }
    if (quotation.status !== 'SENT') {
      return NextResponse.json(
        { error: 'Penawaran ini sudah diputuskan atau tidak lagi tersedia' },
        { status: 400 },
      )
    }

    const decision = body.decision
    if (decision !== 'ACCEPTED' && decision !== 'REJECTED') {
      return NextResponse.json({ error: 'Keputusan tidak valid' }, { status: 400 })
    }

    const note = typeof body.note === 'string' ? body.note : undefined

    /* 1. Update keputusan quotation */
    const updated = await db.quotation.update({
      where: { id },
      data: { status: decision, decidedAt: new Date() },
      include: {
        items: { orderBy: { sortOrder: 'asc' as const } },
        brand: { select: { name: true, color: true } },
      },
    })

    /* 2. Audit — fail-safe */
    await logAudit({
      userId: session.id,
      userName: session.name,
      action: 'PORTAL_QUOTATION_DECISION',
      entityType: 'Quotation',
      entityId: id,
      entityLabel: `${quotation.code} — ${quotation.title}`,
      newValue: { decision, by: session.name, note: note ?? null },
      req,
    })

    /* 3. Komentar otomatis di thread diskusi penawaran */
    const commentBody =
      note && note.trim()
        ? note.trim()
        : decision === 'ACCEPTED'
          ? 'Penawaran ini kami setujui.'
          : 'Penawaran ini kami tolak.'
    await db.portalComment.create({
      data: {
        entityType: 'QUOTATION',
        entityId: id,
        companyId: quotation.companyId,
        userId: session.id,
        userName: session.name,
        userRole: 'CLIENT',
        body: commentBody,
      },
    })

    const result: PortalDecisionResultDTO = {
      quotation: mapPortalQuotation(updated),
      message:
        decision === 'ACCEPTED'
          ? 'Penawaran disetujui. Tim kami akan segera menghubungi Anda untuk langkah selanjutnya.'
          : 'Penawaran ditolak. Terima kasih atas tanggapannya.',
    }
    return NextResponse.json(result)
  } catch (err) {
    console.error('[portal/decision] gagal menyimpan keputusan:', err)
    return NextResponse.json({ error: 'Gagal menyimpan keputusan' }, { status: 500 })
  }
}
