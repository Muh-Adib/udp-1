import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { lastMonths, monthKey } from "@/lib/ops";
import type { ProductionStats, ProjectStatus } from "@/lib/crm-types";

const BRANDS = ["unimasi", "segia", "erfo", "unicam"];
const STATUSES: ProjectStatus[] = ["PLANNED", "BRIEFED", "IN_PROGRESS", "REVIEW", "DONE"];

/** GET /api/reports/production — agregat produksi (proyek, milestone, per brand). */
export async function GET() {
  const user = await requireAuth(["OWNER", "MANAGER", "MARKETER", "FINANCE"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const [projects, milestones] = await Promise.all([
    db.project.findMany(),
    db.milestone.findMany(),
  ]);

  const months = lastMonths(6);
  const statusAgg = new Map<ProjectStatus, number>(STATUSES.map((s) => [s, 0]));
  const brandAgg = new Map<string, { active: number; done: number; budget: number }>();
  const monthlyCompleted = new Map<string, number>();
  const monthlyStarted = new Map<string, number>();
  for (const m of months) {
    monthlyCompleted.set(m.key, 0);
    monthlyStarted.set(m.key, 0);
  }

  let doneCount = 0;
  let progressSum = 0;
  let activeCount = 0;

  for (const p of projects) {
    if (p.status === "DONE") doneCount += 1;
    else {
      activeCount += 1;
      progressSum += p.progress;
    }
    statusAgg.set(p.status as ProjectStatus, (statusAgg.get(p.status as ProjectStatus) ?? 0) + 1);

    const b = brandAgg.get(p.brand) ?? { active: 0, done: 0, budget: 0 };
    if (p.status === "DONE") b.done += 1;
    else b.active += 1;
    b.budget += p.budget;
    brandAgg.set(p.brand, b);

    if (p.status === "DONE") {
      const k = monthKey(p.updatedAt);
      if (monthlyCompleted.has(k)) monthlyCompleted.set(k, (monthlyCompleted.get(k) ?? 0) + 1);
    }
    const sk = monthKey(p.createdAt);
    if (monthlyStarted.has(sk)) monthlyStarted.set(sk, (monthlyStarted.get(sk) ?? 0) + 1);
  }

  const msDone = milestones.filter((m) => m.status === "DONE").length;

  const stats: ProductionStats = {
    totalProjects: projects.length,
    activeCount,
    doneCount,
    avgProgress: activeCount ? Math.round(progressSum / activeCount) : 0,
    milestoneDonePct: milestones.length ? Math.round((msDone / milestones.length) * 100) : 0,
    byStatus: STATUSES.map((s) => ({ status: s, count: statusAgg.get(s) ?? 0 })),
    monthly: months.map((m) => ({ month: m.key, label: m.label, completed: monthlyCompleted.get(m.key) ?? 0, started: monthlyStarted.get(m.key) ?? 0 })),
    byBrand: BRANDS.map((b) => ({ brand: b, active: brandAgg.get(b)?.active ?? 0, done: brandAgg.get(b)?.done ?? 0, budget: brandAgg.get(b)?.budget ?? 0 })),
  };

  return NextResponse.json({ stats });
}
