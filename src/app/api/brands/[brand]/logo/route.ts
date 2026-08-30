import { NextResponse } from "next/server";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { DEFAULT_BRAND_PROFILES, getBrandProfile, mapBrandProfile } from "@/lib/brands";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/svg+xml", "svg"],
]);

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-80);
}

/** GET /api/brands/[brand]/logo — kirim file logo (dipakai <img src> pada kop surat). */
export async function GET(_req: Request, { params }: { params: Promise<{ brand: string }> }) {
  const { brand } = await params;
  const profile = await db.brandProfile.findUnique({ where: { brand } });
  if (!profile?.logoPath) {
    return NextResponse.json({ error: "Logo belum diunggah" }, { status: 404 });
  }
  try {
    const buf = await readFile(path.join(UPLOAD_DIR, profile.logoPath));
    const ext = profile.logoPath.split(".").pop()?.toLowerCase() ?? "png";
    const mime = [...ALLOWED.entries()].find(([, e]) => e === ext)?.[0] ?? "image/png";
    return new NextResponse(new Uint8Array(buf), {
      headers: { "Content-Type": mime, "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "File logo tidak ditemukan" }, { status: 404 });
  }
}

/**
 * POST /api/brands/[brand]/logo — unggah logo brand (OWNER/MANAGER).
 * Multipart: field `file` (PNG/JPG/WEBP/SVG, maks 2 MB).
 */
export async function POST(req: Request, { params }: { params: Promise<{ brand: string }> }) {
  const user = await requireAuth(["OWNER", "MANAGER"]);
  if (!user) return NextResponse.json({ error: "Hanya Owner/Manajer yang dapat mengubah logo brand" }, { status: 401 });

  const { brand } = await params;
  if (!DEFAULT_BRAND_PROFILES[brand]) {
    return NextResponse.json({ error: "Brand tidak dikenal" }, { status: 400 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Pilih file logo terlebih dahulu" }, { status: 400 });
  }
  if (file.size > MAX_LOGO_BYTES) {
    return NextResponse.json({ error: "Ukuran logo maksimal 2 MB" }, { status: 400 });
  }
  const ext = ALLOWED.get(file.type);
  if (!ext) {
    return NextResponse.json({ error: "Format harus PNG, JPG, WEBP, atau SVG" }, { status: 400 });
  }

  await mkdir(UPLOAD_DIR, { recursive: true });
  const fileName = `brand-${brand}-${Date.now()}.${ext}`;
  await writeFile(path.join(UPLOAD_DIR, fileName), Buffer.from(await file.arrayBuffer()));

  await getBrandProfile(brand);
  const updated = await db.brandProfile.update({ where: { brand }, data: { logoPath: fileName } });
  await logAudit({
    actorName: user.name,
    action: "UPLOAD_BRAND_LOGO",
    entity: "BrandProfile",
    entityId: brand,
    detail: fileName,
  });
  return NextResponse.json({ brand: mapBrandProfile(updated) });
}
