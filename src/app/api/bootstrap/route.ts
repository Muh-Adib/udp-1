/* ============ /api/bootstrap — shell hydration (no auth required) ============ */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, mapBrand, mapUser } from '@/lib/crm-server'

export const dynamic = 'force-dynamic'

/** GET → { user, users: UserDTO[], brands: BrandDTO[] } */
export async function GET() {
  const [user, users, brands] = await Promise.all([
    getSessionUser(),
    db.user.findMany({
      include: { brandAccess: { select: { brandId: true } } },
      orderBy: { name: 'asc' },
    }),
    db.brand.findMany({
      include: { services: { orderBy: [{ category: 'asc' }, { name: 'asc' }] } },
      orderBy: { name: 'asc' },
    }),
  ])

  return NextResponse.json({
    user,
    users: users.map(mapUser),
    brands: brands.map(mapBrand),
  })
}
