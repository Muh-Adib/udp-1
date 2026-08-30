import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const user = await requireAuth(["OWNER", "MANAGER", "MARKETER", "FINANCE"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const slaRow = await db.appSetting.findUnique({ where: { key: "firstResponseSlaHours" } });
  return NextResponse.json({ firstResponseSlaHours: slaRow ? Number(slaRow.value) : 2 });
}

export async function PUT(req: Request) {
  const user = await requireAuth(["OWNER", "MANAGER"]);
  if (!user) return NextResponse.json({ error: "Hanya Owner/Manajer yang dapat mengubah pengaturan" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const hours = Number(body?.firstResponseSlaHours);
  if (!hours || hours < 1 || hours > 48) {
    return NextResponse.json({ error: "SLA harus 1–48 jam" }, { status: 400 });
  }

  await db.appSetting.upsert({
    where: { key: "firstResponseSlaHours" },
    update: { value: String(hours) },
    create: { key: "firstResponseSlaHours", value: String(hours) },
  });
  await logAudit({ actorName: user.name, action: "SETTING_UPDATED", entity: "AppSetting", entityId: "firstResponseSlaHours", detail: `${hours} jam` });

  return NextResponse.json({ ok: true, firstResponseSlaHours: hours });
}
