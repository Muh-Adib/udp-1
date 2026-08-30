import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, requireAuth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { buildShareMessage } from "@/lib/secure-links";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/secure-links/[id] — aktif/nonaktifkan atau reset password. */
export async function PATCH(req: Request, ctx: Ctx) {
  const user = await requireAuth(["OWNER", "MANAGER", "MARKETER", "FINANCE", "PRODUCTION"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const { id } = await ctx.params;
  const link = await db.secureLink.findUnique({ where: { id } });
  if (!link) return NextResponse.json({ error: "Tautan tidak ditemukan" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const data: Record<string, unknown> = {};

  let plainPassword: string | null = null;
  if (body?.active !== undefined) {
    data.active = Boolean(body.active);
  }
  if (body?.password) {
    plainPassword = String(body.password);
    if (plainPassword.length < 4) {
      return NextResponse.json({ error: "Password minimal 4 karakter" }, { status: 400 });
    }
    data.passwordHash = hashPassword(plainPassword);
    // Reset password membuat grant lama tetap tak berlaku (cookie tetap, tapi verifikasi
    // unduhan file memakai grant berbasis token saja — password baru hanya untuk akses baru).
  }

  const updated = await db.secureLink.update({ where: { id }, data });
  await logAudit({
    actorName: user.name,
    action: "SECURE_LINK_UPDATED",
    entity: "SecureLink",
    entityId: id,
    detail: `${updated.title} — active=${updated.active}${plainPassword ? ", password direset" : ""}`,
  });

  return NextResponse.json({
    link: {
      id: updated.id,
      token: updated.token,
      url: `/s/${updated.token}`,
      title: updated.title,
      targetType: updated.targetType,
      targetId: updated.targetId,
      leadId: updated.leadId,
      projectId: updated.projectId,
      brand: updated.brand,
      active: updated.active,
      expiresAt: updated.expiresAt?.toISOString() ?? null,
      accessCount: updated.accessCount,
      lastAccessAt: updated.lastAccessAt?.toISOString() ?? null,
      createdByName: updated.createdByName,
      createdAt: updated.createdAt.toISOString(),
    },
    ...(plainPassword
      ? { password: plainPassword, shareMessage: buildShareMessage(updated.title, `/s/${updated.token}`, plainPassword, user.name) }
      : {}),
  });
}

/** DELETE /api/secure-links/[id] — hapus tautan permanen. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await requireAuth(["OWNER", "MANAGER", "MARKETER", "FINANCE", "PRODUCTION"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const { id } = await ctx.params;
  const link = await db.secureLink.findUnique({ where: { id } });
  if (!link) return NextResponse.json({ error: "Tautan tidak ditemukan" }, { status: 404 });

  await db.secureLink.delete({ where: { id } });
  await logAudit({
    actorName: user.name,
    action: "SECURE_LINK_DELETED",
    entity: "SecureLink",
    entityId: id,
    detail: `${link.title} — /s/${link.token}`,
  });
  return NextResponse.json({ ok: true });
}
