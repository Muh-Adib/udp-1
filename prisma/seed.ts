import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "crypto";

const db = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

async function main() {
  console.log("Seeding Grupa Kreasi CRM...");

  // Wipe urut
  await db.auditLog.deleteMany();
  await db.notification.deleteMany();
  await db.leadMessage.deleteMany();
  await db.lead.deleteMany();
  await db.contact.deleteMany();
  await db.user.deleteMany();
  await db.company.deleteMany();
  await db.channelConfig.deleteMany();
  await db.appSetting.deleteMany();

  // Perusahaan klien
  const ptMaju = await db.company.create({ data: { name: "PT Maju Bersama Nusantara", email: "procurement@majubersama.co.id", phone: "0215567788" } });
  const kopiKita = await db.company.create({ data: { name: "Kopi Kita Group", email: "marketing@kopikita.id" } });

  // Users
  await db.user.createMany({
    data: [
      { name: "Andra Wijaya", email: "owner@grupakreasi.id", passwordHash: hashPassword("owner123"), role: "OWNER" },
      { name: "Sinta Maharani", email: "manager@grupakreasi.id", passwordHash: hashPassword("manager123"), role: "MANAGER" },
      { name: "Dewi Anggraini", email: "marketing@grupakreasi.id", passwordHash: hashPassword("marketing123"), role: "MARKETER" },
      { name: "Rizky Hakim", email: "marketing2@grupakreasi.id", passwordHash: hashPassword("marketing123"), role: "MARKETER" },
      { name: "Putri Larasati", email: "finance@grupakreasi.id", passwordHash: hashPassword("finance123"), role: "FINANCE" },
      { name: "Bapak Hendra (Klien)", email: "klien@majubersama.co.id", passwordHash: hashPassword("klien123"), role: "CLIENT", companyId: ptMaju.id },
      { name: "Bu Ratna (Klien)", email: "klien@kopikita.id", passwordHash: hashPassword("klien123"), role: "CLIENT", companyId: kopiKita.id },
    ],
  });

  const dewi = await db.user.findFirst({ where: { email: "marketing@grupakreasi.id" } });
  const rizky = await db.user.findFirst({ where: { email: "marketing2@grupakreasi.id" } });

  // Konfigurasi kanal
  await db.channelConfig.createMany({
    data: [
      {
        type: "whatsapp",
        name: "WhatsApp Business",
        enabled: true,
        configJson: JSON.stringify({ displayName: "Grupa Kreasi WA Bisnis", phoneNumber: "+62 811-2200-345", phoneNumberId: "118234567890123", accessToken: "EAAG-demo-token-xxxx", apiVersion: "v21.0" }),
        webhookSecret: randomBytes(12).toString("hex"),
      },
      {
        type: "email",
        name: "Email Inquiry",
        enabled: true,
        configJson: JSON.stringify({ displayName: "Sales & Inquiry Grupa Kreasi", inboundAddress: "leads@grupakreasi.id", forwardingRule: "Forward semua ke webhook CRM", smtpHost: "smtp.grupakreasi.id", smtpUser: "crm@grupakreasi.id" }),
        webhookSecret: randomBytes(12).toString("hex"),
      },
      {
        type: "instagram",
        name: "Instagram DM",
        enabled: false,
        configJson: JSON.stringify({ displayName: "DM Grupa Kreasi", igUsernames: "@unimasi_id, @segiatech, @erfomultimedia, @unicamstudio", igAccountId: "", accessToken: "" }),
        webhookSecret: randomBytes(12).toString("hex"),
      },
      {
        type: "web",
        name: "Form Kontak Web",
        enabled: true,
        configJson: JSON.stringify({ displayName: "Form Website grupakreasi.id", siteUrls: "https://grupakreasi.id, https://unimasi.id", defaultBrand: "unimasi" }),
        apiKey: `gk_${randomBytes(16).toString("hex")}`,
        webhookSecret: randomBytes(12).toString("hex"),
      },
    ],
  });

  await db.appSetting.create({ data: { key: "firstResponseSlaHours", value: "2" } });

  // Kontak + lead contoh
  const now = Date.now();
  const mk = (d: number) => new Date(now - d * 60 * 60 * 1000);

  const c1 = await db.contact.create({ data: { name: "Rangga Prasetyo", phone: "6281324457788", source: "whatsapp" } });
  const c2 = await db.contact.create({ data: { name: "Melisa Tanujaya", email: "melisa.tanjaya@pt-sinarjaya.co.id", source: "email" } });
  const c3 = await db.contact.create({ data: { name: "dinda.artworld", igUsername: "dinda.artworld", source: "instagram" } });
  const c4 = await db.contact.create({ data: { name: "Budi Santoso", email: "budi.santoso@gmail.com", phone: "6281299007171", source: "web", companyId: kopiKita.id } });
  const c5 = await db.contact.create({ data: { name: "Hendra Gunawan", email: "hendra@majubersama.co.id", phone: "62811772233", source: "email", companyId: ptMaju.id } });

  const l1 = await db.lead.create({
    data: {
      code: "LD-000001", subject: "Pembuatan website company profile", brand: "unimasi", channel: "whatsapp",
      status: "FOLLOW_UP", score: 65, contactId: c1.id, assigneeId: dewi?.id, firstInAt: mk(30), firstOutAt: mk(28),
      sourceRef: "+62 811-2200-345",
    },
  });
  await db.leadMessage.createMany({
    data: [
      { leadId: l1.id, direction: "IN", channel: "whatsapp", body: "Halo, saya mau tanya untuk pembuatan website company profile perusahaan kami. Estimasi budget berapa ya?", senderName: "Rangga Prasetyo", createdAt: mk(30) },
      { leadId: l1.id, direction: "OUT", channel: "whatsapp", body: "Selamat siang Pak Rangga! Terima kasih sudah menghubungi Unimasi. Untuk company profile kami punya paket mulai 15 juta. Boleh tahu kebutuhan halaman & fiturnya?", senderName: "Dewi Anggraini", createdAt: mk(28) },
      { leadId: l1.id, direction: "IN", channel: "whatsapp", body: "Kira-kira 5-7 halaman, ada katalog produk juga. Kalau paket yang 15 juta termasuk maintenance?", senderName: "Rangga Prasetyo", createdAt: mk(6) },
    ],
  });

  const l2 = await db.lead.create({
    data: {
      code: "LD-000002", subject: "Redesign website corporate & SEO bulanan", brand: "segia", channel: "email",
      status: "QUOTED", score: 80, contactId: c2.id, assigneeId: rizky?.id, firstInAt: mk(52), firstOutAt: mk(49),
      sourceRef: "leads@grupakreasi.id",
    },
  });
  await db.leadMessage.createMany({
    data: [
      { leadId: l2.id, direction: "IN", channel: "email", body: "Selamat pagi Tim Grupa Kreasi,\n\nKami PT Sinar Jaya mencari vendor untuk redesign website corporate & SEO bulanan. Mohon kirim company profile dan portofolio.\n\nTerima kasih,\nMelisa", senderName: "Melisa Tanujaya", createdAt: mk(52) },
      { leadId: l2.id, direction: "OUT", channel: "email", body: "Selamat pagi Bu Melisa,\n\nTerima kasih atas ketertarikannya. Kami kirimkan portofolio & studi kasus SEO kami untuk 3 klien FMCG. Apakah minggu ini bisa jadwalkan meeting online 30 menit?\n\nSalam,\nRizky", senderName: "Rizky Hakim", createdAt: mk(49) },
      { leadId: l2.id, direction: "OUT", channel: "internal", body: "Penawaran harga dikirim via email, menunggu konfirmasi procurement. Follow up H+2.", senderName: "Rizky Hakim", createdAt: mk(20) },
    ],
  });

  const l3 = await db.lead.create({
    data: {
      code: "LD-000003", subject: "Rebranding brand skincare", brand: "unicam", channel: "instagram",
      status: "NEW", score: 55, contactId: c3.id, firstInAt: mk(3),
      sourceRef: "@unicamstudio",
    },
  });
  await db.leadMessage.createMany({
    data: [
      { leadId: l3.id, direction: "IN", channel: "instagram", body: "Hi kak, DM ya! Liat portfolio kalian di feed, keren banget. Untuk rebranding brand skincare kami bisa chat more?", senderName: "dinda.artworld", createdAt: mk(3) },
    ],
  });

  const l4 = await db.lead.create({
    data: {
      code: "LD-000004", subject: "Katalog digital 200 SKU", brand: "erfo", channel: "web",
      status: "NEW", score: 45, contactId: c4.id, firstInAt: mk(9),
      sourceRef: "https://grupakreasi.id/layanan",
    },
  });
  await db.leadMessage.createMany({
    data: [
      { leadId: l4.id, direction: "IN", channel: "web", body: "Kami membutuhkan penawaran untuk pembuatan katalog digital produk kami (sekitar 200 SKU).", senderName: "Budi Santoso", createdAt: mk(9) },
    ],
  });

  const l5 = await db.lead.create({
    data: {
      code: "LD-000005", subject: "Penawaran konten sosial media 3 bulan", brand: "erfo", channel: "email",
      status: "WON", score: 100, contactId: c5.id, companyId: ptMaju.id, assigneeId: dewi?.id, firstInAt: mk(240), firstOutAt: mk(238),
      sourceRef: "leads@grupakreasi.id",
    },
  });
  await db.leadMessage.createMany({
    data: [
      { leadId: l5.id, direction: "IN", channel: "email", body: "Dear team,\n\nKami dari procurement PT Maju Bersama, mohon informasi penawaran untuk pembuatan konten sosial media 3 bulan.\n\nSalam,\nHendra", senderName: "Hendra Gunawan", createdAt: mk(240) },
      { leadId: l5.id, direction: "OUT", channel: "email", body: "Selamat siang Pak Hendra,\n\nBerikut kami lampirkan penawaran paket konten 3 bulan (12 konten feed + 8 reels). Kami siap mulai minggu depan.\n\nSalam,\nDewi", senderName: "Dewi Anggraini", createdAt: mk(238) },
    ],
  });

  // Notifikasi awal
  await db.notification.create({
    data: { role: "MARKETER", title: "Lead baru dari Instagram DM", body: "dinda.artworld — Rebranding brand skincare (Unicam Studio)", type: "NEW_LEAD" },
  });
  await db.notification.create({
    data: { role: "MANAGER", title: "Lead baru dari Form Web", body: "Budi Santoso — Katalog digital 200 SKU (Erfo Multimedia)", type: "NEW_LEAD" },
  });

  await db.auditLog.createMany({
    data: [
      { actorName: "system:seed", action: "SEED", entity: "System", detail: "Data awal CRM dibuat" },
      { actorName: "Andra Wijaya", action: "CHANNEL_ENABLED", entity: "ChannelConfig", entityId: "whatsapp", detail: "WhatsApp Business" },
    ],
  });

  console.log("Seeding selesai ✓");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
