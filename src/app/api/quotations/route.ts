import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { mapQuotation, nextDocNumber } from "@/lib/ops";
import type { QuotationItemDTO } from "@/lib/crm-types";

/** GET /api/quotations — daftar penawaran. */
export async function GET() {
  const user = await requireAuth(["OWNER", "MANAGER", "MARKETER", "FINANCE"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const quotations = await db.quotation.findMany({
    include: {
      lead: { include: { contact: true, company: true } },
      projects: { select: { code: true }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const dtos = quotations.map((q) =>
    mapQuotation(q, {
      lead: {
        code: q.lead.code,
        subject: q.lead.subject,
        contactName: q.lead.contact.name,
        companyName: q.lead.company?.name ?? null,
      },
      projectCode: q.projects[0]?.code ?? null,
    })
  );

  return NextResponse.json({ quotations: dtos });
}

/** POST /api/quotations — buat penawaran dari lead (estimasi → QT). */
export async function POST(req: Request) {
  const user = await requireAuth(["OWNER", "MANAGER", "MARKETER"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.leadId || !body?.title || !Array.isArray(body?.items) || body.items.length === 0) {
    return NextResponse.json({ error: "Lead, judul, dan minimal 1 item wajib diisi" }, { status: 400 });
  }

  const lead = await db.lead.findUnique({ where: { id: body.leadId } });
  if (!lead) return NextResponse.json({ error: "Lead tidak ditemukan" }, { status: 404 });

  const items: QuotationItemDTO[] = body.items
    .filter((it: { desc?: string }) => it?.desc)
    .map((it: { desc: string; qty?: number; price?: number }) => ({
      desc: String(it.desc),
      qty: Math.max(1, Number(it.qty) || 1),
      price: Math.max(0, Math.round(Number(it.price) || 0)),
    }));
  if (items.length === 0) return NextResponse.json({ error: "Item penawaran tidak valid" }, { status: 400 });

  const subtotal = items.reduce((s, it) => s + it.qty * it.price, 0);
  const discountPct = Math.min(100, Math.max(0, Number(body.discountPct) || 0));
  const ppnPct = body.ppnPct === 0 ? 0 : Math.min(50, Math.max(0, Number(body.ppnPct ?? 11)));
  const afterDiscount = Math.round(subtotal * (1 - discountPct / 100));
  const grandTotal = Math.round(afterDiscount * (1 + ppnPct / 100));

  const quotation = await db.quotation.create({
    data: {
      number: await nextDocNumber("QT"),
      leadId: lead.id,
      brand: lead.brand,
      title: String(body.title),
      itemsJson: JSON.stringify(items),
      subtotal,
      discountPct,
      ppnPct,
      grandTotal,
      status: "DRAFT",
      notes: body.notes ? String(body.notes) : null,
    },
  });

  // Sinkronkan funnel: penawaran dibuat → stage PROPOSAL
  await db.lead.update({
    where: { id: lead.id },
    data: { stage: lead.stage === "NEW" || lead.stage === "QUALIFIED" ? "PROPOSAL" : lead.stage, status: "QUOTED", estValue: lead.estValue > 0 ? lead.estValue : grandTotal },
  });

  await db.notification.create({
    data: { role: "FINANCE", title: `Penawaran baru ${quotation.number}`, body: `${quotation.title} — ${grandTotal.toLocaleString("id-ID")} (menunggu review keuangan)`, type: "SYSTEM" },
  });
  await logAudit({ actorName: user.name, action: "QUOTATION_CREATED", entity: "Quotation", entityId: quotation.id, detail: `${quotation.number} — ${quotation.title}` });

  return NextResponse.json({ quotation: mapQuotation(quotation) }, { status: 201 });
}
