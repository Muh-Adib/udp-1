/* ============ /api/projects/[id]/milestones/[mid] — GET/PATCH/DELETE milestone ============ */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  getSessionUser, mapMilestone, mapProject, PROJECT_MANAGERS, MILESTONE_WORKERS,
  projectDetailInclude, parseDate,
} from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const VALID_STATUSES = ['PENDING', 'IN_PROGRESS', 'DONE']

/** GET — detail milestone + lampiran. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string; mid: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })
  if (session.role === 'CLIENT') {
    return NextResponse.json({ error: 'Akses khusus tim internal UDP' }, { status: 403 })
  }
  const { mid } = await ctx.params
  const milestone = await db.milestone.findUnique({
    where: { id: mid },
    include: { attachments: { orderBy: { createdAt: 'asc' as const } } },
  })
  if (!milestone) return NextResponse.json({ error: 'Milestone tidak ditemukan' }, { status: 404 })
  return NextResponse.json(mapMilestone(milestone))
}

/**
 * PATCH — alur kerja milestone.
 *  - Status (PENDING/IN_PROGRESS/DONE): MILESTONE_WORKERS (manajemen + produksi).
 *  - Struktur (name/description/estimatedDays/startDate/dueDate): PROJECT_MANAGERS.
 *  Status DONE → completedAt + progress project dihitung ulang.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; mid: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })
  if (session.role === 'CLIENT') {
    return NextResponse.json({ error: 'Akses khusus tim internal UDP' }, { status: 403 })
  }

  const { id, mid } = await ctx.params
  const project = await db.project.findUnique({ where: { id } })
  if (!project) return NextResponse.json({ error: 'Project tidak ditemukan' }, { status: 404 })

  const milestone = await db.milestone.findUnique({ where: { id: mid } })
  if (!milestone || milestone.projectId !== id) {
    return NextResponse.json({ error: 'Milestone tidak ditemukan' }, { status: 404 })
  }

  const body = await req.json().catch(() => null)
  const data: Record<string, unknown> = {}
  const oldValue: Record<string, unknown> = {}
  const newValue: Record<string, unknown> = {}

  /* --- status (pekerja) --- */
  if (typeof body?.status === 'string' && body.status && body.status !== milestone.status) {
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: 'Status milestone tidak valid' }, { status: 400 })
    }
    if (!(MILESTONE_WORKERS as readonly string[]).includes(session.role)) {
      return NextResponse.json({ error: 'Hanya tim produksi/manajemen yang dapat mengubah status milestone' }, { status: 403 })
    }
    data.status = body.status
    oldValue.status = milestone.status
    newValue.status = body.status
    if (body.status === 'DONE') {
      data.completedAt = new Date()
      newValue.completedAt = data.completedAt as Date
    } else {
      data.completedAt = null
    }
  }

  /* --- struktur (manajer) --- */
  const wantsStructural =
    (body?.name !== undefined && body.name !== milestone.name) ||
    (body?.description !== undefined && body.description !== milestone.description) ||
    (body?.estimatedDays !== undefined && body.estimatedDays !== milestone.estimatedDays) ||
    (body?.price !== undefined && body.price !== milestone.price) ||
    (body?.startDate !== undefined && (parseDate(body.startDate)?.getTime() ?? null) !== (milestone.startDate?.getTime() ?? null)) ||
    (body?.dueDate !== undefined && (parseDate(body.dueDate)?.getTime() ?? null) !== (milestone.dueDate?.getTime() ?? null))

  if (wantsStructural) {
    if (!(PROJECT_MANAGERS as readonly string[]).includes(session.role)) {
      return NextResponse.json({ error: 'Hanya Super Admin/Direktur/Manajer yang dapat mengubah detail milestone' }, { status: 403 })
    }
    if (typeof body?.name === 'string' && body.name.trim() && body.name.trim() !== milestone.name) {
      if (body.name.trim().length > 120) return NextResponse.json({ error: 'Nama milestone maksimal 120 karakter' }, { status: 400 })
      data.name = body.name.trim()
      oldValue.name = milestone.name
      newValue.name = data.name
    }
    if (body?.description !== undefined && body.description !== milestone.description) {
      if (body.description !== null && typeof body.description !== 'string') {
        return NextResponse.json({ error: 'Deskripsi tidak valid' }, { status: 400 })
      }
      const desc = typeof body.description === 'string' ? body.description.trim().slice(0, 2000) : null
      data.description = desc || null
      oldValue.description = milestone.description
      newValue.description = data.description
    }
    if (body?.estimatedDays !== undefined && body.estimatedDays !== milestone.estimatedDays) {
      if (body.estimatedDays !== null && (typeof body.estimatedDays !== 'number' || !Number.isFinite(body.estimatedDays) || body.estimatedDays < 0 || body.estimatedDays > 365)) {
        return NextResponse.json({ error: 'Estimasi hari harus 0–365' }, { status: 400 })
      }
      data.estimatedDays = body.estimatedDays === null ? null : Math.round(body.estimatedDays)
      oldValue.estimatedDays = milestone.estimatedDays
      newValue.estimatedDays = data.estimatedDays
    }
    if (body?.price !== undefined && body.price !== milestone.price) {
      if (body.price !== null && (typeof body.price !== 'number' || !Number.isFinite(body.price) || body.price < 0)) {
        return NextResponse.json({ error: 'Harga milestone tidak valid' }, { status: 400 })
      }
      data.price = body.price === null ? null : body.price
      oldValue.price = milestone.price
      newValue.price = data.price
    }
    if (body?.startDate !== undefined) {
      const d = parseDate(body.startDate)
      data.startDate = d
      oldValue.startDate = milestone.startDate?.toISOString() ?? null
      newValue.startDate = d?.toISOString() ?? null
    }
    if (body?.dueDate !== undefined) {
      const d = parseDate(body.dueDate)
      data.dueDate = d
      oldValue.dueDate = milestone.dueDate?.toISOString() ?? null
      newValue.dueDate = d?.toISOString() ?? null
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Tidak ada perubahan' }, { status: 400 })
  }

  const updated = await db.milestone.update({ where: { id: mid }, data })

  /* Recompute progress project jika status berubah. */
  let progress: number | undefined
  if (data.status !== undefined) {
    const all = await db.milestone.findMany({ where: { projectId: id } })
    const done = all.filter((m) => m.status === 'DONE').length
    progress = all.length ? Math.round((done / all.length) * 100) : 0
    if (progress !== project.progress) {
      await db.project.update({ where: { id }, data: { progress } })
    }
  }

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'MILESTONE_UPDATE',
    entityType: 'Milestone',
    entityId: mid,
    entityLabel: `${project.code} — ${milestone.name}`,
    oldValue,
    newValue,
    req,
  })

  return NextResponse.json({ ...mapMilestone(updated), projectProgress: progress })
}

