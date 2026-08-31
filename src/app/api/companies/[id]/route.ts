/* ============ /api/companies/[id] — detail, update, soft-delete ============ */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  getSessionUser, mapCompany, mapContact, mapOpportunity, mapProject,
  opportunityInclude, projectInclude, contactInclude,
} from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const EDITABLE = ['name', 'industry', 'website', 'country', 'city', 'address', 'size', 'taxId', 'currency', 'tags', 'notes', 'ownerId'] as const

/** GET → CompanyDTO + contacts[] + opportunities[] + projects[] */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const { id } = await ctx.params
  const company = await db.company.findFirst({
    where: { id, isDeleted: false },
    include: {
      owner: { select: { id: true, name: true } },
      contacts: { where: { isDeleted: false }, select: { id: true } },
      opportunities: { where: { isDeleted: false }, select: { stage: true, estimatedValue: true } },
    },
  })
  if (!company) return NextResponse.json({ error: 'Perusahaan tidak ditemukan' }, { status: 404 })

  const [contacts, opportunities, projects] = await Promise.all([
    db.contact.findMany({
      where: { companyId: id, isDeleted: false },
      include: contactInclude,
      orderBy: { createdAt: 'asc' },
    }),
    db.opportunity.findMany({
      where: { companyId: id, isDeleted: false },
      include: opportunityInclude,
      orderBy: { createdAt: 'desc' },
    }),
    db.project.findMany({
      where: { companyId: id },
      include: projectInclude,
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return NextResponse.json({
    ...mapCompany(company),
    contacts: contacts.map(mapContact),
    opportunities: opportunities.map(mapOpportunity),
    projects: projects.map(mapProject),
  })
}

/** PATCH — partial update, audit only changed keys */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const { id } = await ctx.params
  const company = await db.company.findFirst({ where: { id, isDeleted: false } })
  if (!company) return NextResponse.json({ error: 'Perusahaan tidak ditemukan' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const data: Record<string, unknown> = {}
  const oldValue: Record<string, unknown> = {}
  const newValue: Record<string, unknown> = {}

  for (const key of EDITABLE) {
    if (body?.[key] === undefined) continue
    let next: unknown = body[key]
    if (key === 'tags') {
      next = Array.isArray(body.tags)
        ? body.tags.join(',')
        : typeof body.tags === 'string' ? body.tags : company.tags
      if (next === company.tags) continue
    } else if (typeof next === 'string' && next === '') {
      if (key === 'name') continue // name cannot be emptied
      next = null
    } else if (key === 'ownerId' && (next === null || next === '')) {
      next = null
    }
    if (next === (company as unknown as Record<string, unknown>)[key]) continue
    data[key] = next
    oldValue[key] = (company as unknown as Record<string, unknown>)[key]
    newValue[key] = next
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Tidak ada perubahan' }, { status: 400 })
  }

  const updated = await db.company.update({
    where: { id },
    data,
    include: {
      owner: { select: { id: true, name: true } },
      contacts: { where: { isDeleted: false }, select: { id: true } },
      opportunities: { where: { isDeleted: false }, select: { stage: true, estimatedValue: true } },
    },
  })

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'UPDATE',
    entityType: 'Company',
    entityId: id,
    entityLabel: company.name,
    oldValue,
    newValue,
    req,
  })

  return NextResponse.json(mapCompany(updated))
}

/** DELETE → soft delete */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const { id } = await ctx.params
  const company = await db.company.findFirst({ where: { id, isDeleted: false } })
  if (!company) return NextResponse.json({ error: 'Perusahaan tidak ditemukan' }, { status: 404 })

  await db.company.update({ where: { id }, data: { isDeleted: true } })

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'DELETE',
    entityType: 'Company',
    entityId: id,
    entityLabel: company.name,
    oldValue: { isDeleted: false },
    newValue: { isDeleted: true },
    req,
  })

  return NextResponse.json({ ok: true })
}
