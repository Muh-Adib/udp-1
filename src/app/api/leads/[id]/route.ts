import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import type { LeadMessageDTO } from "@/lib/crm-types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await requireAuth(["OWNER", "MANAGER", "MARKETER", "FINANCE"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const { id } = await ctx.params;
  const lead = await db.lead.findUnique({
    where: { id },
    include: {
      contact: true,
      assignee: { select: { id: true, name: true } },
      company: { select: { name: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!lead) return NextResponse.json({ error: "Lead tidak ditemukan" }, { status: 404 });

  const messages: LeadMessageDTO[] = lead.messages.map((m) => ({
    id: m.id,
    direction: m.direction as LeadMessageDTO["direction"],
    channel: m.channel,
    body: m.body,
    senderName: m.senderName,
    createdAt: m.createdAt.toISOString(),
  }));

  return NextResponse.json({
    lead: {
      id: lead.id,
      code: lead.code,
      subject: lead.subject,
      brand: lead.brand,
      channel: lead.channel,
      status: lead.status,
      score: lead.score,
      sourceRef: lead.sourceRef,
      lostReason: lead.lostReason,
      createdAt: lead.createdAt.toISOString(),
      updatedAt: lead.updatedAt.toISOString(),
      contact: {
        id: lead.contact.id,
        name: lead.contact.name,
        email: lead.contact.email,
        phone: lead.contact.phone,
        igUsername: lead.contact.igUsername,
        company: lead.company?.name ?? null,
      },
      assignee: lead.assignee ? { id: lead.assignee.id, name: lead.assignee.name } : null,
    },
    messages,
  });
}

const VALID_STATUSES = ["NEW", "FOLLOW_UP", "QUOTED", "WON", "LOST"];
const LOST_REASONS = ["Harga", "Kompetitor", "Budget tidak ada", "Timing", "Tidak ada balasan", "Lainnya"];

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await requireAuth(["OWNER", "MANAGER", "MARKETER"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const lead = await db.lead.findUnique({ where: { id } });
  if (!lead) return NextResponse.json({ error: "Lead tidak ditemukan" }, { status: 404 });

  const data: Record<string, unknown> = {};

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Status tidak valid" }, { status: 400 });
    }
    data.status = body.status;
    if (body.status === "LOST") {
      if (!body.lostReason || !LOST_REASONS.includes(body.lostReason)) {
        return NextResponse.json({ error: "Alasan kalah wajib dipilih" }, { status: 400 });
      }
      data.lostReason = body.lostReason;
    }
    if (body.status === "WON") {
      data.score = Math.max(lead.score, 100);
    }
  }
  if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId || null;
  if (body.brand !== undefined) data.brand = body.brand;

  const updated = await db.lead.update({ where: { id }, data });
  await logAudit({
    actorName: user.name,
    action: "LEAD_UPDATED",
    entity: "Lead",
    entityId: id,
    detail: `status=${updated.status} assignee=${updated.assigneeId ?? "-"} brand=${updated.brand}`,
  });

  return NextResponse.json({ ok: true, status: updated.status, lostReason: updated.lostReason, score: updated.score });
}
