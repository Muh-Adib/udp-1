import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { mapInvoice, mapProject, mapQuotation } from "@/lib/ops";

/** GET /api/portal — ringkasan produksi & keuangan milik perusahaan klien. */
export async function GET() {
  const user = await requireAuth(["CLIENT"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });
  if (!user.companyId) return NextResponse.json({ error: "Akun klien tidak terhubung ke perusahaan" }, { status: 403 });

  const companyId = user.companyId;

  const [company, projects, leads] = await Promise.all([
    db.company.findUnique({ where: { id: companyId }, select: { name: true } }),
    db.project.findMany({
      where: { companyId },
      include: {
        company: { select: { name: true } },
        lead: { select: { code: true } },
        quotation: { select: { number: true } },
        milestones: true,
        invoices: { select: { grandTotal: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.lead.findMany({ where: { companyId }, select: { id: true } }),
  ]);

  const leadIds = leads.map((l) => l.id);
  const projectIds = projects.map((p) => p.id);

  const [quotations, invoices] = await Promise.all([
    db.quotation.findMany({
      where: { leadId: { in: leadIds } },
      include: { lead: { include: { contact: true, company: true } }, projects: { select: { code: true }, take: 1 } },
      orderBy: { createdAt: "desc" },
    }),
    db.invoice.findMany({
      where: { OR: [{ projectId: { in: projectIds } }, { leadId: { in: leadIds } }] },
      include: { payments: { orderBy: { paidAt: "asc" } }, project: { select: { code: true } }, quotation: { select: { number: true } } },
      orderBy: { issuedAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    company: company ? { name: company.name } : null,
    projects: projects.map((p) =>
      mapProject(p, p.milestones, {
        companyName: p.company?.name ?? null,
        leadCode: p.lead?.code ?? null,
        quotationNumber: p.quotation?.number ?? null,
        billedAmount: p.invoices.reduce((s, i) => s + i.grandTotal, 0),
      })
    ),
    invoices: invoices.map((inv) =>
      mapInvoice(inv, inv.payments, {
        projectCode: inv.project?.code ?? null,
        quotationNumber: inv.quotation?.number ?? null,
      })
    ),
    quotations: quotations.map((q) =>
      mapQuotation(q, {
        lead: { code: q.lead.code, subject: q.lead.subject, contactName: q.lead.contact.name, companyName: q.lead.company?.name ?? null },
        projectCode: q.projects[0]?.code ?? null,
      })
    ),
  });
}
