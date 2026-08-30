import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { ingestChannelMessage } from "@/lib/lead-ingest";
import { logAudit } from "@/lib/audit";
import type { LeadDTO, LeadStage, LeadStatus } from "@/lib/crm-types";

const OPEN_STATUSES = ["NEW", "FOLLOW_UP", "QUOTED"];

function slaOverdue(lead: { firstInAt: Date | null; firstOutAt: Date | null; createdAt: Date }, slaHours: number): boolean {
  const start = lead.firstInAt ?? lead.createdAt;
  if (lead.firstOutAt) return false;
  return Date.now() - start.getTime() > slaHours * 3600 * 1000;
}

export async function GET(req: Request) {
  const user = await requireAuth(["OWNER", "MANAGER", "MARKETER", "FINANCE", "CLIENT"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const channel = url.searchParams.get("channel");
  const q = url.searchParams.get("q")?.trim().toLowerCase() ?? "";
  const isClient = user.role === "CLIENT";

  const slaRow = await db.appSetting.findUnique({ where: { key: "firstResponseSlaHours" } });
  const slaHours = slaRow ? Number(slaRow.value) : 2;

  const leads = await db.lead.findMany({
    where: {
      // Klien hanya melihat lead milik perusahaannya
      ...(isClient ? { companyId: user.companyId ?? "__none__" } : {}),
      ...(status && status !== "ALL" ? { status: status === "OPEN" ? { in: OPEN_STATUSES } : status } : {}),
      ...(channel && channel !== "ALL" ? { channel } : {}),
    },
    include: {
      contact: true,
      assignee: { select: { id: true, name: true } },
      company: { select: { name: true } },
      messages: isClient
        ? { where: { direction: { not: "NOTE" } }, orderBy: { createdAt: "desc" }, take: 1 }
        : { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  const dtos: LeadDTO[] = leads
    .filter((l) => {
      if (!q) return true;
      const hay = `${l.code} ${l.subject} ${l.contact.name} ${l.contact.position ?? ""} ${l.contact.companyName ?? ""} ${l.company?.name ?? ""} ${l.contact.country} ${l.contact.email ?? ""} ${l.contact.phone ?? ""} ${l.contact.igUsername ?? ""}`.toLowerCase();
      return hay.includes(q);
    })
    .map((l) => ({
      id: l.id,
      code: l.code,
      subject: l.subject,
      brand: l.brand,
      channel: l.channel as LeadDTO["channel"],
      status: l.status as LeadStatus,
      stage: l.stage as LeadStage,
      estValue: l.estValue ?? 0,
      score: l.score,
      sourceRef: l.sourceRef,
      lostReason: l.lostReason,
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
      slaOverdue: slaOverdue(l, slaHours),
      contact: {
        id: l.contact.id,
        name: l.contact.name,
        position: l.contact.position,
        companyName: l.contact.companyName,
        country: l.contact.country,
        email: l.contact.email,
        phone: l.contact.phone,
        igUsername: l.contact.igUsername,
        company: l.contact.companyName ?? l.company?.name ?? null,
        notes: l.contact.notes,
      },
      assignee: l.assignee ? { id: l.assignee.id, name: l.assignee.name } : null,
      lastMessage: l.messages[0]
        ? { body: l.messages[0].body, direction: l.messages[0].direction, createdAt: l.messages[0].createdAt.toISOString(), channel: l.messages[0].channel }
        : null,
      messageCount: undefined,
    }));

  return NextResponse.json({ leads: dtos, slaHours });
}

export async function POST(req: Request) {
  const user = await requireAuth(["OWNER", "MANAGER", "MARKETER"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.contactName || !body?.subject) {
    return NextResponse.json({ error: "Nama kontak dan subjek wajib diisi" }, { status: 400 });
  }

  // Masuk lewat pipeline ingest yang sama dengan kanal nyata → dedupe kontak + lead konsisten
  const result = await ingestChannelMessage({
    channel: "manual",
    name: body.contactName,
    phone: body.phone ?? null,
    email: body.email ?? null,
    igUsername: body.igUsername ?? null,
    company: body.company ?? null,
    position: body.position ?? null,
    country: body.country ?? null,
    body: body.subject,
    subject: body.subject,
    brand: body.brand ?? null,
  });
  await logAudit({ actorName: user.name, action: "LEAD_CREATED", entity: "Lead", entityId: result.leadId, detail: "Input manual" });

  return NextResponse.json({ lead: { id: result.leadId, code: result.leadCode } }, { status: 201 });
}
