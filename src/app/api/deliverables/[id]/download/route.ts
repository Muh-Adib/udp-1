import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/deliverables/[id]/download — unduh file produksi.
 * Staff internal (OWNER/MANAGER/MARKETER/PRODUCTION/FINANCE) bisa mengunduh semua;
 * CLIENT hanya file milik proyek perusahaannya sendiri (sesuai Portal Klien).
 */
export async function GET(_req: Request, ctx: Ctx) {
  const user = await requireAuth(["OWNER", "MANAGER", "MARKETER", "PRODUCTION", "FINANCE", "CLIENT"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const { id } = await ctx.params;
  const deliverable = await db.deliverable.findUnique({
    where: { id },
    include: { project: { select: { companyId: true } } },
  });
  if (!deliverable || deliverable.type !== "FILE" || !deliverable.filePath) {
    return NextResponse.json({ error: "File tidak ditemukan" }, { status: 404 });
  }

  if (user.role === "CLIENT") {
    if (!user.companyId || deliverable.project?.companyId !== user.companyId) {
      return NextResponse.json({ error: "File bukan milik perusahaan Anda" }, { status: 403 });
    }
  }

  try {
    const buf = await readFile(path.join(UPLOAD_DIR, deliverable.filePath));
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": deliverable.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(deliverable.fileName || deliverable.name)}"`,
        "Content-Length": String(buf.length),
      },
    });
  } catch {
    return NextResponse.json({ error: "File fisik tidak tersedia di server" }, { status: 404 });
  }
}
