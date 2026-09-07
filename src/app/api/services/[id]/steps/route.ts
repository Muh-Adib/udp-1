/* ============ /api/services/[id]/steps — workflow template per layanan (R28) ============
 * PUT (SUPER_ADMIN/DIREKTUR) — simpan workflow layanan (replace-all transaksional):
 *   { steps: [{ name, description?, estimatedDays, price, sortOrder }] }
 * Dipakai sebagai template milestone + estimasi + pricing saat "Buat Project dari Brief".
 * ======================================================================================= */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

interface StepInput {
  name: string
  description?: string | null
  estimatedDays: number
  price: number
  sortOrder: number
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })
  if (session.role !== 'SUPER_ADMIN' && session.role !== 'DIREKTUR') {
    return NextResponse.json({ error: 'Hanya Direktur/Super Admin yang dapat mengelola workflow layanan' }, { status: 403 })
  }

  const { id } = await params
  const service = await db.service.findUnique({
    where: { id },
    include: { brand: { select: { name: true } }, steps: { orderBy: { sortOrder: 'asc' } } },
  })
  if (!service) return NextResponse.json({ error: 'Layanan tidak ditemukan' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const raw = Array.isArray(body?.steps) ? body.steps : []
  if (raw.length === 0) {
    return NextResponse.json({ error: 'Minimal 1 tahap workflow diperlukan' }, { status: 400 })
  }
  if (raw.length > 30) {
    return NextResponse.json({ error: 'Maksimal 30 tahap workflow' }, { status: 400 })
  }

  const steps: StepInput[] = []
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i]
    const name = typeof s?.name === 'string' ? s.name.trim() : ''
    if (!name) return NextResponse.json({ error: `Nama tahap #${i + 1} wajib diisi` }, { status: 400 })
    if (name.length > 120) return NextResponse.json({ error: `Nama tahap #${i + 1} terlalu panjang (maks 120)` }, { status: 400 })
    let days = typeof s?.estimatedDays === 'number' && Number.isFinite(s.estimatedDays) ? Math.round(s.estimatedDays) : 1
    if (days < 1 || days > 365) {
      return NextResponse.json({ error: `Estimasi hari tahap #${i + 1} harus 1–365` }, { status: 400 })
    }
    let price = typeof s?.price === 'number' && Number.isFinite(s.price) ? s.price : 0
    if (price < 0) {
      return NextResponse.json({ error: `Harga tahap #${i + 1} tidak boleh negatif` }, { status: 400 })
    }
    const description = typeof s?.description === 'string' && s.description.trim()
      ? s.description.trim().slice(0, 2000) : null
    steps.push({ name, description, estimatedDays: days, price, sortOrder: i + 1 })
  }

  // Replace-all dalam transaksi — urutan workflow selalu konsisten
  await db.$transaction([
    db.serviceStep.deleteMany({ where: { serviceId: id } }),
    db.serviceStep.createMany({ data: steps.map((st) => ({ ...st, serviceId: id })) }),
  ])

  const saved = await db.serviceStep.findMany({ where: { serviceId: id }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] })

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'UPDATE',
    entityType: 'Service',
    entityId: id,
    entityLabel: `${service.brand.name} — ${service.name} (workflow)`,
    oldValue: {
      steps: service.steps.map((st) => ({ name: st.name, estimatedDays: st.estimatedDays, price: st.price })),
    },
    newValue: { steps: steps.map((st) => ({ name: st.name, estimatedDays: st.estimatedDays, price: st.price })) },
    req,
  })

  return NextResponse.json({
    ok: true,
    steps: saved.map((st) => ({
      id: st.id, name: st.name, description: st.description,
      estimatedDays: st.estimatedDays, price: st.price, sortOrder: st.sortOrder,
    })),
  })
}
