import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { mapInvoice, nextDocNumber } from "@/lib/ops";

/** GET /api/invoices — daftar invoice + status pembayaran. */
export async function GET() {
  const user = await requireAuth(["OWNER", "MANAGER", "FINANCE"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const invoices = await db.invoice.findMany({
    include: {
      payments: { orderBy: { paidAt: "asc" } },
      project: { select: { code: true, company: { select: { name: true } } } },
      quotation: { select: { number: true } },
    },
    orderBy: { issuedAt: "desc" },
    take: 200,
  });

  const dtos = invoices.map((inv) =>
    mapInvoice(inv, inv.payments, {
      projectCode: inv.project?.code ?? null,
      quotationNumber: inv.quotation?.number ?? null,
      companyName: inv.project?.company?.name ?? null,
    })
  );

  return NextResponse.json({ invoices: dtos });
}

/** POST /api/invoices — terbitkan invoice manual (mis. pelunasan / termin). */
export async function POST(req: Request) {
  const user = await requireAuth(["OWNER", "FINANCE"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.title || !body?.amount || Number(body.amount) <= 0) {
    return NextResponse.json({ error: "Judul dan nominal invoice wajib diisi" }, { status: 400 });
  }

  let brand = "unimasi";
  let companyName: string | null = null;
  if (body.projectId) {
    const project = await db.project.findUnique({ where: { id: body.projectId }, include: { company: true } });
    if (!project) return NextResponse.json({ error: "Proyek tidak ditemukan" }, { status: 404 });
    brand = project.brand;
    companyName = project.company?.name ?? null;
  }

  const amount = Math.round(Number(body.amount));
  const ppnPct = body.ppnPct === 0 ? 0 : 11;
  const invoice = await db.invoice.create({
    data: {
      number: await nextDocNumber("INV"),
      projectId: body.projectId ?? null,
      leadId: body.leadId ?? null,
      brand,
      title: String(body.title),
      amount,
      ppnPct,
      grandTotal: Math.round(amount * (1 + ppnPct / 100)),
      dueDate: body.dueDate ? new Date(body.dueDate) : new Date(Date.now() + 14 * 86400000),
      status: "UNPAID",
      issuedAt: new Date(),
    },
  });

  await db.notification.create({
    data: { role: "FINANCE", title: `Invoice ${invoice.number} terbit`, body: `${invoice.title} — ${invoice.grandTotal.toLocaleString("id-ID")}`, type: "SYSTEM" },
  });
  await logAudit({ actorName: user.name, action: "INVOICE_CREATED", entity: "Invoice", entityId: invoice.id, detail: `${invoice.number} — ${invoice.title}` });

  return NextResponse.json({ invoice: mapInvoice(invoice, [], { companyName }) }, { status: 201 });
}
