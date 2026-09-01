/* ============ /api/users — list (auth), create (SUPER_ADMIN) ============ */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, mapUser } from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const ROLES = ['SUPER_ADMIN', 'DIREKTUR', 'MANAJER', 'MARKETING', 'KEUANGAN', 'PRODUKSI', 'HR']

/** GET → UserDTO[] */
export async function GET() {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const users = await db.user.findMany({
    include: { brandAccess: { select: { brandId: true } } },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(users.map(mapUser))
}

/** POST { name, email, role, title?, avatarColor?, brandIds } → create user (SUPER_ADMIN only) */
export async function POST(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })
  if (session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Hanya Super Admin yang dapat membuat user' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const role = typeof body?.role === 'string' ? body.role : ''
  if (!name || !email || !role) {
    return NextResponse.json({ error: 'Nama, email, dan role wajib diisi' }, { status: 400 })
  }
  if (!ROLES.includes(role)) {
    return NextResponse.json({ error: 'Role tidak valid' }, { status: 400 })
  }

  const existing = await db.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: 'Email sudah digunakan' }, { status: 400 })
  }

  const brandIds: string[] = Array.isArray(body?.brandIds) ? body.brandIds.filter((b: unknown) => typeof b === 'string') : []
  const validBrands = brandIds.length
    ? await db.brand.findMany({ where: { id: { in: brandIds } }, select: { id: true } })
    : []

  const user = await db.user.create({
    data: {
      name,
      email,
      role,
      title: typeof body?.title === 'string' && body.title ? body.title : null,
      avatarColor: typeof body?.avatarColor === 'string' && body.avatarColor ? body.avatarColor : '#10b981',
      ...(validBrands.length
        ? { brandAccess: { create: validBrands.map((b) => ({ brandId: b.id })) } }
        : {}),
    },
    include: { brandAccess: { select: { brandId: true } } },
  })

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'CREATE',
    entityType: 'User',
    entityId: user.id,
    entityLabel: user.name,
    newValue: { name, email, role, brandIds: validBrands.map((b) => b.id) },
    req,
  })

  return NextResponse.json(mapUser(user))
}
