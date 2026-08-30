import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { progressFromMilestones } from "@/lib/ops";
import type { MilestoneDTO } from "@/lib/crm-types";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/projects/[id]/milestones — buat milestone MANUAL (sebelumnya hanya
 * dibuat otomatis saat penawaran disetujui). Role: OWNER/MANAGER/MARKETER/PRODUCTION.
 * Body: { title, weight?, dueDate? }
 */
export async function POST(req: Request, ctx: Ctx) {
  const user = await requireAuth(["OWNER", "MANAGER", "MARKETER", "PRODUCTION"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const { id } = await ctx.params;
  const project = await db.project.findUnique({ where: { id }, include: { milestones: true } });
  if (!project) return NextResponse.json({ error: "Proyek tidak ditemukan" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const title = String(body?.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "Judul milestone wajib diisi" }, { status: 400 });
  const weight = Math.max(0, Math.min(100, Math.round(Number(body?.weight ?? 10)) || 0));
  const dueDate = body?.dueDate ? new Date(String(body.dueDate)) : null;

  const maxOrder = project.milestones.reduce((m, ms) => Math.max(m, ms.orderIdx), 0);
  const milestone = await db.milestone.create({
    data: {
      projectId: id,
      title,
      orderIdx: maxOrder + 1,
      weight,
      dueDate: dueDate && !isNaN(dueDate.getTime()) ? dueDate : null,
    },
  });

  // Total bobot berubah → hitung ulang progress proyek
  const all = await db.milestone.findMany({ where: { projectId: id } });
  await db.project.update({ where: { id }, data: { progress: progressFromMilestones(all) } });

  await logAudit({
    actorName: user.name,
    action: "MILESTONE_CREATED",
    entity: "Milestone",
    entityId: milestone.id,
    detail: `${project.code} — "${title}" (bobot ${weight}%)`,
  });

  const dto: MilestoneDTO = {
    id: milestone.id,
    title: milestone.title,
    orderIdx: milestone.orderIdx,
    weight: milestone.weight,
    status: milestone.status as MilestoneDTO["status"],
    dueDate: milestone.dueDate?.toISOString() ?? null,
    doneAt: milestone.doneAt?.toISOString() ?? null,
  };
  return NextResponse.json({ milestone: dto }, { status: 201 });
}
