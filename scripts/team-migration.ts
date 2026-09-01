/* ============ Team migration — R22 ============
 * Menyesuaikan kast user demo menjadi tim nyata (9 akun bernama + admin sistem):
 *   Ratna Wijaya      — SUPER_ADMIN (sistem, tetap)
 *   Andri Saputro     — DIREKTUR      (dari Bambang)
 *   Budi M. Kurniawan — MANAJER       (dari Fajar; data deal dipindah ke Fadel)
 *   Fadel             — MARKETING     (dari Dewi)
 *   Sika              — KEUANGAN      (dari Sari)
 *   Yusi              — PRODUKSI mgr  (dari Andi)
 *   + Rustam Aji / Fais / Adib (PRODUKSI), Latifa (HR)
 * Non-destruktif: rename email+nama mempertahankan seluruh FK demo data.
 * Juga men-seed QuickTemplate (/keyword) contoh dari kebutuhan user.
 * Jalankan SEKALI: bun scripts/team-migration.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const ALL_BRAND_SLUGS = ['unimasi', 'segia-tech', 'erfo-multimedia', 'unicam-studio']

async function grantAllBrands(userId: string) {
  const brands = await db.brand.findMany({ where: { slug: { in: ALL_BRAND_SLUGS } }, select: { id: true } })
  for (const b of brands) {
    await db.userBrandAccess.upsert({
      where: { userId_brandId: { userId, brandId: b.id } },
      create: { userId, brandId: b.id, canManage: false },
      update: {},
    })
  }
}

async function main() {
  console.log('🚚 Migrasi tim 9 akun bernama...')

  /* 1) RENAME akun lama → tim nyata (FK demo data tetap utuh) */
  const renames: Array<{ from: string; to: { email: string; name: string; role: string; title: string; avatarColor: string } }> = [
    { from: 'bambang@grupakreasi.id', to: { email: 'andri@grupakreasi.id', name: 'Andri Saputro', role: 'DIREKTUR', title: 'Direktur', avatarColor: '#f59e0b' } },
    { from: 'dewi@grupakreasi.id', to: { email: 'fadel@grupakreasi.id', name: 'Fadel', role: 'MARKETING', title: 'Marketing', avatarColor: '#8b5cf6' } },
    { from: 'fajar@grupakreasi.id', to: { email: 'budi@grupakreasi.id', name: 'Budi M. Kurniawan', role: 'MANAJER', title: 'Manajer Operasional', avatarColor: '#14b8a6' } },
    { from: 'sari@grupakreasi.id', to: { email: 'sika@grupakreasi.id', name: 'Sika', role: 'KEUANGAN', title: 'Finance', avatarColor: '#ec4899' } },
    { from: 'andi@grupakreasi.id', to: { email: 'yusi@grupakreasi.id', name: 'Yusi', role: 'PRODUKSI', title: 'Production Manager', avatarColor: '#84cc16' } },
  ]
  const idBy = new Map<string, string>() // email lama → id user
  for (const r of renames) {
    const u = await db.user.findUnique({ where: { email: r.from } })
    if (!u) { console.log(`  ⚠ ${r.from} tidak ditemukan — lewati`); continue }
    await db.user.update({ where: { id: u.id }, data: r.to })
    idBy.set(r.from, u.id)
    await grantAllBrands(u.id)
    console.log(`  ✔ ${r.from} → ${r.to.email} (${r.to.role})`)
  }

  const fadelId = idBy.get('dewi@grupakreasi.id')
  const budiId = idBy.get('fajar@grupakreasi.id')
  const yusiId = idBy.get('andi@grupakreasi.id')

  /* 2) Data milik Fajar (kini Manajer) yang sifatnya marketing → pindah ke Fadel */
  if (fadelId && budiId) {
    const opps = await db.opportunity.updateMany({ where: { ownerId: budiId }, data: { ownerId: fadelId } })
    const quos = await db.quotation.updateMany({ where: { createdById: budiId }, data: { createdById: fadelId } })
    const inters = await db.interaction.updateMany({ where: { respondedById: budiId }, data: { respondedById: fadelId } })
    const notes = await db.note.updateMany({ where: { authorId: budiId }, data: { authorId: fadelId } })
    const briefs = await db.brief.updateMany({ where: { preparedById: budiId }, data: { preparedById: fadelId } })
    console.log(`  ✔ reassign fajar→fadel: opp=${opps.count} quo=${quos.count} msg=${inters.count} note=${notes.count} brief=${briefs.count}`)
  }

  /* 3) Buat akun produksi & HR baru */
  const newUsers: Array<{ email: string; name: string; role: string; title: string; avatarColor: string }> = [
    { email: 'rustam@grupakreasi.id', name: 'Rustam Aji', role: 'PRODUKSI', title: 'Produksi', avatarColor: '#16a34a' },
    { email: 'fais@grupakreasi.id', name: 'Fais', role: 'PRODUKSI', title: 'Produksi', avatarColor: '#65a30d' },
    { email: 'adib@grupakreasi.id', name: 'Adib', role: 'PRODUKSI', title: 'Produksi', avatarColor: '#a3e635' },
    { email: 'latifa@grupakreasi.id', name: 'Latifa', role: 'HR', title: 'Human Resources', avatarColor: '#f97316' },
  ]
  for (const n of newUsers) {
    const existing = await db.user.findUnique({ where: { email: n.email } })
    const u = existing
      ? await db.user.update({ where: { email: n.email }, data: n })
      : await db.user.create({ data: n })
    await grantAllBrands(u.id)
    console.log(`  ✔ akun ${n.email} (${n.role}) siap`)
  }

  const rustam = await db.user.findUnique({ where: { email: 'rustam@grupakreasi.id' } })
  const fais = await db.user.findUnique({ where: { email: 'fais@grupakreasi.id' } })
  const adib = await db.user.findUnique({ where: { email: 'adib@grupakreasi.id' } })

  /* 4) Sebagian tugas produksi milik Yusi didistribusikan ke tim produksi baru (variasi demo) */
  if (yusiId && rustam && fais && adib) {
    const yusiTasks = await db.task.findMany({ where: { assigneeId: yusiId, status: { in: ['OPEN', 'IN_PROGRESS'] } }, orderBy: { createdAt: 'asc' }, take: 4, select: { id: true } })
    const map = [rustam.id, fais.id, adib.id, rustam.id]
    for (let i = 0; i < yusiTasks.length; i++) {
      await db.task.update({ where: { id: yusiTasks[i].id }, data: { assigneeId: map[i] } })
    }
    console.log(`  ✔ ${yusiTasks.length} tugas produksi didistribusikan ke Rustam/Fais/Adib`)
  }

  /* 5) Seed QuickTemplate (/keyword) — contoh dari kebutuhan user */
  const admin = await db.user.findFirst({ where: { role: 'SUPER_ADMIN' } })
  const quickTemplates = [
    {
      keyword: 'terimakasih',
      body: 'Halo {{contact_name}}, terima kasih! Permintaan {{service_name}} dari {{company_name}} sudah kami terima. Saya {{marketing_name}} dari {{brand_name}}. Apakah boleh tahu target tayang & durasi yang diinginkan?',
      description: 'Balasan permintaan masuk — konfirmasi + gali target & durasi',
    },
    {
      keyword: 'followup',
      body: 'Hi {{contact_name}},\n\nFollowing up on your inquiry about {{service_name}}. Here are two case studies similar to what {{company_name}} needs:\n1. Case study A — booking engine for hospitality\n2. Case study B — corporate website revamp\n\nHappy to walk you through. Estimated timeline: {{estimated_timeline}}.\n\nBest,\n{{marketing_name}}',
      description: 'Follow-up bahasa Inggris + case study + estimasi timeline',
    },
    {
      keyword: 'jadwal',
      body: 'Halo {{contact_name}}, saya {{marketing_name}} dari {{brand_name}}. Apakah {{company_name}} tersedia untuk diskusi singkat 15 menit minggu ini? Kami fleksibel mengikuti jadwal Bapak/Ibu.',
      description: 'Mengajukan meeting discovery',
    },
    {
      keyword: 'penawaran',
      body: 'Halo {{contact_name}}, penawaran untuk {{service_name}} sudah kami kirimkan. Estimasi pengerjaan {{estimated_timeline}}. Bila ada angka/scope yang perlu disesuaikan dengan rencana {{company_name}}, kami siap membantu. Terima kasih! — {{marketing_name}}, {{brand_name}}',
      description: 'Follow-up setelah penawaran terkirim',
    },
  ]
  for (const t of quickTemplates) {
    await db.quickTemplate.upsert({
      where: { keyword: t.keyword },
      create: { ...t, creatorId: admin?.id ?? null, creatorName: admin?.name ?? 'Sistem' },
      update: { body: t.body, description: t.description, isActive: true },
    })
    console.log(`  ✔ template /${t.keyword}`)
  }

  /* 6) Ringkasan tim */
  const team = await db.user.findMany({ where: { isActive: true }, orderBy: [{ role: 'asc' }, { name: 'asc' }] })
  console.log('\n👥 Tim aktif:')
  for (const u of team) console.log(`   ${u.role.padEnd(12)} ${u.name.padEnd(20)} ${u.email}`)
  console.log('\n✅ Migrasi selesai.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
