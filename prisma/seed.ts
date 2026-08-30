import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "crypto";

const db = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

function ago(days: number, hours = 0): Date {
  return new Date(Date.now() - days * 86400000 - hours * 3600000);
}

async function main() {
  console.log("Seeding UDP CRM — PT. Unicam Digital Pictvres...");

  // Wipe urut
  await db.auditLog.deleteMany();
  await db.notification.deleteMany();
  await db.payment.deleteMany();
  await db.invoice.deleteMany();
  await db.milestone.deleteMany();
  await db.project.deleteMany();
  await db.quotation.deleteMany();
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
  const sinarJaya = await db.company.create({ data: { name: "PT Sinar Jaya Agro", email: "ga@pt-sinarjaya.co.id" } });

  // Users (domain UDP)
  await db.user.createMany({
    data: [
      { name: "Andra Wijaya", email: "owner@udp.co.id", passwordHash: hashPassword("owner123"), role: "OWNER" },
      { name: "Sinta Maharani", email: "manager@udp.co.id", passwordHash: hashPassword("manager123"), role: "MANAGER" },
      { name: "Dewi Anggraini", email: "marketing@udp.co.id", passwordHash: hashPassword("marketing123"), role: "MARKETER" },
      { name: "Rizky Hakim", email: "marketing2@udp.co.id", passwordHash: hashPassword("marketing123"), role: "MARKETER" },
      { name: "Putri Larasati", email: "finance@udp.co.id", passwordHash: hashPassword("finance123"), role: "FINANCE" },
      { name: "Bapak Hendra (Klien)", email: "klien@majubersama.co.id", passwordHash: hashPassword("klien123"), role: "CLIENT", companyId: ptMaju.id },
      { name: "Bu Ratna (Klien)", email: "klien@kopikita.id", passwordHash: hashPassword("klien123"), role: "CLIENT", companyId: kopiKita.id },
    ],
  });

  const dewi = await db.user.findFirst({ where: { email: "marketing@udp.co.id" } });
  const rizky = await db.user.findFirst({ where: { email: "marketing2@udp.co.id" } });

  // Konfigurasi kanal
  await db.channelConfig.createMany({
    data: [
      {
        type: "whatsapp",
        name: "WhatsApp Business",
        enabled: true,
        configJson: JSON.stringify({ displayName: "UDP WA Bisnis", phoneNumber: "+62 811-2200-345", phoneNumberId: "118234567890123", accessToken: "EAAG-demo-token-xxxx", apiVersion: "v21.0" }),
        webhookSecret: randomBytes(12).toString("hex"),
      },
      {
        type: "email",
        name: "Email Inquiry",
        enabled: true,
        configJson: JSON.stringify({ displayName: "Sales & Inquiry UDP", inboundAddress: "leads@udp.co.id", forwardingRule: "Forward semua ke webhook CRM", smtpHost: "smtp.udp.co.id", smtpUser: "crm@udp.co.id" }),
        webhookSecret: randomBytes(12).toString("hex"),
      },
      {
        type: "instagram",
        name: "Instagram DM",
        enabled: false,
        configJson: JSON.stringify({ displayName: "DM UDP", igUsernames: "@unimasi_id, @segiatech, @erfomultimedia, @unicamstudio", igAccountId: "", accessToken: "" }),
        webhookSecret: randomBytes(12).toString("hex"),
      },
      {
        type: "web",
        name: "Form Kontak Web",
        enabled: true,
        configJson: JSON.stringify({ displayName: "Form Website udp.co.id", siteUrls: "https://udp.co.id, https://unimasi.id", defaultBrand: "unimasi" }),
        apiKey: `udp_${randomBytes(16).toString("hex")}`,
        webhookSecret: randomBytes(12).toString("hex"),
      },
    ],
  });

  await db.appSetting.create({ data: { key: "firstResponseSlaHours", value: "2" } });

  // ===== Kontak =====
  const c1 = await db.contact.create({ data: { name: "Rangga Prasetyo", phone: "6281324457788", source: "whatsapp" } });
  const c2 = await db.contact.create({ data: { name: "Melisa Tanujaya", email: "melisa.tanjaya@pt-sinarjaya.co.id", source: "email", companyId: sinarJaya.id } });
  const c3 = await db.contact.create({ data: { name: "dinda.artworld", igUsername: "dinda.artworld", source: "instagram" } });
  const c4 = await db.contact.create({ data: { name: "Budi Santoso", email: "budi.santoso@gmail.com", phone: "6281299007171", source: "web", companyId: kopiKita.id } });
  const c5 = await db.contact.create({ data: { name: "Hendra Gunawan", email: "hendra@majubersama.co.id", phone: "62811772233", source: "email", companyId: ptMaju.id } });
  const c6 = await db.contact.create({ data: { name: "Ratna Sari", email: "ratna@kopikita.id", phone: "6281777654321", source: "whatsapp", companyId: kopiKita.id } });
  const c7 = await db.contact.create({ data: { name: "Yoga Pratama", email: "yoga@tokoselalu.id", source: "web" } });

  // ===== Leads (funnel lengkap) =====
  const l1 = await db.lead.create({
    data: {
      code: "LD-000001", subject: "Pembuatan website company profile", brand: "unimasi", channel: "whatsapp",
      status: "FOLLOW_UP", stage: "QUALIFIED", estValue: 15000000, score: 65, contactId: c1.id, assigneeId: dewi?.id,
      firstInAt: ago(1, 6), firstOutAt: ago(1, 4), sourceRef: "+62 811-2200-345",
    },
  });
  await db.leadMessage.createMany({
    data: [
      { leadId: l1.id, direction: "IN", channel: "whatsapp", body: "Halo, saya mau tanya untuk pembuatan website company profile perusahaan kami. Estimasi budget berapa ya?", senderName: "Rangga Prasetyo", createdAt: ago(1, 6) },
      { leadId: l1.id, direction: "OUT", channel: "whatsapp", body: "Selamat siang Pak Rangga! Terima kasih sudah menghubungi UDP. Untuk company profile kami punya paket mulai 15 juta. Boleh tahu kebutuhan halaman & fiturnya?", senderName: "Dewi Anggraini", createdAt: ago(1, 4) },
      { leadId: l1.id, direction: "IN", channel: "whatsapp", body: "Kira-kira 5-7 halaman, ada katalog produk juga. Kalau paket yang 15 juta termasuk maintenance?", senderName: "Rangga Prasetyo", createdAt: ago(0, 5) },
    ],
  });

  const l2 = await db.lead.create({
    data: {
      code: "LD-000002", subject: "Redesign website corporate & SEO bulanan", brand: "segia", channel: "email",
      status: "QUOTED", stage: "PROPOSAL", estValue: 45000000, score: 80, contactId: c2.id, assigneeId: rizky?.id,
      firstInAt: ago(6), firstOutAt: ago(5, 22), sourceRef: "leads@udp.co.id",
    },
  });
  await db.leadMessage.createMany({
    data: [
      { leadId: l2.id, direction: "IN", channel: "email", body: "Selamat pagi Tim UDP,\n\nKami PT Sinar Jaya mencari vendor untuk redesign website corporate & SEO bulanan. Mohon kirim company profile dan portofolio.\n\nTerima kasih,\nMelisa", senderName: "Melisa Tanujaya", createdAt: ago(6) },
      { leadId: l2.id, direction: "OUT", channel: "email", body: "Selamat pagi Bu Melisa,\n\nTerima kasih atas ketertarikannya. Kami kirimkan portofolio & studi kasus SEO kami untuk 3 klien FMCG. Apakah minggu ini bisa jadwalkan meeting online 30 menit?\n\nSalam,\nRizky", senderName: "Rizky Hakim", createdAt: ago(5, 22) },
    ],
  });

  const l3 = await db.lead.create({
    data: {
      code: "LD-000003", subject: "Rebranding brand skincare", brand: "unicam", channel: "instagram",
      status: "NEW", stage: "NEW", estValue: 25000000, score: 55, contactId: c3.id, firstInAt: ago(0, 3), sourceRef: "@unicamstudio",
    },
  });
  await db.leadMessage.create({
    data: { leadId: l3.id, direction: "IN", channel: "instagram", body: "Hi kak, DM ya! Liat portfolio kalian di feed, keren banget. Untuk rebranding brand skincare kami bisa chat more?", senderName: "dinda.artworld", createdAt: ago(0, 3) },
  });

  const l4 = await db.lead.create({
    data: {
      code: "LD-000004", subject: "Katalog digital 200 SKU", brand: "erfo", channel: "web",
      status: "NEW", stage: "NEW", estValue: 12000000, score: 45, contactId: c4.id, firstInAt: ago(0, 9), sourceRef: "https://udp.co.id/layanan",
    },
  });
  await db.leadMessage.create({
    data: { leadId: l4.id, direction: "IN", channel: "web", body: "Kami membutuhkan penawaran untuk pembuatan katalog digital produk kami (sekitar 200 SKU).", senderName: "Budi Santoso", createdAt: ago(0, 9) },
  });

  // WON + sudah jadi proyek selesai (2 bulan lalu)
  const l5 = await db.lead.create({
    data: {
      code: "LD-000005", subject: "Produksi konten sosial media 3 bulan", brand: "erfo", channel: "email",
      status: "WON", stage: "WON", estValue: 39960000, score: 100, contactId: c5.id, companyId: ptMaju.id, assigneeId: dewi?.id,
      firstInAt: ago(70), firstOutAt: ago(69, 20), sourceRef: "leads@udp.co.id",
    },
  });
  await db.leadMessage.createMany({
    data: [
      { leadId: l5.id, direction: "IN", channel: "email", body: "Dear team,\n\nKami dari procurement PT Maju Bersama, mohon informasi penawaran untuk pembuatan konten sosial media 3 bulan.\n\nSalam,\nHendra", senderName: "Hendra Gunawan", createdAt: ago(70) },
      { leadId: l5.id, direction: "OUT", channel: "email", body: "Selamat siang Pak Hendra,\n\nBerikut kami lampirkan penawaran paket konten 3 bulan (12 konten feed + 8 reels). Kami siap mulai minggu depan.\n\nSalam,\nDewi", senderName: "Dewi Anggraini", createdAt: ago(69, 20) },
    ],
  });

  const l6 = await db.lead.create({
    data: {
      code: "LD-000006", subject: "Video company profile & drone shoot", brand: "unicam", channel: "whatsapp",
      status: "QUOTED", stage: "NEGOTIATION", estValue: 42180000, score: 85, contactId: c2.id, companyId: sinarJaya.id, assigneeId: rizky?.id,
      firstInAt: ago(12), firstOutAt: ago(12, -1), sourceRef: "+62 811-2200-345",
    },
  });
  await db.leadMessage.createMany({
    data: [
      { leadId: l6.id, direction: "IN", channel: "whatsapp", body: "Pak Rizky, penawaran videonya sudah kami baca. Bisa diskon sedikit kalau ambil paket drone + editing 4K?", senderName: "Melisa Tanujaya", createdAt: ago(2) },
      { leadId: l6.id, direction: "OUT", channel: "whatsapp", body: "Bu Melisa, untuk paket drone + 4K kami bisa kasih diskon 5% jika PO terbit minggu ini ya. Tim produksi kami slotnya tinggal 2 jadwal bulan ini.", senderName: "Rizky Hakim", createdAt: ago(1, 20) },
    ],
  });

  const l7 = await db.lead.create({
    data: {
      code: "LD-000007", subject: "Brand activation & booth Kopi Kita", brand: "erfo", channel: "whatsapp",
      status: "WON", stage: "WON", estValue: 30525000, score: 100, contactId: c6.id, companyId: kopiKita.id, assigneeId: dewi?.id,
      firstInAt: ago(35), firstOutAt: ago(34, 22), sourceRef: "+62 811-2200-345",
    },
  });
  await db.leadMessage.createMany({
    data: [
      { leadId: l7.id, direction: "IN", channel: "whatsapp", body: "Kak Dewi, kami butuh booth brand activation untuk 3 kota. Budget sekitar 30 juta bisa?", senderName: "Ratna Sari", createdAt: ago(35) },
      { leadId: l7.id, direction: "OUT", channel: "whatsapp", body: "Bu Ratna, bisa! Kami kirim proposal booth modular 3 kota dengan desain custom. Minggu depan bisa mulai produksi.", senderName: "Dewi Anggraini", createdAt: ago(34, 22) },
    ],
  });

  const l8 = await db.lead.create({
    data: {
      code: "LD-000008", subject: "Jasa desain kemasan produk", brand: "unicam", channel: "email",
      status: "LOST", stage: "LOST", estValue: 8000000, score: 40, contactId: c7.id, lostReason: "Kompetitor",
      firstInAt: ago(20), firstOutAt: ago(19, 18), sourceRef: "leads@udp.co.id",
    },
  });
  await db.leadMessage.createMany({
    data: [
      { leadId: l8.id, direction: "IN", channel: "email", body: "Halo, mau tanya jasa desain kemasan untuk produk kami (3 varian SKUs).", senderName: "Yoga Pratama", createdAt: ago(20) },
      { leadId: l8.id, direction: "NOTE", channel: "internal", body: "Klien memilih kompetitor karena harga lebih murah 30%. Tawarkan paket retainer untuk peluang berikutnya.", senderName: "Rizky Hakim", createdAt: ago(15) },
    ],
  });

  const l9 = await db.lead.create({
    data: {
      code: "LD-000009", subject: "SEO & Google Ads untuk e-commerce", brand: "segia", channel: "web",
      status: "NEW", stage: "NEW", estValue: 18000000, score: 50, contactId: c4.id, companyId: kopiKita.id, firstInAt: ago(0, 2), sourceRef: "https://udp.co.id/layanan/seo",
    },
  });
  await db.leadMessage.create({
    data: { leadId: l9.id, direction: "IN", channel: "web", body: "Toko online kami butuh optimasi SEO dan ads bulanan. Mohon penawarannya.", senderName: "Budi Santoso", createdAt: ago(0, 2) },
  });

  // ===== Penawaran =====
  await db.quotation.create({
    data: {
      number: "QT-0001", leadId: l2.id, brand: "segia", title: "Redesign Website Corporate + SEO Bulanan (6 bulan)",
      itemsJson: JSON.stringify([
        { desc: "Redesign website corporate (12 halaman)", qty: 1, price: 25000000 },
        { desc: "SEO bulanan (6 bulan)", qty: 6, price: 2500000 },
        { desc: "Copywriting & foto produk", qty: 1, price: 8000000 },
      ]),
      subtotal: 48000000, discountPct: 5, ppnPct: 11, grandTotal: 50724000,
      status: "SENT", sentAt: ago(4), notes: "Diskon 5% kontrak 6 bulan.",
    },
  });

  const qt2 = await db.quotation.create({
    data: {
      number: "QT-0002", leadId: l5.id, brand: "erfo", title: "Produksi Konten Sosial Media 3 Bulan",
      itemsJson: JSON.stringify([
        { desc: "Konten feed (desain + copywriting)", qty: 12, price: 1800000 },
        { desc: "Reels/video pendek", qty: 8, price: 2200000 },
        { desc: "Monthly report & analitik", qty: 3, price: 600000 },
      ]),
      subtotal: 39960000, discountPct: 0, ppnPct: 11, grandTotal: 44355600,
      status: "APPROVED", sentAt: ago(65), decidedAt: ago(60), notes: "Persetujuan via email procurement.",
    },
  });

  await db.quotation.create({
    data: {
      number: "QT-0003", leadId: l6.id, brand: "unicam", title: "Video Company Profile + Drone Shoot 4K",
      itemsJson: JSON.stringify([
        { desc: "Video company profile (3 menit, 4K)", qty: 1, price: 28000000 },
        { desc: "Drone shoot lokasi", qty: 1, price: 8000000 },
        { desc: "Editing + sound design", qty: 1, price: 12000000 },
      ]),
      subtotal: 48000000, discountPct: 10, ppnPct: 11, grandTotal: 47952000,
      status: "SENT", sentAt: ago(3), notes: "Diskon 10% penawaran intro klien baru.",
    },
  });

  const qt4 = await db.quotation.create({
    data: {
      number: "QT-0004", leadId: l7.id, brand: "erfo", title: "Brand Activation Booth 3 Kota",
      itemsJson: JSON.stringify([
        { desc: "Desain & produksi booth modular", qty: 3, price: 7500000 },
        { desc: "Crew & koordinasi event", qty: 3, price: 1500000 },
        { desc: "Dokumentasi foto/video", qty: 3, price: 750000 },
      ]),
      subtotal: 29250000, discountPct: 0, ppnPct: 11, grandTotal: 32467500,
      status: "APPROVED", sentAt: ago(30), decidedAt: ago(28),
    },
  });

  // ===== Proyek produksi =====
  const prj1 = await db.project.create({
    data: {
      code: "PRJ-0001", name: "Produksi Konten Sosial Media 3 Bulan", brand: "erfo",
      companyId: ptMaju.id, leadId: l5.id, quotationId: qt2.id,
      status: "DONE", progress: 100, budget: 44355600, managerName: "Sinta Maharani",
      startDate: ago(58), dueDate: ago(2),
    },
  });
  const prj1ms = [
    { title: "Brief & Konsep", orderIdx: 1, weight: 20 },
    { title: "Produksi Awal", orderIdx: 2, weight: 30 },
    { title: "Review & Revisi", orderIdx: 3, weight: 20 },
    { title: "Finalisasi", orderIdx: 4, weight: 20 },
    { title: "Serah Terima", orderIdx: 5, weight: 10 },
  ];
  for (const m of prj1ms) {
    await db.milestone.create({ data: { projectId: prj1.id, ...m, status: "DONE", dueDate: ago(10), doneAt: ago(12) } });
  }

  const prj2 = await db.project.create({
    data: {
      code: "PRJ-0002", name: "Brand Activation Booth 3 Kota", brand: "erfo",
      companyId: kopiKita.id, leadId: l7.id, quotationId: qt4.id,
      status: "IN_PROGRESS", progress: 50, budget: 32467500, managerName: "Dewi Anggraini",
      startDate: ago(25), dueDate: new Date(Date.now() + 5 * 86400000),
    },
  });
  await db.milestone.create({ data: { projectId: prj2.id, title: "Brief & Konsep", orderIdx: 1, weight: 20, status: "DONE", dueDate: ago(20), doneAt: ago(21) } });
  await db.milestone.create({ data: { projectId: prj2.id, title: "Produksi Awal", orderIdx: 2, weight: 30, status: "DONE", dueDate: ago(10), doneAt: ago(11) } });
  await db.milestone.create({ data: { projectId: prj2.id, title: "Review & Revisi", orderIdx: 3, weight: 20, status: "IN_PROGRESS", dueDate: ago(-3) } });
  await db.milestone.create({ data: { projectId: prj2.id, title: "Finalisasi", orderIdx: 4, weight: 20, status: "PENDING", dueDate: ago(-5) } });
  await db.milestone.create({ data: { projectId: prj2.id, title: "Serah Terima", orderIdx: 5, weight: 10, status: "PENDING", dueDate: ago(-7) } });

  // ===== Invoice & pembayaran (tersebar untuk chart 6 bulan) =====
  const inv1 = await db.invoice.create({
    data: {
      number: "INV-0001", projectId: prj1.id, quotationId: qt2.id, leadId: l5.id, brand: "erfo",
      title: "DP 50% — Produksi Konten Sosial Media 3 Bulan",
      amount: 19980000, ppnPct: 11, grandTotal: 22177800, dueDate: ago(44), status: "PAID", issuedAt: ago(58),
    },
  });
  await db.payment.create({ data: { invoiceId: inv1.id, amount: 22177800, method: "TRANSFER", note: "Transfer procurement PT Maju Bersama", paidAt: ago(55) } });

  const inv2 = await db.invoice.create({
    data: {
      number: "INV-0002", projectId: prj1.id, quotationId: qt2.id, leadId: l5.id, brand: "erfo",
      title: "Pelunasan — Produksi Konten Sosial Media 3 Bulan",
      amount: 19980000, ppnPct: 11, grandTotal: 22177800, dueDate: ago(8), status: "PAID", issuedAt: ago(20),
    },
  });
  await db.payment.create({ data: { invoiceId: inv2.id, amount: 22177800, method: "TRANSFER", note: "Pelunasan akhir kontrak", paidAt: ago(10) } });

  const inv3 = await db.invoice.create({
    data: {
      number: "INV-0003", projectId: prj2.id, quotationId: qt4.id, leadId: l7.id, brand: "erfo",
      title: "DP 50% — Brand Activation Booth 3 Kota",
      amount: 14625000, ppnPct: 11, grandTotal: 16233750, dueDate: ago(11), status: "PAID", issuedAt: ago(25),
    },
  });
  await db.payment.create({ data: { invoiceId: inv3.id, amount: 16233750, method: "TRANSFER", note: "DP Kopi Kita Group", paidAt: ago(23) } });

  await db.invoice.create({
    data: {
      number: "INV-0004", projectId: prj2.id, quotationId: qt4.id, leadId: l7.id, brand: "erfo",
      title: "Pelunasan — Brand Activation Booth 3 Kota",
      amount: 14625000, ppnPct: 11, grandTotal: 16233750, dueDate: new Date(Date.now() + 7 * 86400000), status: "UNPAID", issuedAt: ago(3),
    },
  });

  await db.invoice.create({
    data: {
      number: "INV-0005", brand: "unimasi",
      title: "Maintenance Website — Unimasi (Kuartal)",
      amount: 4500000, ppnPct: 11, grandTotal: 4995000, dueDate: ago(9), status: "UNPAID", issuedAt: ago(39),
    },
  });

  // ===== Notifikasi =====
  await db.notification.createMany({
    data: [
      { role: "MARKETER", title: "Lead baru dari Instagram DM", body: "dinda.artworld — Rebranding brand skincare (Unicam Studio)", type: "NEW_LEAD" },
      { role: "MANAGER", title: "Lead baru dari Form Web", body: "Budi Santoso — Katalog digital 200 SKU (Erfo Multimedia)", type: "NEW_LEAD" },
      { role: "FINANCE", title: "Invoice INV-0004 terbit", body: "Pelunasan — Brand Activation Booth 3 Kota — Rp 16.233.750", type: "SYSTEM" },
      { role: "MANAGER", title: "Milestone Review & Revisi berjalan", body: "PRJ-0002 Brand Activation Booth 3 Kota — progress 50%", type: "SYSTEM" },
    ],
  });

  await db.auditLog.createMany({
    data: [
      { actorName: "system:seed", action: "SEED", entity: "System", detail: "Data awal UDP CRM dibuat" },
      { actorName: "Andra Wijaya", action: "CHANNEL_ENABLED", entity: "ChannelConfig", entityId: "whatsapp", detail: "WhatsApp Business" },
      { actorName: "Putri Larasati", action: "QUOTATION_APPROVED", entity: "Quotation", entityId: qt2.id, detail: "QT-0002 → PRJ-0001 + INV-0001" },
      { actorName: "Putri Larasati", action: "PAYMENT_RECORDED", entity: "Invoice", entityId: inv1.id, detail: "INV-0001 +22.177.800 (PAID)" },
    ],
  });

  // Backdate updatedAt untuk data historis (chart bulanan) — kolom @updatedAt tidak bisa diisi via create/update
  await db.$executeRawUnsafe(`UPDATE "Lead" SET "updatedAt" = '${ago(60).toISOString()}' WHERE "code" = 'LD-000005'`);
  await db.$executeRawUnsafe(`UPDATE "Lead" SET "updatedAt" = '${ago(27).toISOString()}' WHERE "code" = 'LD-000007'`);
  await db.$executeRawUnsafe(`UPDATE "Lead" SET "updatedAt" = '${ago(14).toISOString()}' WHERE "code" = 'LD-000008'`);
  await db.$executeRawUnsafe(`UPDATE "Project" SET "updatedAt" = '${ago(10).toISOString()}' WHERE "code" = 'PRJ-0001'`);
  await db.$executeRawUnsafe(`UPDATE "Quotation" SET "updatedAt" = '${ago(60).toISOString()}' WHERE "number" = 'QT-0002'`);

  console.log("Seeding selesai ✓ (UDP — PT. Unicam Digital Pictvres)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
