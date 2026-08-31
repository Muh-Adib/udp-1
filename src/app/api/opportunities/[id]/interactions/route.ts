/* ============ /api/opportunities/[id]/interactions — log interaction on an opportunity ============ */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, mapInteraction, interactionInclude } from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/** POST { channel, direction: 'IN'|'OUT', body, subject?, attachmentName? } */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const { id } = await ctx.params
  const opp = await db.opportunity.findFirst({ where: { id, isDeleted: false } })
  if (!opp) return NextResponse.json({ error: 'Opportunity tidak ditemukan' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const text = typeof body?.body === 'string' ? body.body.trim() : ''
  const direction = body?.direction === 'OUT' ? 'OUT' : body?.direction === 'IN' ? 'IN' : ''
  if (!direction) return NextResponse.json({ error: 'Direction harus IN atau OUT' }, { status: 400 })
  if (!text) return NextResponse.json({ error: 'Isi pesan wajib diisi' }, { status: 400 })
  if (typeof body?.channel !== 'string' || !body.channel) {
    return NextResponse.json({ error: 'Channel wajib dipilih' }, { status: 400 })
  }

  const now = new Date()
  const interaction = await db.interaction.create({
    data: {
      opportunityId: opp.id,
      contactId: opp.contactId,
      companyId: opp.companyId,
      brandId: opp.executingBrandId,
      channel: body.channel,
      direction,
      subject: typeof body?.subject === 'string' && body.subject ? body.subject : null,
      body: text,
      attachmentName: typeof body?.attachmentName === 'string' && body.attachmentName ? body.attachmentName : null,
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
    newValue: { direction, channel: interaction.channel, opportunityId: opp.id },
    req,
  })

  /* Auto-advance: first OUT reply moves NEW/CONTACT_ATTEMPTED → CONNECTED */
  if (direction === 'OUT' && (opp.stage === 'NEW' || opp.stage === 'CONTACT_ATTEMPTED')) {
    await db.opportunity.update({
      where: { id: opp.id },
      data: { stage: 'CONNECTED', probability: 25, stageUpdatedAt: now },
    })
    await logAudit({
      userId: session.id,
      userName: session.name,
      action: 'AUTO_STAGE_CHANGE',
      entityType: 'Opportunity',
      entityId: opp.id,
      entityLabel: `${opp.code} — ${opp.title}`,
      oldValue: { stage: opp.stage },
      newValue: { stage: 'CONNECTED', reason: 'Balasan pertama terkirim' },
      req,
    })
  }

  return NextResponse.json(mapInteraction(interaction))
}
