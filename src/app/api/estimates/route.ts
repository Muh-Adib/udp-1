import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { mapEstimate } from "@/lib/ops";
import type { EstimateItemDTO } from "@/lib/crm-types";

/** GET /api/estimates?briefId=… — daftar estimasi pengerjaan. */
export async function GET(req: Request) {
  const user = await requireAuth(["OWNER", "MANAGER", "MARKETER", "PRODUCTION", "FINANCE"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const briefId = searchParams.get("briefId");
  const estimates = await db.workEstimate.findMany({
    where: briefId ? { briefId } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ estimates: estimates.map(mapEstimate) });
}

/**
 * POST /api/estimates — buat estimasi pengerjaan untuk sebuah brief (role Produksi / Owner / Manajer).
 * Body: { briefId, items: [{task, qty, unit, hours, cost}], notes? }
 * Setelah dibuat: status brief → ESTIMATED + notifikasi ke manajer/finance/marketing.
 */
export async function POST(req: Request) {
  const user = await requireAuth(["PRODUCTION", "OWNER", "MANAGER"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const briefId = body?.briefId ? String(body.briefId) : "";
  if (!briefId) return NextResponse.json({ error: "Brief wajib dipilih" }, { status: 400 });

  const brief = await db.brief.findUnique({ where: { id: briefId }, include: { lead: { include: { contact: true } } } });
  if (!brief) return NextResponse.json({ error: "Brief tidak ditemukan" }, { status: 404 });
  if (brief.status === "QUOTED") {
    return NextResponse.json({ error: "Brief sudah ditawarkan — estimasi tidak bisa ditambahkan" }, { status: 400 });
  }

  const rawItems = Array.isArray(body?.items) ? body.items : [];
  const items: EstimateItemDTO[] = [];
  for (const it of rawItems) {
    const task = it?.task ? String(it.task).trim() : "";
    const qty = Math.max(0, Math.round(Number(it?.qty) || 0));
    const unit = it?.unit ? String(it.unit).trim() : "unit";
    const hours = Math.max(0, Math.round(Number(it?.hours) || 0));
    const cost = Math.max(0, Math.round(Number(it?.cost) || 0));
    if (!task || qty <= 0) continue;
    items.push({ task, qty, unit, hours, cost });
  }
  if (items.length === 0) {
    return NextResponse.json({ error: "Minimal satu baris pekerjaan valid (nama + qty > 0)" }, { status: 400 });
  }

  const totalHours = items.reduce((s, i) => s + i.hours, 0);
  const totalCost = items.reduce((s, i) => s + i.qty * i.cost, 0);

  const estimate = await db.workEstimate.create({
    data: {
      briefId: brief.id,
      itemsJson: JSON.stringify(items),
      totalHours,
      totalCost,
      notes: body?.notes ? String(body.notes) : null,
      status: "SUBMITTED",
      createdById: user.id,
      createdByName: user.name,
    },
  });
  await db.brief.update({ where: { id: brief.id }, data: { status: "ESTIMATED" } });

  await db.leadMessage.create({
    data: {
      leadId: brief.leadId,
      direction: "NOTE",
      channel: "internal",
      body: `Estimasi produksi ${brief.code}: ${totalHours} jam · biaya Rp ${totalCost.toLocaleString("id-ID")} (oleh ${user.name}). Siap dibuatkan penawaran.`,
      senderName: user.name,
    },
  });
  for (const role of ["MANAGER", "FINANCE", "MARKETER"] as const) {
    await db.notification.create({
      data: {
        role,
        title: `Estimasi ${brief.code} tersedia`,
        body: `${brief.title} — ${totalHours} jam, biaya produksi Rp ${totalCost.toLocaleString("id-ID")}. Penawaran bisa disusun di menu Keuangan.`,
        type: "SYSTEM",
      },
    });
  }
  await logAudit({ actorName: user.name, action: "ESTIMATE_CREATED", entity: "WorkEstimate", entityId: estimate.id, detail: `${brief.code} — ${totalHours} jam, Rp ${totalCost}` });

  return NextResponse.json({ estimate: mapEstimate(estimate), briefCode: brief.code }, { status: 201 });
}
