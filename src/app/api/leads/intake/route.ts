import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ingestChannelMessage } from "@/lib/lead-ingest";
import { logAudit } from "@/lib/audit";

const DEFAULT_BRAND_KEYS: readonly string[] = ["unimasi", "segia", "erfo", "unicam"];

/**
 * POST /api/leads/intake — pintu masuk lead REAL (bukan dummy).
 * Dipakai form "Lead Masuk" di Inbox: staf mencatat percakapan yang benar-benar terjadi
 * (DM Instagram, WhatsApp, email, form web) lengkap dengan identitas kontak.
 * Melewati pipeline yang sama dengan webhook kanal: dedupe kontak, enrich identitas,
 * penggabungan lead terbuka, skor, notifikasi, audit.
 */
export async function POST(req: Request) {
  const user = await requireAuth(["OWNER", "MANAGER", "MARKETER"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Payload tidak valid" }, { status: 400 });

  const channel = String(body.channel ?? "manual");
  if (!["whatsapp", "email", "instagram", "web", "manual"].includes(channel)) {
    return NextResponse.json({ error: "Kanal sumber tidak valid" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  const subject = String(body.subject ?? "").trim();
  const msgBody = String(body.body ?? "").trim();
  if (!name) return NextResponse.json({ error: "Nama lengkap kontak wajib diisi" }, { status: 400 });
  if (!subject) return NextResponse.json({ error: "Subjek wajib diisi" }, { status: 400 });
  if (!msgBody) return NextResponse.json({ error: "Isi pesan wajib diisi" }, { status: 400 });

  // Brand WAJIB eksplisit — lead tidak boleh menggantung tanpa brand (tidak ada default senyap).
  const brand = String(body.brand ?? "").trim().toLowerCase();
  if (!brand) return NextResponse.json({ error: "Pilih brand yang dituju lead" }, { status: 400 });
  if (!DEFAULT_BRAND_KEYS.includes(brand)) {
    return NextResponse.json({ error: "Brand tidak dikenal" }, { status: 400 });
  }

  const phone = String(body.phone ?? "").trim();
  const email = String(body.email ?? "").trim();
  const ig = String(body.igUsername ?? "").trim();
  if (!phone && !email && !ig && channel !== "web" && channel !== "manual") {
    return NextResponse.json(
      { error: "Isi minimal satu kontak: nomor WhatsApp, email, atau username Instagram" },
      { status: 400 },
    );
  }

  const result = await ingestChannelMessage({
    channel: channel as "whatsapp" | "email" | "instagram" | "web" | "manual",
    name,
    phone: phone || null,
    email: email || null,
    igUsername: ig || null,
    company: body.company ? String(body.company) : null,
    position: body.position ? String(body.position) : null,
    country: body.country ? String(body.country) : null,
    contactNotes: body.contactNotes ? String(body.contactNotes) : null,
    body: msgBody,
    subject,
    brand,
    sourceRef: body.sourceRef ? String(body.sourceRef) : null,
  });

  await logAudit({
    actorName: user.name,
    action: "LEAD_INTAKE",
    entity: "Lead",
    entityId: result.leadId,
    detail: `Lead ${result.leadCode} dari ${channel}${result.newContact ? " — kontak baru" : ` — kontak existing (cocok via ${result.matchedBy ?? "-"})`}`,
  });

  return NextResponse.json(result, { status: 201 });
}
