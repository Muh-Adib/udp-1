import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/** Balas pesan keluar (OUT) atau catatan internal (NOTE). */
export async function POST(req: Request, ctx: Ctx) {
  const user = await requireAuth(["OWNER", "MANAGER", "MARKETER"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body?.body?.trim() || !body?.direction) {
    return NextResponse.json({ error: "Isi pesan wajib diisi" }, { status: 400 });
  }
  if (!["OUT", "NOTE"].includes(body.direction)) {
    return NextResponse.json({ error: "Arah pesan tidak valid" }, { status: 400 });
  }

  const lead = await db.lead.findUnique({ where: { id } });
  if (!lead) return NextResponse.json({ error: "Lead tidak ditemukan" }, { status: 404 });

  const now = new Date();
  const msg = await db.leadMessage.create({
    data: {
      leadId: id,
      direction: body.direction,
      channel: body.direction === "OUT" ? lead.channel : "internal",
      body: body.body.trim(),
      senderId: user.id,
      senderName: user.name,
    },
  });

  if (body.direction === "OUT") {
    await db.lead.update({
      where: { id },
      data: {
        firstOutAt: lead.firstOutAt ?? now,
        status: lead.status === "NEW" ? "FOLLOW_UP" : lead.status,
        score: Math.min(100, lead.score + 5),
        updatedAt: now,
      },
    });
  } else {
    await db.lead.update({ where: { id }, data: { updatedAt: now } });
  }

  await logAudit({
    actorName: user.name,
    action: body.direction === "OUT" ? "MESSAGE_SENT" : "NOTE_ADDED",
    entity: "Lead",
    entityId: id,
    detail: body.body.slice(0, 80),
  });

  return NextResponse.json({
    message: {
      id: msg.id,
      direction: msg.direction,
      channel: msg.channel,
      body: msg.body,
      senderName: msg.senderName,
      createdAt: msg.createdAt.toISOString(),
    },
  }, { status: 201 });
}
