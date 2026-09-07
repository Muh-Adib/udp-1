/* ============ /api/projects/[id]/milestones/[mid]/attachments — POST upload ============ */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  getSessionUser, mapAttachment, validateAttachmentBody, MILESTONE_WORKERS,
} from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/** POST { name, mimeType, size, dataUrl } — lampiran milestone (data-URL ≤2MB). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; mid: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })
  if (session.role === 'CLIENT') {
    return NextResponse.json({ error: 'Akses khusus tim internal UDP' }, { status: 403 })
  }
  if (!(MILESTONE_WORKERS as readonly string[]).includes(session.role)) {
    return NextResponse.json({ error: 'Hanya tim produksi/manajemen yang dapat mengunggah lampiran milestone' }, { status: 403 })
  }

  const { id, mid } = await ctx.params
  const project = await db.project.findUnique({ where: { id } })
  if (!project) return NextResponse.json({ error: 'Project tidak ditemukan' }, { status: 404 })
  const milestone = await db.milestone.findUnique({ where: { id: mid } })
  if (!milestone || milestone.projectId !== id) {
    return NextResponse.json({ error: 'Milestone tidak ditemukan' }, { status: 404 })
  }

  const body = await req.json().catch(() => null)
  const validated = validateAttachmentBody(body ?? {})
  if (typeof validated === 'string') {
    return NextResponse.json({ error: validated }, { status: 400 })
  }

  const attachment = await db.milestoneAttachment.create({
    data: { ...validated, milestoneId: mid, uploadedByName: session.name },
  })

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'MILESTONE_ATTACHMENT_ADD',
    entityType: 'MilestoneAttachment',
    entityId: attachment.id,
    entityLabel: `${project.code} — ${milestone.name} · ${validated.name}`,
    newValue: { name: validated.name, mimeType: validated.mimeType, size: validated.size },
    req,
  })

  return NextResponse.json(mapAttachment(attachment), { status: 201 })
}
