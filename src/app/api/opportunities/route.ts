/* ============ /api/opportunities — list + filters, create (with new company/contact) ============ */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  getSessionUser, mapOpportunity, opportunityInclude,
  generateOppCode, parseDate, STAGE_DEFAULT_PROBABILITY,
} from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** GET ?stage=a,b&brandId=&ownerId=&channel=&temperature=&priority=&search= → OpportunityDTO[] */
export async function GET(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const stages = (searchParams.get('stage') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const brandId = searchParams.get('brandId') ?? ''
  const ownerId = searchParams.get('ownerId') ?? ''
  const channel = searchParams.get('channel') ?? ''
  const temperature = searchParams.get('temperature') ?? ''
  const priority = searchParams.get('priority') ?? ''
  const search = (searchParams.get('search') ?? '').trim().toLowerCase()

  const opportunities = await db.opportunity.findMany({
    where: {
      isDeleted: false,
      ...(stages.length ? { stage: { in: stages } } : {}),
      ...(brandId ? { executingBrandId: brandId } : {}),
      ...(ownerId ? { ownerId } : {}),
      ...(channel ? { channel } : {}),
      ...(temperature ? { temperature } : {}),
      ...(priority ? { priority } : {}),
    },
    include: opportunityInclude,
    orderBy: { createdAt: 'desc' },
  })

  const filtered = search
    ? opportunities.filter((o) =>
        `${o.code} ${o.title} ${o.company.name} ${o.contact.firstName} ${o.contact.lastName ?? ''}`
          .toLowerCase()
          .includes(search),
      )
    : opportunities

  return NextResponse.json(filtered.map(mapOpportunity))
}

/**
 * POST — create opportunity.
 * Body: { title, companyId?|newCompany?, contactId?|newContact?, sourceBrandId,
 *         executingBrandId?, serviceId?, leadSource, channel, campaign?, brief?, needs?,
 *         deliverables?, deadline?, estimatedValue, currency?, probability?,
 *         expectedCloseDate?, priority?, temperature?, ownerId? }
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const sourceBrandId = typeof body?.sourceBrandId === 'string' ? body.sourceBrandId : ''
  if (!title) return NextResponse.json({ error: 'Judul opportunity wajib diisi' }, { status: 400 })
  if (!sourceBrandId) return NextResponse.json({ error: 'Brand sumber wajib dipilih' }, { status: 400 })

  const sourceBrand = await db.brand.findUnique({ where: { id: sourceBrandId } })
  if (!sourceBrand) return NextResponse.json({ error: 'Brand sumber tidak ditemukan' }, { status: 404 })

  /* ----- resolve company ----- */
  let companyId: string | null = typeof body?.companyId === 'string' ? body.companyId : null
  if (!companyId && body?.newCompany?.name) {
    const created = await db.company.create({
      data: {
        name: String(body.newCompany.name).trim(),
        industry: str(body.newCompany.industry),
        country: str(body.newCompany.country) ?? 'Indonesia',
        city: str(body.newCompany.city),
      },
    })
    companyId = created.id
    await logAudit({
      userId: session.id, userName: session.name, action: 'CREATE',
      entityType: 'Company', entityId: created.id, entityLabel: created.name,
      newValue: { name: created.name }, req,
    })
  }
  if (!companyId) return NextResponse.json({ error: 'Perusahaan wajib dipilih' }, { status: 400 })
  const company = await db.company.findFirst({ where: { id: companyId, isDeleted: false } })
  if (!company) return NextResponse.json({ error: 'Perusahaan tidak ditemukan' }, { status: 404 })

  /* ----- resolve contact ----- */
  let contactId: string | null = typeof body?.contactId === 'string' ? body.contactId : null
  if (!contactId && body?.newContact?.firstName) {
    const created = await db.contact.create({
      data: {
        firstName: String(body.newContact.firstName).trim(),
        lastName: str(body.newContact.lastName),
        email: str(body.newContact.email),
        whatsapp: str(body.newContact.whatsapp),
        position: str(body.newContact.position),
        companyId: company.id,
      },
    })
    contactId = created.id
    await logAudit({
      userId: session.id, userName: session.name, action: 'CREATE',
      entityType: 'Contact', entityId: created.id,
      entityLabel: `${created.firstName} ${created.lastName ?? ''}`.trim(),
      newValue: { firstName: created.firstName, companyId: company.id }, req,
    })
  }
  if (!contactId) return NextResponse.json({ error: 'Kontak wajib dipilih' }, { status: 400 })
  const contact = await db.contact.findFirst({ where: { id: contactId, isDeleted: false } })
  if (!contact) return NextResponse.json({ error: 'Kontak tidak ditemukan' }, { status: 404 })
  if (body?.serviceId) {
    const service = await db.service.findUnique({ where: { id: body.serviceId } })
    if (!service) return NextResponse.json({ error: 'Service tidak ditemukan' }, { status: 404 })
  }

  const executingBrandId = str(body?.executingBrandId) ?? sourceBrandId
  const executingBrand = await db.brand.findUnique({ where: { id: executingBrandId } })
  if (!executingBrand) return NextResponse.json({ error: 'Brand eksekutor tidak ditemukan' }, { status: 404 })

  const ownerId = str(body?.ownerId) ?? session.id
  const owner = await db.user.findFirst({ where: { id: ownerId, isActive: true } })
  if (!owner) return NextResponse.json({ error: 'Owner tidak ditemukan' }, { status: 404 })

  const estimatedValue = typeof body?.estimatedValue === 'number' ? body.estimatedValue : 0
  const code = await generateOppCode()

  const created = await db.opportunity.create({
    data: {
      code,
      title,
      companyId: company.id,
      contactId: contact.id,
      sourceBrandId,
      executingBrandId,
      serviceId: str(body?.serviceId),
      leadSource: str(body?.leadSource) ?? 'WEBSITE',
      channel: str(body?.channel) ?? 'WEBSITE',
      campaign: str(body?.campaign),
      brief: str(body?.brief),
      needs: str(body?.needs),
      deliverables: str(body?.deliverables),
      deadline: parseDate(body?.deadline),
      estimatedValue,
      currency: str(body?.currency) ?? 'IDR',
      probability: STAGE_DEFAULT_PROBABILITY.NEW, // stage NEW default
      expectedCloseDate: parseDate(body?.expectedCloseDate),
      ownerId: owner.id,
      priority: str(body?.priority) ?? 'MEDIUM',
      stage: 'NEW',
      temperature: str(body?.temperature) ?? 'WARM',
      stageUpdatedAt: new Date(),
    },
    include: opportunityInclude,
  })

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'CREATE',
    entityType: 'Opportunity',
    entityId: created.id,
    entityLabel: `${code} — ${title}`,
    newValue: { code, title, stage: 'NEW', estimatedValue, companyId: company.id, contactId: contact.id },
    req,
  })

  return NextResponse.json(mapOpportunity(created))
}
