import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateApiKey, generateVerifyToken, toChannelDTO } from "@/lib/channels";
import { logAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ type: string }> };

/** Regenerasi API key (kanal web) atau verify token (WhatsApp/Instagram/Email). */
export async function POST(_req: Request, ctx: Ctx) {
  const user = await requireAuth(["OWNER", "MANAGER"]);
  if (!user) return NextResponse.json({ error: "Hanya Owner/Manajer yang dapat regenerasi kredensial" }, { status: 401 });

  const { type } = await ctx.params;
  if (!["whatsapp", "email", "instagram", "web"].includes(type)) {
    return NextResponse.json({ error: "Jenis kanal tidak valid" }, { status: 400 });
  }

  const data: { apiKey?: string; webhookSecret?: string } = {};
  if (type === "web") data.apiKey = generateApiKey();
  else data.webhookSecret = generateVerifyToken();

  const updated = await db.channelConfig.update({ where: { type }, data });
  await logAudit({ actorName: user.name, action: "CHANNEL_KEY_ROTATED", entity: "ChannelConfig", entityId: type });

  return NextResponse.json({ channel: toChannelDTO(updated) });
}
