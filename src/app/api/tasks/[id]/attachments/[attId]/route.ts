/* ============ /api/tasks/[id]/attachments/[attId] — DELETE lampiran tugas ============ */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/** DELETE — hapus lampiran tugas (semua tim internal; tugas milik tim). */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string; attId: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })
  if (session.role === 'CLIENT') {
    return NextResponse.json({ error: 'Akses khusus tim internal UDP' }, { status: 403 })
  }

  const { id, attId } = await ctx.params
  const attachment = await db.taskAttachment.findUnique({ where: { id: attId } })
  if (!attachment || attachment.taskId !== id) {
    return NextResponse.json({ error: 'Lampiran tidak ditemukan' }, { status: 404 })
  }
  const task = await db.task.findUnique({ where: { id } })
  if (!task) return NextResponse.json({ error: 'Task tidak ditemukan' }, { status: 404 })

  await db.taskAttachment.delete({ where: { id: attId } })

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'TASK_ATTACHMENT_DELETE',
    entityType: 'TaskAttachment',
    entityId: attId,
    entityLabel: `${task.title} · ${attachment.name}`,
    oldValue: { name: attachment.name },
    req,
  })

  return NextResponse.json({ ok: true })
}
