/* ============ /api/merge — merge duplicate contacts ============ */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, fullNameOf } from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/** POST { keepId, mergeId } — move opportunities/interactions to keep, fill blanks, soft-delete merge */
export async function POST(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const keepId = typeof body?.keepId === 'string' ? body.keepId : ''
  const mergeId = typeof body?.mergeId === 'string' ? body.mergeId : ''
  if (!keepId || !mergeId || keepId === mergeId) {
    return NextResponse.json({ error: 'Pilih dua kontak yang berbeda untuk digabung' }, { status: 400 })
  }

  const [keep, merge] = await Promise.all([
    db.contact.findFirst({ where: { id: keepId, isDeleted: false } }),
    db.contact.findFirst({ where: { id: mergeId, isDeleted: false } }),
  ])
  if (!keep || !merge) {
    return NextResponse.json({ error: 'Kontak tidak ditemukan' }, { status: 404 })
  }

  await db.$transaction([
    db.opportunity.updateMany({ where: { contactId: mergeId }, data: { contactId: keepId } }),
    db.interaction.updateMany({ where: { contactId: mergeId }, data: { contactId: keepId } }),
    db.contact.update({
      where: { id: keepId },
      data: {
        // fill only empty fields on keep from the merged contact
        position: keep.position ?? merge.position,
        email: keep.email ?? merge.email,
        altEmail: keep.altEmail ?? merge.altEmail,
        whatsapp: keep.whatsapp ?? merge.whatsapp,
        phone: keep.phone ?? merge.phone,
        linkedin: keep.linkedin ?? merge.linkedin,
        companyId: keep.companyId ?? merge.companyId,
      },
    }),
    db.contact.update({ where: { id: mergeId }, data: { isDeleted: true } }),
  ])

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'MERGE',
    entityType: 'Contact',
    entityId: keepId,
    entityLabel: `merged ${fullNameOf(merge.firstName, merge.lastName)} into ${fullNameOf(keep.firstName, keep.lastName)}`,
    oldValue: { mergeId, mergeName: fullNameOf(merge.firstName, merge.lastName) },
    newValue: { mergeId, keepId },
    req,
  })

  return NextResponse.json({ ok: true, keepId, mergeId })
}
