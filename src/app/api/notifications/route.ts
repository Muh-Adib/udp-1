import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import type { NotificationDTO } from "@/lib/crm-types";

export async function GET(req: Request) {
  const user = await requireAuth(["OWNER", "MANAGER", "MARKETER", "FINANCE"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const url = new URL(req.url);
  const markAll = url.searchParams.get("markAll") === "1";
  if (markAll) {
    await db.notification.updateMany({
      where: { read: false, OR: [{ role: user.role }, { role: null, userId: null }, { userId: user.id }] },
      data: { read: true },
    });
  }

  const rows = await db.notification.findMany({
    where: { OR: [{ role: user.role }, { role: null, userId: null }, { userId: user.id }] },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  const notifications: NotificationDTO[] = rows.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    type: n.type,
    link: n.link,
    read: n.read,
    createdAt: n.createdAt.toISOString(),
  }));

  return NextResponse.json({ notifications, unread: notifications.filter((n) => !n.read).length });
}

export async function POST(req: Request) {
  const user = await requireAuth(["OWNER", "MANAGER", "MARKETER", "FINANCE"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (body.ids && Array.isArray(body.ids)) {
    await db.notification.updateMany({ where: { id: { in: body.ids } }, data: { read: true } });
  }
  return NextResponse.json({ ok: true });
}
