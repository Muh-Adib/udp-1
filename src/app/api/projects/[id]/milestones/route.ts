/* ============ /api/projects/[id]/milestones — POST tambah milestone ============ */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  getSessionUser, mapMilestone, PROJECT_MANAGERS, parseDate,
} from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/** POST { name, description?, estimatedDays?, dueDate? } — tambah milestone di urutan terakhir. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })
  if (session.role === 'CLIENT') {
    return NextResponse.json({ error: 'Akses khusus tim internal UDP' }, { status: 403 })
  }
  if (!(PROJECT_MANAGERS as readonly string[]).includes(session.role)) {
    return NextResponse.json({ error: 'Hanya Super Admin/Direktur/Manajer yang dapat menambah milestone' }, { status: 403 })
  }

  const { id } = await ctx.params
  const project = await db.project.findUnique({ where: { id }, include: { _count: { select: { milestones: true } } } })
  if (!project) return NextResponse.json({ error: 'Project tidak ditemukan' }, { status: 404 })
  if (project._count.milestones >= 20) {
    return NextResponse.json({ error: 'Maksimal 20 milestone per project' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'Nama milestone wajib diisi' }, { status: 400 })
  if (name.length > 120) return NextResponse.json({ error: 'Nama milestone maksimal 120 karakter' }, { status: 400 })

  let estimatedDays: number | null = null
  if (typeof body?.estimatedDays === 'number' && Number.isFinite(body.estimatedDays)) {
    if (body.estimatedDays < 0 || body.estimatedDays > 365) {
      return NextResponse.json({ error: 'Estimasi hari harus 0–365' }, { status: 400 })
    }
    estimatedDays = Math.round(body.estimatedDays)
  }
  const dueDate = parseDate(body?.dueDate)
  const description = typeof body?.description === 'string' && body.description.trim()
    ? body.description.trim().slice(0, 2000) : null

  const last = await db.milestone.findFirst({ where: { projectId: id }, orderBy: { stepOrder: 'desc' } })
  const milestone = await db.milestone.create({
    data: {
      projectId: id,
      name,
      description,
      estimatedDays,
      dueDate,
      stepOrder: (last?.stepOrder ?? 0) + 1,
      status: 'PENDING',
    },
  })

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'MILESTONE_CREATE',
    entityType: 'Milestone',
    entityId: milestone.id,
    entityLabel: `${project.code} — ${name}`,
    newValue: { name, estimatedDays, dueDate: dueDate?.toISOString() ?? null },
    req,
  })

  return NextResponse.json(mapMilestone(milestone), { status: 201 })
}
