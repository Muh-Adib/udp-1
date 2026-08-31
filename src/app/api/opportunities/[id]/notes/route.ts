/* ============ /api/opportunities/[id]/notes — add note ============ */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, mapNote, noteInclude } from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/** POST { body, visibility? } — visibility: INTERNAL | DIRECTOR */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const { id } = await ctx.params
  const opp = await db.opportunity.findFirst({ where: { id, isDeleted: false } })
  if (!opp) return NextResponse.json({ error: 'Opportunity tidak ditemukan' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const text = typeof body?.body === 'string' ? body.body.trim() : ''
  if (!text) return NextResponse.json({ error: 'Isi catatan wajib diisi' }, { status: 400 })
  const visibility = body?.visibility === 'DIRECTOR' ? 'DIRECTOR' : 'INTERNAL'

  const note = await db.note.create({
    data: { body: text, opportunityId: id, authorId: session.id, visibility },
    include: noteInclude,
  })

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'NOTE_CREATE',
    entityType: 'Note',
    entityId: note.id,
    entityLabel: `Catatan pada ${opp.code}`,
    newValue: { opportunityId: id, visibility },
    req,
  })

  return NextResponse.json(mapNote(note))
}
