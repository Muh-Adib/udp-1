/* ============ /api/projects — GET list + POST buat project dari opportunity WON ============ */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  getSessionUser, mapProject, projectInclude, generateProjectCode,
  parseDate, calcProgress,
} from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'
import type { ProjectCreateMilestoneInput } from '@/lib/crm-types'

export const dynamic = 'force-dynamic'

/** GET ?status= → ProjectDTO[] */
export async function GET(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })
  if (session.role === 'CLIENT') {
    return NextResponse.json({ error: 'Akses khusus tim internal UDP' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') ?? ''

  const projects = await db.project.findMany({
    where: status ? { status } : {},
    include: projectInclude,
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(projects.map(mapProject))
}

/**
 * POST — Buat project dari opportunity bertahap WON (tombol "Buat Project").
 * Body: { opportunityId, name?, managerId?, budget?, startDate?, endDate?, workflowType?,
 *         milestones: [{ name, description?, estimatedDays?, dueDate? }] }
 * Satu opportunity = satu project (unique). Milestone wajib ≥1.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })
  if (session.role === 'CLIENT') {
    return NextResponse.json({ error: 'Akses khusus tim internal UDP' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const opportunityId = typeof body?.opportunityId === 'string' ? body.opportunityId : ''
  if (!opportunityId) return NextResponse.json({ error: 'opportunityId wajib diisi' }, { status: 400 })

  const opp = await db.opportunity.findUnique({
    where: { id: opportunityId },
    include: {
      company: { select: { id: true, name: true } },
      executingBrand: { select: { id: true, name: true, workflowType: true } },
      briefs: { select: { deliverables: true, timeline: true, status: true }, orderBy: { updatedAt: 'desc' }, take: 1 },
    },
  })
  if (!opp) return NextResponse.json({ error: 'Opportunity tidak ditemukan' }, { status: 404 })
  if (opp.stage !== 'WON') {
    return NextResponse.json({ error: 'Project hanya dibuat dari opportunity berstatus Won' }, { status: 400 })
  }

  const existing = await db.project.findUnique({ where: { opportunityId } })
  if (existing) {
    return NextResponse.json(
      { error: `Project sudah ada untuk opportunity ini (${existing.code})`, projectId: existing.id },
      { status: 409 }
    )
  }

  // Nama project
  const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 160) : opp.title

  // Workflow type: default ikut brand
  const workflowType = typeof body?.workflowType === 'string' && body.workflowType
    ? body.workflowType
    : opp.executingBrand.workflowType

  // Manager opsional — harus user internal aktif & bukan CLIENT
  let managerId: string | null = null
  if (typeof body?.managerId === 'string' && body.managerId) {
    const mgr = await db.user.findUnique({ where: { id: body.managerId } })
    if (!mgr || !mgr.isActive || mgr.role === 'CLIENT') {
      return NextResponse.json({ error: 'Penanggung jawab tidak valid' }, { status: 400 })
    }
    managerId = mgr.id
  }

  // Budget: default dari nilai deal
  let budget = typeof body?.budget === 'number' && body.budget >= 0 ? body.budget : Math.max(0, opp.estimatedValue)
  if (typeof body?.budget === 'number' && body.budget < 0) {
    return NextResponse.json({ error: 'Budget tidak boleh negatif' }, { status: 400 })
  }

  const now = new Date()
  const startDate = parseDate(body?.startDate) ?? now
  const endDate = parseDate(body?.endDate) ?? null
  if (endDate && endDate < startDate) {
    return NextResponse.json({ error: 'Tanggal selesai tidak boleh sebelum tanggal mulai' }, { status: 400 })
  }

  // Milestone list — validasi
  const rawMilestones = Array.isArray(body?.milestones) ? body.milestones : []
  if (rawMilestones.length === 0) {
    return NextResponse.json({ error: 'Minimal 1 milestone diperlukan' }, { status: 400 })
  }
  if (rawMilestones.length > 20) {
    return NextResponse.json({ error: 'Maksimal 20 milestone' }, { status: 400 })
  }
  const milestones: ProjectCreateMilestoneInput[] = []
  for (let i = 0; i < rawMilestones.length; i++) {
    const m = rawMilestones[i]
    const mName = typeof m?.name === 'string' ? m.name.trim() : ''
    if (!mName) return NextResponse.json({ error: `Nama milestone #${i + 1} wajib diisi` }, { status: 400 })
    if (mName.length > 120) return NextResponse.json({ error: `Nama milestone #${i + 1} terlalu panjang (maks 120)` }, { status: 400 })
    let estimatedDays: number | undefined
    if (typeof m?.estimatedDays === 'number' && Number.isFinite(m.estimatedDays)) {
      if (m.estimatedDays < 0 || m.estimatedDays > 365) {
        return NextResponse.json({ error: `Estimasi hari milestone #${i + 1} harus 0–365` }, { status: 400 })
      }
      estimatedDays = Math.round(m.estimatedDays)
    }
    const mDue = parseDate(m?.dueDate)
    milestones.push({
      name: mName,
      description: typeof m?.description === 'string' && m.description.trim() ? m.description.trim().slice(0, 2000) : undefined,
      estimatedDays,
      price: typeof m?.price === 'number' && Number.isFinite(m.price) && m.price >= 0 ? m.price : undefined,
      dueDate: mDue ? mDue.toISOString() : undefined,
    })
  }

  // Due date default milestone: startDate + estimatedDays (atau +7 hari per milestone)
  const milestoneData = milestones.map((m, idx) => {
    const est = m.estimatedDays ?? 7
    const due = m.dueDate ? new Date(m.dueDate) : new Date(startDate.getTime() + Math.max(1, est) * 86400000)
    return {
      name: m.name,
      description: m.description ?? null,
      estimatedDays: m.estimatedDays ?? null,
      price: m.price ?? null,
      stepOrder: idx + 1,
      status: 'PENDING',
      dueDate: due,
    }
  })

  const code = await generateProjectCode()

  const project = await db.project.create({
    data: {
      name,
      code,
      opportunityId,
      companyId: opp.companyId,
      brandId: opp.executingBrandId,
      managerId,
      status: 'PLANNING',
      progress: 0,
      workflowType,
      budget,
      startDate,
      endDate,
      milestones: { create: milestoneData },
    },
    include: projectInclude,
  })

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'PROJECT_CREATE',
    entityType: 'Project',
    entityId: project.id,
    entityLabel: `${project.code} — ${project.name}`,
    newValue: { opportunityId, milestoneCount: milestoneData.length, workflowType },
    req,
  })

  return NextResponse.json({
    ...mapProject(project),
    progress: calcProgress(0, milestoneData.length),
    briefUsed: opp.briefs[0]?.status === 'FINAL',
  }, { status: 201 })
}
