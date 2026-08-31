/* ============ /api/projects/[id] — update progress/status/milestones ============ */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, mapProject, projectInclude } from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/** PATCH { progress?, status?, milestoneId?, milestoneStatus? } */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const { id } = await ctx.params
  const project = await db.project.findUnique({
    where: { id },
    include: { milestones: { orderBy: { stepOrder: 'asc' } } },
  })
  if (!project) return NextResponse.json({ error: 'Project tidak ditemukan' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const data: Record<string, unknown> = {}
  const oldValue: Record<string, unknown> = {}
  const newValue: Record<string, unknown> = {}

  if (typeof body?.status === 'string' && body.status && body.status !== project.status) {
    data.status = body.status
    oldValue.status = project.status
    newValue.status = body.status
    if (body.status === 'COMPLETED') {
      data.endDate = new Date()
      newValue.endDate = data.endDate
    }
  }

  if (typeof body?.progress === 'number') {
    const clamped = Math.max(0, Math.min(100, Math.round(body.progress)))
    if (clamped !== project.progress) {
      data.progress = clamped
      oldValue.progress = project.progress
      newValue.progress = clamped
    }
  }

  /* milestone update → recompute progress = round(done/total*100) */
  if (body?.milestoneId && typeof body?.milestoneStatus === 'string') {
    const milestone = project.milestones.find((m) => m.id === body.milestoneId)
    if (!milestone) return NextResponse.json({ error: 'Milestone tidak ditemukan' }, { status: 404 })
    if (!['PENDING', 'IN_PROGRESS', 'DONE'].includes(body.milestoneStatus)) {
      return NextResponse.json({ error: 'Status milestone tidak valid' }, { status: 400 })
    }
    const msData: Record<string, unknown> = { status: body.milestoneStatus }
    if (body.milestoneStatus === 'DONE') msData.completedAt = new Date()
    else msData.completedAt = null
    await db.milestone.update({ where: { id: milestone.id }, data: msData })

    const all = await db.milestone.findMany({ where: { projectId: id } })
    const done = all.filter((m) => m.status === 'DONE').length
    const progress = all.length ? Math.round((done / all.length) * 100) : 0
    data.progress = progress
    oldValue.milestone = { id: milestone.id, status: milestone.status }
    newValue.milestone = { id: milestone.id, status: body.milestoneStatus }
    if (progress !== project.progress) {
      oldValue.progress = project.progress
      newValue.progress = progress
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Tidak ada perubahan' }, { status: 400 })
  }

  const updated = await db.project.update({ where: { id }, data, include: projectInclude })

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'PROJECT_UPDATE',
    entityType: 'Project',
    entityId: id,
    entityLabel: `${project.code} — ${project.name}`,
    oldValue,
    newValue,
    req,
  })

  return NextResponse.json(mapProject(updated))
}
