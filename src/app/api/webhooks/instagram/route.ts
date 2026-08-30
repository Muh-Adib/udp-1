import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ingestChannelMessage } from "@/lib/lead-ingest";

/**
 * Webhook Instagram Messaging API (Meta).
 * - GET  : verifikasi subscribe (sama seperti WhatsApp)
 * - POST : event DM masuk { object: "instagram", entry: [{ id, messaging: [{ sender, recipient, timestamp, message }] }] }
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const cfg = await db.channelConfig.findUnique({ where: { type: "instagram" } });
  if (!cfg || mode !== "subscribe" || !token || token !== cfg.webhookSecret) {
    return NextResponse.json({ error: "Verifikasi webhook gagal" }, { status: 403 });
  }
  return new Response(challenge ?? "", { status: 200 });
}

interface IgPayload {
  object?: string;
  entry?: {
    id?: string;
    time?: number;
    messaging?: {
      sender?: { id?: string };
      recipient?: { id?: string };
      timestamp?: number;
      message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: unknown[] };
    }[];
  }[];
}

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as IgPayload;
    const cfg = await db.channelConfig.findUnique({ where: { type: "instagram" } });
    if (!cfg) return NextResponse.json({ error: "Kanal Instagram belum dikonfigurasi" }, { status: 404 });

    let config: Record<string, string> = {};
    try { config = JSON.parse(cfg.configJson || "{}"); } catch { config = {}; }
    const accounts: string[] = (config.igUsernames ?? "").split(",").map((s) => s.trim().replace(/^@/, "")).filter(Boolean);
    const brandMap: Record<string, string> = { unimasi: "unimasi", segiatech: "segia", erfomultimedia: "erfo", unicamstudio: "unicam" };

    let processed = 0;
    for (const entry of payload.entry ?? []) {
      const accountHandle = accounts.find((a) => a.toLowerCase().includes((entry.id ?? "").slice(-4))) ?? accounts[0] ?? entry.id ?? "";
      const brand = brandMap[accountHandle.toLowerCase()] ?? null;
      for (const evt of entry.messaging ?? []) {
        if (evt.message?.is_echo) continue; // abaikan pesan keluar
        const text = evt.message?.text ?? (evt.message?.attachments ? "[Lampiran media]" : "");
        if (!text) continue;
        const senderId = evt.sender?.id ?? "unknown";
        await ingestChannelMessage({
          channel: "instagram",
          name: `IG ${senderId}`,
          igUsername: senderId,
          body: text,
          brand,
          sourceRef: accountHandle ? `@${accountHandle}` : null,
          externalId: evt.message?.mid ?? `ig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          receivedAt: evt.timestamp ? new Date(evt.timestamp) : new Date(),
        });
        processed++;
      }
    }

    if (processed > 0) {
      await db.channelConfig.update({ where: { type: "instagram" }, data: { lastEventAt: new Date() } });
    }
    return NextResponse.json({ received: true, processed });
  } catch (e) {
    console.error("instagram webhook error", e);
    return NextResponse.json({ received: true, processed: 0 });
  }
}
