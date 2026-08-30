import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { progressFromMilestones } from "@/lib/ops";
import type { MilestoneDTO } from "@/lib/crm-types";

type Ctx = { params: Promise<{ id: string }> };

const VALID_MS_STATUS = ["PENDING", "IN_PROGRESS", "DONE"];

/**
 * PATCH /api/milestones/[id] — ubah judul/bobot/tenggat/status milestone.
 * Status DONE/IN_PROGRESS diperbolehkan langsung dari sini (senada siklus checkbox).
 */
export async function PATCH(req: Request, ctx: Ctx) {
  const user = await requireAuth(["OWNER", "MANAGER", "MARKETER", "PRODUCTION"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const { id } = await ctx.params;
  const milestone = await db.milestone.findUnique({ where: { id } });
  if (!milestone) return NextResponse.json({ error: "Milestone tidak ditemukan" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const data: Record<string, unknown> = {};

  if (body?.title !== undefined) {
    const title = String(body.title).trim();
    if (!title) return NextResponse.json({ error: "Judul milestone tidak boleh kosong" }, { status: 400 });
    data.title = title;
  }
  if (body?.weight !== undefined) {
    data.weight = Math.max(0, Math.min(100, Math.round(Number(body.weight)) || 0));
  }
  if (body?.dueDate !== undefined) {
    const d = body.dueDate ? new Date(String(body.dueDate)) : null;
    data.dueDate = d && !isNaN(d.getTime()) ? d : null;
  }
  if (body?.status !== undefined) {
    if (!VALID_MS_STATUS.includes(String(body.status))) {
      return NextResponse.json({ error: "Status milestone tidak valid" }, { status: 400 });
    }
    data.status = String(body.status);
    data.doneAt = body.status === "DONE" ? new Date() : null;
  }

  const updated = await db.milestone.update({ where: { id }, data });

  const all = await db.milestone.findMany({ where: { projectId: milestone.projectId } });
  await db.project.update({ where: { id: milestone.projectId }, data: { progress: progressFromMilestones(all) } });

  await logAudit({
    actorName: user.name,
    action: "MILESTONE_UPDATED",
    entity: "Milestone",
    entityId: id,
    detail: `"${updated.title}" — status=${updated.status} bobot=${updated.weight}%`,
  });

  const dto: MilestoneDTO = {
    id: updated.id,
    title: updated.title,
    orderIdx: updated.orderIdx,
    weight: updated.weight,
    status: updated.status as MilestoneDTO["status"],
    dueDate: updated.dueDate?.toISOString() ?? null,
    doneAt: updated.doneAt?.toISOString() ?? null,
  };
  return NextResponse.json({ milestone: dto });
}

/** DELETE /api/milestones/[id] — hapus milestone (deliverable terkait tetap, jadi "Tanpa milestone"). */
export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await requireAuth(["OWNER", "MANAGER"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const { id } = await ctx.params;
  const milestone = await db.milestone.findUnique({ where: { id } });
  if (!milestone) return NextResponse.json({ error: "Milestone tidak ditemukan" }, { status: 404 });

  await db.milestone.delete({ where: { id } });

  const all = await db.milestone.findMany({ where: { projectId: milestone.projectId } });
  await db.project.update({ where: { id: milestone.projectId }, data: { progress: progressFromMilestones(all) } });

  await logAudit({
    actorName: user.name,
    action: "MILESTONE_DELETED",
    entity: "Milestone",
    entityId: id,
    detail: `"${milestone.title}" (bobot ${milestone.weight}%)`,
  });
  return NextResponse.json({ ok: true });
}
