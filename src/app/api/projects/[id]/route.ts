import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { progressFromMilestones } from "@/lib/ops";

type Ctx = { params: Promise<{ id: string }> };

const VALID_STATUS = ["PLANNED", "BRIEFED", "IN_PROGRESS", "REVIEW", "DONE"];
const VALID_MS_STATUS = ["PENDING", "IN_PROGRESS", "DONE"];

/**
 * PATCH /api/projects/[id]
 * body: { status?, progress?, milestoneId?, milestoneStatus? }
 * - Update status proyek (alur produksi)
 * - Toggle milestone → progress proyek dihitung ulang otomatis dari bobot milestone
 */
export async function PATCH(req: Request, ctx: Ctx) {
  const user = await requireAuth(["OWNER", "MANAGER", "MARKETER", "PRODUCTION"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const project = await db.project.findUnique({ where: { id }, include: { milestones: true } });
  if (!project) return NextResponse.json({ error: "Proyek tidak ditemukan" }, { status: 404 });

  const data: Record<string, unknown> = {};

  if (body?.milestoneId && body?.milestoneStatus) {
    if (!VALID_MS_STATUS.includes(body.milestoneStatus)) {
      return NextResponse.json({ error: "Status milestone tidak valid" }, { status: 400 });
    }
    const ms = project.milestones.find((m) => m.id === body.milestoneId);
    if (!ms) return NextResponse.json({ error: "Milestone tidak ditemukan" }, { status: 404 });

    await db.milestone.update({
      where: { id: ms.id },
      data: { status: body.milestoneStatus, doneAt: body.milestoneStatus === "DONE" ? new Date() : null },
    });

    // Progress = bobot milestone DONE; proyek otomatis aktif saat milestone pertama berjalan
    const fresh = await db.project.findUnique({ where: { id }, include: { milestones: true } });
    const progress = progressFromMilestones(fresh!.milestones);
    data.progress = progress;
    if (progress > 0) {
      if (!["DONE", "REVIEW"].includes(fresh!.status)) data.status = "IN_PROGRESS";
      if (progress >= 100 && fresh!.status !== "DONE") data.status = "REVIEW"; // semua milestone selesai → menunggu persetujuan klien
    } else if (body.milestoneStatus === "IN_PROGRESS" && ["PLANNED"].includes(fresh!.status)) {
      data.status = "BRIEFED"; // pekerjaan mulai berjalan
    }
  }

  if (body?.status !== undefined) {
    if (!VALID_STATUS.includes(body.status)) {
      return NextResponse.json({ error: "Status proyek tidak valid" }, { status: 400 });
    }
    data.status = body.status;
    if (body.status === "DONE") data.progress = 100;
  }

  if (body?.progress !== undefined && body?.milestoneId === undefined) {
    data.progress = Math.min(100, Math.max(0, Math.round(Number(body.progress) || 0)));
  }

  await db.project.update({ where: { id }, data });

  const statusNow = (data.status as string) ?? project.status;
  await logAudit({
    actorName: user.name,
    action: "PROJECT_UPDATED",
    entity: "Project",
    entityId: id,
    detail: `${project.code} status=${statusNow} progress=${data.progress ?? project.progress}`,
  });

  return NextResponse.json({ ok: true });
}
