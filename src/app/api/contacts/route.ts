import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import type { ContactDTO } from "@/lib/crm-types";

export async function GET(req: Request) {
  const user = await requireAuth(["OWNER", "MANAGER", "MARKETER", "FINANCE"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim().toLowerCase() ?? "";

  const contacts = await db.contact.findMany({
    include: { company: { select: { name: true } }, _count: { select: { leads: true } } },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  const dtos: ContactDTO[] = contacts
    .filter((c) => {
      if (!q) return true;
      return `${c.name} ${c.email ?? ""} ${c.phone ?? ""} ${c.igUsername ?? ""}`.toLowerCase().includes(q);
    })
    .map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      igUsername: c.igUsername,
      source: c.source,
      company: c.company?.name ?? null,
      createdAt: c.createdAt.toISOString(),
      leadCount: c._count.leads,
    }));

  return NextResponse.json({ contacts: dtos });
}
