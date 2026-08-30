import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { grantCookieName, grantMaxAgeSeconds, grantValue } from "@/lib/secure-links";
import { mapBrandProfile } from "@/lib/brands";
import { mapBrief, mapQuotation } from "@/lib/ops";
import type { SecureAccessResult, SecureTargetType } from "@/lib/crm-types";

/**
 * POST /api/secure/access — PUBLIK (tanpa login).
 * Body: { token, password }. Password salah/token mati → 401/410.
 * Berhasil → cookie grant 4 jam (untuk unduhan file) + payload dokumen.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const token = String(body?.token ?? "").trim();
  const password = String(body?.password ?? "");
  if (!token || !password) {
    return NextResponse.json({ error: "Tautan dan password wajib diisi" }, { status: 400 });
  }

  const link = await db.secureLink.findUnique({ where: { token } });
  if (!link) return NextResponse.json({ error: "Tautan tidak ditemukan atau sudah dicabut" }, { status: 404 });
  if (!link.active) return NextResponse.json({ error: "Tautan ini sudah dinonaktifkan oleh pengirim" }, { status: 410 });
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "Tautan ini sudah kedaluwarsa" }, { status: 410 });
  }
  if (!verifyPassword(password, link.passwordHash)) {
    return NextResponse.json({ error: "Password salah" }, { status: 401 });
  }

  // Cookie grant → endpoint unduhan file tidak butuh password di URL
  const store = await cookies();
  store.set(grantCookieName(token), grantValue(token), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: grantMaxAgeSeconds(),
  });

  await db.secureLink.update({
    where: { id: link.id },
    data: { accessCount: { increment: 1 }, lastAccessAt: new Date() },
  });

  const payload = await buildDocPayload(link.targetType as SecureTargetType, link.targetId, link.brand, link.createdByName, link.title, link.token);
  return NextResponse.json(payload);
}

async function buildDocPayload(
  kind: SecureTargetType,
  targetId: string,
  brandKey: string,
  senderName: string | null,
  fallbackTitle: string,
  token: string
): Promise<SecureAccessResult | NextResponse> {
  const brandProfile = await db.brandProfile.findUnique({ where: { brand: brandKey } });
  const brand = brandProfile ? mapBrandProfile(brandProfile) : null;
  if (!brand) return NextResponse.json({ error: "Identitas brand tidak ditemukan" }, { status: 500 });

  if (kind === "QUOTATION") {
    const q = await db.quotation.findUnique({ where: { id: targetId }, include: { lead: { include: { contact: true, company: { select: { name: true } } } } } });
    if (!q) return NextResponse.json({ error: "Dokumen tidak ditemukan" }, { status: 404 });
    const dto = mapQuotation(q, {
      lead: {
        code: q.lead.code,
        subject: q.lead.subject,
        contactName: q.lead.contact.name,
        companyName: q.lead.contact.companyName ?? q.lead.company?.name ?? null,
      },
    });
    return {
      kind,
      title: fallbackTitle,
      docLabel: "SURAT PENAWARAN",
      docNumber: q.number,
      dateIso: q.createdAt.toISOString(),
      senderName,
      toName: q.lead.contact.name,
      toCompany: q.lead.contact.companyName ?? q.lead.company?.name ?? null,
      showBankInfo: true,
      brand,
      quotation: dto,
    };
  }

  if (kind === "BRIEF") {
    const b = await db.brief.findUnique({
      where: { id: targetId },
      include: {
        lead: { include: { contact: true, company: true } },
        estimates: { orderBy: { createdAt: "desc" } },
        createdBy: { select: { name: true } },
      },
    });
    if (!b) return NextResponse.json({ error: "Dokumen tidak ditemukan" }, { status: 404 });
    const dto = mapBrief({ ...b, createdByName: b.createdBy?.name ?? null }, b.estimates, {
      lead: {
        code: b.lead.code,
        subject: b.lead.subject,
        contactName: b.lead.contact.name,
        companyName: b.lead.contact.companyName ?? b.lead.company?.name ?? null,
      },
    });
    return {
      kind,
      title: fallbackTitle,
      docLabel: "BRIEF PROYEK",
      docNumber: b.code,
      dateIso: b.createdAt.toISOString(),
      senderName: b.createdBy?.name ?? senderName,
      toName: b.lead.contact.name,
      toCompany: b.lead.contact.companyName ?? b.lead.company?.name ?? null,
      showBankInfo: false,
      brand,
      brief: dto,
    };
  }

  // DELIVERABLE
  const d = await db.deliverable.findUnique({ where: { id: targetId }, include: { project: { include: { lead: { include: { contact: true, company: true } } } } } });
  if (!d) return NextResponse.json({ error: "Dokumen tidak ditemukan" }, { status: 404 });
  return {
    kind,
    title: fallbackTitle,
    docLabel: "DOKUMEN PROYEK",
    docNumber: d.project.code,
    dateIso: d.createdAt.toISOString(),
    senderName,
    toName: d.project.lead?.contact.name ?? null,
    toCompany: d.project.lead?.contact.companyName ?? d.project.lead?.company?.name ?? null,
    showBankInfo: false,
    brand,
    deliverable: {
      name: d.name,
      type: d.type as "FILE" | "LINK",
      fileName: d.fileName,
      mimeType: d.mimeType,
      sizeLabel: d.sizeLabel,
      note: d.note,
      downloadUrl: d.type === "FILE" ? `/api/secure/file?token=${token}` : null,
      externalUrl: d.type === "LINK" ? d.url : null,
    },
  };
}
