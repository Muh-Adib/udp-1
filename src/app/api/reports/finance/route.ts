import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { effectiveInvoiceStatus, lastMonths, monthKey } from "@/lib/ops";
import type { FinanceStats, InvoiceStatus } from "@/lib/crm-types";

const BRANDS = ["unimasi", "segia", "erfo", "unicam"];

/** GET /api/reports/finance — agregat keuangan (cashflow, outstanding, per brand). */
export async function GET() {
  const user = await requireAuth(["OWNER", "MANAGER", "FINANCE"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const [invoices, payments, quotations] = await Promise.all([
    db.invoice.findMany({ include: { payments: true } }),
    db.payment.findMany(),
    db.quotation.findMany({ select: { status: true } }),
  ]);

  const months = lastMonths(6);

  let revenuePaid = 0;
  let outstanding = 0;
  let overdueCount = 0;
  const statusAgg = new Map<InvoiceStatus, { count: number; amount: number }>();
  const brandAgg = new Map<string, { revenue: number; outstanding: number }>();
  const monthlyRevenue = new Map<string, number>();
  const monthlyInvoiced = new Map<string, number>();

  for (const m of months) {
    monthlyRevenue.set(m.key, 0);
    monthlyInvoiced.set(m.key, 0);
  }

  for (const p of payments) {
    revenuePaid += p.amount;
    const k = monthKey(p.paidAt);
    if (monthlyRevenue.has(k)) monthlyRevenue.set(k, (monthlyRevenue.get(k) ?? 0) + p.amount);
  }

  for (const inv of invoices) {
    const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
    const st = effectiveInvoiceStatus(inv, paid);
    const s = statusAgg.get(st) ?? { count: 0, amount: 0 };
    s.count += 1;
    s.amount += inv.grandTotal - paid;
    statusAgg.set(st, s);

    if (st !== "PAID") {
      outstanding += inv.grandTotal - paid;
      if (st === "OVERDUE") overdueCount += 1;
    }

    const b = brandAgg.get(inv.brand) ?? { revenue: 0, outstanding: 0 };
    if (st === "PAID") b.revenue += inv.grandTotal;
    else b.outstanding += inv.grandTotal - paid;
    brandAgg.set(inv.brand, b);

    const ik = monthKey(inv.issuedAt);
    if (monthlyInvoiced.has(ik)) monthlyInvoiced.set(ik, (monthlyInvoiced.get(ik) ?? 0) + inv.grandTotal);
  }

  const approved = quotations.filter((q) => q.status === "APPROVED").length;

  const stats: FinanceStats = {
    revenuePaid,
    outstanding,
    overdueCount,
    invoiceCount: invoices.length,
    quotationCount: quotations.length,
    quotationApprovedPct: quotations.length ? Math.round((approved / quotations.length) * 100) : 0,
    monthly: months.map((m) => ({ month: m.key, label: m.label, revenue: monthlyRevenue.get(m.key) ?? 0, invoiced: monthlyInvoiced.get(m.key) ?? 0 })),
    byBrand: BRANDS.map((b) => ({ brand: b, revenue: brandAgg.get(b)?.revenue ?? 0, outstanding: brandAgg.get(b)?.outstanding ?? 0 })),
    statusBreakdown: (["UNPAID", "PARTIAL", "PAID", "OVERDUE"] as InvoiceStatus[]).map((st) => ({
      status: st,
      count: statusAgg.get(st)?.count ?? 0,
      amount: statusAgg.get(st)?.amount ?? 0,
    })),
  };

  return NextResponse.json({ stats });
}
