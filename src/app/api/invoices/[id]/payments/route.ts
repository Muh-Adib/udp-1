import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { mapInvoice } from "@/lib/ops";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/invoices/[id]/payments — catat pembayaran invoice. */
export async function POST(req: Request, ctx: Ctx) {
  const user = await requireAuth(["OWNER", "FINANCE"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const amount = Math.round(Number(body?.amount));
  if (!amount || amount <= 0) return NextResponse.json({ error: "Nominal pembayaran tidak valid" }, { status: 400 });

  const invoice = await db.invoice.findUnique({ where: { id }, include: { payments: true } });
  if (!invoice) return NextResponse.json({ error: "Invoice tidak ditemukan" }, { status: 404 });

  const paidSoFar = invoice.payments.reduce((s, p) => s + p.amount, 0);
  if (paidSoFar >= invoice.grandTotal) {
    return NextResponse.json({ error: "Invoice sudah lunas" }, { status: 400 });
  }

  await db.payment.create({
    data: {
      invoiceId: invoice.id,
      amount: Math.min(amount, invoice.grandTotal - paidSoFar),
      method: ["TRANSFER", "CASH", "QRIS", "OTHER"].includes(body?.method) ? body.method : "TRANSFER",
      note: body?.note ? String(body.note) : null,
      paidAt: new Date(),
    },
  });

  // Status DB di-update agar ringkasan cepat; status efektif tetap dihitung saat baca.
  const newPaid = Math.min(invoice.grandTotal, paidSoFar + amount);
  const status = newPaid >= invoice.grandTotal ? "PAID" : "PARTIAL";
  await db.invoice.update({ where: { id }, data: { status } });

  // Invoice pelunasan dibayar penuh → proyek siap serah terima (notif untuk manajer)
  if (status === "PAID" && invoice.projectId) {
    const project = await db.project.findUnique({ where: { id: invoice.projectId } });
    if (project) {
      await db.notification.create({
        data: { role: "MANAGER", title: `Pembayaran lunas untuk ${project.code}`, body: `${invoice.number} lunas — proyek "${project.name}" siap finalisasi/serah terima`, type: "SYSTEM" },
      });
    }
  }

  await logAudit({ actorName: user.name, action: "PAYMENT_RECORDED", entity: "Invoice", entityId: id, detail: `${invoice.number} +${amount.toLocaleString("id-ID")} (${status})` });

  const fresh = await db.invoice.findUnique({ where: { id }, include: { payments: { orderBy: { paidAt: "asc" } } } });
  return NextResponse.json({ invoice: mapInvoice(fresh!, fresh!.payments) });
}
