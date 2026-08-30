import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ingestChannelMessage } from "@/lib/lead-ingest";

/**
 * Webhook inbound email.
 * Format provider (Mailgun/SendGrid/Postmark/Zapier Email Parser) dinormalisasi ke:
 * { from: "Nama <a@b.co>", fromName?, fromEmail?, subject, text, to? }
 * Autentikasi: header `X-GK-Webhook-Token` atau query `?token=` — harus sama dengan webhookSecret kanal email.
 */
export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const token = req.headers.get("x-gk-webhook-token") ?? url.searchParams.get("token") ?? "";

    const cfg = await db.channelConfig.findUnique({ where: { type: "email" } });
    if (!cfg) return NextResponse.json({ error: "Kanal email belum dikonfigurasi" }, { status: 404 });
    if (!token || token !== cfg.webhookSecret) {
      return NextResponse.json({ error: "Token webhook tidak valid" }, { status: 401 });
    }

    const contentType = req.headers.get("content-type") ?? "";
    let from = "", fromName = "", fromEmail = "", subject = "", text = "", to = "", messageId = "";
    if (contentType.includes("application/json")) {
      const p = await req.json().catch(() => ({}));
      from = p.from ?? "";
      fromName = p.fromName ?? "";
      fromEmail = p.fromEmail ?? "";
      subject = p.subject ?? "";
      text = p.text ?? p.body ?? p.stripedHtml ?? "";
      to = p.to ?? "";
      messageId = p.messageId ?? p["Message-Id"] ?? null;
    } else {
      const form = await req.formData();
      from = String(form.get("from") ?? "");
      subject = String(form.get("subject") ?? "");
      text = String(form.get("text") ?? form.get("body-plain") ?? form.get("stripped-text") ?? "");
      to = String(form.get("to") ?? "");
      messageId = String(form.get("Message-Id") ?? form.get("messageId") ?? "");
    }

    // Parse "Nama <email@host>" jika fromName/fromEmail belum ada
    if (!fromEmail && from) {
      const m = from.match(/<([^>]+)>/);
      if (m) {
        fromEmail = m[1];
        fromName = fromName || from.replace(/<[^>]+>/, "").replace(/"/g, "").trim();
      } else {
        fromEmail = from.trim();
      }
    }
    if (!fromEmail) return NextResponse.json({ error: "Alamat pengirim tidak terbaca" }, { status: 400 });

    let brand: string | null = null;
    let config: Record<string, string> = {};
    try { config = JSON.parse(cfg.configJson || "{}"); } catch { config = {}; }
    if (to) {
      // rute alamat per brand, mis. sales@unimasi.id → unimasi
      const lower = to.toLowerCase();
      for (const b of ["unimasi", "segia", "erfo", "unicam"]) if (lower.includes(b)) brand = b;
    }

    const result = await ingestChannelMessage({
      channel: "email",
      name: fromName || fromEmail.split("@")[0],
      email: fromEmail,
      body: text || subject || "(Email kosong)",
      subject: subject || null,
      brand,
      sourceRef: to || config.inboundAddress || null,
      externalId: messageId || `email_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    });

    await db.channelConfig.update({ where: { type: "email" }, data: { lastEventAt: new Date(), eventCount: { increment: 1 } } });
    return NextResponse.json({ received: true, ...result });
  } catch (e) {
    console.error("email webhook error", e);
    return NextResponse.json({ error: "Gagal memproses email" }, { status: 500 });
  }
}
