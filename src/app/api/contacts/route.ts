/* ============ /api/contacts — list + search, create ============ */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, mapContact, splitTags } from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/** GET ?search=&companyId=&brandId=&country= → ContactDTO[] */
export async function GET(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const search = (searchParams.get('search') ?? '').trim().toLowerCase()
  const companyId = searchParams.get('companyId') ?? ''
  const brandId = searchParams.get('brandId') ?? ''
  const country = (searchParams.get('country') ?? '').trim().toLowerCase()

  const contacts = await db.contact.findMany({
    where: {
      isDeleted: false,
      ...(companyId ? { companyId } : {}),
    },
    include: {
      company: { select: { id: true, name: true, country: true } },
      opportunities: { where: { isDeleted: false }, select: { executingBrandId: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const filtered = contacts.filter((c) => {
    if (brandId && !c.opportunities.some((o) => o.executingBrandId === brandId)) return false
    if (country && c.country.toLowerCase() !== country) return false
    if (search) {
      const haystack = `${c.firstName} ${c.lastName ?? ''} ${c.email ?? ''} ${c.whatsapp ?? ''} ${c.phone ?? ''}`.toLowerCase()
      if (!haystack.includes(search)) return false
    }
    return true
  })

  return NextResponse.json(filtered.map(mapContact))
}

/** POST { firstName, lastName?, position?, email?, whatsapp?, phone?, companyId?, country?, city?, language?, preferredChannel?, tags?, notes? } */
export async function POST(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const firstName = typeof body?.firstName === 'string' ? body.firstName.trim() : ''
  if (!firstName) return NextResponse.json({ error: 'Nama depan wajib diisi' }, { status: 400 })

  if (body?.companyId) {
    const company = await db.company.findFirst({ where: { id: body.companyId, isDeleted: false } })
    if (!company) return NextResponse.json({ error: 'Perusahaan tidak ditemukan' }, { status: 404 })
  }

  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

  const contact = await db.contact.create({
    data: {
      firstName,
      lastName: str(body?.lastName),
      position: str(body?.position),
      email: str(body?.email),
      altEmail: str(body?.altEmail),
      whatsapp: str(body?.whatsapp),
      phone: str(body?.phone),
      instagram: str(body?.instagram),
      threads: str(body?.threads),
      companyId: body?.companyId ?? null,
      country: str(body?.country) ?? 'Indonesia',
      city: str(body?.city),
      language: str(body?.language) ?? 'id',
      preferredChannel: str(body?.preferredChannel) ?? 'WHATSAPP',
      tags: splitTags(typeof body?.tags === 'string' ? body.tags : Array.isArray(body?.tags) ? body.tags.join(',') : '').join(','),
    },
    include: { company: { select: { id: true, name: true, country: true } } },
  })

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'CREATE',
    entityType: 'Contact',
    entityId: contact.id,
    entityLabel: `${contact.firstName} ${contact.lastName ?? ''}`.trim(),
    newValue: { firstName, email: contact.email, companyId: contact.companyId },
    req,
  })

  return NextResponse.json(mapContact(contact))
}
