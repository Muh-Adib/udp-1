/* ============ /api/tasks/[id]/attachments — POST upload lampiran tugas ============ */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, mapAttachment, validateAttachmentBody } from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/** POST { name, mimeType, size, dataUrl } — lampiran tugas (data-URL ≤2MB). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })
  if (session.role === 'CLIENT') {
    return NextResponse.json({ error: 'Akses khusus tim internal UDP' }, { status: 403 })
  }

  const { id } = await ctx.params
  const task = await db.task.findUnique({ where: { id } })
  if (!task) return NextResponse.json({ error: 'Task tidak ditemukan' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const validated = validateAttachmentBody(body ?? {})
  if (typeof validated === 'string') {
    return NextResponse.json({ error: validated }, { status: 400 })
  }

  const attachment = await db.taskAttachment.create({
    data: { ...validated, taskId: id, uploadedByName: session.name },
  })

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'TASK_ATTACHMENT_ADD',
    entityType: 'TaskAttachment',
    entityId: attachment.id,
    entityLabel: `${task.title} · ${validated.name}`,
    newValue: { name: validated.name, mimeType: validated.mimeType, size: validated.size },
    req,
  })

  return NextResponse.json(mapAttachment(attachment), { status: 201 })
}
