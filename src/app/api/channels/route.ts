import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { ensureChannelConfigs, toChannelDTO } from "@/lib/channels";
import { logAudit } from "@/lib/audit";

/** Daftar konfigurasi semua kanal. */
export async function GET() {
  const user = await requireAuth(["OWNER", "MANAGER", "MARKETER", "FINANCE"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  await ensureChannelConfigs();
  const rows = await db.channelConfig.findMany({ orderBy: { type: "asc" } });
  return NextResponse.json({ channels: rows.map(toChannelDTO) });
}

/** Perbarui konfigurasi / status aktif satu kanal. */
export async function PUT(req: Request) {
  const user = await requireAuth(["OWNER", "MANAGER"]);
  if (!user) return NextResponse.json({ error: "Hanya Owner/Manajer yang dapat mengubah konfigurasi kanal" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.type || !["whatsapp", "email", "instagram", "web"].includes(body.type)) {
    return NextResponse.json({ error: "Jenis kanal tidak valid" }, { status: 400 });
  }

  const existing = await db.channelConfig.findUnique({ where: { type: body.type } });
  if (!existing) return NextResponse.json({ error: "Kanal tidak ditemukan" }, { status: 404 });

  const data: { enabled?: boolean; configJson?: string; name?: string } = {};
  if (typeof body.enabled === "boolean") data.enabled = body.enabled;
  if (body.config && typeof body.config === "object") {
    data.configJson = JSON.stringify(body.config);
  }
  if (body.name && typeof body.name === "string") data.name = body.name;

  const updated = await db.channelConfig.update({ where: { type: body.type }, data });

  if (typeof body.enabled === "boolean" && body.enabled !== existing.enabled) {
    await logAudit({
      actorName: user.name,
      action: body.enabled ? "CHANNEL_ENABLED" : "CHANNEL_DISABLED",
      entity: "ChannelConfig",
      entityId: updated.type,
      detail: updated.name,
    });
  } else {
    await logAudit({ actorName: user.name, action: "CHANNEL_UPDATED", entity: "ChannelConfig", entityId: updated.type, detail: updated.name });
  }

  return NextResponse.json({ channel: toChannelDTO(updated) });
}
