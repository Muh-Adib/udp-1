import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ingestChannelMessage } from "@/lib/lead-ingest";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ type: string }> };

const DEMO_SENDERS: Record<string, { name: string; phone?: string; email?: string; ig?: string; company?: string }> = {
  whatsapp: { name: "Rangga Prasetyo", phone: "+62 813-2445-7788", company: "PT Maju Bersama" },
  email: { name: "Melisa Tanujaya", email: "melisa.tanjaya@pt-sinarjaya.co.id", company: "PT Sinar Jaya" },
  instagram: { name: "dinda.artworld", ig: "@dinda.artworld" },
  web: { name: "Pengunjung Web", email: "budi.santoso@gmail.com", phone: "0812 9900 7171" },
};

const DEMO_BODIES: Record<string, string[]> = {
  whatsapp: [
    "Halo, saya mau tanya untuk pembuatan website company profile perusahaan kami. Estimasi budget berapa ya?",
    "Selamat siang, kami butuh jasa video produksi untuk launch product bulan depan. Bisa diskusi?",
  ],
  email: [
    "Selamat pagi Tim Grupa Kreasi,\n\nKami PT Sinar Jaya mencari vendor untuk redesign website corporate & SEO bulanan. Mohon kirim company profile dan portofolio.\n\nTerima kasih,\nMelisa",
    "Dear team,\n\nKami dari procurement PT Sinar Jaya, mohon informasi penawaran untuk pembuatan konten sosial media 3 bulan.\n\nSalam,\nMelisa Tanujaya",
  ],
  instagram: [
    "Hi kak, DM ya! Liat portfolio kalian di feed, keren banget. Untuk rebranding brand skincare kami bisa chat more?",
    "Kak, mau tanya harga pakai jasa foto produk per session berapa ya?",
  ],
  web: [
    "Halo, saya tertarik dengan layanan pengembangan aplikasi mobile. Mohon dihubungi kembali. Terima kasih.",
    "Kami membutuhkan penawaran untuk pembuatan katalog digital produk kami (sekitar 200 SKU).",
  ],
};

/** Simulasi satu pesan masuk dari kanal — untuk menguji alur tanpa provider eksternal. */
export async function POST(_req: Request, ctx: Ctx) {
  const user = await requireAuth(["OWNER", "MANAGER", "MARKETER"]);
  if (!user) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const { type } = await ctx.params;
  if (!["whatsapp", "email", "instagram", "web"].includes(type)) {
    return NextResponse.json({ error: "Jenis kanal tidak valid" }, { status: 400 });
  }

  const channel = type as keyof typeof DEMO_SENDERS;
  const cfg = await db.channelConfig.findUnique({ where: { type } });
  if (!cfg) return NextResponse.json({ error: "Kanal belum dikonfigurasi" }, { status: 404 });

  let config: Record<string, string> = {};
  try {
    config = JSON.parse(cfg.configJson || "{}");
  } catch {
    config = {};
  }

  const sender = DEMO_SENDERS[channel];
  const bodies = DEMO_BODIES[channel];
  const body = bodies[Math.floor(Math.random() * bodies.length)];

  const brandPool = ["unimasi", "segia", "erfo", "unicam"];
  const brand = config.defaultBrand && Math.random() > 0.5 ? config.defaultBrand : brandPool[Math.floor(Math.random() * brandPool.length)];

  const result = await ingestChannelMessage({
    channel: type as import("@/lib/crm-types").ChannelType,
    name: sender.name,
    phone: sender.phone ?? null,
    email: sender.email ?? null,
    igUsername: sender.ig ?? null,
    company: sender.company ?? null,
    body,
    subject: channel === "email" ? bodies[0].split("\n")[0].slice(0, 60) : null,
    brand,
    sourceRef: channel === "web" ? config.siteUrls?.split(",")[0]?.trim() ?? "https://grupakreasi.id" : null,
    externalId: `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  });

  await logAudit({ actorName: user.name, action: "CHANNEL_TEST", entity: "ChannelConfig", entityId: type, detail: `Lead ${result.leadCode}` });

  return NextResponse.json({ ok: true, ...result, body });
}
