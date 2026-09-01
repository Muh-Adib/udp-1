/* ============ /api/contacts/[id] — update, soft-delete ============ */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, mapContact, splitTags } from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const STRING_FIELDS = ['lastName', 'position', 'email', 'altEmail', 'whatsapp', 'phone', 'instagram', 'threads', 'country', 'city', 'timezone', 'language', 'preferredChannel', 'linkedin', 'consentStatus'] as const

/** PATCH — partial update, audit only changed keys */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const { id } = await ctx.params
  const contact = await db.contact.findFirst({ where: { id, isDeleted: false } })
  if (!contact) return NextResponse.json({ error: 'Kontak tidak ditemukan' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const data: Record<string, unknown> = {}
  const oldValue: Record<string, unknown> = {}
  const newValue: Record<string, unknown> = {}
  const current = contact as unknown as Record<string, unknown>

  if (typeof body?.firstName === 'string' && body.firstName.trim() && body.firstName.trim() !== contact.firstName) {
    data.firstName = body.firstName.trim()
    oldValue.firstName = contact.firstName
    newValue.firstName = body.firstName.trim()
  }

  for (const key of STRING_FIELDS) {
    if (body?.[key] === undefined) continue
    const raw = body[key]
    const next = typeof raw === 'string' && raw.trim() === '' ? null : raw
    if (next === current[key]) continue
    data[key] = next
    oldValue[key] = current[key]
    newValue[key] = next
  }

  if (body?.tags !== undefined) {
    const next = Array.isArray(body.tags) ? body.tags.join(',') : typeof body.tags === 'string' ? body.tags : contact.tags
    if (next !== contact.tags) {
      data.tags = next
      oldValue.tags = splitTags(contact.tags)
      newValue.tags = splitTags(next as string)
    }
  }

  if (body?.companyId !== undefined) {
    const next = body.companyId || null
    if (next !== contact.companyId) {
      if (next) {
        const company = await db.company.findFirst({ where: { id: next, isDeleted: false } })
        if (!company) return NextResponse.json({ error: 'Perusahaan tidak ditemukan' }, { status: 404 })
      }
      data.companyId = next
      oldValue.companyId = contact.companyId
      newValue.companyId = next
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Tidak ada perubahan' }, { status: 400 })
  }

  const updated = await db.contact.update({
    where: { id },
    data,
    include: { company: { select: { id: true, name: true, country: true } } },
  })

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'UPDATE',
    entityType: 'Contact',
    entityId: id,
    entityLabel: `${updated.firstName} ${updated.lastName ?? ''}`.trim(),
    oldValue,
    newValue,
    req,
  })

  return NextResponse.json(mapContact(updated))
}

/** DELETE → soft delete */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const { id } = await ctx.params
  const contact = await db.contact.findFirst({ where: { id, isDeleted: false } })
  if (!contact) return NextResponse.json({ error: 'Kontak tidak ditemukan' }, { status: 404 })

  await db.contact.update({ where: { id }, data: { isDeleted: true } })

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'DELETE',
    entityType: 'Contact',
    entityId: id,
    entityLabel: `${contact.firstName} ${contact.lastName ?? ''}`.trim(),
    oldValue: { isDeleted: false },
    newValue: { isDeleted: true },
    req,
  })

  return NextResponse.json({ ok: true })
}
