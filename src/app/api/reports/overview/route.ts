import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { lastMonths, monthKey } from "@/lib/ops";
import type { OverviewStats } from "@/lib/crm-types";

const BRANDS = ["unimasi", "segia", "erfo", "unicam"];

/**
 * GET /api/reports/overview — bagan gabungan Keuangan × Produksi.
 * Revenue (pembayaran invoice) vs proyek selesai vs lead menang per bulan,
 * plus rincian per brand. Ini yang membuat keuangan & produksi "bekerja sama".
 */
export async function GET() {
  const user = await requireAuth(["OWNER", "MANAGER", "FINANCE"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const months = lastMonths(6);
  const [payments, projects, leads] = await Promise.all([
    db.payment.findMany(),
    db.project.findMany(),
    db.lead.findMany({ select: { stage: true, estValue: true, brand: true, updatedAt: true } }),
  ]);

  const monthlyRevenue = new Map<string, number>();
  const monthlyCompleted = new Map<string, number>();
  const monthlyWon = new Map<string, number>();
  for (const m of months) {
    monthlyRevenue.set(m.key, 0);
    monthlyCompleted.set(m.key, 0);
    monthlyWon.set(m.key, 0);
  }

  for (const p of payments) {
    const k = monthKey(p.paidAt);
    if (monthlyRevenue.has(k)) monthlyRevenue.set(k, (monthlyRevenue.get(k) ?? 0) + p.amount);
  }
  for (const pr of projects) {
    if (pr.status === "DONE") {
      const k = monthKey(pr.updatedAt);
      if (monthlyCompleted.has(k)) monthlyCompleted.set(k, (monthlyCompleted.get(k) ?? 0) + 1);
    }
  }
  for (const l of leads) {
    if (l.stage === "WON") {
      const k = monthKey(l.updatedAt);
      if (monthlyWon.has(k)) monthlyWon.set(k, (monthlyWon.get(k) ?? 0) + 1);
    }
  }

  const brandAgg = new Map<string, { revenue: number; activeProjects: number; doneProjects: number; pipelineValue: number }>(
    BRANDS.map((b) => [b, { revenue: 0, activeProjects: 0, doneProjects: 0, pipelineValue: 0 }])
  );

  // Revenue per brand: butuh invoice → payment; pakai invoice.brand dari payment.invoiceId
  const invoices = await db.invoice.findMany({ select: { id: true, brand: true, grandTotal: true, payments: { select: { amount: true } } } });
  for (const inv of invoices) {
    const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
    const b = brandAgg.get(inv.brand);
    if (b) b.revenue += paid;
  }
  for (const pr of projects) {
    const b = brandAgg.get(pr.brand);
    if (!b) continue;
    if (pr.status === "DONE") b.doneProjects += 1;
    else b.activeProjects += 1;
  }
  for (const l of leads) {
    if (l.stage !== "WON" && l.stage !== "LOST") {
      const b = brandAgg.get(l.brand);
      if (b) b.pipelineValue += l.estValue ?? 0;
    }
  }

  const totalRevenue = Array.from(monthlyRevenue.values()).reduce((s, v) => s + v, 0);
  const totalDone = Array.from(monthlyCompleted.values()).reduce((s, v) => s + v, 0);
  const totalActive = projects.filter((p) => p.status !== "DONE").length;
  const pipelineValue = leads.filter((l) => l.stage !== "WON" && l.stage !== "LOST").reduce((s, l) => s + (l.estValue ?? 0), 0);

  const stats: OverviewStats = {
    monthly: months.map((m) => ({
      month: m.key,
      label: m.label,
      revenue: monthlyRevenue.get(m.key) ?? 0,
      projectsCompleted: monthlyCompleted.get(m.key) ?? 0,
      leadsWon: monthlyWon.get(m.key) ?? 0,
    })),
    perBrand: BRANDS.map((b) => ({ brand: b, ...(brandAgg.get(b) ?? { revenue: 0, activeProjects: 0, doneProjects: 0, pipelineValue: 0 }) })),
    totals: {
      revenue: totalRevenue,
      projectsDone: totalDone,
      projectsActive: totalActive,
      pipelineValue,
      avgProjectValue: projects.length ? Math.round(projects.reduce((s, p) => s + p.budget, 0) / projects.length) : 0,
    },
  };

  return NextResponse.json({ stats });
}
