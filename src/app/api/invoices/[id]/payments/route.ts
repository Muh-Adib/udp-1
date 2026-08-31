/* ============ /api/invoices/[id]/payments — record a payment ============ */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, parseDate, invoiceInclude, mapInvoice } from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/**
 * POST — record a payment against an invoice.
 * Body: { amount, method?, reference?, paidAt?, note? }
 * Recomputes paidAmount from all payments and derives the invoice status:
 * PAID when paidAmount >= total - 1 (rounding epsilon), PARTIAL when > 0, else UNPAID.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const { id } = await ctx.params
  const invoice = await db.invoice.findFirst({ where: { id }, include: invoiceInclude })
  if (!invoice) return NextResponse.json({ error: 'Invoice tidak ditemukan' }, { status: 404 })

  if (invoice.status === 'CANCELLED') {
    return NextResponse.json({ error: 'Invoice telah dibatalkan' }, { status: 400 })
  }
  if (invoice.status === 'PAID') {
    return NextResponse.json({ error: 'Invoice sudah lunas' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  const amount = Number(body?.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Jumlah pembayaran harus lebih dari 0' }, { status: 400 })
  }

  const newPaid = invoice.paidAmount + amount
  if (newPaid > invoice.total + 1) {
    return NextResponse.json({ error: 'Total pembayaran melebihi nilai invoice' }, { status: 400 })
  }

  const method = typeof body?.method === 'string' && body.method.trim() ? body.method.trim() : 'TRANSFER'
  const reference = typeof body?.reference === 'string' && body.reference.trim() ? body.reference.trim() : null
  const note = typeof body?.note === 'string' && body.note.trim() ? body.note.trim() : null
  const paidAt = parseDate(body?.paidAt) ?? new Date()

  await db.payment.create({
    data: {
      invoiceId: id,
      amount,
      method,
      reference,
      paidAt,
      note,
      recordedById: session.id,
    },
  })

  /* --- recompute from all payments --- */
  const payments = await db.payment.findMany({ where: { invoiceId: id }, select: { amount: true } })
  const paidAmount = Math.round(payments.reduce((sum, p) => sum + p.amount, 0))
  const status = paidAmount >= invoice.total - 1 ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'UNPAID'

  await db.invoice.update({ where: { id }, data: { paidAmount, status } })

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'PAYMENT_RECORD',
    entityType: 'Invoice',
    entityId: id,
    entityLabel: `${invoice.code} — ${invoice.title}`,
    oldValue: { paidAmount: invoice.paidAmount, status: invoice.status },
    newValue: { amount, method, paidAmount, status },
    req,
  })

  const updated = await db.invoice.findFirst({ where: { id }, include: invoiceInclude })
  return NextResponse.json(mapInvoice(updated!))
}
