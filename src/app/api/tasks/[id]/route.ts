/* ============ /api/tasks/[id] — update status/dueDate/title/priority ============ */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, mapTask, taskInclude, parseDate } from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const VALID_STATUSES = ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED']

/** PATCH { status?, dueDate?, title?, priority? } — DONE sets completedAt */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const { id } = await ctx.params
  const task = await db.task.findUnique({ where: { id } })
  if (!task) return NextResponse.json({ error: 'Task tidak ditemukan' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const data: Record<string, unknown> = {}
  const oldValue: Record<string, unknown> = {}
  const newValue: Record<string, unknown> = {}

  if (typeof body?.title === 'string' && body.title.trim() && body.title.trim() !== task.title) {
    data.title = body.title.trim()
    oldValue.title = task.title
    newValue.title = body.title.trim()
  }

  if (typeof body?.priority === 'string' && body.priority && body.priority !== task.priority) {
    data.priority = body.priority
    oldValue.priority = task.priority
    newValue.priority = body.priority
  }

  if (body?.dueDate !== undefined) {
    const next = parseDate(body.dueDate)
    if ((next?.getTime() ?? null) !== (task.dueDate?.getTime() ?? null)) {
      data.dueDate = next
      oldValue.dueDate = task.dueDate?.toISOString() ?? null
      newValue.dueDate = next?.toISOString() ?? null
    }
  }

  if (typeof body?.status === 'string' && body.status && body.status !== task.status) {
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: 'Status tidak valid' }, { status: 400 })
    }
    data.status = body.status
    oldValue.status = task.status
    newValue.status = body.status
    if (body.status === 'DONE') {
      data.completedAt = new Date()
      newValue.completedAt = data.completedAt as Date
    } else if (task.completedAt) {
      data.completedAt = null
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Tidak ada perubahan' }, { status: 400 })
  }

  const updated = await db.task.update({ where: { id }, data, include: taskInclude })

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'TASK_UPDATE',
    entityType: 'Task',
    entityId: id,
    entityLabel: task.title,
    oldValue,
    newValue,
    req,
  })

  return NextResponse.json(mapTask(updated))
}
