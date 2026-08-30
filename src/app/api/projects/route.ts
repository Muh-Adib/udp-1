import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { defaultMilestones, mapProject, nextDocNumber } from "@/lib/ops";

/** GET /api/projects — daftar proyek produksi + milestone. */
export async function GET() {
  const user = await requireAuth(["OWNER", "MANAGER", "MARKETER", "FINANCE"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const projects = await db.project.findMany({
    include: {
      company: { select: { name: true } },
      lead: { select: { code: true } },
      quotation: { select: { number: true } },
      milestones: true,
      invoices: { select: { grandTotal: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const dtos = projects.map((p) =>
    mapProject(p, p.milestones, {
      companyName: p.company?.name ?? null,
      leadCode: p.lead?.code ?? null,
      quotationNumber: p.quotation?.number ?? null,
      billedAmount: p.invoices.reduce((s, i) => s + i.grandTotal, 0),
    })
  );

  return NextResponse.json({ projects: dtos });
}

/** POST /api/projects — buat proyek manual (tanpa penawaran). */
export async function POST(req: Request) {
  const user = await requireAuth(["OWNER", "MANAGER"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.name) return NextResponse.json({ error: "Nama proyek wajib diisi" }, { status: 400 });

  const now = new Date();
  const project = await db.project.create({
    data: {
      code: await nextDocNumber("PRJ"),
      name: String(body.name),
      brand: body.brand ?? "unimasi",
      companyId: body.companyId ?? null,
      status: "PLANNED",
      budget: Math.max(0, Math.round(Number(body.budget) || 0)),
      managerName: body.managerName ? String(body.managerName) : user.name,
      startDate: body.startDate ? new Date(body.startDate) : now,
      dueDate: body.dueDate ? new Date(body.dueDate) : new Date(now.getTime() + 30 * 86400000),
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

  await logAudit({ actorName: user.name, action: "PROJECT_CREATED", entity: "Project", entityId: project.id, detail: `${project.code} — ${project.name}` });
  return NextResponse.json({ project: mapProject(project, []) }, { status: 201 });
}
