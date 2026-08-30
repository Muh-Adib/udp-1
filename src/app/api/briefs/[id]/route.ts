import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { mapBrief } from "@/lib/ops";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/briefs/[id]
 * action: "submit" (kirim ke produksi utk estimasi) — OWNER/MANAGER/MARKETER
 *         "reject-estimate" (kembalikan ke draft, catatan wajib) — OWNER/MANAGER
 */
export async function PATCH(req: Request, ctx: Ctx) {
  const user = await requireAuth(["OWNER", "MANAGER", "MARKETER"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const action = body?.action as string | undefined;

  const brief = await db.brief.findUnique({ where: { id }, include: { lead: { include: { contact: true } } } });
  if (!brief) return NextResponse.json({ error: "Brief tidak ditemukan" }, { status: 404 });

  if (action === "submit") {
    if (brief.status !== "DRAFT") {
      return NextResponse.json({ error: "Hanya brief draf yang bisa dikirim untuk estimasi" }, { status: 400 });
    }
    const updated = await db.brief.update({
      where: { id },
      data: { status: "SUBMITTED", notes: body?.notes ? String(body.notes) : brief.notes },
    });
    await db.leadMessage.create({
      data: {
        leadId: brief.leadId,
        direction: "NOTE",
        channel: "internal",
        body: `Brief ${brief.code} dikirim ke tim produksi untuk estimasi pengerjaan.`,
        senderName: user.name,
      },
    });
    await db.notification.create({
      data: {
        role: "PRODUCTION",
        title: `Brief ${brief.code} menunggu estimasi`,
        body: `${brief.title} — dari ${brief.lead.contact.name}. Mohon hitung estimasi pengerjaan.`,
        type: "SYSTEM",
      },
    });
    await logAudit({ actorName: user.name, action: "BRIEF_SUBMITTED", entity: "Brief", entityId: id, detail: brief.code });
    return NextResponse.json({ ok: true, brief: mapBrief({ ...updated, createdByName: user.name }, [], {}) });
  }

  if (action === "reject-estimate") {
    if (user.role !== "OWNER" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "Hanya owner/manajer yang bisa mengembalikan brief" }, { status: 403 });
    }
    if (!["SUBMITTED", "ESTIMATED"].includes(brief.status)) {
      return NextResponse.json({ error: "Status brief tidak bisa dikembalikan" }, { status: 400 });
    }
    const note = body?.notes ? String(body.notes) : "";
    if (!note) return NextResponse.json({ error: "Catatan wajib diisi saat mengembalikan brief" }, { status: 400 });
    const updated = await db.brief.update({
      where: { id },
      data: { status: "DRAFT", notes: note },
    });
    await db.notification.create({
      data: {
        role: "PRODUCTION",
        title: `Brief ${brief.code} dikembalikan`,
        body: `${brief.title} — ${note}`,
        type: "SYSTEM",
      },
    });
    await logAudit({ actorName: user.name, action: "BRIEF_RETURNED", entity: "Brief", entityId: id, detail: `${brief.code} — ${note}` });
    return NextResponse.json({ ok: true, brief: mapBrief({ ...updated, createdByName: user.name }, [], {}) });
  }

  return NextResponse.json({ error: "Aksi tidak valid" }, { status: 400 });
}
