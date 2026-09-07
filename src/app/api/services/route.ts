/* ============ /api/services — katalog layanan + workflow template (R28) ============
 * GET  ?brandId=&includeInactive=1 → ServiceDTO[] (dengan steps terurut) — semua role internal.
 * POST (SUPER_ADMIN/DIREKTUR) → buat layanan { brandId, name, category?, description?, basePrice?, estimatedDays? }
 * Manage (tulis) mengikuti gate pengaturan brand: hanya SUPER_ADMIN & DIREKTUR.
 * ================================================================================== */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const stepsOrderBy = [{ sortOrder: 'asc' as const }, { name: 'asc' as const }]

/** GET — daftar layanan (opsional filter brand + sertakan nonaktif). */
export async function GET(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })
  if (session.role === 'CLIENT') {
    return NextResponse.json({ error: 'Akses khusus tim internal UDP' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const brandId = searchParams.get('brandId') ?? ''
  const includeInactive = searchParams.get('includeInactive') === '1'

  const services = await db.service.findMany({
    where: {
      ...(brandId ? { brandId } : {}),
      ...(includeInactive ? {} : { isActive: true }),
    },
    include: { steps: { orderBy: stepsOrderBy } },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  })

  return NextResponse.json(
    services.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      brandId: s.brandId,
      description: s.description,
      basePrice: s.basePrice,
      estimatedDays: s.estimatedDays,
      isActive: s.isActive,
      steps: s.steps.map((st) => ({
        id: st.id,
        name: st.name,
        description: st.description,
        estimatedDays: st.estimatedDays,
        price: st.price,
        sortOrder: st.sortOrder,
      })),
    }))
  )
}

/** POST — tambah layanan baru pada sebuah brand. */
export async function POST(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })
  if (session.role !== 'SUPER_ADMIN' && session.role !== 'DIREKTUR') {
    return NextResponse.json({ error: 'Hanya Direktur/Super Admin yang dapat mengelola layanan' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const brandId = typeof body?.brandId === 'string' ? body.brandId : ''
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!brandId) return NextResponse.json({ error: 'brandId wajib diisi' }, { status: 400 })
  if (!name) return NextResponse.json({ error: 'Nama layanan wajib diisi' }, { status: 400 })
  if (name.length > 120) return NextResponse.json({ error: 'Nama layanan terlalu panjang (maks 120)' }, { status: 400 })

  const brand = await db.brand.findUnique({ where: { id: brandId } })
  if (!brand) return NextResponse.json({ error: 'Brand tidak ditemukan' }, { status: 404 })

  const category = typeof body?.category === 'string' && body.category.trim()
    ? body.category.trim().slice(0, 60) : 'Umum'
  const description = typeof body?.description === 'string' && body.description.trim()
    ? body.description.trim().slice(0, 1000) : null
  if (typeof body?.basePrice === 'number' && body.basePrice < 0) {
    return NextResponse.json({ error: 'Harga dasar tidak boleh negatif' }, { status: 400 })
  }
  const basePrice = typeof body?.basePrice === 'number' && body.basePrice >= 0 ? body.basePrice : null
  const estimatedDays = typeof body?.estimatedDays === 'number' && body.estimatedDays >= 0
    ? Math.round(body.estimatedDays) : null

  const duplicate = await db.service.findFirst({ where: { brandId, name: { equals: name } } })
  if (duplicate) {
    return NextResponse.json({ error: `Layanan "${name}" sudah ada di brand ini` }, { status: 409 })
  }

  const created = await db.service.create({
    data: { brandId, name, category, description, basePrice, estimatedDays, isActive: true },
    include: { steps: { orderBy: stepsOrderBy } },
  })

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'CREATE',
    entityType: 'Service',
    entityId: created.id,
    entityLabel: `${brand.name} — ${created.name}`,
    newValue: { name, category, basePrice, estimatedDays },
    req,
  })

  return NextResponse.json(
    {
      id: created.id, name: created.name, category: created.category, brandId: created.brandId,
      description: created.description, basePrice: created.basePrice,
      estimatedDays: created.estimatedDays, isActive: created.isActive, steps: [],
    },
    { status: 201 }
  )
}
