/* ============ /api/tasks — list + create ============ */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, mapTask, taskInclude, parseDate } from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const OPEN_STATUSES = ['OPEN', 'IN_PROGRESS']

/** GET ?status=&assigneeId=&opportunityId=&scope=upcoming → TaskDTO[] */
export async function GET(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') ?? ''
  const assigneeId = searchParams.get('assigneeId') ?? ''
  const opportunityId = searchParams.get('opportunityId') ?? ''
  const scope = searchParams.get('scope') ?? ''

  const upcoming = scope === 'upcoming'
  const baseFilters = {
    ...(assigneeId ? { assigneeId } : {}),
    ...(opportunityId ? { opportunityId } : {}),
  }
  const tasks = upcoming
    ? await db.task.findMany({
        where: { ...baseFilters, status: { in: OPEN_STATUSES } },
        include: taskInclude,
        orderBy: { dueDate: 'asc' },
        take: 20,
      })
    : await db.task.findMany({
        where: { ...baseFilters, ...(status ? { status } : {}) },
        include: taskInclude,
        orderBy: { createdAt: 'desc' },
      })

  // null dueDates last for upcoming scope
  const sorted = upcoming
    ? [...tasks].sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0
        if (!a.dueDate) return 1
        if (!b.dueDate) return -1
        return a.dueDate.getTime() - b.dueDate.getTime()
      })
    : tasks

  return NextResponse.json(sorted.map(mapTask))
}

/** POST { title, description?, opportunityId?, assigneeId, dueDate?, priority?, type? } */
export async function POST(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const assigneeId = typeof body?.assigneeId === 'string' ? body.assigneeId : ''
  if (!title || !assigneeId) {
    return NextResponse.json({ error: 'Judul dan assignee wajib diisi' }, { status: 400 })
  }

  const assignee = await db.user.findFirst({ where: { id: assigneeId, isActive: true } })
  if (!assignee) return NextResponse.json({ error: 'Assignee tidak ditemukan' }, { status: 404 })

  const opportunityId = typeof body?.opportunityId === 'string' && body.opportunityId ? body.opportunityId : null
  if (opportunityId) {
    const opp = await db.opportunity.findFirst({ where: { id: opportunityId, isDeleted: false } })
    if (!opp) return NextResponse.json({ error: 'Opportunity tidak ditemukan' }, { status: 404 })
  }

  const task = await db.task.create({
    data: {
      title,
      description: typeof body?.description === 'string' && body.description ? body.description : null,
      opportunityId,
      assigneeId,
      dueDate: parseDate(body?.dueDate),
      priority: typeof body?.priority === 'string' && body.priority ? body.priority : 'MEDIUM',
      type: typeof body?.type === 'string' && body.type ? body.type : 'FOLLOW_UP',
    },
    include: taskInclude,
  })

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'TASK_CREATE',
    entityType: 'Task',
    entityId: task.id,
    entityLabel: task.title,
    newValue: { title, assigneeId, opportunityId, dueDate: task.dueDate?.toISOString() ?? null },
    req,
  })

  return NextResponse.json(mapTask(task))
}
