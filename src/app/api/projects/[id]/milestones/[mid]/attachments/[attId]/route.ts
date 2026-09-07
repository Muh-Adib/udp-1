/* ============ /api/projects/[id]/milestones/[mid]/attachments/[attId] — DELETE ============ */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, MILESTONE_WORKERS } from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/** DELETE — hapus lampiran milestone (tim produksi/manajemen). */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string; mid: string; attId: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })
  if (session.role === 'CLIENT') {
    return NextResponse.json({ error: 'Akses khusus tim internal UDP' }, { status: 403 })
  }
  if (!(MILESTONE_WORKERS as readonly string[]).includes(session.role)) {
    return NextResponse.json({ error: 'Hanya tim produksi/manajemen yang dapat menghapus lampiran milestone' }, { status: 403 })
  }

  const { id, mid, attId } = await ctx.params
  const attachment = await db.milestoneAttachment.findUnique({ where: { id: attId } })
  if (!attachment || attachment.milestoneId !== mid) {
    return NextResponse.json({ error: 'Lampiran tidak ditemukan' }, { status: 404 })
  }
  const milestone = await db.milestone.findUnique({ where: { id: mid } })
  if (!milestone || milestone.projectId !== id) {
    return NextResponse.json({ error: 'Milestone tidak ditemukan' }, { status: 404 })
  }

  await db.milestoneAttachment.delete({ where: { id: attId } })

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'MILESTONE_ATTACHMENT_DELETE',
    entityType: 'MilestoneAttachment',
    entityId: attId,
    entityLabel: `${milestone.name} · ${attachment.name}`,
    oldValue: { name: attachment.name },
    req,
  })

  return NextResponse.json({ ok: true })
}
