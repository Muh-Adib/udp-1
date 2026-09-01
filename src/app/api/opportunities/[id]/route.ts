/* ============ /api/opportunities/[id] — detail + partial update ============ */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  getSessionUser, mapOpportunity, mapInteraction, mapTask, mapNote, mapProject,
  opportunityInclude, interactionInclude, taskInclude, noteInclude, projectInclude,
  parseDate,
} from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const DATE_FIELDS = ['expectedCloseDate', 'nextActionDate', 'deadline', 'followUpDate'] as const
const NUMBER_FIELDS = ['probability', 'estimatedValue'] as const
const STRING_FIELDS = [
  'title', 'priority', 'temperature', 'currency', 'nextAction', 'brief', 'needs',
  'targetAudience', 'deliverables', 'competitorName', 'lostNotes', 'reactivation', 'estimatedTimeline',
  'nurtureTrack', 'campaign',
] as const
const FK_FIELDS = ['ownerId', 'serviceId'] as const

/** GET → OpportunityDetailDTO */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const { id } = await ctx.params
  const opp = await db.opportunity.findFirst({
    where: { id, isDeleted: false },
    include: opportunityInclude,
  })
  if (!opp) return NextResponse.json({ error: 'Opportunity tidak ditemukan' }, { status: 404 })

  const [interactions, tasks, notes, related, projects] = await Promise.all([
    db.interaction.findMany({
      where: { opportunityId: id },
      include: interactionInclude,
      orderBy: { sentAt: 'asc' },
    }),
    db.task.findMany({
      where: { opportunityId: id },
      include: taskInclude,
      orderBy: { createdAt: 'desc' },
    }),
    db.note.findMany({
      where: { opportunityId: id },
      include: noteInclude,
      orderBy: { createdAt: 'desc' },
    }),
    db.opportunity.findMany({
      where: { companyId: opp.companyId, isDeleted: false, id: { not: id } },
      include: opportunityInclude,
      orderBy: { createdAt: 'desc' },
    }),
    db.project.findMany({
      where: { companyId: opp.companyId },
      include: projectInclude,
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return NextResponse.json({
    ...mapOpportunity(opp),
    interactions: interactions.map((i) => mapInteraction(i)),
    tasks: tasks.map(mapTask),
    notes: notes.map(mapNote),
    related: related.map(mapOpportunity),
    projects: projects.map(mapProject),
  })
}

/** PATCH — allowed: title, priority, temperature, probability, estimatedValue, currency,
 *  expectedCloseDate, nextAction, nextActionDate, brief, needs, targetAudience,
 *  deliverables, deadline, competitorName, followUpDate, reactivation, nurtureTrack,
 *  ownerId, serviceId, campaign, lostNotes. Audit only changed keys. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const { id } = await ctx.params
  const opp = await db.opportunity.findFirst({ where: { id, isDeleted: false } })
  if (!opp) return NextResponse.json({ error: 'Opportunity tidak ditemukan' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const data: Record<string, unknown> = {}
  const oldValue: Record<string, unknown> = {}
  const newValue: Record<string, unknown> = {}
  const current = opp as unknown as Record<string, unknown>

  for (const key of DATE_FIELDS) {
    if (body?.[key] === undefined) continue
    const next = parseDate(body[key])
    const prev = current[key] as Date | null
    if ((next?.getTime() ?? null) === (prev?.getTime() ?? null)) continue
    data[key] = next
    oldValue[key] = prev?.toISOString() ?? null
    newValue[key] = next?.toISOString() ?? null
  }

  for (const key of NUMBER_FIELDS) {
    if (body?.[key] === undefined) continue
    const next = Number(body[key])
    if (isNaN(next)) continue
    if (key === 'probability') {
      const clamped = Math.max(0, Math.min(100, Math.round(next)))
      if (clamped === opp.probability) continue
      data[key] = clamped
      oldValue[key] = opp.probability
      newValue[key] = clamped
    } else {
      if (next === opp.estimatedValue) continue
      data[key] = next
      oldValue[key] = opp.estimatedValue
      newValue[key] = next
    }
  }

  for (const key of STRING_FIELDS) {
    if (body?.[key] === undefined) continue
    const raw = body[key]
    const next = typeof raw === 'string' && raw.trim() === '' ? null : raw
    if (next === current[key]) continue
    data[key] = next
    oldValue[key] = current[key]
    newValue[key] = next
  }

  for (const key of FK_FIELDS) {
    if (body?.[key] === undefined) continue
    const next = typeof body[key] === 'string' && body[key] ? body[key] : null
    if (next === current[key]) continue
    if (key === 'ownerId') {
      if (!next) continue // ownerId is required — never null
      const owner = await db.user.findFirst({ where: { id: next, isActive: true } })
      if (!owner) return NextResponse.json({ error: 'Owner tidak ditemukan' }, { status: 404 })
    }
    if (key === 'serviceId' && next) {
      const service = await db.service.findUnique({ where: { id: next } })
      if (!service) return NextResponse.json({ error: 'Service tidak ditemukan' }, { status: 404 })
    }
    data[key] = next
    oldValue[key] = current[key]
    newValue[key] = next
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Tidak ada perubahan' }, { status: 400 })
  }

  const updated = await db.opportunity.update({ where: { id }, data, include: opportunityInclude })

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'UPDATE',
    entityType: 'Opportunity',
    entityId: id,
    entityLabel: `${opp.code} — ${opp.title}`,
    oldValue,
    newValue,
    req,
  })

  return NextResponse.json(mapOpportunity(updated))
}

/** DELETE → soft delete (kept for completeness) */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const { id } = await ctx.params
  const opp = await db.opportunity.findFirst({ where: { id, isDeleted: false } })
  if (!opp) return NextResponse.json({ error: 'Opportunity tidak ditemukan' }, { status: 404 })

  await db.opportunity.update({ where: { id }, data: { isDeleted: true } })

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'DELETE',
    entityType: 'Opportunity',
    entityId: id,
    entityLabel: `${opp.code} — ${opp.title}`,
    oldValue: { isDeleted: false },
    newValue: { isDeleted: true },
    req,
  })

  return NextResponse.json({ ok: true })
}
