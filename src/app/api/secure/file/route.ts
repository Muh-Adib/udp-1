import { cookies } from "next/headers";
import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { grantCookieName, verifyGrant } from "@/lib/secure-links";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

/**
 * GET /api/secure/file?token=… — PUBLIK unduhan file produksi via tautan aman.
 * Wajib punya cookie grant (diterbitkan setelah password benar di /api/secure/access).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = String(searchParams.get("token") ?? "").trim();
  if (!token) return NextResponse.json({ error: "Token tidak ada" }, { status: 400 });

  const link = await db.secureLink.findUnique({ where: { token } });
  if (!link || !link.active) return NextResponse.json({ error: "Tautan tidak valid" }, { status: 404 });
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "Tautan kedaluwarsa" }, { status: 410 });
  }

  const store = await cookies();
  if (!verifyGrant(token, store.get(grantCookieName(token))?.value)) {
    return NextResponse.json({ error: "Akses belum diverifikasi — buka tautan + password dulu" }, { status: 401 });
  }
  if (link.targetType !== "DELIVERABLE") {
    return NextResponse.json({ error: "Tautan bukan file" }, { status: 400 });
  }

  const deliverable = await db.deliverable.findUnique({ where: { id: link.targetId } });
  if (!deliverable || !deliverable.filePath) {
    return NextResponse.json({ error: "File tidak ditemukan" }, { status: 404 });
  }

  // Cegah path traversal: hanya nama file di dalam uploads/
  const safeName = path.basename(deliverable.filePath);
  try {
    const buf = await readFile(path.join(UPLOAD_DIR, safeName));
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": deliverable.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${(deliverable.fileName || deliverable.name).replace(/[^\w.\-]+/g, "_")}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "File fisik tidak ditemukan di server" }, { status: 404 });
  }
}
