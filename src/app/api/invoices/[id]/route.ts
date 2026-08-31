/* ============ /api/invoices/[id] — partial update / cancel ============ */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, parseDate, invoiceInclude, mapInvoice } from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/**
 * PATCH — Body: { title?, dueDate?, notes?, status? }
 * status only accepts 'CANCELLED' and only while paidAmount === 0.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const { id } = await ctx.params
  const invoice = await db.invoice.findFirst({ where: { id }, include: invoiceInclude })
  if (!invoice) return NextResponse.json({ error: 'Invoice tidak ditemukan' }, { status: 404 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body tidak valid' }, { status: 400 })

  const data: Record<string, unknown> = {}
  const oldValue: Record<string, unknown> = {}
  const newValue: Record<string, unknown> = {}

  if (body.status !== undefined) {
    if (body.status !== 'CANCELLED') {
      return NextResponse.json({ error: 'Hanya pembatalan (CANCELLED) yang didukung' }, { status: 400 })
    }
    if (invoice.status === 'CANCELLED') {
      return NextResponse.json({ error: 'Invoice sudah dibatalkan' }, { status: 400 })
    }
    if (invoice.paidAmount > 0) {
      return NextResponse.json({ error: 'Invoice yang sudah memiliki pembayaran tidak dapat dibatalkan' }, { status: 400 })
    }
    data.status = 'CANCELLED'
    oldValue.status = invoice.status
    newValue.status = 'CANCELLED'
  }

  if (body.title !== undefined) {
    const nextTitle = typeof body.title === 'string' ? body.title.trim() : ''
    if (nextTitle && nextTitle !== invoice.title) {
      data.title = nextTitle
      oldValue.title = invoice.title
      newValue.title = nextTitle
    }
  }

  if (body.dueDate !== undefined) {
    const nextDue = parseDate(body.dueDate)
    if ((nextDue?.getTime() ?? null) !== (invoice.dueDate?.getTime() ?? null)) {
      data.dueDate = nextDue
      oldValue.dueDate = invoice.dueDate?.toISOString() ?? null
      newValue.dueDate = nextDue?.toISOString() ?? null
    }
  }

  if (body.notes !== undefined) {
    const nextNotes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null
    if (nextNotes !== invoice.notes) {
      data.notes = nextNotes
      oldValue.notes = invoice.notes
      newValue.notes = nextNotes
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Tidak ada perubahan' }, { status: 400 })
  }

  await db.invoice.update({ where: { id }, data })

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'INVOICE_UPDATE',
    entityType: 'Invoice',
    entityId: id,
    entityLabel: `${invoice.code} — ${invoice.title}`,
    oldValue,
    newValue,
    req,
  })

  const updated = await db.invoice.findFirst({ where: { id }, include: invoiceInclude })
  return NextResponse.json(mapInvoice(updated!))
}
