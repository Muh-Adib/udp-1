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
        position: lead.contact.position,
        companyName: lead.contact.companyName,
        country: lead.contact.country,
        email: lead.contact.email,
        phone: lead.contact.phone,
        igUsername: lead.contact.igUsername,
        company: lead.contact.companyName ?? lead.company?.name ?? null,
        notes: lead.contact.notes,
      },
      assignee: lead.assignee ? { id: lead.assignee.id, name: lead.assignee.name } : null,
    },
    messages,
  });
}

const VALID_STATUSES = ["NEW", "FOLLOW_UP", "QUOTED", "WON", "LOST"];
const VALID_STAGES = ["NEW", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"];
const LOST_REASONS = ["Harga", "Kompetitor", "Budget tidak ada", "Timing", "Tidak ada balasan", "Lainnya"];
const STAGE_TO_STATUS: Record<string, string> = {
  NEW: "NEW",
  QUALIFIED: "FOLLOW_UP",
  PROPOSAL: "QUOTED",
  NEGOTIATION: "QUOTED",
  WON: "WON",
  LOST: "LOST",
};
const STATUS_TO_STAGE: Record<string, string> = {
  NEW: "NEW",
  FOLLOW_UP: "QUALIFIED",
  QUOTED: "PROPOSAL",
  WON: "WON",
  LOST: "LOST",
};

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await requireAuth(["OWNER", "MANAGER", "MARKETER"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const lead = await db.lead.findUnique({ where: { id } });
  if (!lead) return NextResponse.json({ error: "Lead tidak ditemukan" }, { status: 404 });

  const data: Record<string, unknown> = {};

  if (body.stage !== undefined) {
    if (!VALID_STAGES.includes(body.stage)) {
      return NextResponse.json({ error: "Tahap funnel tidak valid" }, { status: 400 });
    }
    data.stage = body.stage;
    data.status = STAGE_TO_STATUS[body.stage];
    if (body.stage === "LOST") {
      if (!body.lostReason || !LOST_REASONS.includes(body.lostReason)) {
        return NextResponse.json({ error: "Alasan kalah wajib dipilih" }, { status: 400 });
      }
      data.lostReason = body.lostReason;
    }
    if (body.stage === "WON") {
      data.score = Math.max(lead.score, 100);
    }
  } else if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Status tidak valid" }, { status: 400 });
    }
    data.status = body.status;
    data.stage = STATUS_TO_STAGE[body.status];
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
  if (body.estValue !== undefined) {
    data.estValue = Math.max(0, Math.round(Number(body.estValue) || 0));
  }
  if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId || null;
  if (body.brand !== undefined) data.brand = body.brand;

  const updated = await db.lead.update({ where: { id }, data });
  await logAudit({
    actorName: user.name,
    action: "LEAD_UPDATED",
    entity: "Lead",
    entityId: id,
    detail: `stage=${updated.stage} status=${updated.status} estValue=${updated.estValue} assignee=${updated.assigneeId ?? "-"} brand=${updated.brand}`,
  });

  return NextResponse.json({ ok: true, stage: updated.stage, status: updated.status, lostReason: updated.lostReason, score: updated.score });
}
