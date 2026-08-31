/* Seed data untuk Multi-Brand CRM — Grupa Kreasi Media */
import { PrismaClient, Prisma } from '@prisma/client'

const db = new PrismaClient()

const d = (days: number, hour = 9, min = 0) => {
  const dt = new Date()
  dt.setDate(dt.getDate() + days)
  dt.setHours(hour, min, 0, 0)
  return dt
}

const STAGES = ['NEW','CONTACT_ATTEMPTED','CONNECTED','QUALIFIED','DISCOVERY','ESTIMATION','PROPOSAL_SENT','NEGOTIATION','VERBAL_AGREEMENT','WON','LOST','NURTURE'] as const

async function main() {
  console.log('🌱 Seeding Multi-Brand CRM...')

  // clean (order matters)
  await db.auditLog.deleteMany()
  await db.payment.deleteMany()
  await db.invoice.deleteMany()
  await db.quotationItem.deleteMany()
  await db.quotation.deleteMany()
  await db.estimationItem.deleteMany()
  await db.estimation.deleteMany()
  await db.brief.deleteMany()
  await db.milestone.deleteMany()
  await db.project.deleteMany()
  await db.followUpTemplate.deleteMany()
  await db.note.deleteMany()
  await db.task.deleteMany()
  await db.interaction.deleteMany()
  await db.opportunity.deleteMany()
  await db.contact.deleteMany()
  await db.company.deleteMany()
  await db.service.deleteMany()
  await db.brand.deleteMany()
  await db.userBrandAccess.deleteMany()
  await db.user.deleteMany()

  /* ---------------- USERS ---------------- */
  const [ratna, bambang, dewi, fajar, sari, andi] = await Promise.all([
    db.user.create({ data: { email: 'ratna@grupakreasi.id', name: 'Ratna Wijaya', role: 'SUPER_ADMIN', title: 'Super Admin', avatarColor: '#0ea5a4' } }),
    db.user.create({ data: { email: 'bambang@grupakreasi.id', name: 'Bambang Sutrisno', role: 'DIREKTUR', title: 'Direktur Utama', avatarColor: '#f59e0b' } }),
    db.user.create({ data: { email: 'dewi@grupakreasi.id', name: 'Dewi Lestari', role: 'MARKETING', title: 'Marketing Lead', avatarColor: '#8b5cf6' } }),
    db.user.create({ data: { email: 'fajar@grupakreasi.id', name: 'Fajar Pratama', role: 'MARKETING', title: 'Marketing Executive', avatarColor: '#f43f5e' } }),
    db.user.create({ data: { email: 'sari@grupakreasi.id', name: 'Sari Kusuma', role: 'KEUANGAN', title: 'Finance Manager', avatarColor: '#ec4899' } }),
    db.user.create({ data: { email: 'andi@grupakreasi.id', name: 'Andi Mulyana', role: 'PRODUKSI', title: 'Production Manager', avatarColor: '#84cc16' } }),
  ])

  /* ---------------- BRANDS + SERVICES ---------------- */
  const unimasi = await db.brand.create({ data: {
    name: 'Unimasi', slug: 'unimasi', color: '#f59e0b', tagline: 'Animation & Visual Learning Studio',
    description: 'Animasi company profile, pembelajaran, infografis, program/produk, sosialisasi, dan marketing.',
    website: 'https://www.unimasi.com', slaHours: 6, workflowType: 'animation',
  }})
  const segia = await db.brand.create({ data: {
    name: 'Segia Tech', slug: 'segia-tech', color: '#10b981', tagline: 'Digital Product & Growth Agency',
    description: 'Website, SEO, UI/UX, dan produksi konten digital.',
    website: 'https://www.segiatech.com', slaHours: 4, workflowType: 'website',
  }})
  const erfo = await db.brand.create({ data: {
    name: 'Erfo Multimedia', slug: 'erfo-multimedia', color: '#f43f5e', tagline: 'Documentation & Live Production',
    description: 'Foto/video dokumentasi, shooting, live streaming, drone, video AI, dan video 360.',
    website: 'https://www.erfomultimedia.com', slaHours: 3, workflowType: 'video',
  }})
  const unicam = await db.brand.create({ data: {
    name: 'Unicam Studio', slug: 'unicam-studio', color: '#8b5cf6', tagline: 'Creative Media & Immersive Experience',
    description: 'Corporate video, animasi 2D/3D, AI video, AR/VR, virtual tour, immersive experience, projection mapping.',
    website: 'https://www.unicamstudio.com', slaHours: 8, workflowType: 'video',
  }})

  const svc = async (brandId: string, name: string, category: string) =>
    db.service.create({ data: { brandId, name, category } })

  const [sWeb, sLanding, sSeo, sUiux, sContent, sMaint,
    sCpAnim, sElearn, sInfo, sProd, sSos, sMotion,
    sDok, sShooting, sLive, sDrone, sAiVid, sV360,
    sCorpVid, sAnim2d3d, sArvr, sVtour, sProjMap] = await Promise.all([
    svc(segia.id, 'Company Website', 'Web Development'),
    svc(segia.id, 'Landing Page', 'Web Development'),
    svc(segia.id, 'SEO Optimization', 'Digital Growth'),
    svc(segia.id, 'UI/UX Design', 'Design'),
    svc(segia.id, 'Produksi Konten Digital', 'Content'),
    svc(segia.id, 'Web Maintenance', 'Web Development'),
    svc(unimasi.id, 'Company Profile Animation', 'Animation'),
    svc(unimasi.id, 'E-Learning Animation', 'Animation'),
    svc(unimasi.id, 'Infographic Animation', 'Animation'),
    svc(unimasi.id, 'Product/Program Animation', 'Animation'),
    svc(unimasi.id, 'Sosialisasi & Kampanye', 'Animation'),
    svc(unimasi.id, 'Motion Graphics Marketing', 'Animation'),
    svc(erfo.id, 'Dokumentasi Foto/Video', 'Documentation'),
    svc(erfo.id, 'Shooting Iklan', 'Production'),
    svc(erfo.id, 'Live Streaming', 'Live Production'),
    svc(erfo.id, 'Drone Videography', 'Production'),
    svc(erfo.id, 'Video AI', 'Production'),
    svc(erfo.id, 'Video 360', 'Immersive'),
    svc(unicam.id, 'Corporate Video', 'Video Production'),
    svc(unicam.id, 'Animasi 2D/3D', 'Animation'),
    svc(unicam.id, 'AR/VR Experience', 'Immersive'),
    svc(unicam.id, 'Virtual Tour', 'Immersive'),
    svc(unicam.id, 'Projection Mapping', 'Immersive'),
  ])

  await Promise.all([
    db.userBrandAccess.create({ data: { userId: dewi.id, brandId: unimasi.id, canManage: true } }),
    db.userBrandAccess.create({ data: { userId: dewi.id, brandId: unicam.id, canManage: true } }),
    db.userBrandAccess.create({ data: { userId: dewi.id, brandId: segia.id } }),
    db.userBrandAccess.create({ data: { userId: fajar.id, brandId: segia.id, canManage: true } }),
    db.userBrandAccess.create({ data: { userId: fajar.id, brandId: erfo.id, canManage: true } }),
    db.userBrandAccess.create({ data: { userId: fajar.id, brandId: unicam.id } }),
    db.userBrandAccess.create({ data: { userId: bambang.id, brandId: unimasi.id } }),
    db.userBrandAccess.create({ data: { userId: bambang.id, brandId: segia.id } }),
    db.userBrandAccess.create({ data: { userId: bambang.id, brandId: erfo.id } }),
    db.userBrandAccess.create({ data: { userId: bambang.id, brandId: unicam.id } }),
  ])

  /* ---------------- COMPANIES ---------------- */
  const mkCompany = (data: Parameters<typeof db.company.create>[0]['data']) => db.company.create({ data })
  const [nusantara, kemenkes, sentosa, bumi, swg, cakrawala, maju, hotelier, yayasan, tekno] = await Promise.all([
    mkCompany({ name: 'PT Nusantara Sejahtera', industry: 'FMCG', website: 'https://nusantarasejahtera.co.id', country: 'Indonesia', city: 'Jakarta', size: 'Enterprise', currency: 'IDR', tags: 'fmcg,retail', ownerId: dewi.id, address: 'Jl. Gatot Subroto Kav. 12, Jakarta Selatan' }),
    mkCompany({ name: 'Kementerian Kesehatan RI', industry: 'Government', website: 'https://kemkes.go.id', country: 'Indonesia', city: 'Jakarta', size: 'Government', currency: 'IDR', tags: 'government,kesehatan', ownerId: dewi.id }),
    mkCompany({ name: 'Bank Sentosa', industry: 'Banking', website: 'https://banksentosa.co.id', country: 'Indonesia', city: 'Jakarta', size: 'Enterprise', currency: 'IDR', tags: 'banking,finance', ownerId: fajar.id }),
    mkCompany({ name: 'PT Bumi Energi Nusantara', industry: 'Energy', website: 'https://bumienergi.co.id', country: 'Indonesia', city: 'Balikpapan', size: 'Enterprise', currency: 'IDR', tags: 'energy,mining', ownerId: dewi.id }),
    mkCompany({ name: 'Singapore Wellness Group', industry: 'Healthcare', website: 'https://sgwellness.sg', country: 'Singapore', city: 'Singapore', size: 'Medium', currency: 'SGD', tags: 'healthcare,regional', ownerId: fajar.id }),
    mkCompany({ name: 'Universitas Cakrawala', industry: 'Education', website: 'https://cakrawala.ac.id', country: 'Indonesia', city: 'Bandung', size: 'Medium', currency: 'IDR', tags: 'education', ownerId: dewi.id }),
    mkCompany({ name: 'PT Maju Pangan Indonesia', industry: 'Food & Beverage', website: 'https://majupangan.co.id', country: 'Indonesia', city: 'Surabaya', size: 'Medium', currency: 'IDR', tags: 'fnb,ekspor', ownerId: fajar.id }),
    mkCompany({ name: 'Global Hotelier Group', industry: 'Hospitality', website: 'https://globalhotelier.com', country: 'Malaysia', city: 'Kuala Lumpur', size: 'Enterprise', currency: 'MYR', tags: 'hospitality,regional', ownerId: fajar.id }),
    mkCompany({ name: 'Yayasan Peduli Lingkungan', industry: 'NGO', country: 'Indonesia', city: 'Jakarta', size: 'NGO', currency: 'IDR', tags: 'ngo,lingkungan', ownerId: dewi.id }),
    mkCompany({ name: 'PT Tekno Presisi', industry: 'Manufacturing', website: 'https://teknopresisi.co.id', country: 'Indonesia', city: 'Bekasi', size: 'Medium', currency: 'IDR', tags: 'manufacturing,otomotif', ownerId: dewi.id }),
  ])

  /* ---------------- CLIENT PORTAL USER ---------------- */
  const clientUser = await db.user.create({ data: {
    email: 'daniel.oei@banksentosa.co.id', name: 'Daniel Oei', role: 'CLIENT',
    title: 'Digital Banking Division Head', avatarColor: '#14b8a6', companyId: sentosa.id,
  }})
  console.log(`   Client portal user: ${clientUser.email} (Bank Sentosa)`)

  /* ---------------- CONTACTS ---------------- */
  const mkContact = (data: Parameters<typeof db.contact.create>[0]['data']) => db.contact.create({ data })
  const [hendra, maya, rina, jonathan, budi, profSari, ahmad, linda, dedi, ratih, kevin, sinta, daniel, clara] = await Promise.all([
    mkContact({ companyId: nusantara.id, firstName: 'Hendra', lastName: 'Gunawan', position: 'Marketing Director', email: 'hendra.gunawan@nusantarasejahtera.co.id', whatsapp: '+6281234567890', phone: '+62215551001', isPrimary: true, tags: 'decision-maker' }),
    mkContact({ companyId: nusantara.id, firstName: 'Maya', lastName: 'Anggraini', position: 'Brand Manager', email: 'maya.a@nusantarasejahtera.co.id', whatsapp: '+6281234567891', preferredChannel: 'EMAIL' }),
    mkContact({ companyId: kemenkes.id, firstName: 'Rina', lastName: 'Salim', position: 'Kepala Biro Informasi Publik', email: 'rina.salim@kemkes.go.id', whatsapp: '+6281298765432', isPrimary: true, preferredChannel: 'EMAIL', tags: 'government,pap' }),
    mkContact({ companyId: swg.id, firstName: 'Jonathan', lastName: 'Tan', position: 'Head of Marketing', email: 'jonathan.tan@sgwellness.sg', whatsapp: '+6591234567', country: 'Singapore', timezone: 'Asia/Singapore', language: 'en', isPrimary: true }),
    mkContact({ companyId: bumi.id, firstName: 'Budi', lastName: 'Santoso', position: 'IT & Digital Manager', email: 'budi.santoso@bumienergi.co.id', whatsapp: '+6281377788899', city: 'Balikpapan', isPrimary: true }),
    mkContact({ companyId: cakrawala.id, firstName: 'Sari', lastName: 'Wulandari', position: 'Direktur Pemasaran & Admisi', email: 'sari.w@cakrawala.ac.id', whatsapp: '+6281555443322', city: 'Bandung', isPrimary: true }),
    mkContact({ companyId: sentosa.id, firstName: 'Ahmad', lastName: 'Fauzi', position: 'Digital Banking Manager', email: 'ahmad.fauzi@banksentosa.co.id', whatsapp: '+6281199223344', isPrimary: true, tags: 'warm-referral' }),
    mkContact({ companyId: hotelier.id, firstName: 'Linda', lastName: 'Halim', position: 'Marcom Head', email: 'linda.halim@globalhotelier.com', whatsapp: '+60123456789', country: 'Malaysia', timezone: 'Asia/Kuala_Lumpur', language: 'en', isPrimary: true }),
    mkContact({ companyId: yayasan.id, firstName: 'Dedi', lastName: 'Kurniawan', position: 'Sekretaris Yayasan', email: 'dedi@pedulilingkungan.or.id', whatsapp: '+6281777665544', isPrimary: true }),
    mkContact({ companyId: maju.id, firstName: 'Ratih', lastName: 'Puspita', position: 'Product Manager', email: 'ratih.p@majupangan.co.id', whatsapp: '+6281333221100', city: 'Surabaya', isPrimary: true }),
    mkContact({ companyId: tekno.id, firstName: 'Kevin', lastName: 'Wijaya', position: 'Owner', email: 'kevin@teknopresisi.co.id', whatsapp: '+6281888997766', isPrimary: true, tags: 'repeat-client' }),
    mkContact({ companyId: kemenkes.id, firstName: 'Sinta', lastName: 'Maharani', position: 'PR Manager', email: 'sinta.maharani@kemkes.go.id', whatsapp: '+6281266554433', preferredChannel: 'WHATSAPP' }),
    mkContact({ companyId: sentosa.id, firstName: 'Daniel', lastName: 'Oei', position: 'Procurement Lead', email: 'daniel.oei@banksentosa.co.id', whatsapp: '+6281566778899' }),
    mkContact({ companyId: swg.id, firstName: 'Clara', lastName: 'Tanuwijaya', position: 'Event Manager', email: 'clara.t@sgwellness.sg', whatsapp: '+6598765432', country: 'Singapore', timezone: 'Asia/Singapore', language: 'en' }),
  ])

  /* ---------------- OPPORTUNITIES ---------------- */
  const oppSeq = (n: number) => `OPP-2025-${String(n).padStart(4, '0')}`
  const mkOpp = async (seq: number, data: Record<string, unknown>) =>
    db.opportunity.create({ data: { ...(data as unknown as Prisma.OpportunityUncheckedCreateInput), code: oppSeq(seq) } })

  const o1 = await mkOpp(1, { title: 'Redesign Website Corporate', companyId: nusantara.id, contactId: hendra.id, sourceBrandId: segia.id, executingBrandId: segia.id, serviceId: sWeb.id, leadSource: 'WEBSITE', channel: 'WEBSITE', campaign: 'Google Ads - Website Korporat', brief: 'Website corporate dengan katalog produk dan berita; referensi: kompetitor FMCG.', needs: 'Modernisasi website + katalog produk', deliverables: 'Website responsif, CMS, katalog 200 produk', estimatedValue: 180000000, probability: 15, stage: 'NEW', temperature: 'WARM', ownerId: dewi.id, priority: 'HIGH', expectedCloseDate: d(45), nextAction: 'Hubungi via WhatsApp (SLA 4 jam)', nextActionDate: d(0, 17), createdAt: d(0, 8) })
  const o2 = await mkOpp(2, { title: 'Animasi E-Learning Kesehatan Masyarakat', companyId: kemenkes.id, contactId: rina.id, sourceBrandId: unimasi.id, executingBrandId: unimasi.id, serviceId: sElearn.id, leadSource: 'INSTAGRAM', channel: 'INSTAGRAM', campaign: 'IG Organic', brief: 'Seri animasi edukasi PHBS untuk 10 episode.', estimatedValue: 320000000, probability: 55, stage: 'QUALIFIED', temperature: 'HOT', ownerId: dewi.id, priority: 'URGENT', expectedCloseDate: d(30), nextAction: 'Meeting penyusunan BAP', nextActionDate: d(2, 10), createdAt: d(9) })
  const o3 = await mkOpp(3, { title: 'Company Profile Video 2025', companyId: sentosa.id, contactId: ahmad.id, sourceBrandId: unicam.id, executingBrandId: unicam.id, serviceId: sCorpVid.id, leadSource: 'REFERRAL', channel: 'WHATSAPP', brief: 'Video profil bank untuk investor day.', estimatedValue: 275000000, probability: 70, stage: 'NEGOTIATION', temperature: 'HOT', ownerId: fajar.id, priority: 'HIGH', expectedCloseDate: d(12), nextAction: 'Follow-up revisi penawaran v2', nextActionDate: d(1, 11), competitorName: 'VisionReel', createdAt: d(24) })
  const o4 = await mkOpp(4, { title: 'Live Streaming Annual Wellness Summit', companyId: swg.id, contactId: clara.id, sourceBrandId: erfo.id, executingBrandId: erfo.id, serviceId: sLive.id, leadSource: 'EMAIL', channel: 'EMAIL', estimatedValue: 18, currency: 'SGD', probability: 45, stage: 'CONNECTED', temperature: 'WARM', ownerId: fajar.id, priority: 'MEDIUM', expectedCloseDate: d(35), nextAction: 'Kirim portofolio live streaming', nextActionDate: d(1), createdAt: d(6) })
  const o5 = await mkOpp(5, { title: 'SEO & Konten Digital Penerimaan Mahasiswa', companyId: cakrawala.id, contactId: profSari.id, sourceBrandId: segia.id, executingBrandId: segia.id, serviceId: sSeo.id, leadSource: 'WEBSITE', channel: 'WEBSITE', brief: 'Naikkan organic traffic untuk pendaftaran mahasiswa baru.', estimatedValue: 95000000, probability: 40, stage: 'ESTIMATION', temperature: 'WARM', ownerId: dewi.id, priority: 'MEDIUM', expectedCloseDate: d(25), nextAction: 'Finalisasi cost breakdown dengan finance', nextActionDate: d(1, 14), createdAt: d(11) })
  const o6 = await mkOpp(6, { title: 'Virtual Tour Pabrik Cikarang', companyId: tekno.id, contactId: kevin.id, sourceBrandId: unicam.id, executingBrandId: unicam.id, serviceId: sVtour.id, leadSource: 'WEBSITE', channel: 'WEBSITE', brief: 'Virtual tour 360° pabrik untuk keperluan audit vendor dan pameran digital.', estimatedValue: 145000000, probability: 60, stage: 'PROPOSAL_SENT', temperature: 'HOT', ownerId: dewi.id, priority: 'HIGH', expectedCloseDate: d(18), nextAction: 'Tanya status proposal (masa berlaku 14 hari)', nextActionDate: d(1, 9), createdAt: d(15) })
  const o7 = await mkOpp(7, { title: 'Dokumentasi Video Produk Ekspor', companyId: maju.id, contactId: ratih.id, sourceBrandId: erfo.id, executingBrandId: erfo.id, serviceId: sDok.id, leadSource: 'INSTAGRAM', channel: 'INSTAGRAM', estimatedValue: 60000000, probability: 20, stage: 'CONTACT_ATTEMPTED', temperature: 'COLD', ownerId: fajar.id, priority: 'LOW', expectedCloseDate: d(60), nextAction: 'Telepon ulang (belum direspons)', nextActionDate: d(0, 16), createdAt: d(3) })
  const o8 = await mkOpp(8, { title: 'Animasi Produk Untuk Pasar Ekspor', companyId: maju.id, contactId: ratih.id, sourceBrandId: unimasi.id, executingBrandId: unimasi.id, serviceId: sProd.id, leadSource: 'EVENT', channel: 'MEETING', brief: 'Animasi 3D proses produksi makanan untuk pameran Food Expo Shanghai.', estimatedValue: 210000000, probability: 35, stage: 'DISCOVERY', temperature: 'WARM', ownerId: dewi.id, priority: 'MEDIUM', expectedCloseDate: d(40), nextAction: 'Jadwalkan discovery call lanjutan', nextActionDate: d(3, 13), createdAt: d(8) })
  const o9 = await mkOpp(9, { title: 'Website + Booking Engine Jaringan Hotel', companyId: hotelier.id, contactId: linda.id, sourceBrandId: segia.id, executingBrandId: segia.id, serviceId: sWeb.id, leadSource: 'REFERRAL', channel: 'REFERRAL', estimatedValue: 460000000, probability: 100, stage: 'WON', temperature: 'HOT', ownerId: fajar.id, priority: 'HIGH', expectedCloseDate: d(-5), wonAt: d(-5), nextAction: 'Kick-off project dengan produksi', nextActionDate: d(1, 10), createdAt: d(48) })
  const o10 = await mkOpp(10, { title: 'Corporate Video Program CSR', companyId: bumi.id, contactId: budi.id, sourceBrandId: unicam.id, executingBrandId: unicam.id, serviceId: sCorpVid.id, leadSource: 'COLD_CALL', channel: 'PHONE', estimatedValue: 185000000, probability: 100, stage: 'WON', temperature: 'HOT', ownerId: dewi.id, priority: 'MEDIUM', expectedCloseDate: d(-12), wonAt: d(-12), createdAt: d(60) })
  const o11 = await mkOpp(11, { title: 'Infografis Kampanye Sampah Plastik', companyId: yayasan.id, contactId: dedi.id, sourceBrandId: unimasi.id, executingBrandId: unimasi.id, serviceId: sInfo.id, leadSource: 'INSTAGRAM', channel: 'INSTAGRAM', estimatedValue: 45000000, probability: 0, stage: 'LOST', temperature: 'COLD', ownerId: dewi.id, priority: 'LOW', lostReason: 'PRICE_TOO_HIGH', lostNotes: 'Anggaran yayasan terbatas tahun ini, memilih vendor lebih murah (Studio X).', competitorName: 'Studio X', lastOfferValue: 45000000, reactivation: 'SMALLER_PACKAGE', followUpDate: d(30), lostAt: d(-8), createdAt: d(35) })
  const o12 = await mkOpp(12, { title: 'Video 360 Tour Cabang Bank', companyId: sentosa.id, contactId: daniel.id, sourceBrandId: erfo.id, executingBrandId: erfo.id, serviceId: sV360.id, leadSource: 'WEBSITE', channel: 'WEBSITE', estimatedValue: 120000000, probability: 0, stage: 'LOST', temperature: 'COLD', ownerId: fajar.id, priority: 'LOW', lostReason: 'CHOSE_COMPETITOR', lostNotes: 'Kompetitor memberi harga 20% lebih rendah dengan timeline lebih cepat.', competitorName: 'VisionReel', lastOfferValue: 120000000, reactivation: 'REOFFER_90', followUpDate: d(75), lostAt: d(-20), createdAt: d(40) })
  const o13 = await mkOpp(13, { title: 'AR Catalog Produk Otomotif', companyId: tekno.id, contactId: kevin.id, sourceBrandId: unicam.id, executingBrandId: unicam.id, serviceId: sArvr.id, leadSource: 'REFERRAL', channel: 'WHATSAPP', estimatedValue: 300000000, probability: 25, stage: 'NURTURE', temperature: 'COLD', ownerId: dewi.id, priority: 'MEDIUM', reactivation: 'BUDGET_PERIOD', followUpDate: d(50), nurtureTrack: 'REOFFER_90', nextAction: 'Penawaran ulang menjelang budget 2026', nextActionDate: d(50), createdAt: d(30) })
  const o14 = await mkOpp(14, { title: 'UI/UX Redesign Mobile Banking', companyId: sentosa.id, contactId: daniel.id, sourceBrandId: segia.id, executingBrandId: segia.id, serviceId: sUiux.id, leadSource: 'REFERRAL', channel: 'MEETING', estimatedValue: 340000000, probability: 85, stage: 'VERBAL_AGREEMENT', temperature: 'HOT', ownerId: fajar.id, priority: 'URGENT', expectedCloseDate: d(5), nextAction: 'Tunggu PO & DP 50%', nextActionDate: d(2, 10), createdAt: d(20) })
  const o15 = await mkOpp(15, { title: 'Drone Video Site Survey Tambang', companyId: bumi.id, contactId: budi.id, sourceBrandId: erfo.id, executingBrandId: erfo.id, serviceId: sDrone.id, leadSource: 'REFERRAL', channel: 'WHATSAPP', estimatedValue: 85000000, probability: 55, stage: 'QUALIFIED', temperature: 'WARM', ownerId: fajar.id, priority: 'MEDIUM', expectedCloseDate: d(28), nextAction: 'Konfirmasi izin area tambang', nextActionDate: d(2, 9), createdAt: d(7) })
  const o16 = await mkOpp(16, { title: 'Animasi 2D Kampanye Vaksinasi', companyId: kemenkes.id, contactId: sinta.id, sourceBrandId: unimasi.id, executingBrandId: unimasi.id, serviceId: sProd.id, leadSource: 'EMAIL', channel: 'EMAIL', campaign: 'Kampanye Kesehatan Q3', estimatedValue: 265000000, probability: 60, stage: 'PROPOSAL_SENT', temperature: 'HOT', ownerId: dewi.id, priority: 'HIGH', expectedCloseDate: d(15), nextAction: 'Presentasi proposal ke PAP', nextActionDate: d(1, 13), createdAt: d(13) })

  /* ---------------- INTERACTIONS ---------------- */
  const mkInt = (data: Parameters<typeof db.interaction.create>[0]['data']) => db.interaction.create({ data })

  await Promise.all([
    // o1 — website form (baru, belum dibalas → SLA warning)
    mkInt({ opportunityId: o1.id, contactId: hendra.id, companyId: nusantara.id, brandId: segia.id, channel: 'WEBSITE', direction: 'IN', body: 'Halo, kami butuh redesign website corporate. Mohon info paket dan estimasi biaya. Terima kasih.', sentAt: d(0, 8), status: 'DELIVERED', originalLink: 'https://segiatech.com/contact?form=LF-2201' }),
    // o2 — IG DM thread
    mkInt({ opportunityId: o2.id, contactId: rina.id, companyId: kemenkes.id, brandId: unimasi.id, channel: 'INSTAGRAM', direction: 'IN', body: 'Selamat siang, kami dari Kemenkes tertarik dengan portofolio animasi edukasi. Apakah bisa kirim reel contoh?', sentAt: d(9, 10) }),
    mkInt({ opportunityId: o2.id, contactId: rina.id, companyId: kemenkes.id, brandId: unimasi.id, channel: 'INSTAGRAM', direction: 'OUT', respondedById: dewi.id, respondedAt: d(9, 11, 20), body: 'Selamat siang Ibu Rina 🙌 Tentu, berikut kami kirim 3 contoh reel animasi e-learning kami...', status: 'READ', sentAt: d(9, 11, 20) }),
    mkInt({ opportunityId: o2.id, contactId: rina.id, companyId: kemenkes.id, brandId: unimasi.id, channel: 'WHATSAPP', direction: 'IN', body: 'Setelah diskusi internal, kami perlu 10 episode animasi PHBS. Kira-kira berapa estimasinya?', sentAt: d(4, 14) }),
    mkInt({ opportunityId: o2.id, contactId: rina.id, companyId: kemenkes.id, brandId: unimasi.id, channel: 'WHATSAPP', direction: 'OUT', respondedById: dewi.id, respondedAt: d(4, 15), body: 'Siap Bu, untuk 10 episode range Rp 280–340 jt tergantung durasi & kompleksitas. Boleh kita jadwalkan meeting untuk brief?', status: 'READ', sentAt: d(4, 15) }),
    // o3 — negotiation thread
    mkInt({ opportunityId: o3.id, contactId: ahmad.id, companyId: sentosa.id, brandId: unicam.id, channel: 'WHATSAPP', direction: 'IN', body: 'Pak, proposal v1 kami review. Ada masukan dari legal terkait hak cipta footage.', sentAt: d(3, 13) }),
    mkInt({ opportunityId: o3.id, contactId: ahmad.id, companyId: sentosa.id, brandId: unicam.id, channel: 'EMAIL', direction: 'OUT', respondedById: fajar.id, respondedAt: d(3, 16, 30), subject: 'QUO-2025-0031 — Revisi Syarat Lisensi Footage', body: 'Pak Ahmad, terlampir proposal revisi v2 dengan skema lisensi perpetual.', status: 'READ', sentAt: d(3, 16, 30) }),
    // o4 — email
    mkInt({ opportunityId: o4.id, contactId: clara.id, companyId: swg.id, brandId: erfo.id, channel: 'EMAIL', direction: 'IN', subject: 'Enquiry: Live Streaming for Annual Summit (2 days)', body: 'Hi, we plan to live stream our annual summit on 2 stages, approx 800 concurrent viewers. Can you share package and past work?', sentAt: d(6, 9, 40) }),
    mkInt({ opportunityId: o4.id, contactId: clara.id, companyId: swg.id, brandId: erfo.id, channel: 'EMAIL', direction: 'OUT', respondedById: fajar.id, respondedAt: d(6, 13), subject: 'Re: Enquiry: Live Streaming for Annual Summit', body: 'Hi Clara, thanks for reaching out! Here is our live streaming deck with 3 package tiers...', status: 'READ', sentAt: d(6, 13) }),
    // o5 — website
    mkInt({ opportunityId: o5.id, contactId: profSari.id, companyId: cakrawala.id, brandId: segia.id, channel: 'WEBSITE', direction: 'IN', body: 'Kami butuh jasa SEO untuk program penerimaan mahasiswa baru. Mohon dihubungi.', sentAt: d(11, 10, 15) }),
    mkInt({ opportunityId: o5.id, contactId: profSari.id, companyId: cakrawala.id, brandId: segia.id, channel: 'PHONE', direction: 'OUT', respondedById: dewi.id, respondedAt: d(10, 11), body: 'Telepon awal: konfirmasi kebutuhan, target: 3x organic traffic sebelum Juli.' }),
    // o6 — website + wa
    mkInt({ opportunityId: o6.id, contactId: kevin.id, companyId: tekno.id, brandId: unicam.id, channel: 'WEBSITE', direction: 'IN', body: 'Butuh virtual tour 360 untuk pabrik kami di Cikarang. Sudah pernah lihat portofolio virtual tour showroom.', sentAt: d(15, 9, 30) }),
    mkInt({ opportunityId: o6.id, contactId: kevin.id, companyId: tekno.id, brandId: unicam.id, channel: 'WHATSAPP', direction: 'OUT', respondedById: dewi.id, respondedAt: d(15, 12), body: 'Siap Pak Kevin, kami kirim proposal virtual tour + contoh hasil 360° pabrik otomotif.', status: 'READ' }),
    // o7 — IG, belum dibalas 3 hari (overdue)
    mkInt({ opportunityId: o7.id, contactId: ratih.id, companyId: maju.id, brandId: erfo.id, channel: 'INSTAGRAM', direction: 'IN', body: 'Min, mau tanya untuk jasa dokumentasi video produk. Untuk katalog ekspor.', sentAt: d(3, 19, 45) }),
    // o8 — event + meeting
    mkInt({ opportunityId: o8.id, contactId: ratih.id, companyId: maju.id, brandId: unimasi.id, channel: 'MEETING', direction: 'IN', body: 'Pertemuan di pameran SIAL InterFOOD: minat animasi 3D proses produksi untuk booth Food Expo Shanghai.', sentAt: d(8, 14) }),
    // o9 — won thread (referral)
    mkInt({ opportunityId: o9.id, contactId: linda.id, companyId: hotelier.id, brandId: segia.id, channel: 'EMAIL', direction: 'IN', subject: 'Website Revamp for 12 Properties — RFP', body: 'Dear team, attached our RFP for website revamp including booking engine integration.', sentAt: d(48, 10) }),
    mkInt({ opportunityId: o9.id, contactId: linda.id, companyId: hotelier.id, brandId: segia.id, channel: 'EMAIL', direction: 'OUT', respondedById: fajar.id, respondedAt: d(40, 15), subject: 'SEG-Q-2025-0012 — Proposal Website + Booking Engine', body: 'Dear Linda, please find our proposal with 3 implementation phases. Valid for 14 days.', status: 'READ' }),
    mkInt({ opportunityId: o9.id, contactId: linda.id, companyId: hotelier.id, brandId: segia.id, channel: 'WHATSAPP', direction: 'IN', body: 'Good news! Management approved. PO will follow this week. 🎉', sentAt: d(-5, 11), status: 'READ' }),
    // o10 — cold call to won
    mkInt({ opportunityId: o10.id, contactId: budi.id, companyId: bumi.id, brandId: unicam.id, channel: 'PHONE', direction: 'OUT', body: 'Cold call awal: minat video CSR program reboisasi.', sentAt: d(60, 10, 30) }),
    mkInt({ opportunityId: o10.id, contactId: budi.id, companyId: bumi.id, brandId: unicam.id, channel: 'EMAIL', direction: 'IN', subject: 'PO No. 550/BEN/2025 — Corporate Video CSR', body: 'Pak Andi/Dewi, PO terlampir. Mohon jadwal pre-production meeting.', sentAt: d(-12, 9) }),
    // o11 lost
    mkInt({ opportunityId: o11.id, contactId: dedi.id, companyId: yayasan.id, brandId: unimasi.id, channel: 'WHATSAPP', direction: 'IN', body: 'Terima kasih, tapi anggaran kami tidak cukup untuk skema ini tahun ini.', sentAt: d(-8, 15) }),
    // o12 lost
    mkInt({ opportunityId: o12.id, contactId: daniel.id, companyId: sentosa.id, brandId: erfo.id, channel: 'EMAIL', direction: 'IN', subject: 'Re: Penawaran Video 360', body: 'Mohon maaf, kami memilih vendor lain. Semoga bisa bekerja sama di kesempatan lain.', sentAt: d(-20, 11) }),
    // o13 nurture
    mkInt({ opportunityId: o13.id, contactId: kevin.id, companyId: tekno.id, brandId: unicam.id, channel: 'WHATSAPP', direction: 'IN', body: 'Budget AR tahun ini sudah dialokasikan. Mungkin kalau tahun depan bisa jalan.', sentAt: d(22, 16) }),
    // o14 verbal
    mkInt({ opportunityId: o14.id, contactId: daniel.id, companyId: sentosa.id, brandId: segia.id, channel: 'MEETING', direction: 'IN', body: 'Rapat negosiasi: sepakat scope & harga. PO menyusul dari procurement.', sentAt: d(1, 14) }),
    // o15
    mkInt({ opportunityId: o15.id, contactId: budi.id, companyId: bumi.id, brandId: erfo.id, channel: 'WHATSAPP', direction: 'IN', body: 'Untuk drone, area tambang butuh izin. Kami proses dulu surat jalannya.', sentAt: d(2, 10, 30) }),
    // o16
    mkInt({ opportunityId: o16.id, contactId: sinta.id, companyId: kemenkes.id, brandId: unimasi.id, channel: 'EMAIL', direction: 'IN', subject: 'Permintaan Proposal Kampanye Vaksinasi', body: 'Mohon kirimkan proposal animasi 2D untuk kampanye vaksinasi nasional, 4 episode.', sentAt: d(13, 8, 50) }),
    mkInt({ opportunityId: o16.id, contactId: sinta.id, companyId: kemenkes.id, brandId: unimasi.id, channel: 'EMAIL', direction: 'OUT', respondedById: dewi.id, respondedAt: d(12, 10), subject: 'QUO-2025-0044 — Animasi 2D Kampanye Vaksinasi (4 Episode)', body: 'Bu Sinta, proposal terlampir. Kami siap presentasi minggu ini bila diperlukan.', status: 'READ' }),
    // extra: duplicate-ish inbound via WA for o1 contact (identity matching demo)
    mkInt({ opportunityId: o1.id, contactId: hendra.id, companyId: nusantara.id, brandId: segia.id, channel: 'WHATSAPP', direction: 'IN', body: 'Halo, tadi saya isi form website. Boleh dibalas ya? Butuh segera.', sentAt: d(0, 9, 30) }),
  ])

  /* ---------------- TASKS ---------------- */
  await Promise.all([
    db.task.create({ data: { title: 'Respons lead website PT Nusantara Sejahtera (SLA 4 jam)', opportunityId: o1.id, assigneeId: dewi.id, dueDate: d(0, 12), priority: 'URGENT', type: 'FOLLOW_UP' } }),
    db.task.create({ data: { title: 'Telepon ulang PT Maju Pangan (belum respons IG)', opportunityId: o7.id, assigneeId: fajar.id, dueDate: d(-1, 16), priority: 'HIGH', type: 'FOLLOW_UP' } }),
    db.task.create({ data: { title: 'Siapkan BAP meeting Kemenkes E-Learning', opportunityId: o2.id, assigneeId: dewi.id, dueDate: d(2, 9), priority: 'HIGH', type: 'MEETING' } }),
    db.task.create({ data: { title: 'Follow-up revisi proposal Bank Sentosa v2', opportunityId: o3.id, assigneeId: fajar.id, dueDate: d(1, 11), priority: 'URGENT', type: 'FOLLOW_UP' } }),
    db.task.create({ data: { title: 'Kick-off meeting website Hotelier', opportunityId: o9.id, assigneeId: fajar.id, dueDate: d(1, 10), priority: 'HIGH', type: 'MEETING' } }),
    db.task.create({ data: { title: 'Pre-production meeting video CSR Bumi Energi', opportunityId: o10.id, assigneeId: andi.id, dueDate: d(0, 14), priority: 'MEDIUM', type: 'INTERNAL' } }),
    db.task.create({ data: { title: 'Finalisasi cost breakdown SEO Cakrawala', opportunityId: o5.id, assigneeId: sari.id, dueDate: d(1, 14), priority: 'MEDIUM', type: 'INTERNAL' } }),
    db.task.create({ data: { title: 'Tunggu & verifikasi PO UI/UX Mobile Banking', opportunityId: o14.id, assigneeId: fajar.id, dueDate: d(2, 10), priority: 'URGENT', type: 'FOLLOW_UP' } }),
    db.task.create({ data: { title: 'Re-offer paket infografis kecil ke Yayasan Peduli', opportunityId: o11.id, assigneeId: dewi.id, dueDate: d(30, 10), priority: 'LOW', type: 'FOLLOW_UP' } }),
    db.task.create({ data: { title: 'Kirim portofolio live streaming ke Singapore Wellness', opportunityId: o4.id, assigneeId: fajar.id, dueDate: d(1, 17), priority: 'MEDIUM', type: 'FOLLOW_UP' } }),
    db.task.create({ data: { title: 'Presentasi proposal vaksinasi ke PAP Kemenkes', opportunityId: o16.id, assigneeId: dewi.id, dueDate: d(1, 13), priority: 'HIGH', type: 'MEETING' } }),
  ])

  /* ---------------- NOTES ---------------- */
  await Promise.all([
    db.note.create({ data: { opportunityId: o3.id, authorId: bambang.id, body: 'Direktur: Diskon maksimal 8% boleh disetujui. Jangan turunkan fee produksi, cukup dari margin lisensi.', visibility: 'DIRECTOR' } }),
    db.note.create({ data: { opportunityId: o3.id, authorId: fajar.id, body: 'Legal bank minta lisensi footage perpetual. Sudah dikonfirmasi ke produksi, tidak ada biaya tambahan.', visibility: 'INTERNAL' } }),
    db.note.create({ data: { opportunityId: o14.id, authorId: bambang.id, body: 'Direktur: Deal strategis untuk portfolio fintech. Prioritaskan ketersediaan tim UI/UX.', visibility: 'DIRECTOR' } }),
    db.note.create({ data: { opportunityId: o2.id, authorId: dewi.id, body: 'PAP Kemenkes punya anggaran tersendiri, tapi perlu persetujuan Kepala Biro. Kuncinya timeline proposal < 2 minggu.', visibility: 'INTERNAL' } }),
    db.note.create({ data: { opportunityId: o1.id, authorId: dewi.id, body: 'Lead dari Google Ads, kata kunci "jasa website corporate". Belum dibalas — perlu respons segera untuk SLA.', visibility: 'INTERNAL' } }),
    db.note.create({ data: { opportunityId: o9.id, authorId: andi.id, body: 'Handover produksi: 12 properti hotel, fase 1 = 4 properti pilot. Perlu copywriter bahasa Inggris.', visibility: 'INTERNAL' } }),
  ])

  /* ---------------- PROJECTS (dari WON) ---------------- */
  const p1 = await db.project.create({ data: {
    name: 'Website + Booking Engine — Global Hotelier Group', code: 'PRJ-2025-001', opportunityId: o9.id,
    companyId: hotelier.id, brandId: segia.id, managerId: andi.id, status: 'IN_PROGRESS', progress: 35,
    workflowType: 'website', budget: 460000000, startDate: d(-4), endDate: d(70),
  }})
  const p2 = await db.project.create({ data: {
    name: 'Corporate Video CSR — PT Bumi Energi', code: 'PRJ-2025-002', opportunityId: o10.id,
    companyId: bumi.id, brandId: unicam.id, managerId: andi.id, status: 'IN_PROGRESS', progress: 60,
    workflowType: 'video', budget: 185000000, startDate: d(-11), endDate: d(30),
  }})
  const webMilestones = ['Discovery & Requirement', 'Sitemap & Wireframe', 'UI/UX Design', 'Development', 'QA & Testing', 'Launch & Handover']
  const vidMilestones = ['Pre-Production', 'Shooting', 'Editing', 'Revision Round', 'Final Delivery']
  await Promise.all([
    ...webMilestones.map((name, i) => db.milestone.create({ data: { projectId: p1.id, name, stepOrder: i + 1, status: i === 0 ? 'DONE' : i === 1 ? 'IN_PROGRESS' : 'PENDING', dueDate: d(10 + i * 10), completedAt: i === 0 ? d(-1) : null } })),
    ...vidMilestones.map((name, i) => db.milestone.create({ data: { projectId: p2.id, name, stepOrder: i + 1, status: i < 2 ? 'DONE' : i === 2 ? 'IN_PROGRESS' : 'PENDING', dueDate: d(-2 + i * 8), completedAt: i < 2 ? d(-4 + i) : null } })),
  ])

  // Proyek Bank Sentosa (dari opportunity UI/UX Redesign — quotation ACCEPTED) — data demo Client Portal
  const p3 = await db.project.create({ data: {
    name: 'UI/UX Redesign Mobile Banking — Bank Sentosa', code: 'PRJ-2025-003', opportunityId: o14.id,
    companyId: sentosa.id, brandId: segia.id, managerId: andi.id, status: 'IN_PROGRESS', progress: 40,
    workflowType: 'website', budget: 340000000, startDate: d(-3), endDate: d(60),
  }})
  await Promise.all([
    ...webMilestones.map((name, i) => db.milestone.create({ data: { projectId: p3.id, name, stepOrder: i + 1, status: i < 2 ? 'DONE' : i === 2 ? 'IN_PROGRESS' : 'PENDING', dueDate: d(6 + i * 10), completedAt: i < 2 ? d(-2 + i) : null } })),
  ])

  /* ---------------- FOLLOW-UP TEMPLATES ---------------- */
  const mkTpl = (brandId: string, data: Record<string, unknown>) =>
    db.followUpTemplate.create({ data: { ...(data as unknown as Prisma.FollowUpTemplateUncheckedCreateInput), brandId } })
  await Promise.all([
    mkTpl(segia.id, { name: 'FU1 — Konfirmasi Diterima', step: 1, delayDays: 1, channel: 'WHATSAPP', purpose: 'Konfirmasi pesan diterima', body: 'Halo {{contact_name}}, terima kasih telah menghubungi {{brand_name}} 👋 Permintaan Anda terkait {{service_name}} sudah kami terima. Saya {{marketing_name}} akan membantu prosesnya. Boleh dishare sedikit detail kebutuhan perusahaan {{company_name}}?' }),
    mkTpl(segia.id, { name: 'FU2 — Tawaran Konsultasi', step: 2, delayDays: 3, channel: 'WHATSAPP', purpose: 'Tawarkan konsultasi singkat', body: 'Halo {{contact_name}}, semoga sehat selalu. Kami punya slot konsultasi gratis 30 menit membahas {{service_name}} untuk {{company_name}}. Tersedia {{meeting_link}} — kapan waktu yang nyaman untuk Bapak/Ibu?' }),
    mkTpl(segia.id, { name: 'FU3 — Portfolio Relevan', step: 3, delayDays: 7, channel: 'EMAIL', language: 'en', subject: 'Relevant work for {{company_name}} — {{brand_name}}', purpose: 'Kirim portfolio relevan', body: 'Hi {{contact_name}},\n\nFollowing up on your inquiry about {{service_name}}. Here are two case studies similar to what {{company_name}} needs:\n\n1. Case study A — booking engine for hospitality\n2. Case study B — corporate website revamp\n\nHappy to walk you through. Estimated timeline: {{estimated_timeline}}.\n\nBest,\n{{marketing_name}}' }),
    mkTpl(segia.id, { name: 'FU4 — Final Follow-up', step: 4, delayDays: 14, channel: 'WHATSAPP_EMAIL', purpose: 'Final follow-up', body: 'Halo {{contact_name}}, kami ingin memastikan apakah kebutuhan {{service_name}} masih relevan. Jika saat ini belum, dengan senang hati kami akan follow up lagi di waktu yang lebih tepat. Dokumen {{proposal_link}} tetap kami siapkan.' }),
    mkTpl(unimasi.id, { name: 'FU1 — Konfirmasi Diterima', step: 1, delayDays: 1, channel: 'WHATSAPP', purpose: 'Konfirmasi pesan diterima', body: 'Halo {{contact_name}}, terima kasih! Permintaan {{service_name}} dari {{company_name}} sudah kami terima. Saya {{marketing_name}} dari {{brand_name}}. Apakah boleh tahu target tayang & durasi yang diinginkan?' }),
    mkTpl(unimasi.id, { name: 'Nurture — Re-offer 30 Hari', step: 5, delayDays: 30, channel: 'EMAIL', purpose: 'Re-offer 30 hari', body: 'Halo {{contact_name}}, sudah sebulan sejak kita terakhir berbicara tentang {{service_name}}. Kami baru menyelesaikan 2 proyek serupa — apakah {{company_name}} ingin melihat hasilnya? {{proposal_link}}' }),
    mkTpl(erfo.id, { name: 'FU1 — Konfirmasi Diterima', step: 1, delayDays: 1, channel: 'WHATSAPP', purpose: 'Konfirmasi pesan diterima', body: 'Halo {{contact_name}}, pesan Anda untuk {{brand_name}} sudah kami terima 🙏 Untuk kebutuhan {{service_name}}, mohon info lokasi & tanggal rencana. Saya {{marketing_name}} siap membantu.' }),
    mkTpl(erfo.id, { name: 'FU2 — Penawaran Survey', step: 2, delayDays: 3, channel: 'WHATSAPP', purpose: 'Tawarkan site survey', body: 'Halo {{contact_name}}, untuk memberi estimasi akurat {{service_name}}, tim kami bisa lakukan site survey singkat. Kapan waktu yang cocok minggu ini?' }),
    mkTpl(unicam.id, { name: 'FU1 — Konfirmasi Diterima', step: 1, delayDays: 1, channel: 'EMAIL', language: 'en', subject: 'Thank you for contacting {{brand_name}}', purpose: 'Confirm receipt', body: 'Dear {{contact_name}},\n\nThank you for your interest in {{service_name}}. I am {{marketing_name}} from {{brand_name}}. Could we schedule a short call to understand {{company_name}}\'s objectives? Here is my meeting link: {{meeting_link}}\n\nBest regards,' }),
    mkTpl(unicam.id, { name: 'Nurture — Budget Period Re-offer', step: 5, delayDays: 60, channel: 'EMAIL', purpose: 'Re-offer menjelang budget period', body: 'Dear {{contact_name}},\n\nAs {{company_name}} plans next year\'s budget, immersive media like {{service_name}} could be a strong differentiator. We prepared an indicative proposal: {{proposal_link}}\n\nRegards,\n{{marketing_name}}' }),
  ])

  /* ---------------- AUDIT LOGS ---------------- */
  await Promise.all([
    db.auditLog.create({ data: { userId: dewi.id, userName: 'Dewi Lestari', action: 'LOGIN', entityType: 'User', entityId: dewi.id, entityLabel: 'Dewi Lestari', ip: '103.11.22.33', userAgent: 'Chrome / macOS' } }),
    db.auditLog.create({ data: { userId: fajar.id, userName: 'Fajar Pratama', action: 'LOGIN', entityType: 'User', entityId: fajar.id, entityLabel: 'Fajar Pratama', ip: '103.11.22.40', userAgent: 'Chrome / Windows' } }),
    db.auditLog.create({ data: { userId: fajar.id, userName: 'Fajar Pratama', action: 'STAGE_CHANGE', entityType: 'Opportunity', entityId: o9.id, entityLabel: oppSeq(9) + ' — Website + Booking Engine Jaringan Hotel', oldValue: JSON.stringify({ stage: 'VERBAL_AGREEMENT' }), newValue: JSON.stringify({ stage: 'WON' }), ip: '103.11.22.40' } }),
    db.auditLog.create({ data: { userId: dewi.id, userName: 'Dewi Lestari', action: 'STAGE_CHANGE', entityType: 'Opportunity', entityId: o11.id, entityLabel: oppSeq(11) + ' — Infografis Kampanye Sampah Plastik', oldValue: JSON.stringify({ stage: 'ESTIMATION' }), newValue: JSON.stringify({ stage: 'LOST', lostReason: 'PRICE_TOO_HIGH' }), ip: '103.11.22.33' } }),
    db.auditLog.create({ data: { userId: bambang.id, userName: 'Bambang Sutrisno', action: 'APPROVE_DISCOUNT', entityType: 'Opportunity', entityId: o3.id, entityLabel: oppSeq(3) + ' — Company Profile Video 2025', newValue: JSON.stringify({ discount: '8%' }), ip: '103.11.22.51' } }),
    db.auditLog.create({ data: { userId: ratna.id, userName: 'Ratna Wijaya', action: 'CREATE', entityType: 'Brand', entityId: unicam.id, entityLabel: 'Unicam Studio', newValue: JSON.stringify({ slaHours: 8, workflowType: 'video' }), ip: '10.0.0.2' } }),
    db.auditLog.create({ data: { userId: ratna.id, userName: 'Ratna Wijaya', action: 'CREATE', entityType: 'User', entityId: andi.id, entityLabel: 'Andi Mulyana', newValue: JSON.stringify({ role: 'PRODUKSI' }), ip: '10.0.0.2' } }),
    db.auditLog.create({ data: { userId: dewi.id, userName: 'Dewi Lestari', action: 'CREATE', entityType: 'Opportunity', entityId: o2.id, entityLabel: oppSeq(2) + ' — Animasi E-Learning Kesehatan Masyarakat', newValue: JSON.stringify({ stage: 'NEW', estimatedValue: 320000000 }), ip: '103.11.22.33' } }),
    db.auditLog.create({ data: { userId: sari.id, userName: 'Sari Kusuma', action: 'UPDATE', entityType: 'Opportunity', entityId: o5.id, entityLabel: oppSeq(5) + ' — SEO & Konten Digital Penerimaan Mahasiswa', oldValue: JSON.stringify({ estimatedValue: 85000000 }), newValue: JSON.stringify({ estimatedValue: 95000000 }), ip: '103.11.22.61' } }),
  ])

  /* ---------------- QUOTATIONS & INVOICES (Fase 2) ---------------- */
  const year = new Date().getFullYear()
  const mkQuote = async (n: number, data: Record<string, unknown>, items: { description: string; qty: number; unitPrice: number }[]) => {
    const subtotal = items.reduce((a, i) => a + i.qty * i.unitPrice, 0)
    const discountPct = (data.discountPct as number) ?? 0
    const discountAmount = Math.round(subtotal * discountPct / 100)
    const taxPct = (data.taxPct as number) ?? 11
    const taxAmount = Math.round((subtotal - discountAmount) * taxPct / 100)
    return db.quotation.create({ data: {
      ...(data as unknown as Prisma.QuotationUncheckedCreateInput),
      code: `QUO-${year}-${String(n).padStart(4, '0')}`,
      subtotal, discountAmount, taxAmount,
      total: subtotal - discountAmount + taxAmount,
      items: { create: items.map((it, idx) => ({ ...it, sortOrder: idx + 1 })) },
    } })
  }

  const q1 = await mkQuote(1, {
    opportunityId: o3.id, brandId: unicam.id, companyId: sentosa.id,
    title: 'Company Profile Video 2025 — Bank Sentosa', status: 'SENT', currency: 'IDR',
    discountPct: 8, taxPct: 11, validUntil: d(10), sentAt: d(3),
    notes: 'Termasuk 2 hari shooting, motion graphics, musik original. Lisensi footage perpetual.',
    createdById: fajar.id,
  }, [
    { description: 'Pre-production (script, storyboard, talent)', qty: 1, unitPrice: 35000000 },
    { description: 'Shooting 2 hari (crew + equipment)', qty: 2, unitPrice: 75000000 },
    { description: 'Editing, motion graphics, sound design', qty: 1, unitPrice: 95000000 },
  ])

  const q2 = await mkQuote(2, {
    opportunityId: o14.id, brandId: segia.id, companyId: sentosa.id,
    title: 'UI/UX Redesign Mobile Banking', status: 'ACCEPTED', currency: 'IDR',
    discountPct: 0, taxPct: 0, validUntil: d(-2), sentAt: d(9), decidedAt: d(2),
    notes: 'Discovery workshop, design system, handoff developer.', createdById: fajar.id,
  }, [
    { description: 'Discovery & user research', qty: 1, unitPrice: 60000000 },
    { description: 'Design system & komponen', qty: 1, unitPrice: 90000000 },
    { description: 'UI design 40+ layar', qty: 1, unitPrice: 140000000 },
    { description: 'Prototipe & usability testing', qty: 1, unitPrice: 50000000 },
  ])

  await mkQuote(3, {
    opportunityId: o6.id, brandId: unicam.id, companyId: tekno.id,
    title: 'Virtual Tour 360° Pabrik Cikarang', status: 'DRAFT', currency: 'IDR',
    discountPct: 0, taxPct: 11, createdById: dewi.id,
  }, [
    { description: 'Pemindaian 360° 12 titik area produksi', qty: 12, unitPrice: 6500000 },
    { description: 'Hotspot informasi & navigasi', qty: 1, unitPrice: 35000000 },
    { description: 'Hosting & maintenance 1 tahun', qty: 1, unitPrice: 28000000 },
  ])

  // R12 — penawaran DITOLAK client via portal (demo bridge lost reason + notifikasi PORTAL_COMMENT)
  const q4 = await mkQuote(4, {
    opportunityId: o16.id, brandId: unimasi.id, companyId: kemenkes.id,
    title: 'Animasi 2D Kampanye Vaksinasi (4 Episode)', status: 'REJECTED', currency: 'IDR',
    discountPct: 5, taxPct: 11, validUntil: d(5), sentAt: d(-6), decidedAt: d(-1, 14),
    notes: 'Produksi 4 episode animasi 2D + voice over profesional + adaptasi media sosial.',
    createdById: dewi.id,
  }, [
    { description: 'Naskah & storyboard 4 episode', qty: 4, unitPrice: 7500000 },
    { description: 'Produksi animasi 2D per episode (90 detik)', qty: 4, unitPrice: 52000000 },
    { description: 'Voice over profesional & sound design', qty: 4, unitPrice: 8500000 },
    { description: 'Adaptasi format media sosial (9:16 & 1:1)', qty: 8, unitPrice: 3500000 },
  ])
  await db.portalComment.create({ data: {
    entityType: 'QUOTATION', entityId: q4.id, companyId: kemenkes.id, userId: null,
    userName: 'Sinta Maharani', userRole: 'CLIENT',
    body: 'Terima kasih atas proposalnya. Namun anggaran kampanye tahun ini telah dialokasikan ke vendor lain. Semoga bisa bekerja sama pada periode anggaran berikutnya.',
    createdAt: d(-1, 15),
  } })
  await db.auditLog.create({ data: {
    userName: 'Sinta Maharani', action: 'PORTAL_QUOTATION_DECISION',
    entityType: 'Quotation', entityId: q4.id, entityLabel: `QUO-${year}-0004 — Animasi 2D Kampanye Vaksinasi (4 Episode)`,
    newValue: JSON.stringify({ decision: 'REJECTED', by: 'Sinta Maharani', source: 'seed' }),
  } })

  const mkInvoice = async (n: number, data: Record<string, unknown>) => {
    const amount = data.amount as number
    const taxPct = (data.taxPct as number) ?? 0
    const total = Math.round(amount * (1 + taxPct / 100))
    return db.invoice.create({ data: { ...(data as unknown as Prisma.InvoiceUncheckedCreateInput), code: `INV-${year}-${String(n).padStart(4, '0')}`, total } })
  }

  const inv1 = await mkInvoice(1, {
    opportunityId: o9.id, projectId: p1.id,
    brandId: segia.id, companyId: hotelier.id,
    title: 'DP 50% — Website + Booking Engine Jaringan Hotel', status: 'PARTIAL',
    amount: 230000000, taxPct: 0, dueDate: d(-5), issuedAt: d(-4),
    notes: 'Termin 1 dari 2. Pelunasan setelah fase development selesai.',
  })
  const inv2 = await mkInvoice(2, {
    opportunityId: o10.id, projectId: p2.id, brandId: unicam.id, companyId: bumi.id,
    title: 'Corporate Video Program CSR — Termin 1 (50%)', status: 'PAID',
    amount: 92500000, taxPct: 0, dueDate: d(-6), issuedAt: d(-11),
    notes: 'Dibayar penuh via transfer.',
  })

  await Promise.all([
    db.payment.create({ data: { invoiceId: inv1.id, amount: 92000000, method: 'TRANSFER', reference: 'TRF/BCA/88213', paidAt: d(-4), note: 'DP masuk', recordedById: sari.id } }),
    db.payment.create({ data: { invoiceId: inv2.id, amount: 92500000, method: 'TRANSFER', reference: 'TRF/Mandiri/55021', paidAt: d(-7), recordedById: sari.id } }),
  ])
  await db.invoice.update({ where: { id: inv2.id }, data: { paidAmount: 92500000 } })
  await db.invoice.update({ where: { id: inv1.id }, data: { paidAmount: 92000000 } })

  // Invoice Bank Sentosa (dari QUO-2026-0002 ACCEPTED) — data demo Client Portal
  const inv3 = await mkInvoice(3, {
    opportunityId: o14.id, quotationId: q2.id, projectId: p3.id,
    brandId: segia.id, companyId: sentosa.id,
    title: 'DP 50% — UI/UX Redesign Mobile Banking', status: 'PARTIAL',
    amount: 170000000, taxPct: 0, dueDate: d(-2), issuedAt: d(-6),
    notes: 'Termin 1 dari 2. Pelunasan setelah fase UI design selesai.',
  })
  const inv4 = await mkInvoice(4, {
    opportunityId: o14.id, quotationId: q2.id, projectId: p3.id,
    brandId: segia.id, companyId: sentosa.id,
    title: 'Termin 1 — Design System & Discovery Bank Sentosa', status: 'PAID',
    amount: 90000000, taxPct: 0, dueDate: d(-9), issuedAt: d(-15),
    notes: 'Dibayar penuh via transfer.',
  })
  await Promise.all([
    db.payment.create({ data: { invoiceId: inv3.id, amount: 100000000, method: 'TRANSFER', reference: 'TRF/BCA/90417', paidAt: d(-5), note: 'Sebagian DP', recordedById: sari.id } }),
    db.payment.create({ data: { invoiceId: inv4.id, amount: 90000000, method: 'TRANSFER', reference: 'TRF/BCA/88110', paidAt: d(-10), recordedById: sari.id } }),
  ])
  await db.invoice.update({ where: { id: inv3.id }, data: { paidAmount: 100000000 } })
  await db.invoice.update({ where: { id: inv4.id }, data: { paidAmount: 90000000 } })

  await Promise.all([
    db.auditLog.create({ data: { userId: fajar.id, userName: 'Fajar Pratama', action: 'QUOTATION_SENT', entityType: 'Quotation', entityId: q1.id, entityLabel: `QUO-${year}-0001 — Company Profile Video 2025`, newValue: JSON.stringify({ status: 'SENT', discountPct: 8, total: q1.total }), ip: '103.11.22.40' } }),
    db.auditLog.create({ data: { userId: sari.id, userName: 'Sari Kusuma', action: 'PAYMENT_RECORD', entityType: 'Invoice', entityId: inv2.id, entityLabel: `INV-${year}-0002 — Corporate Video CSR Termin 1`, newValue: JSON.stringify({ amount: 92500000, method: 'TRANSFER', status: 'PAID' }), ip: '103.11.22.61' } }),
    db.auditLog.create({ data: { userId: sari.id, userName: 'Sari Kusuma', action: 'PAYMENT_RECORD', entityType: 'Invoice', entityId: inv3.id, entityLabel: `INV-${year}-0003 — DP 50% UI/UX Redesign Mobile Banking`, newValue: JSON.stringify({ amount: 100000000, method: 'TRANSFER', status: 'PARTIAL' }), ip: '103.11.22.61' } }),
  ])

  /* ---------------- BRIEF & ESTIMATION (o14 — quotation ACCEPTED) ---------------- */
  const brief14 = await db.brief.create({ data: {
    opportunityId: o14.id,
    serviceScope: 'Redesign UI/UX aplikasi mobile banking Android & iOS: discovery & user research, design system, UI design 40+ layar, prototipe interaktif, usability testing, dan handoff ke tim developer internal bank.',
    objectives: 'Modernisasi pengalaman mobile banking; menaikkan rating app store dari 3,9 ke 4,5; menurunkan keluhan call center terkait navigasi 30%; mendukung target aktivasi digital onboarding 60.000 nasabah baru dalam 6 bulan.',
    targetAudience: 'Nasabah retail usia 22–45 tahun (±75% Android), nasabah prioritas, dan calon nasabah muda yang berpindah dari bank digital.',
    keyMessages: 'Aman & terpercaya (bank regulated), cepat (transfer & bayar < 3 langkah), personal (dashboard menyesuaikan pola transaksi nasabah).',
    deliverables: 'Research report + persona; design system (token, komponen, pola); UI 40+ layar (light/dark); prototipe klik Figma; laporan usability testing 15 responden; aset handoff + spesifikasi developer; 2 sesi pendampingan implementasi.',
    timeline: 'Minggu 1–2 discovery & research; minggu 3–4 design system; minggu 5–9 UI design bertahap per modul; minggu 10 prototipe & usability testing; minggu 11–12 revisi & handoff. Kick-off 1 minggu setelah PO diterima.',
    references: 'Visual: aplikasi mobile banking unggulan lokal & regional. Flow: onboarding bank digital terkemuka. Seluruh komponen mengikuti brand guideline Bank Sentosa v3.',
    budgetRange: `Rp 300–360 jt (selaras QUO-${year}-0002 yang disetujui); eksklusi lisensi pihak ketiga di luar daftar dan produksi aset foto.`,
    constraints: 'Security review per layar oleh tim IT bank; aset & file kerja disimpan di server bank (tanpa cloud pribadi); usability test hanya memakai data dummy; revisi desain maksimal 3 putaran.',
    status: 'FINAL',
    preparedById: fajar.id,
  }})

  // lineTotal = qty × unitCost × (days ?? 1) — formula sama dengan API /estimation
  const estItems = [
    { category: 'INTERNAL', description: 'UX Researcher — discovery, user interview & usability testing', qty: 2, unit: 'orang', unitCost: 3500000, days: 5 },
    { category: 'INTERNAL', description: 'UI/UX Designer — design system, 40+ layar & prototipe', qty: 2, unit: 'orang', unitCost: 3200000, days: 15 },
    { category: 'FREELANCE', description: 'Editor freelance — video tutorial onboarding in-app', qty: 1, unit: 'paket', unitCost: 12000000, days: null },
    { category: 'EQUIPMENT', description: 'Sewa device lab (ponsel Android/iOS + laptop) usability testing', qty: 6, unit: 'unit', unitCost: 500000, days: 4 },
    { category: 'TRANSPORT', description: 'Transport & operasional tim workshop di Jakarta', qty: 8, unit: 'perjalanan', unitCost: 350000, days: null },
    { category: 'ACCOMMODATION', description: 'Akomodasi tim discovery (4 kamar × 2 malam)', qty: 4, unit: 'kamar', unitCost: 950000, days: 2 },
    { category: 'TALENT', description: 'Narator voice-over video tutorial onboarding', qty: 1, unit: 'orang', unitCost: 4000000, days: null },
    { category: 'LOCATION', description: 'Sewa ruang workshop & focus group discussion', qty: 2, unit: 'hari', unitCost: 4500000, days: null },
    { category: 'SOFTWARE', description: 'Lisensi Figma & tool prototyping (3 bulan)', qty: 3, unit: 'bulan', unitCost: 2500000, days: null },
    { category: 'HOSTING', description: 'Hosting prototipe & rekaman usability testing (3 bulan)', qty: 3, unit: 'bulan', unitCost: 1300000, days: null },
  ]
  const internalCost = estItems.filter((i) => i.category === 'INTERNAL').reduce((a, i) => a + i.qty * i.unitCost * (i.days ?? 1), 0)
  const externalCost = estItems.filter((i) => i.category !== 'INTERNAL').reduce((a, i) => a + i.qty * i.unitCost * (i.days ?? 1), 0)
  const subtotalCost = internalCost + externalCost
  const contingencyPct = 5
  const managementFeePct = 10
  const targetMarginPct = 30
  const taxPct = 11
  const contingencyAmount = (subtotalCost * contingencyPct) / 100
  const managementFeeAmount = (subtotalCost * managementFeePct) / 100
  const totalCost = subtotalCost + contingencyAmount + managementFeeAmount
  const sellingPrice = Math.round(totalCost / (1 - targetMarginPct / 100))
  const taxAmount = (sellingPrice * taxPct) / 100
  const priceWithTax = sellingPrice + taxAmount

  const est14 = await db.estimation.create({ data: {
    opportunityId: o14.id, currency: 'IDR', status: 'FINAL',
    internalCost, externalCost, subtotalCost, contingencyPct, contingencyAmount,
    managementFeePct, managementFeeAmount, totalCost, targetMarginPct, sellingPrice,
    taxPct, taxAmount, priceWithTax,
    notes: `Estimasi final selaras QUO-${year}-0002 yang disetujui (total Rp 340 jt). Selling price di bawah nilai quotation → margin aktual 35,8%; ruang negosiasi harga tetap tersedia.`,
    createdById: sari.id,
    items: { create: estItems.map((it, idx) => ({ ...it, sortOrder: idx })) },
  }})

  await Promise.all([
    db.auditLog.create({ data: { userId: fajar.id, userName: 'Fajar Pratama', action: 'BRIEF_SAVED', entityType: 'Brief', entityId: brief14.id, entityLabel: `${oppSeq(14)} — Brief`, newValue: JSON.stringify({ status: 'FINAL' }), ip: '103.11.22.40' } }),
    db.auditLog.create({ data: { userId: sari.id, userName: 'Sari Kusuma', action: 'ESTIMATION_SAVED', entityType: 'Estimation', entityId: est14.id, entityLabel: `${oppSeq(14)} — Estimasi`, newValue: JSON.stringify({ totalCost, sellingPrice, status: 'FINAL' }), ip: '103.11.22.61' } }),
  ])

  console.log('✅ Seed selesai:')
  console.log(`   Users: 6, Brands: 4, Services: 23, Companies: 10, Contacts: 14`)
  console.log(`   Opportunities: 16, Interactions: ~26, Tasks: 11, Projects: 2, Templates: 10`)
  console.log(`   Quotations: 3 (1 menunggu approval diskon), Invoices: 2 (1 outstanding), Payments: 2`)
  console.log(`   Brief: 1 (FINAL), Estimation: 1 (FINAL — ${estItems.length} item, subtotal Rp ${subtotalCost.toLocaleString('id-ID')})`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
