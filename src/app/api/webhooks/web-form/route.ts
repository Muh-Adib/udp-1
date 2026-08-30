import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ingestChannelMessage } from "@/lib/lead-ingest";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-GK-Api-Key",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * Endpoint form kontak website.
 * - POST JSON { name, email, phone, message, brand?, page? } atau form-encoded
 * - Autentikasi: header `X-GK-Api-Key` atau query `?key=` = apiKey kanal web
 * Dipakai oleh snippet embed di website tiap brand.
 */
export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const key = req.headers.get("x-gk-api-key") ?? url.searchParams.get("key") ?? "";

    const cfg = await db.channelConfig.findUnique({ where: { type: "web" } });
    if (!cfg || !cfg.apiKey || key !== cfg.apiKey) {
      return NextResponse.json({ error: "API key tidak valid" }, { status: 401, headers: CORS });
    }

    let config: Record<string, string> = {};
    try { config = JSON.parse(cfg.configJson || "{}"); } catch { config = {}; }

    const contentType = req.headers.get("content-type") ?? "";
    let fields: Record<string, string> = {};
    if (contentType.includes("application/json")) {
      const p = await req.json().catch(() => ({}));
      fields = Object.fromEntries(Object.entries(p ?? {}).map(([k, v]) => [k, String(v ?? "")]));
    } else {
      const form = await req.formData();
      fields = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
    }

    const name = fields.name?.trim() || fields.nama?.trim() || "";
    const email = fields.email?.trim() || null;
    const phone = fields.phone?.trim() || fields.whatsapp?.trim() || null;
    const message = fields.message?.trim() || fields.pesan?.trim() || "";
    const brand = fields.brand?.trim() || config.defaultBrand || null;
    const page = fields.page?.trim() || url.searchParams.get("page") || null;

    if (!name || (!email && !phone) || !message) {
      return NextResponse.json({ error: "Field wajib: name, (email|phone), message" }, { status: 400, headers: CORS });
    }

    const result = await ingestChannelMessage({
      channel: "web",
      name,
      email,
      phone,
      body: message,
      brand,
      sourceRef: page || (config.siteUrls ?? "").split(",")[0]?.trim() || null,
      externalId: fields.messageId ?? `web_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    });

    await db.channelConfig.update({ where: { type: "web" }, data: { lastEventAt: new Date(), eventCount: { increment: 1 } } });
    return NextResponse.json({ ok: true, ...result }, { headers: CORS });
  } catch (e) {
    console.error("web-form webhook error", e);
    return NextResponse.json({ error: "Gagal memproses form" }, { status: 500, headers: CORS });
  }
}
