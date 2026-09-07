/* ============ /api/services/[id] — ubah & hapus layanan (R28) ============
 * PATCH  (SUPER_ADMIN/DIREKTUR) — ubah name/category/description/basePrice/estimatedDays/isActive.
 * DELETE (SUPER_ADMIN/DIREKTUR) — hapus permanen; ditolak (409) bila sudah dipakai opportunity
 *                                 → sarankan nonaktifkan saja.
 * ======================================================================== */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const stepsOrderBy = [{ sortOrder: 'asc' as const }, { name: 'asc' as const }]

async function guardManage() {
  const session = await getSessionUser()
  if (!session) {
    return { session: null, error: NextResponse.json({ error: 'Belum login' }, { status: 401 }) }
  }
  if (session.role !== 'SUPER_ADMIN' && session.role !== 'DIREKTUR') {
    return {
      session: null,
      error: NextResponse.json(
        { error: 'Hanya Direktur/Super Admin yang dapat mengelola layanan' },
        { status: 403 }
      ),
    }
  }
  return { session, error: null }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await guardManage()
  if (!session) return error

  const { id } = await params
  const service = await db.service.findUnique({ where: { id }, include: { brand: { select: { name: true } } } })
  if (!service) return NextResponse.json({ error: 'Layanan tidak ditemukan' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const data: Record<string, unknown> = {}

  if (typeof body?.name === 'string') {
    const name = body.name.trim()
    if (!name) return NextResponse.json({ error: 'Nama layanan tidak boleh kosong' }, { status: 400 })
    if (name.length > 120) return NextResponse.json({ error: 'Nama layanan terlalu panjang (maks 120)' }, { status: 400 })
    const duplicate = await db.service.findFirst({ where: { brandId: service.brandId, name: { equals: name }, id: { not: id } } })
    if (duplicate) return NextResponse.json({ error: `Layanan "${name}" sudah ada di brand ini` }, { status: 409 })
    data.name = name
  }
  if (typeof body?.category === 'string') data.category = body.category.trim().slice(0, 60) || 'Umum'
  if (typeof body?.description === 'string') data.description = body.description.trim().slice(0, 1000) || null
  if (body?.basePrice === null) data.basePrice = null
  if (typeof body?.basePrice === 'number') {
    if (body.basePrice < 0) return NextResponse.json({ error: 'Harga dasar tidak boleh negatif' }, { status: 400 })
    data.basePrice = body.basePrice
  }
  if (body?.estimatedDays === null) data.estimatedDays = null
  if (typeof body?.estimatedDays === 'number') {
    if (body.estimatedDays < 0 || body.estimatedDays > 3650) {
      return NextResponse.json({ error: 'Estimasi hari harus 0–3650' }, { status: 400 })
    }
    data.estimatedDays = Math.round(body.estimatedDays)
  }
  if (typeof body?.isActive === 'boolean') data.isActive = body.isActive

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Tidak ada perubahan' }, { status: 400 })
  }

  const updated = await db.service.update({
    where: { id },
    data,
    include: { steps: { orderBy: stepsOrderBy } },
  })

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'UPDATE',
    entityType: 'Service',
    entityId: id,
    entityLabel: `${service.brand.name} — ${updated.name}`,
    oldValue: {
      name: service.name, category: service.category, description: service.description,
      basePrice: service.basePrice, estimatedDays: service.estimatedDays, isActive: service.isActive,
    },
    newValue: data,
    req,
  })

  return NextResponse.json({
    id: updated.id, name: updated.name, category: updated.category, brandId: updated.brandId,
    description: updated.description, basePrice: updated.basePrice,
    estimatedDays: updated.estimatedDays, isActive: updated.isActive,
    steps: updated.steps.map((st) => ({
      id: st.id, name: st.name, description: st.description,
      estimatedDays: st.estimatedDays, price: st.price, sortOrder: st.sortOrder,
    })),
  })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await guardManage()
  if (!session) return error

  const { id } = await params
  const service = await db.service.findUnique({
    where: { id },
    include: {
      brand: { select: { name: true } },
      _count: { select: { opportunities: true } },
    },
  })
  if (!service) return NextResponse.json({ error: 'Layanan tidak ditemukan' }, { status: 404 })

  if (service._count.opportunities > 0) {
    return NextResponse.json(
      {
        error: `Layanan dipakai ${service._count.opportunities} opportunity — nonaktifkan saja agar riwayat tetap utuh`,
      },
      { status: 409 }
    )
  }

  await db.service.delete({ where: { id } })

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'DELETE',
    entityType: 'Service',
    entityId: id,
    entityLabel: `${service.brand.name} — ${service.name}`,
    oldValue: { name: service.name, category: service.category, basePrice: service.basePrice },
    req,
  })

  return NextResponse.json({ ok: true })
}
