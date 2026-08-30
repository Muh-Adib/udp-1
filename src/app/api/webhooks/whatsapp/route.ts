import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ingestChannelMessage } from "@/lib/lead-ingest";

/**
 * Webhook WhatsApp Cloud API (Meta).
 * - GET  : verifikasi subscribe (hub.challenge + hub.verify_token)
 * - POST : pesan masuk format Meta Cloud API
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const cfg = await db.channelConfig.findUnique({ where: { type: "whatsapp" } });
  if (!cfg || mode !== "subscribe" || !token || token !== cfg.webhookSecret) {
    return NextResponse.json({ error: "Verifikasi webhook gagal" }, { status: 403 });
  }
  return new Response(challenge ?? "", { status: 200 });
}

interface WaMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
}
interface WaPayload {
  entry?: {
    changes?: {
      value?: {
        metadata?: { display_phone_number?: string; phone_number_id?: string };
        contacts?: { profile?: { name?: string }; wa_id?: string }[];
        messages?: WaMessage[];
      };
    }[];
  }[];
}

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as WaPayload;
    const cfg = await db.channelConfig.findUnique({ where: { type: "whatsapp" } });
    if (!cfg) return NextResponse.json({ error: "Kanal WhatsApp belum dikonfigurasi" }, { status: 404 });

    let processed = 0;
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        const profileName = value?.contacts?.[0]?.profile?.name ?? "";
        const waId = value?.contacts?.[0]?.wa_id ?? value?.messages?.[0]?.from ?? "";
        for (const msg of value?.messages ?? []) {
          const body =
            msg.text?.body ??
            msg.button?.text ??
            msg.interactive?.button_reply?.title ??
            msg.interactive?.list_reply?.title ??
            (msg.type === "audio" ? "[Pesan suara]" :
             msg.type === "image" ? "[Gambar]" :
             msg.type === "document" ? "[Dokumen]" : "[Pesan media]");
          let waConfig: Record<string, string> = {};
          try { waConfig = JSON.parse(cfg.configJson || "{}"); } catch { waConfig = {}; }
          const brand = waConfig.defaultBrand && ["unimasi", "segia", "erfo", "unicam"].includes(waConfig.defaultBrand)
            ? waConfig.defaultBrand
            : null;
          await ingestChannelMessage({
            channel: "whatsapp",
            name: profileName || `WA ${msg.from}`,
            phone: msg.from || waId,
            body,
            sourceRef: value?.metadata?.display_phone_number ?? null,
            brand,
            externalId: msg.id,
            receivedAt: msg.timestamp ? new Date(Number(msg.timestamp) * 1000) : new Date(),
          });
          processed++;
        }
      }
    }

    if (processed > 0) {
      await db.channelConfig.update({ where: { type: "whatsapp" }, data: { lastEventAt: new Date() } });
    }
    return NextResponse.json({ received: true, processed });
  } catch (e) {
    console.error("whatsapp webhook error", e);
    // Meta mengharapkan 200 agar tidak retry terus-menerus
    return NextResponse.json({ received: true, processed: 0 });
  }
}
