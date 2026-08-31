/* ============ /api/finance/summary — FinanceSummaryDTO ============ */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, mapPayment } from '@/lib/crm-server'

export const dynamic = 'force-dynamic'

/** GET → FinanceSummaryDTO computed in JS from all non-CANCELLED invoices + payments. */
export async function GET(_req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const invoices = await db.invoice.findMany({
    where: { status: { not: 'CANCELLED' } },
    include: {
      brand: { select: { id: true, name: true, color: true } },
      company: { select: { id: true, name: true } },
      payments: { include: { recordedBy: { select: { id: true, name: true } } } },
    },
  })

  const outstandingOf = (total: number, paidAmount: number) => Math.max(0, Math.round(total - paidAmount))

  let outstandingTotal = 0
  let overdueTotal = 0
  let overdueCount = 0
  let invoicedTotal = 0
  let unpaidCount = 0
  let paidThisMonth = 0

  const aging = [
    { bucket: '0-30', count: 0, value: 0 },
    { bucket: '31-60', count: 0, value: 0 },
    { bucket: '61-90', count: 0, value: 0 },
    { bucket: '>90', count: 0, value: 0 },
  ]
  const bucketFor = (days: number): number =>
    days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3

  const brandAgg = new Map<string, { brandId: string; name: string; color: string; invoiced: number; paid: number; outstanding: number }>()
  const allPayments: (ReturnType<typeof mapPayment> & {
    invoiceCode: string
    invoiceTitle: string
    companyName: string
    paidAtDate: Date
  })[] = []

  for (const inv of invoices) {
    const outstanding = outstandingOf(inv.total, inv.paidAmount)
    invoicedTotal += inv.total
    outstandingTotal += outstanding
    if (outstanding > 0) unpaidCount += 1

    /* --- aging (only overdue with outstanding) --- */
    if (outstanding > 0 && inv.dueDate && inv.dueDate.getTime() < now.getTime()) {
      const daysOverdue = Math.floor((now.getTime() - inv.dueDate.getTime()) / 86_400_000)
      const bucket = aging[bucketFor(daysOverdue)]
      bucket.count += 1
      bucket.value += outstanding
      overdueCount += 1
      overdueTotal += outstanding
    }

    /* --- payments --- */
    for (const p of inv.payments) {
      if (p.paidAt.getTime() >= monthStart.getTime()) paidThisMonth += p.amount
      allPayments.push({
        ...mapPayment(p),
        invoiceCode: inv.code,
        invoiceTitle: inv.title,
        companyName: inv.company.name,
        paidAtDate: p.paidAt,
      })
    }

    /* --- per-brand aggregation --- */
    const entry = brandAgg.get(inv.brandId) ?? {
      brandId: inv.brandId,
      name: inv.brand.name,
      color: inv.brand.color,
      invoiced: 0,
      paid: 0,
      outstanding: 0,
    }
    entry.invoiced += inv.total
    entry.paid += inv.paidAmount
    entry.outstanding += outstanding
    brandAgg.set(inv.brandId, entry)
  }

  const recentPayments = allPayments
    .sort((a, b) => b.paidAtDate.getTime() - a.paidAtDate.getTime())
    .slice(0, 8)
    .map(({ paidAtDate: _paidAtDate, ...p }) => p)

  return NextResponse.json({
    outstandingTotal: Math.round(outstandingTotal),
    overdueTotal: Math.round(overdueTotal),
    overdueCount,
    paidThisMonth: Math.round(paidThisMonth),
    invoicedTotal: Math.round(invoicedTotal),
    unpaidCount,
    aging,
    byBrand: [...brandAgg.values()].sort((a, b) => b.invoiced - a.invoiced),
    recentPayments,
  })
}
