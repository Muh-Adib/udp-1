import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { normalizePhoneGlobal } from "@/lib/countries";
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
      return `${c.name} ${c.position ?? ""} ${c.companyName ?? ""} ${c.company?.name ?? ""} ${c.country} ${c.email ?? ""} ${c.phone ?? ""} ${c.igUsername ?? ""}`.toLowerCase().includes(q);
    })
    .map((c) => ({
      id: c.id,
      name: c.name,
      position: c.position,
      companyName: c.companyName,
      country: c.country,
      email: c.email,
      phone: c.phone,
      igUsername: c.igUsername,
      source: c.source,
      company: c.companyName ?? c.company?.name ?? null,
      notes: c.notes,
      createdAt: c.createdAt.toISOString(),
      leadCount: c._count.leads,
    }));

  return NextResponse.json({ contacts: dtos });
}

/**
 * POST /api/contacts — tambah kontak secara real (bukan dummy).
 * Dedupe: bila nomor/email/IG sudah terdaftar, kembalikan 409 + kontak existing
 * agar UI bisa menawarkan "pakai yang sudah ada" dan mencegah data ganda.
 */
export async function POST(req: Request) {
  const user = await requireAuth(["OWNER", "MANAGER", "MARKETER"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Payload tidak valid" }, { status: 400 });

  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Nama lengkap wajib diisi" }, { status: 400 });

  const phone = normalizePhoneGlobal(body.phone ? String(body.phone) : null);
  const email = body.email ? String(body.email).trim().toLowerCase() : null;
  const ig = body.igUsername ? String(body.igUsername).trim().replace(/^@/, "").toLowerCase() : null;
  if (!phone && !email && !ig) {
    return NextResponse.json({ error: "Isi minimal satu kontak: nomor telepon, email, atau Instagram" }, { status: 400 });
  }

  const matched = await findDuplicate({ phone, email, ig });
  if (matched) {
    return NextResponse.json(
      {
        error: `Kontak sudah terdaftar sebagai "${matched.name}" (cocok via ${duplicateLabel(matched._matched)})`,
        existing: { id: matched.id, name: matched.name, email: matched.email, phone: matched.phone, igUsername: matched.igUsername },
      },
      { status: 409 },
    );
  }

  const contact = await db.contact.create({
    data: {
      name,
      position: body.position ? String(body.position).trim() : null,
      companyName: body.companyName ? String(body.companyName).trim() : null,
      country: body.country ? String(body.country).trim() : "Indonesia",
      email,
      phone,
      igUsername: ig,
      notes: body.notes ? String(body.notes).trim() : null,
      source: "manual",
    },
  });

  await logAudit({ actorName: user.name, action: "CONTACT_CREATED", entity: "Contact", entityId: contact.id, detail: `${contact.name}${contact.companyName ? ` — ${contact.companyName}` : ""}` });
  return NextResponse.json({ contact: { id: contact.id } }, { status: 201 });
}

export async function PUT(req: Request) {
  const user = await requireAuth(["OWNER", "MANAGER", "MARKETER"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "ID kontak wajib" }, { status: 400 });

  const existing = await db.contact.findUnique({ where: { id: String(body.id) } });
  if (!existing) return NextResponse.json({ error: "Kontak tidak ditemukan" }, { status: 404 });

  const name = body.name !== undefined ? String(body.name).trim() : existing.name;
  if (!name) return NextResponse.json({ error: "Nama lengkap wajib diisi" }, { status: 400 });

  const phone = body.phone !== undefined ? normalizePhoneGlobal(body.phone ? String(body.phone) : null) : existing.phone;
  const email = body.email !== undefined ? (body.email ? String(body.email).trim().toLowerCase() : null) : existing.email;
  const ig = body.igUsername !== undefined ? (body.igUsername ? String(body.igUsername).trim().replace(/^@/, "").toLowerCase() : null) : existing.igUsername;

  // Cegah duplikat: nomor/email/IG yang diubah tidak boleh milik kontak lain
  const matched = await findDuplicate({ phone, email, ig });
  if (matched && matched.id !== existing.id) {
    return NextResponse.json(
      { error: `Data tersebut sudah dipakai kontak "${matched.name}" (cocok via ${duplicateLabel(matched._matched)})` },
      { status: 409 },
    );
  }

  const updated = await db.contact.update({
    where: { id: existing.id },
    data: {
      name,
      position: body.position !== undefined ? (body.position ? String(body.position).trim() : null) : existing.position,
      companyName: body.companyName !== undefined ? (body.companyName ? String(body.companyName).trim() : null) : existing.companyName,
      country: body.country !== undefined ? String(body.country).trim() || "Indonesia" : existing.country,
      email,
      phone,
      igUsername: ig,
      notes: body.notes !== undefined ? (body.notes ? String(body.notes).trim() : null) : existing.notes,
    },
  });

  await logAudit({ actorName: user.name, action: "CONTACT_UPDATED", entity: "Contact", entityId: updated.id, detail: updated.name });
  return NextResponse.json({ contact: { id: updated.id } });
}

type DupField = "phone" | "email" | "instagram";
type MatchedContact = { id: string; name: string; email: string | null; phone: string | null; igUsername: string | null; _matched: DupField };

async function findDuplicate(input: { phone: string | null; email: string | null; ig: string | null }): Promise<MatchedContact | null> {
  if (input.phone) {
    const c = await db.contact.findFirst({ where: { phone: input.phone } });
    if (c) return { ...c, _matched: "phone" };
  }
  if (input.email) {
    const c = await db.contact.findFirst({ where: { email: input.email } });
    if (c) return { ...c, _matched: "email" };
  }
  if (input.ig) {
    const c = await db.contact.findFirst({ where: { igUsername: input.ig } });
    if (c) return { ...c, _matched: "instagram" };
  }
  return null;
}

function duplicateLabel(f: DupField): string {
  return { phone: "nomor telepon", email: "email", instagram: "username Instagram" }[f];
}
