import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { mapDeliverable } from "@/lib/ops";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-120);
}

function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** GET /api/deliverables?projectId=… — daftar file produksi / link Google Drive. */
export async function GET(req: Request) {
  const user = await requireAuth(["OWNER", "MANAGER", "MARKETER", "PRODUCTION", "FINANCE"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const deliverables = await db.deliverable.findMany({
    where: projectId ? { projectId } : undefined,
    include: { project: { select: { code: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  return NextResponse.json({
    deliverables: deliverables.map((d) => ({ ...mapDeliverable(d), projectCode: d.project.code, projectName: d.project.name })),
  });
}

/**
 * POST /api/deliverables — produksi mengirim file / link Google Drive ke proyek.
 *  - JSON: { type: "LINK", projectId, name, url, note?, milestoneLabel? }
 *  - Multipart (type: "FILE"): fields projectId, name, note?, milestoneLabel?, file
 * URL link divalidasi (http/https; Google Drive didukung penuh).
 */
export async function POST(req: Request) {
  const user = await requireAuth(["OWNER", "MANAGER", "MARKETER", "PRODUCTION"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const contentType = req.headers.get("content-type") ?? "";

  // ---------- LINK (JSON) ----------
  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => null);
    const projectId = body?.projectId ? String(body.projectId) : "";
    const name = body?.name ? String(body.name).trim() : "";
    const url = body?.url ? String(body.url).trim() : "";
    if (!projectId || !name || !url) {
      return NextResponse.json({ error: "Proyek, nama file, dan URL wajib diisi" }, { status: 400 });
    }
    if (!/^https?:\/\/.+/i.test(url)) {
      return NextResponse.json({ error: "URL harus dimulai dengan http:// atau https://" }, { status: 400 });
    }
    const project = await db.project.findUnique({ where: { id: projectId } });
    if (!project) return NextResponse.json({ error: "Proyek tidak ditemukan" }, { status: 404 });

    const deliverable = await db.deliverable.create({
      data: {
        projectId,
        name,
        type: "LINK",
        url,
        fileName: null,
        mimeType: null,
        sizeLabel: null,
        milestoneLabel: body?.milestoneLabel ? String(body.milestoneLabel) : null,
        note: body?.note ? String(body.note) : null,
        uploadedByName: user.name,
      },
    });
    await db.leadMessage.create({
      data: {
        leadId: project.leadId ?? "",
        direction: "NOTE",
        channel: "internal",
        body: `Deliverable "${name}" (tautan) ditambahkan ke ${project.code} oleh ${user.name}.`,
        senderName: user.name,
      },
    }).catch(() => undefined);
    await db.notification.create({
      data: {
        role: "MANAGER",
        title: `File produksi baru — ${project.code}`,
        body: `${name} (tautan) dikirim oleh ${user.name}${project.leadId ? "" : ""}`,
        type: "SYSTEM",
      },
    });
    await logAudit({ actorName: user.name, action: "DELIVERABLE_LINK", entity: "Deliverable", entityId: deliverable.id, detail: `${project.code} — ${name}` });
    return NextResponse.json({ deliverable: mapDeliverable(deliverable) }, { status: 201 });
  }

  // ---------- FILE (multipart) ----------
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const projectId = String(form.get("projectId") ?? "");
    const name = String(form.get("name") ?? "").trim();
    const note = String(form.get("note") ?? "");
    const milestoneLabel = String(form.get("milestoneLabel") ?? "");
    const file = form.get("file");

    if (!projectId || !name || !(file instanceof File)) {
      return NextResponse.json({ error: "Proyek, nama, dan file wajib diisi" }, { status: 400 });
    }
    if (file.size === 0) return NextResponse.json({ error: "File kosong" }, { status: 400 });
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "Ukuran file maksimal 10 MB — gunakan link Google Drive untuk file besar" }, { status: 400 });
    }

    const project = await db.project.findUnique({ where: { id: projectId } });
    if (!project) return NextResponse.json({ error: "Proyek tidak ditemukan" }, { status: 404 });

    await mkdir(UPLOAD_DIR, { recursive: true });
    const safeName = `${Date.now()}-${sanitizeFileName(file.name)}`;
    const dest = path.join(UPLOAD_DIR, safeName);
    await writeFile(dest, Buffer.from(await file.arrayBuffer()));

    const deliverable = await db.deliverable.create({
      data: {
        projectId,
        name,
        type: "FILE",
        url: null,
        filePath: safeName,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeLabel: humanSize(file.size),
        milestoneLabel: milestoneLabel || null,
        note: note || null,
        uploadedByName: user.name,
      },
    });
    await db.leadMessage.create({
      data: {
        leadId: project.leadId ?? "",
        direction: "NOTE",
        channel: "internal",
        body: `Deliverable "${name}" (${file.name}, ${humanSize(file.size)}) diunggah ke ${project.code} oleh ${user.name}.`,
        senderName: user.name,
      },
    }).catch(() => undefined);
    await db.notification.create({
      data: {
        role: "MANAGER",
        title: `File produksi baru — ${project.code}`,
        body: `${name} (${file.name}) diunggah oleh ${user.name}`,
        type: "SYSTEM",
      },
    });
    await logAudit({ actorName: user.name, action: "DELIVERABLE_FILE", entity: "Deliverable", entityId: deliverable.id, detail: `${project.code} — ${file.name}` });
    return NextResponse.json({ deliverable: mapDeliverable(deliverable) }, { status: 201 });
  }

  return NextResponse.json({ error: "Content-Type tidak didukung" }, { status: 400 });
}
