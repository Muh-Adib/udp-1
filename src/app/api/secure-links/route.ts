import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { hashPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { buildShareMessage, generatePassword, generateToken, secureLinkPath } from "@/lib/secure-links";
import type { SecureLinkDTO, SecureTargetType } from "@/lib/crm-types";

const VALID_TARGETS: SecureTargetType[] = ["QUOTATION", "BRIEF", "DELIVERABLE"];

function mapLink(
  l: {
    id: string; token: string; title: string; targetType: string; targetId: string;
    leadId: string | null; projectId: string | null; brand: string; active: boolean;
    expiresAt: Date | null; accessCount: number; lastAccessAt: Date | null;
    createdByName: string | null; createdAt: Date;
  },
  extra?: { targetLabel?: string | null }
): SecureLinkDTO {
  return {
    id: l.id,
    token: l.token,
    url: secureLinkPath(l.token),
    title: l.title,
    targetType: l.targetType as SecureTargetType,
    targetId: l.targetId,
    targetLabel: extra?.targetLabel ?? null,
    leadId: l.leadId,
    projectId: l.projectId,
    brand: l.brand,
    active: l.active,
    expiresAt: l.expiresAt?.toISOString() ?? null,
    accessCount: l.accessCount,
    lastAccessAt: l.lastAccessAt?.toISOString() ?? null,
    createdByName: l.createdByName,
    createdAt: l.createdAt.toISOString(),
  };
}

/** GET /api/secure-links?leadId=&projectId= — riwayat tautan aman (internal). */
export async function GET(req: Request) {
  const user = await requireAuth(["OWNER", "MANAGER", "MARKETER", "FINANCE", "PRODUCTION"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const leadId = searchParams.get("leadId");
  const projectId = searchParams.get("projectId");
  const links = await db.secureLink.findMany({
    where: {
      ...(leadId ? { leadId } : {}),
      ...(projectId ? { projectId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Tambahkan label target untuk tampilan (QT-0001, BRF-0002, nama file)
  const withLabels = await Promise.all(
    links.map(async (l) => {
      let targetLabel: string | null = null;
      if (l.targetType === "QUOTATION") {
        targetLabel = (await db.quotation.findUnique({ where: { id: l.targetId } }))?.number ?? null;
      } else if (l.targetType === "BRIEF") {
        targetLabel = (await db.brief.findUnique({ where: { id: l.targetId } }))?.code ?? null;
      } else if (l.targetType === "DELIVERABLE") {
        targetLabel = (await db.deliverable.findUnique({ where: { id: l.targetId } }))?.name ?? null;
      }
      return mapLink(l, { targetLabel });
    })
  );

  return NextResponse.json({ links: withLabels });
}

/**
 * POST /api/secure-links — buat tautan aman + password.
 * Body: { targetType, targetId, title?, leadId?, projectId?, brand?, password?, expiresInDays? }
 * Password PLAIN hanya ada di respons ini (untuk dikirim ke klien via kanal terpisah).
 */
export async function POST(req: Request) {
  const user = await requireAuth(["OWNER", "MANAGER", "MARKETER", "FINANCE", "PRODUCTION"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const targetType = String(body?.targetType ?? "");
  const targetId = String(body?.targetId ?? "");
  if (!VALID_TARGETS.includes(targetType as SecureTargetType) || !targetId) {
    return NextResponse.json({ error: "Jenis dokumen atau target tidak valid" }, { status: 400 });
  }

  const password = body?.password ? String(body.password) : generatePassword();
  if (password.length < 4) {
    return NextResponse.json({ error: "Password minimal 4 karakter" }, { status: 400 });
  }

  // Ambil target + konteks (lead/brand/judul default)
  let title = body?.title ? String(body.title).trim() : "";
  let leadId: string | null = body?.leadId ? String(body.leadId) : null;
  let projectId: string | null = body?.projectId ? String(body.projectId) : null;
  let brand = body?.brand ? String(body.brand) : "";
  let targetLabel: string | null = null;

  if (targetType === "QUOTATION") {
    const q = await db.quotation.findUnique({ where: { id: targetId }, include: { lead: true } });
    if (!q) return NextResponse.json({ error: "Penawaran tidak ditemukan" }, { status: 404 });
    title = title || `${q.number} — ${q.title}`;
    leadId = leadId ?? q.leadId;
    brand = brand || q.brand;
    targetLabel = q.number;
  } else if (targetType === "BRIEF") {
    const b = await db.brief.findUnique({ where: { id: targetId }, include: { lead: true } });
    if (!b) return NextResponse.json({ error: "Brief tidak ditemukan" }, { status: 404 });
    title = title || `${b.code} — ${b.title}`;
    leadId = leadId ?? b.leadId;
    brand = brand || b.brand;
    targetLabel = b.code;
  } else {
    const d = await db.deliverable.findUnique({ where: { id: targetId }, include: { project: true } });
    if (!d) return NextResponse.json({ error: "File produksi tidak ditemukan" }, { status: 404 });
    title = title || d.name;
    projectId = projectId ?? d.projectId;
    leadId = leadId ?? d.project.leadId;
    brand = brand || d.project.brand;
    targetLabel = d.name;
  }

  const expiresAt =
    body?.expiresInDays === null || body?.expiresInDays === undefined || body?.expiresInDays === ""
      ? null
      : new Date(Date.now() + Math.max(1, Math.min(365, Math.round(Number(body.expiresInDays) || 0))) * 24 * 60 * 60 * 1000);

  const link = await db.secureLink.create({
    data: {
      token: generateToken(),
      title: title || "Dokumen",
      targetType,
      targetId,
      leadId,
      projectId,
      brand: ["unimasi", "segia", "erfo", "unicam"].includes(brand) ? brand : "unimasi",
      passwordHash: hashPassword(password),
      expiresAt,
      createdById: user.id,
      createdByName: user.name,
    },
  });

  const url = secureLinkPath(link.token);
  await logAudit({
    actorName: user.name,
    action: "SECURE_LINK_CREATED",
    entity: "SecureLink",
    entityId: link.id,
    detail: `${targetType} ${targetLabel ?? targetId} — ${url} (kadaluarsa: ${expiresAt ? expiresAt.toISOString().slice(0, 10) : "tidak"})`,
  });

  const dto = mapLink(link, { targetLabel });
  return NextResponse.json(
    { link: dto, password, shareMessage: buildShareMessage(title || "Dokumen", url, password, user.name) },
    { status: 201 }
  );
}
