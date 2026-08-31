/* ============ /api/opportunities/[id]/stage — stage transitions ============ */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, parseDate, generateProjectCode, STAGE_DEFAULT_PROBABILITY } from '@/lib/crm-server'
import { WORKFLOW_MILESTONES } from '@/lib/crm-constants'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const VALID_STAGES = [
  'NEW', 'CONTACT_ATTEMPTED', 'CONNECTED', 'QUALIFIED', 'DISCOVERY', 'ESTIMATION',
  'PROPOSAL_SENT', 'NEGOTIATION', 'VERBAL_AGREEMENT', 'WON', 'LOST', 'NURTURE',
]

/** POST { stage, lostReason?, lostNotes?, competitorName?, lastOfferValue?, reactivation?, followUpDate? } */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const { id } = await ctx.params
  const opp = await db.opportunity.findFirst({
    where: { id, isDeleted: false },
    include: { executingBrand: { select: { id: true, workflowType: true } } },
  })
  if (!opp) return NextResponse.json({ error: 'Opportunity tidak ditemukan' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const stage = typeof body?.stage === 'string' ? body.stage : ''
  if (!VALID_STAGES.includes(stage)) {
    return NextResponse.json({ error: 'Stage tidak valid' }, { status: 400 })
  }
  if (stage === 'LOST' && !body?.lostReason) {
    return NextResponse.json({ error: 'Alasan lost wajib dipilih sebelum memindah ke Lost' }, { status: 400 })
  }

  const now = new Date()
  const data: Record<string, unknown> = { stage, stageUpdatedAt: now }
  const newValue: Record<string, unknown> = { stage }

  if (stage === 'LOST') {
    data.lostReason = body.lostReason
    data.lostNotes = typeof body?.lostNotes === 'string' && body.lostNotes ? body.lostNotes : null
    data.lostAt = now
    data.probability = 0
    data.temperature = 'COLD'
    data.wonAt = null
    if (body?.competitorName) data.competitorName = body.competitorName
    if (typeof body?.lastOfferValue === 'number') data.lastOfferValue = body.lastOfferValue
    if (body?.reactivation) data.reactivation = body.reactivation
    if (body?.followUpDate) data.followUpDate = parseDate(body.followUpDate)
    Object.assign(newValue, { lostReason: data.lostReason, probability: 0 })
  } else {
    // leaving LOST → clear lost markers
    if (opp.lostReason || opp.lostAt) {
      data.lostReason = null
      data.lostNotes = null
      data.lostAt = null
    }
  }

  let createdProjectId: string | null = null

  if (stage === 'WON') {
    data.wonAt = now
    data.probability = 100
    data.lostReason = null
    data.lostNotes = null
    data.lostAt = null
    // finalize value: use the last offer as final estimated value when provided
    if (typeof body?.lastOfferValue === 'number' && body.lastOfferValue > 0) {
      data.estimatedValue = body.lastOfferValue
      newValue.lastOfferValue = body.lastOfferValue
    }
    newValue.probability = 100
  } else if (opp.wonAt && stage !== 'WON') {
    data.wonAt = null
  }

  if (stage !== 'WON' && stage !== 'LOST') {
    data.probability = STAGE_DEFAULT_PROBABILITY[stage] ?? opp.probability
    if (body?.reactivation) data.reactivation = body.reactivation
    if (body?.followUpDate) data.followUpDate = parseDate(body.followUpDate)
    newValue.probability = data.probability
  }

  const updated = await db.opportunity.update({ where: { id }, data })

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'STAGE_CHANGE',
    entityType: 'Opportunity',
    entityId: id,
    entityLabel: `${opp.code} — ${opp.title}`,
    oldValue: { stage: opp.stage, probability: opp.probability },
    newValue,
    req,
  })

  /* ----- WON → auto-create project (once) ----- */
  if (stage === 'WON') {
    const existing = await db.project.findUnique({ where: { opportunityId: id } })
    if (!existing) {
      const workflowType = opp.executingBrand.workflowType
      const finalValue = typeof data.estimatedValue === 'number' ? data.estimatedValue : opp.estimatedValue
      const manager = await db.user.findFirst({ where: { role: 'PRODUKSI', isActive: true } })
      const code = await generateProjectCode()
      const milestoneNames = WORKFLOW_MILESTONES[workflowType] ?? WORKFLOW_MILESTONES.generic
      const project = await db.project.create({
        data: {
          name: opp.title,
          code,
          opportunityId: id,
          companyId: opp.companyId,
          brandId: opp.executingBrandId,
          managerId: manager?.id ?? null,
          status: 'PLANNING',
          progress: 0,
          workflowType,
          budget: finalValue,
          startDate: now,
          milestones: {
            create: milestoneNames.map((name, idx) => ({
              name,
              stepOrder: idx + 1,
              status: 'PENDING',
              dueDate: new Date(now.getTime() + (idx + 1) * 10 * 86400000), // spaced 10 days
            })),
          },
        },
      })
      createdProjectId = project.id
      await logAudit({
        userId: session.id,
        userName: session.name,
        action: 'PROJECT_CREATE',
        entityType: 'Project',
        entityId: project.id,
        entityLabel: `${code} — ${project.name}`,
        newValue: { code, workflowType, budget: finalValue, milestones: milestoneNames.length },
        req,
      })
    }
  }

  return NextResponse.json({
    ok: true,
    opportunityId: updated.id,
    stage: updated.stage,
    probability: updated.probability,
    projectId: createdProjectId,
  })
}
