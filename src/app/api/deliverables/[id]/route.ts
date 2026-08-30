import { NextResponse } from "next/server";
import { unlink } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

type Ctx = { params: Promise<{ id: string }> };

/** DELETE /api/deliverables/[id] — pengunggah sendiri, atau OWNER/MANAGER. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await requireAuth(["OWNER", "MANAGER", "MARKETER", "PRODUCTION"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const { id } = await ctx.params;
  const deliverable = await db.deliverable.findUnique({ where: { id }, include: { project: { select: { code: true } } } });
  if (!deliverable) return NextResponse.json({ error: "Deliverable tidak ditemukan" }, { status: 404 });

  if (!["OWNER", "MANAGER"].includes(user.role) && deliverable.uploadedByName !== user.name) {
    return NextResponse.json({ error: "Hanya pengunggah atau owner/manajer yang bisa menghapus" }, { status: 403 });
  }

  if (deliverable.filePath) {
    await unlink(path.join(UPLOAD_DIR, deliverable.filePath)).catch(() => undefined);
  }
  await db.deliverable.delete({ where: { id } });
  await logAudit({ actorName: user.name, action: "DELIVERABLE_DELETED", entity: "Deliverable", entityId: id, detail: `${deliverable.project.code} — ${deliverable.name}` });
  return NextResponse.json({ ok: true });
}
