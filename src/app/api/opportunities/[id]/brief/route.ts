/* ============ /api/opportunities/[id]/brief — GET + PUT (upsert) ============ */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, iso } from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'
import type { BriefDTO } from '@/lib/crm-types'

export const dynamic = 'force-dynamic'

const INTERNAL_ROLES = ['SUPER_ADMIN', 'DIREKTUR', 'MARKETING', 'KEUANGAN', 'PRODUKSI']
const BRIEF_STATUSES = ['DRAFT', 'FINAL']

function mapBrief(b: {
  id: string
  opportunityId: string
  serviceScope: string | null
  objectives: string | null
  targetAudience: string | null
  keyMessages: string | null
  deliverables: string | null
  timeline: string | null
  references: string | null
  budgetRange: string | null
  constraints: string | null
  status: string
  preparedById: string | null
  preparedBy?: { name: string } | null
  updatedAt: Date
}): BriefDTO {
  return {
    id: b.id,
    opportunityId: b.opportunityId,
    serviceScope: b.serviceScope,
    objectives: b.objectives,
    targetAudience: b.targetAudience,
    keyMessages: b.keyMessages,
    deliverables: b.deliverables,
    timeline: b.timeline,
    references: b.references,
    budgetRange: b.budgetRange,
    constraints: b.constraints,
    status: b.status as BriefDTO['status'],
    preparedById: b.preparedById,
    preparedByName: b.preparedBy?.name ?? null,
    updatedAt: iso(b.updatedAt),
  }
}

/** String → trimmed string; empty/null/non-string → null. */
function normalizeText(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}

/** GET → BriefDTO | null (200). Internal team only. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })
  if (!INTERNAL_ROLES.includes(session.role)) {
    return NextResponse.json({ error: 'Hanya tim internal yang dapat mengakses brief' }, { status: 403 })
  }

  const { id } = await ctx.params
  const opportunity = await db.opportunity.findUnique({ where: { id }, select: { id: true } })
  if (!opportunity) return NextResponse.json({ error: 'Opportunity tidak ditemukan' }, { status: 404 })

  const brief = await db.brief.findUnique({
    where: { opportunityId: id },
    include: { preparedBy: { select: { name: true } } },
  })
  return NextResponse.json(brief ? mapBrief(brief) : null)
}

/**
 * PUT — upsert brief. Body: Partial<BriefDTO> (9 text fields + status).
 * status ∈ DRAFT|FINAL (default DRAFT); preparedById = session user.
 * Audit: BRIEF_SAVED (oldValue { status } hanya saat update).
 */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })
  if (!INTERNAL_ROLES.includes(session.role)) {
    return NextResponse.json({ error: 'Hanya tim internal yang dapat mengakses brief' }, { status: 403 })
  }

  const { id } = await ctx.params
  const opportunity = await db.opportunity.findUnique({
    where: { id },
    select: { id: true, code: true },
  })
  if (!opportunity) return NextResponse.json({ error: 'Opportunity tidak ditemukan' }, { status: 404 })

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Body tidak valid' }, { status: 400 })
  }

  let status = 'DRAFT'
  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !BRIEF_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: 'Status harus DRAFT atau FINAL' }, { status: 400 })
    }
    status = body.status
  }

  const data = {
    status,
    preparedById: session.id,
    ...(body.serviceScope !== undefined && { serviceScope: normalizeText(body.serviceScope) }),
    ...(body.objectives !== undefined && { objectives: normalizeText(body.objectives) }),
    ...(body.targetAudience !== undefined && { targetAudience: normalizeText(body.targetAudience) }),
    ...(body.keyMessages !== undefined && { keyMessages: normalizeText(body.keyMessages) }),
    ...(body.deliverables !== undefined && { deliverables: normalizeText(body.deliverables) }),
    ...(body.timeline !== undefined && { timeline: normalizeText(body.timeline) }),
    ...(body.references !== undefined && { references: normalizeText(body.references) }),
    ...(body.budgetRange !== undefined && { budgetRange: normalizeText(body.budgetRange) }),
    ...(body.constraints !== undefined && { constraints: normalizeText(body.constraints) }),
  }

  const existing = await db.brief.findUnique({ where: { opportunityId: id } })
  const brief = existing
    ? await db.brief.update({ where: { opportunityId: id }, data })
    : await db.brief.create({ data: { ...data, opportunityId: id } })

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'BRIEF_SAVED',
    entityType: 'Brief',
    entityId: brief.id,
    entityLabel: `${opportunity.code} — Brief`,
    ...(existing ? { oldValue: { status: existing.status } } : {}),
    newValue: { status: brief.status },
    req,
  })

  const saved = await db.brief.findUnique({
    where: { opportunityId: id },
    include: { preparedBy: { select: { name: true } } },
  })
  return NextResponse.json(mapBrief(saved!))
}
