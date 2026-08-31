/* ============ /api/brands — list brands with services (internal, auth) ============ */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, mapBrand } from '@/lib/crm-server'

export const dynamic = 'force-dynamic'

/** GET → BrandDTO[] (services ordered by category,name).
 *  R15 engineering fix: endpoint ini sebelumnya TANPA sesi (satu-satunya route data
 *  yang terbuka publik). Konfigurasi brand (prefix invoice, SLA, kontak) tidak boleh
 *  diakses tanpa login — bootstrap memang no-auth by design (picker login demo),
 *  tapi API langsung wajib 401. */
export async function GET() {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const brands = await db.brand.findMany({
    include: { services: { orderBy: [{ category: 'asc' }, { name: 'asc' }] } },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(brands.map(mapBrand))
}
