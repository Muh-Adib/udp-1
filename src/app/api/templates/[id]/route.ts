/* ============ /api/templates/[id] — edit / toggle isActive (SUPER_ADMIN) ============ */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, mapTemplate } from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const FIELDS = ['name', 'channel', 'language', 'subject', 'body', 'purpose'] as const
const NUMBER_FIELDS = ['step', 'delayDays'] as const

/** PATCH — partial update incl. isActive toggle */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })
  if (session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Hanya Super Admin yang dapat mengubah template' }, { status: 403 })
  }

  const { id } = await ctx.params
  const template = await db.followUpTemplate.findUnique({ where: { id } })
  if (!template) return NextResponse.json({ error: 'Template tidak ditemukan' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const data: Record<string, unknown> = {}
  const oldValue: Record<string, unknown> = {}
  const newValue: Record<string, unknown> = {}
  const current = template as unknown as Record<string, unknown>

  for (const key of FIELDS) {
    if (body?.[key] === undefined) continue
    const raw = body[key]
    const next = typeof raw === 'string' && raw.trim() === '' ? null : raw
    if (next === current[key]) continue
    data[key] = next
    oldValue[key] = current[key]
    newValue[key] = next
  }

  for (const key of NUMBER_FIELDS) {
    if (body?.[key] === undefined || typeof body[key] !== 'number') continue
    const next = Math.max(0, Math.round(body[key]))
    if (next === current[key]) continue
    data[key] = next
    oldValue[key] = current[key]
    newValue[key] = next
  }

  if (typeof body?.isActive === 'boolean' && body.isActive !== template.isActive) {
    data.isActive = body.isActive
    oldValue.isActive = template.isActive
    newValue.isActive = body.isActive
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Tidak ada perubahan' }, { status: 400 })
  }

  const updated = await db.followUpTemplate.update({ where: { id }, data })

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'UPDATE',
    entityType: 'Template',
    entityId: id,
    entityLabel: updated.name,
    oldValue,
    newValue,
    req,
  })

  return NextResponse.json(mapTemplate(updated))
}
