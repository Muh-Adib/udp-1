import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { DEFAULT_BRAND_PROFILES, getOrCreateBrandProfiles, mapBrandProfile } from "@/lib/brands";

/** GET /api/brands — daftar identitas brand (auto-create default bila belum ada). */
export async function GET() {
  const user = await requireAuth(["OWNER", "MANAGER", "MARKETER", "PRODUCTION", "FINANCE"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const rows = await getOrCreateBrandProfiles();
  return NextResponse.json({ brands: rows.map(mapBrandProfile) });
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * PUT /api/brands — perbarui identitas brand (OWNER/MANAGER).
 * Body: { brand, name?, tagline?, address?, phone?, email?, website?, primaryColor?, letterheadNote?, footerNote?, bankInfo? }
 */
export async function PUT(req: Request) {
  const user = await requireAuth(["OWNER", "MANAGER"]);
  if (!user) return NextResponse.json({ error: "Hanya Owner/Manajer yang dapat mengubah identitas brand" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const brand = body?.brand ? String(body.brand) : "";
  if (!DEFAULT_BRAND_PROFILES[brand]) {
    return NextResponse.json({ error: "Brand tidak dikenal" }, { status: 400 });
  }

  const data: Record<string, string> = {};
  const strFields = ["name", "tagline", "address", "phone", "email", "instagram", "website", "letterheadNote", "footerNote", "bankInfo"] as const;
  for (const f of strFields) {
    if (body[f] !== undefined) data[f] = String(body[f]).slice(0, 500);
  }
  if (data.name !== undefined && !data.name.trim()) {
    return NextResponse.json({ error: "Nama brand wajib diisi" }, { status: 400 });
  }
  if (body.primaryColor !== undefined) {
    const c = String(body.primaryColor).trim().toUpperCase();
    if (!HEX_RE.test(c)) {
      return NextResponse.json({ error: "Warna harus dalam format hex, cth: #059669" }, { status: 400 });
    }
    data.primaryColor = c;
  }

  await getOrCreateBrandProfiles();
  const updated = await db.brandProfile.update({ where: { brand }, data });
  await logAudit({
    actorName: user.name,
    action: "UPDATE_BRAND",
    entity: "BrandProfile",
    entityId: brand,
    detail: `Warna: ${updated.primaryColor}`,
  });
  return NextResponse.json({ brand: mapBrandProfile(updated) });
}
