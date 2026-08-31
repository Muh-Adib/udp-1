/* ============ /api/companies — list + search, create ============ */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, mapCompany, splitTags } from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/** GET ?search=&country=&industry= → CompanyDTO[] */
export async function GET(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const search = (searchParams.get('search') ?? '').trim().toLowerCase()
  const country = (searchParams.get('country') ?? '').trim().toLowerCase()
  const industry = (searchParams.get('industry') ?? '').trim().toLowerCase()

  const companies = await db.company.findMany({
    where: { isDeleted: false },
    include: {
      owner: { select: { id: true, name: true } },
      contacts: { where: { isDeleted: false }, select: { id: true } },
      opportunities: { where: { isDeleted: false }, select: { stage: true, estimatedValue: true } },
    },
    orderBy: { name: 'asc' },
  })

  // SQLite `contains` is case-sensitive → filter in JS for correctness.
  const filtered = companies.filter((c) => {
    if (search) {
      const haystack = `${c.name} ${c.city ?? ''} ${c.industry ?? ''}`.toLowerCase()
      if (!haystack.includes(search)) return false
    }
    if (country && c.country.toLowerCase() !== country) return false
    if (industry && (c.industry ?? '').toLowerCase() !== industry) return false
    return true
  })

  return NextResponse.json(filtered.map(mapCompany))
}

/** POST { name, industry?, website?, country, city?, size?, taxId?, currency?, tags?, notes?, ownerId? } */
export async function POST(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'Nama perusahaan wajib diisi' }, { status: 400 })

  const company = await db.company.create({
    data: {
      name,
      industry: typeof body?.industry === 'string' && body.industry ? body.industry : null,
      website: typeof body?.website === 'string' && body.website ? body.website : null,
      country: typeof body?.country === 'string' && body.country ? body.country : 'Indonesia',
      city: typeof body?.city === 'string' && body.city ? body.city : null,
      address: typeof body?.address === 'string' && body.address ? body.address : null,
      size: typeof body?.size === 'string' && body.size ? body.size : null,
      taxId: typeof body?.taxId === 'string' && body.taxId ? body.taxId : null,
      currency: typeof body?.currency === 'string' && body.currency ? body.currency : 'IDR',
      tags: splitTags(typeof body?.tags === 'string' ? body.tags : Array.isArray(body?.tags) ? body.tags.join(',') : '').join(','),
      notes: typeof body?.notes === 'string' && body.notes ? body.notes : null,
      ownerId: typeof body?.ownerId === 'string' && body.ownerId ? body.ownerId : null,
    },
    include: {
      owner: { select: { id: true, name: true } },
      contacts: { where: { isDeleted: false }, select: { id: true } },
      opportunities: { where: { isDeleted: false }, select: { stage: true, estimatedValue: true } },
    },
  })

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'CREATE',
    entityType: 'Company',
    entityId: company.id,
    entityLabel: company.name,
    newValue: { name, country: company.country, industry: company.industry },
    req,
  })

  return NextResponse.json(mapCompany(company))
}
