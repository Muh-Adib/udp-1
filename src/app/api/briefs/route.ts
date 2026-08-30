import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { mapBrief, nextDocNumber } from "@/lib/ops";
import type { LeadStage } from "@/lib/crm-types";

/**
 * GET /api/briefs — daftar brief (alur: Lead → Brief → Estimasi → Penawaran).
 * Termasuk estimasi produksi & info lead.
 */
export async function GET() {
  const user = await requireAuth(["OWNER", "MANAGER", "MARKETER", "PRODUCTION", "FINANCE"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const briefs = await db.brief.findMany({
    include: {
      lead: { include: { contact: true, company: true } },
      estimates: { orderBy: { createdAt: "desc" } },
      project: { select: { code: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({
    briefs: briefs.map((b) =>
      mapBrief(
        {
          id: b.id,
          code: b.code,
          leadId: b.leadId,
          brand: b.brand,
          title: b.title,
          objective: b.objective,
          audience: b.audience,
          deliverables: b.deliverables,
          references: b.references,
          deadline: b.deadline,
          notes: b.notes,
          status: b.status,
          createdByName: b.createdBy?.name ?? null,
          createdAt: b.createdAt,
        },
        b.estimates,
        {
          lead: {
            code: b.lead.code,
            subject: b.lead.subject,
            stage: b.lead.stage as LeadStage,
            contactName: b.lead.contact.name,
            companyName: b.lead.company?.name ?? null,
            estValue: b.lead.estValue,
          },
          projectCode: b.project?.code ?? null,
        }
      )
    ),
  });
}

/**
 * POST /api/briefs — buat brief dari lead (marketing/manajer/owner).
 * Body: { leadId, title, objective, audience?, deliverables?, references?, deadline?, notes? }
 */
export async function POST(req: Request) {
  const user = await requireAuth(["OWNER", "MANAGER", "MARKETER"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const leadId = body?.leadId ? String(body.leadId) : "";
  const title = body?.title ? String(body.title).trim() : "";
  const objective = body?.objective ? String(body.objective).trim() : "";

  if (!leadId || !title || !objective) {
    return NextResponse.json({ error: "Lead, judul, dan tujuan brief wajib diisi" }, { status: 400 });
  }

  const lead = await db.lead.findUnique({ where: { id: leadId }, include: { contact: true } });
  if (!lead) return NextResponse.json({ error: "Lead tidak ditemukan" }, { status: 404 });
  if (lead.stage === "LOST") {
    return NextResponse.json({ error: "Lead sudah hilang — tidak bisa dibuatkan brief" }, { status: 400 });
  }
  if (lead.stage === "WON") {
    return NextResponse.json({ error: "Lead sudah menang — produksi berjalan lewat proyek" }, { status: 400 });
  }

  let deadline: Date | null = null;
  if (body?.deadline) {
    const d = new Date(String(body.deadline));
    if (!Number.isNaN(d.getTime())) deadline = d;
  }

  const brief = await db.brief.create({
    data: {
      code: await nextDocNumber("BRF"),
      leadId: lead.id,
      brand: lead.brand,
      title,
      objective,
      audience: body?.audience ? String(body.audience) : null,
      deliverables: body?.deliverables ? String(body.deliverables) : "",
      references: body?.references ? String(body.references) : null,
      deadline,
      notes: body?.notes ? String(body.notes) : null,
      status: "DRAFT",
      createdById: user.id,
    },
  });

  await db.leadMessage.create({
    data: {
      leadId: lead.id,
      direction: "NOTE",
      channel: "internal",
      body: `Brief ${brief.code} dibuat: ${title}. Menunggu dikirim untuk estimasi produksi.`,
      senderName: user.name,
    },
  });
  await db.notification.create({
    data: {
      role: "PRODUCTION",
      title: `Brief baru ${brief.code}`,
      body: `${title} — dari lead ${lead.code} (${lead.contact.name}). Menunggu dikirim untuk estimasi.`,
      type: "SYSTEM",
    },
  });
  await logAudit({ actorName: user.name, action: "BRIEF_CREATED", entity: "Brief", entityId: brief.id, detail: `${brief.code} dari ${lead.code}` });

  return NextResponse.json({ brief: mapBrief({ ...brief, createdByName: user.name }, [], {}) }, { status: 201 });
}
