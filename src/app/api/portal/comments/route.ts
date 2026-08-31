/* ============ /api/portal/comments — thread diskusi per dokumen portal (R11) ============ *
 * GET  ?entityType=QUOTATION|INVOICE|PROJECT&entityId=... → PortalCommentDTO[] (createdAt asc)
 * POST { entityType, entityId, body } → PortalCommentDTO (1 komentar baru, 1..2000 karakter)
 * Client hanya untuk data company-nya; semua role internal (SUPER_ADMIN, DIREKTUR,
 * MARKETING, KEUANGAN, PRODUKSI) boleh membaca & membalas.
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'
import type { PortalCommentDTO, PortalCommentEntity } from '@/lib/crm-types'

export const dynamic = 'force-dynamic'

const ENTITY_TYPES: PortalCommentEntity[] = ['QUOTATION', 'INVOICE', 'PROJECT']

/** Nama entity (singular, gaya audit) per entityType utk entityLabel audit log */
const AUDIT_ENTITY_NAME: Record<PortalCommentEntity, string> = {
  QUOTATION: 'Quotation',
  INVOICE: 'Invoice',
  PROJECT: 'Project',
}

function parseEntityParams(entityTypeRaw: string | null, entityIdRaw: string | null) {
  if (!entityTypeRaw || !ENTITY_TYPES.includes(entityTypeRaw as PortalCommentEntity)) {
    return { error: 'Jenis entitas tidak valid' as const }
  }
  if (!entityIdRaw) return { error: 'EntityId wajib diisi' as const }
  return { entityType: entityTypeRaw as PortalCommentEntity, entityId: entityIdRaw }
}

/** Muat entitas induk + cek kepemilikan utk role CLIENT. Return error response bila gagal. */
async function loadEntityWithAccess(
  entityType: PortalCommentEntity,
  entityId: string,
  sessionCompanyId: string | null | undefined,
  sessionRole: string,
) {
  const entity =
    entityType === 'QUOTATION'
      ? await db.quotation.findUnique({ where: { id: entityId }, select: { id: true, companyId: true, code: true, title: true } })
      : entityType === 'INVOICE'
        ? await db.invoice.findUnique({ where: { id: entityId }, select: { id: true, companyId: true, code: true, title: true } })
        : await db.project.findUnique({ where: { id: entityId }, select: { id: true, companyId: true, code: true, name: true } })

  if (!entity) return { error: 'Data tidak ditemukan' as const, status: 404 as const }
  if (sessionRole === 'CLIENT' && entity.companyId !== sessionCompanyId) {
    return { error: 'Data bukan milik perusahaan Anda' as const, status: 403 as const }
  }
  return { entity }
}

function mapComment(c: {
  id: string
  entityType: string
  entityId: string
  userName: string
  userRole: string
  body: string
  createdAt: Date
}): PortalCommentDTO {
  return {
    id: c.id,
    entityType: c.entityType as PortalCommentEntity,
    entityId: c.entityId,
    userName: c.userName,
    userRole: c.userRole,
    isClient: c.userRole === 'CLIENT',
    body: c.body,
    createdAt: c.createdAt.toISOString(),
  }
}

/** GET → PortalCommentDTO[] ordered createdAt asc */
export async function GET(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const parsed = parseEntityParams(searchParams.get('entityType'), searchParams.get('entityId'))
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const { entityType, entityId } = parsed

  try {
    const access = await loadEntityWithAccess(entityType, entityId, session.companyId, session.role)
    if ('error' in access) {
      return NextResponse.json({ error: access.error }, { status: access.status })
    }

    const rows = await db.portalComment.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'asc' as const },
    })
    return NextResponse.json(rows.map(mapComment))
  } catch (err) {
    console.error('[portal/comments] gagal memuat komentar:', err)
    return NextResponse.json({ error: 'Gagal memuat komentar' }, { status: 500 })
  }
}

/** POST → PortalCommentDTO (komentar baru) */
export async function POST(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  try {
    const body: { entityType?: unknown; entityId?: unknown; body?: unknown } = await req
      .json()
      .catch(() => ({}))

    const parsed = parseEntityParams(
      typeof body.entityType === 'string' ? body.entityType : null,
      typeof body.entityId === 'string' ? body.entityId : null,
    )
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    const { entityType, entityId } = parsed

    const text = typeof body.body === 'string' ? body.body.trim() : ''
    if (!text || text.length > 2000) {
      return NextResponse.json(
        { error: 'Komentar wajib diisi (maks 2000 karakter)' },
        { status: 400 },
      )
    }

    const access = await loadEntityWithAccess(entityType, entityId, session.companyId, session.role)
    if ('error' in access) {
      return NextResponse.json({ error: access.error }, { status: access.status })
    }
    const entity = access.entity

    const created = await db.portalComment.create({
      data: {
        entityType,
        entityId,
        companyId: entity.companyId,
        userId: session.id,
        userName: session.name,
        userRole: session.role,
        body: text,
      },
    })

    await logAudit({
      userId: session.id,
      userName: session.name,
      action: 'PORTAL_COMMENT_ADDED',
      entityType: AUDIT_ENTITY_NAME[entityType],
      entityId,
      entityLabel: `${entity.code} — komentar`,
      newValue: { by: session.name, role: session.role, length: text.length },
      req,
    })

    return NextResponse.json(mapComment(created))
  } catch (err) {
    console.error('[portal/comments] gagal mengirim komentar:', err)
    return NextResponse.json({ error: 'Gagal mengirim komentar' }, { status: 500 })
  }
}
