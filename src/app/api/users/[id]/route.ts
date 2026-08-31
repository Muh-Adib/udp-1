/* ============ /api/users/[id] — update / soft-delete (SUPER_ADMIN) ============ */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, mapUser } from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const ROLES = ['SUPER_ADMIN', 'DIREKTUR', 'MARKETING', 'KEUANGAN', 'PRODUKSI']

/** PATCH { role?, isActive?, name?, title?, avatarColor?, brandIds? } */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })
  if (session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Hanya Super Admin yang dapat mengubah user' }, { status: 403 })
  }

  const { id } = await ctx.params
  const user = await db.user.findUnique({ where: { id }, include: { brandAccess: { select: { brandId: true } } } })
  if (!user) return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const data: Record<string, unknown> = {}
  const newValue: Record<string, unknown> = {}
  const oldValue: Record<string, unknown> = {}

  if (typeof body?.name === 'string' && body.name.trim() && body.name !== user.name) {
    data.name = body.name.trim()
    oldValue.name = user.name
    newValue.name = body.name.trim()
  }
  if (typeof body?.title === 'string' && body.title !== (user.title ?? '')) {
    data.title = body.title || null
    oldValue.title = user.title
    newValue.title = data.title
  }
  if (typeof body?.avatarColor === 'string' && body.avatarColor && body.avatarColor !== user.avatarColor) {
    data.avatarColor = body.avatarColor
    oldValue.avatarColor = user.avatarColor
    newValue.avatarColor = body.avatarColor
  }
  if (typeof body?.role === 'string' && body.role && body.role !== user.role) {
    if (!ROLES.includes(body.role)) {
      return NextResponse.json({ error: 'Role tidak valid' }, { status: 400 })
    }
    data.role = body.role
    oldValue.role = user.role
    newValue.role = body.role
  }
  if (typeof body?.isActive === 'boolean' && body.isActive !== user.isActive) {
    if (!body.isActive && user.id === session.id) {
      return NextResponse.json({ error: 'Tidak dapat menonaktifkan akun sendiri' }, { status: 400 })
    }
    data.isActive = body.isActive
    oldValue.isActive = user.isActive
    newValue.isActive = body.isActive
  }
  if (Array.isArray(body?.brandIds)) {
    const brandIds = body.brandIds.filter((b: unknown) => typeof b === 'string')
    const validBrands = brandIds.length
      ? await db.brand.findMany({ where: { id: { in: brandIds } }, select: { id: true } })
      : []
    const nextIds = validBrands.map((b) => b.id).sort()
    const currentIds = user.brandAccess.map((b) => b.brandId).sort()
    if (JSON.stringify(nextIds) !== JSON.stringify(currentIds)) {
      oldValue.brandIds = currentIds
      newValue.brandIds = nextIds
      await db.userBrandAccess.deleteMany({ where: { userId: id } })
      if (nextIds.length) {
        await db.userBrandAccess.createMany({
          data: nextIds.map((brandId) => ({ userId: id, brandId })),
        })
      }
    }
  }

  const brandChanged = 'brandIds' in oldValue
  if (Object.keys(data).length === 0 && !brandChanged) {
    return NextResponse.json({ error: 'Tidak ada perubahan' }, { status: 400 })
  }

  let updated = user
  if (Object.keys(data).length > 0) {
    updated = await db.user.update({
      where: { id },
      data,
      include: { brandAccess: { select: { brandId: true } } },
    })
  } else if (brandChanged) {
    // only brandAccess rows changed → refetch to return fresh brandIds
    updated = (await db.user.findUnique({
      where: { id },
      include: { brandAccess: { select: { brandId: true } } },
    })) ?? user
  }

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'UPDATE',
    entityType: 'User',
    entityId: id,
    entityLabel: user.name,
    oldValue,
    newValue,
    req,
  })

  return NextResponse.json(mapUser(updated))
}

/** DELETE → soft delete (isActive=false) */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })
  if (session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Hanya Super Admin yang dapat menghapus user' }, { status: 403 })
  }

  const { id } = await ctx.params
  if (id === session.id) {
    return NextResponse.json({ error: 'Tidak dapat menonaktifkan akun sendiri' }, { status: 400 })
  }
  const user = await db.user.findUnique({ where: { id } })
  if (!user) return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 })
  if (!user.isActive) return NextResponse.json({ error: 'User sudah tidak aktif' }, { status: 400 })

  await db.user.update({ where: { id }, data: { isActive: false } })

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'DELETE',
    entityType: 'User',
    entityId: id,
    entityLabel: user.name,
    oldValue: { isActive: true },
    newValue: { isActive: false },
    req,
  })

  return NextResponse.json({ ok: true })
}
