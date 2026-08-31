/* ============ /api/interactions — Lead Inbox + manual logging + website lead simulator ============ */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  getSessionUser, mapInteraction, interactionInclude, generateOppCode,
} from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/** GET ?brandId=&channel=&unreadOnly=1&search=&days=60 → InteractionDTO[] (IN only) */
export async function GET(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const brandId = searchParams.get('brandId') ?? ''
  const channel = searchParams.get('channel') ?? ''
  const unreadOnly = searchParams.get('unreadOnly') === '1'
  const search = (searchParams.get('search') ?? '').trim().toLowerCase()
  const days = Number(searchParams.get('days')) > 0 ? Number(searchParams.get('days')) : 60

  const since = new Date(Date.now() - days * 86400000)
  const inbound = await db.interaction.findMany({
    where: {
      direction: 'IN',
      sentAt: { gte: since },
      ...(brandId ? { brandId } : {}),
      ...(channel ? { channel } : {}),
    },
    include: interactionInclude,
    orderBy: { sentAt: 'desc' },
  })

  // replied = an OUT interaction exists in the same opportunity after this IN.
  const oppIds = [...new Set(inbound.map((i) => i.opportunityId).filter((v): v is string => !!v))]
  const outs = oppIds.length
    ? await db.interaction.findMany({
        where: { opportunityId: { in: oppIds }, direction: 'OUT' },
        select: { opportunityId: true, sentAt: true },
      })
    : []
  const outByOpp = new Map<string, Date[]>()
  for (const o of outs) {
    if (!o.opportunityId) continue
    const list = outByOpp.get(o.opportunityId) ?? []
    list.push(o.sentAt)
    outByOpp.set(o.opportunityId, list)
  }

  const filtered = inbound.filter((i) => {
    const replied = i.opportunityId
      ? (outByOpp.get(i.opportunityId) ?? []).some((d) => d.getTime() > i.sentAt.getTime())
      : false
    if (unreadOnly && replied) return false
    if (search) {
      const haystack = `${i.contact.firstName} ${i.contact.lastName ?? ''} ${i.company?.name ?? ''} ${i.subject ?? ''} ${i.body}`.toLowerCase()
      if (!haystack.includes(search)) return false
    }
    return true
  })

  return NextResponse.json(
    filtered.map((i) => {
      const replied = i.opportunityId
        ? (outByOpp.get(i.opportunityId) ?? []).some((d) => d.getTime() > i.sentAt.getTime())
        : false
      return mapInteraction(i, replied)
    }),
  )
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/**
 * POST — two modes:
 * 1. { websiteForm: { name, email, whatsapp?, message, brandId, serviceId? } } → simulate public website lead.
 * 2. { contactId, opportunityId?, brandId, channel, direction, body, subject? } → manual log / quick reply.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const body = await req.json().catch(() => null)

  /* ---------------- Mode 1: website lead simulation ---------------- */
  if (body?.websiteForm && typeof body.websiteForm === 'object') {
    const wf = body.websiteForm
    const name = str(wf.name)
    const email = str(wf.email)?.toLowerCase() ?? null
    const message = typeof wf.message === 'string' ? wf.message.trim() : ''
    const brandId = str(wf.brandId)
    if (!name || !email || !brandId || !message) {
      return NextResponse.json({ error: 'Nama, email, brand, dan pesan wajib diisi' }, { status: 400 })
    }
    if (!email.includes('@')) return NextResponse.json({ error: 'Email tidak valid' }, { status: 400 })

    const brand = await db.brand.findUnique({ where: { id: brandId } })
    if (!brand) return NextResponse.json({ error: 'Brand tidak ditemukan' }, { status: 404 })

    // contact by normalized email (email or altEmail) — exact then case-insensitive fallback
    let contact = await db.contact.findFirst({
      where: { isDeleted: false, OR: [{ email }, { altEmail: email }] },
    })
    if (!contact) {
      const candidates = await db.contact.findMany({
        where: { isDeleted: false, OR: [{ email: { not: null } }, { altEmail: { not: null } }] },
        take: 2000,
      })
      contact =
        candidates.find((c) => (c.email ?? '').trim().toLowerCase() === email) ??
        candidates.find((c) => (c.altEmail ?? '').trim().toLowerCase() === email) ??
        null
    }
    const contactCreated = !contact

    // company by email domain (match on website), else create from domain stem
    const domain = email.split('@')[1]
    const domainStem = domain.split('.')[0]
    const companies = await db.company.findMany({
      where: { isDeleted: false },
      select: { id: true, name: true, website: true },
      take: 2000,
    })
    let company = companies.find((c) => (c.website ?? '').toLowerCase().includes(domain)) ?? null
    let companyCreated = false
    if (!company) {
      const companyName =
        domainStem.charAt(0).toUpperCase() + domainStem.slice(1)
      company = await db.company.create({
        data: { name: companyName, website: `https://${domain}`, country: 'Indonesia' },
        select: { id: true, name: true, website: true },
      })
      companyCreated = true
    }

    if (contactCreated) {
      contact = await db.contact.create({
        data: {
          firstName: name,
          email,
          whatsapp: str(wf.whatsapp),
          companyId: company.id,
          preferredChannel: 'WEBSITE',
        },
      })
    } else if (contact && !contact.companyId) {
      await db.contact.update({ where: { id: contact.id }, data: { companyId: company.id } })
    }
    if (!contact) return NextResponse.json({ error: 'Gagal menyiapkan kontak' }, { status: 500 })

    // opportunity (always NEW even for existing contact — a fresh website inquiry)
    const code = await generateOppCode()
    const title = `Website Inquiry — ${company.name}`
    const opportunity = await db.opportunity.create({
      data: {
        code,
        title,
        companyId: company.id,
        contactId: contact.id,
        sourceBrandId: brandId,
        executingBrandId: brandId,
        serviceId: str(wf.serviceId),
        leadSource: 'WEBSITE',
        channel: 'WEBSITE',
        brief: message,
        estimatedValue: 0,
        currency: brand.primaryCurrency,
        probability: 10, // NEW
        stage: 'NEW',
        temperature: 'WARM',
        ownerId: session.id,
        stageUpdatedAt: new Date(),
      },
    })

    await db.interaction.create({
      data: {
        opportunityId: opportunity.id,
        contactId: contact.id,
        companyId: company.id,
        brandId,
        channel: 'WEBSITE',
        direction: 'IN',
        body: message,
        status: 'DELIVERED',
      },
    })

    await logAudit({
      userId: session.id,
      userName: session.name,
      action: 'LEAD_WEBSITE',
      entityType: 'Opportunity',
      entityId: opportunity.id,
      entityLabel: `${code} — ${title}`,
      newValue: { code, email, brandId, contactCreated, companyCreated },
      req,
    })

    return NextResponse.json({
      opportunityId: opportunity.id,
      contactId: contact.id,
      created: contactCreated || companyCreated,
    })
  }

  /* ---------------- Mode 2: manual log / quick reply ---------------- */
  const text = typeof body?.body === 'string' ? body.body.trim() : ''
  const direction = body?.direction === 'OUT' ? 'OUT' : body?.direction === 'IN' ? 'IN' : ''
  const contactId = str(body?.contactId)
  const brandId = str(body?.brandId)
  if (!contactId || !brandId || !text || !direction) {
    return NextResponse.json(
      { error: 'Kontak, brand, direction, dan isi pesan wajib diisi' },
      { status: 400 },
    )
  }

  const contact = await db.contact.findFirst({ where: { id: contactId, isDeleted: false } })
  if (!contact) return NextResponse.json({ error: 'Kontak tidak ditemukan' }, { status: 404 })
  const brand = await db.brand.findUnique({ where: { id: brandId } })
  if (!brand) return NextResponse.json({ error: 'Brand tidak ditemukan' }, { status: 404 })

  const opportunityId = str(body?.opportunityId)
  if (opportunityId) {
    const opp = await db.opportunity.findFirst({ where: { id: opportunityId, isDeleted: false } })
    if (!opp) return NextResponse.json({ error: 'Opportunity tidak ditemukan' }, { status: 404 })
  }

  const now = new Date()
  const interaction = await db.interaction.create({
    data: {
      opportunityId: opportunityId ?? null,
      contactId,
      companyId: contact.companyId,
      brandId,
      channel: str(body?.channel) ?? 'WHATSAPP',
      direction,
      subject: str(body?.subject),
      body: text,
      ...(direction === 'OUT' ? { respondedById: session.id, respondedAt: now } : {}),
    },
    include: interactionInclude,
  })

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'INTERACTION_CREATE',
    entityType: 'Interaction',
    entityId: interaction.id,
    entityLabel: interaction.subject ?? interaction.channel,
    newValue: { direction, channel: interaction.channel, contactId, opportunityId: opportunityId ?? null },
    req,
  })

  return NextResponse.json(mapInteraction(interaction))
}