/** DELETE — hapus milestone (manajer) + transaksi reorder. */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string; mid: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })
  if (session.role === 'CLIENT') {
    return NextResponse.json({ error: 'Akses khusus tim internal UDP' }, { status: 403 })
  }
  if (!(PROJECT_MANAGERS as readonly string[]).includes(session.role)) {
    return NextResponse.json({ error: 'Hanya Super Admin/Direktur/Manajer yang dapat menghapus milestone' }, { status: 403 })
  }

  const { id, mid } = await ctx.params
  const project = await db.project.findUnique({ where: { id } })
  if (!project) return NextResponse.json({ error: 'Project tidak ditemukan' }, { status: 404 })
  const milestone = await db.milestone.findUnique({ where: { id: mid } })
  if (!milestone || milestone.projectId !== id) {
    return NextResponse.json({ error: 'Milestone tidak ditemukan' }, { status: 404 })
  }

  const remaining = await db.milestone.count({ where: { projectId: id } })
  if (remaining <= 1) {
    return NextResponse.json({ error: 'Project minimal memiliki 1 milestone' }, { status: 400 })
  }

  await db.$transaction(async (tx) => {
    await tx.milestone.delete({ where: { id: mid } })
    const rest = await tx.milestone.findMany({ where: { projectId: id }, orderBy: { stepOrder: 'asc' } })
    for (let i = 0; i < rest.length; i++) {
      if (rest[i].stepOrder !== i + 1) {
        await tx.milestone.update({ where: { id: rest[i].id }, data: { stepOrder: i + 1 } })
      }
    }
    const done = rest.filter((m) => m.status === 'DONE').length
    const progress = rest.length ? Math.round((done / rest.length) * 100) : 0
    await tx.project.update({ where: { id }, data: { progress } })
  })

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'MILESTONE_DELETE',
    entityType: 'Milestone',
    entityId: mid,
    entityLabel: `${project.code} — ${milestone.name}`,
    oldValue: { name: milestone.name, status: milestone.status },
    req,
  })

  const fresh = await db.project.findUnique({ where: { id }, include: projectDetailInclude })
  return NextResponse.json(fresh ? mapProject(fresh) : { ok: true })
}
