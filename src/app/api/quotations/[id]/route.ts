import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { defaultMilestones, mapQuotation, nextDocNumber } from "@/lib/ops";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/quotations/[id]
 * action: "send" | "approve" | "reject"
 * approve → lead WON + auto buat Project produksi (dengan milestone default) + Invoice DP 50%.
 */
export async function PATCH(req: Request, ctx: Ctx) {
  const user = await requireAuth(["OWNER", "MANAGER", "FINANCE"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const action = body?.action as string | undefined;
  if (!["send", "approve", "reject"].includes(action ?? "")) {
    return NextResponse.json({ error: "Aksi tidak valid" }, { status: 400 });
  }

  const quotation = await db.quotation.findUnique({ where: { id }, include: { lead: true } });
  if (!quotation) return NextResponse.json({ error: "Penawaran tidak ditemukan" }, { status: 404 });

  const lead = quotation.lead;

  if (action === "send") {
    if (quotation.status !== "DRAFT") {
      return NextResponse.json({ error: "Hanya draf yang bisa dikirim" }, { status: 400 });
    }
    await db.quotation.update({
      where: { id },
      data: { status: "SENT", sentAt: new Date() },
    });
    await db.leadMessage.create({
      data: { leadId: lead.id, direction: "NOTE", channel: "internal", body: `Penawaran ${quotation.number} dikirim ke klien (total ${quotation.grandTotal.toLocaleString("id-ID")}).`, senderName: user.name },
    });
    await logAudit({ actorName: user.name, action: "QUOTATION_SENT", entity: "Quotation", entityId: id, detail: quotation.number });
    return NextResponse.json({ ok: true });
  }

  if (action === "reject") {
    if (quotation.status === "APPROVED") {
      return NextResponse.json({ error: "Penawaran sudah disetujui" }, { status: 400 });
    }
    await db.quotation.update({
      where: { id },
      data: { status: "REJECTED", decidedAt: new Date(), decidedNote: body?.decidedNote ? String(body.decidedNote) : null },
    });
    await logAudit({ actorName: user.name, action: "QUOTATION_REJECTED", entity: "Quotation", entityId: id, detail: `${quotation.number} — ${body?.decidedNote ?? "-"}` });
    return NextResponse.json({ ok: true });
  }

  // action === "approve" — alur gabungan keuangan → produksi
  if (quotation.status === "APPROVED") {
    return NextResponse.json({ error: "Penawaran sudah disetujui sebelumnya" }, { status: 400 });
  }

  // 1) Penawaran disetujui + lead menang
  await db.quotation.update({ where: { id }, data: { status: "APPROVED", decidedAt: new Date(), decidedNote: body?.decidedNote ? String(body.decidedNote) : null } });
  await db.lead.update({ where: { id: lead.id }, data: { stage: "WON", status: "WON", score: Math.max(lead.score, 100), estValue: quotation.grandTotal } });

  // 2) Proyek produksi otomatis
  const projectCode = await nextDocNumber("PRJ");
  const now = new Date();
  const project = await db.project.create({
    data: {
      code: projectCode,
      name: quotation.title,
      brand: quotation.brand,
      companyId: lead.companyId,
      leadId: lead.id,
      quotationId: quotation.id,
      status: "PLANNED",
      budget: quotation.grandTotal,
      managerName: user.name,
      startDate: now,
      dueDate: new Date(now.getTime() + 30 * 86400000),
    },
  });
  await db.milestone.createMany({
    data: defaultMilestones().map((m) => ({
      projectId: project.id,
      title: m.title,
      orderIdx: m.orderIdx,
      weight: m.weight,
      status: "PENDING",
      dueDate: new Date(now.getTime() + m.offsetDays * 86400000),
    })),
  });

  // 3) Invoice DP 50% otomatis
  const dpp = Math.round(quotation.grandTotal / 1.11 / 2);
  const invoice = await db.invoice.create({
    data: {
      number: await nextDocNumber("INV"),
      projectId: project.id,
      quotationId: quotation.id,
      leadId: lead.id,
      brand: quotation.brand,
      title: `DP 50% — ${quotation.title}`,
      amount: dpp,
      ppnPct: 11,
      grandTotal: Math.round(dpp * 1.11),
      dueDate: new Date(now.getTime() + 14 * 86400000),
      status: "UNPAID",
      issuedAt: now,
    },
  });

  await db.leadMessage.create({
    data: { leadId: lead.id, direction: "NOTE", channel: "internal", body: `Penawaran ${quotation.number} disetujui. Proyek ${projectCode} dibuat + invoice DP ${invoice.number}.`, senderName: user.name },
  });
  await db.notification.create({
    data: { role: "MANAGER", title: `Proyek baru ${project.code}`, body: `${project.name} — dari penawaran ${quotation.number} (budget ${project.budget.toLocaleString("id-ID")})`, type: "SYSTEM" },
  });
  await db.notification.create({
    data: { role: "FINANCE", title: `Invoice DP ${invoice.number} terbit`, body: `${invoice.title} — ${invoice.grandTotal.toLocaleString("id-ID")}, jatuh tempo 14 hari`, type: "SYSTEM" },
  });
  await logAudit({ actorName: user.name, action: "QUOTATION_APPROVED", entity: "Quotation", entityId: id, detail: `${quotation.number} → ${projectCode} + ${invoice.number}` });

  return NextResponse.json({ ok: true, projectCode, invoiceNumber: invoice.number });
}

/** GET detail satu penawaran. */
export async function GET(_req: Request, ctx: Ctx) {
  const user = await requireAuth(["OWNER", "MANAGER", "MARKETER", "FINANCE"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });
  const { id } = await ctx.params;
  const quotation = await db.quotation.findUnique({
    where: { id },
    include: { lead: { include: { contact: true, company: true } }, projects: { select: { code: true }, take: 1 } },
  });
  if (!quotation) return NextResponse.json({ error: "Penawaran tidak ditemukan" }, { status: 404 });
  return NextResponse.json({
    quotation: mapQuotation(quotation, {
      lead: { code: quotation.lead.code, subject: quotation.lead.subject, contactName: quotation.lead.contact.name, companyName: quotation.lead.company?.name ?? null },
      projectCode: quotation.projects[0]?.code ?? null,
    }),
  });
}
