import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { formatPhoneDisplay } from "@/lib/countries";
import { REPLY_CHANNEL_LABEL, type ChannelType, type LeadMessageDTO } from "@/lib/crm-types";

type Ctx = { params: Promise<{ id: string }> };

const OUT_CHANNELS: ChannelType[] = ["whatsapp", "email", "instagram", "web"];

/**
 * Tentukan tujuan nyata (destination) untuk balasan keluar pada sebuah kanal,
 * berdasarkan data kontak yang benar-benar tersedia.
 * WhatsApp → nomor, Email → alamat email, Instagram → @handle.
 */
function resolveDestination(channel: ChannelType, contact: { phone: string | null; email: string | null; igUsername: string | null }): { destination: string | null; missing: string | null } {
  switch (channel) {
    case "whatsapp":
      return contact.phone
        ? { destination: formatPhoneDisplay(contact.phone), missing: null }
        : { destination: null, missing: "nomor WhatsApp" };
    case "email":
      return contact.email
        ? { destination: contact.email, missing: null }
        : { destination: null, missing: "alamat email" };
    case "instagram":
      return contact.igUsername
        ? { destination: `@${contact.igUsername}`, missing: null }
        : { destination: null, missing: "username Instagram" };
    case "web":
      // Balasan kanal web diteruskan via email kontak bila ada (form web tidak punya kotak masuk dua arah)
      return contact.email
        ? { destination: contact.email, missing: null }
        : { destination: null, missing: "alamat email (untuk meneruskan balasan web)" };
  }
}

/** Balas pesan keluar (OUT) atau catatan internal (NOTE) — dengan ROUTING KANAL yang tervalidasi. */
export async function POST(req: Request, ctx: Ctx) {
  const user = await requireAuth(["OWNER", "MANAGER", "MARKETER"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body?.body?.trim() || !body?.direction) {
    return NextResponse.json({ error: "Isi pesan wajib diisi" }, { status: 400 });
  }
  if (!["OUT", "NOTE"].includes(body.direction)) {
    return NextResponse.json({ error: "Arah pesan tidak valid" }, { status: 400 });
  }

  const lead = await db.lead.findUnique({ where: { id }, include: { contact: true } });
  if (!lead) return NextResponse.json({ error: "Lead tidak ditemukan" }, { status: 404 });

  const now = new Date();

  // ===== Routing kanal untuk balasan keluar =====
  // Balasan WA harus ke nomor WA, DM ke Instagram, email ke alamat email —
  // kanal yang tidak punya tujuan nyata pada kontak DITOLAK, bukan diam-diam salah kirim.
  let outChannel: ChannelType | null = null;
  let destination: string | null = null;

  if (body.direction === "OUT") {
    const requested = (body.channel ?? lead.channel) as ChannelType;
    if (!OUT_CHANNELS.includes(requested)) {
      return NextResponse.json(
        { error: "Pilih kanal balasan: WhatsApp, Email, atau Instagram DM — atau gunakan catatan internal" },
        { status: 400 },
      );
    }
    const { destination: dest, missing } = resolveDestination(requested, lead.contact);
    if (!dest) {
      const available = OUT_CHANNELS.map((c) => {
        const r = resolveDestination(c, lead.contact);
        return r.destination ? `${REPLY_CHANNEL_LABEL[c]} (${r.destination})` : null;
      }).filter(Boolean);
      return NextResponse.json(
        {
          error: `Kontak belum punya ${missing} — balasan via ${REPLY_CHANNEL_LABEL[requested]} tidak bisa dikirim.${available.length ? ` Kanal yang tersedia: ${available.join(", ")}.` : " Lengkapi kontak terlebih dahulu."}`,
        },
        { status: 400 },
      );
    }
    outChannel = requested;
    destination = dest;
  }

  const msg = await db.leadMessage.create({
    data: {
      leadId: id,
      direction: body.direction,
      channel: body.direction === "OUT" ? (outChannel as string) : "internal",
      body: body.body.trim(),
      senderId: user.id,
      senderName: user.name,
    },
  });

  if (body.direction === "OUT") {
    await db.lead.update({
      where: { id },
      data: {
        firstOutAt: lead.firstOutAt ?? now,
        status: lead.status === "NEW" ? "FOLLOW_UP" : lead.status,
        score: Math.min(100, lead.score + 5),
        updatedAt: now,
      },
    });
  } else {
    await db.lead.update({ where: { id }, data: { updatedAt: now } });
  }

  await logAudit({
    actorName: user.name,
    action: body.direction === "OUT" ? "MESSAGE_SENT" : "NOTE_ADDED",
    entity: "Lead",
    entityId: id,
    detail: body.direction === "OUT" ? `Kirim via ${REPLY_CHANNEL_LABEL[outChannel as ChannelType]} ke ${destination} — ${body.body.slice(0, 60)}` : body.body.slice(0, 80),
  });

  const message: LeadMessageDTO = {
    id: msg.id,
    direction: msg.direction as LeadMessageDTO["direction"],
    channel: msg.channel,
    body: msg.body,
    senderName: msg.senderName,
    createdAt: msg.createdAt.toISOString(),
    destination,
  };

  return NextResponse.json({ message }, { status: 201 });
}
