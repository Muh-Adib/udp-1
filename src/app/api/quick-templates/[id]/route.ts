/* ============ /api/quick-templates/[id] — update & hapus template slash ============
 * PATCH  { body?, description?, keyword? } — pembuat atau SUPER_ADMIN
 * DELETE — soft delete (isActive=false) — pembuat atau SUPER_ADMIN
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, mapQuickTemplate } from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const KEYWORD_RE = /^[a-z0-9][a-z0-9_-]{1,31}$/

const canManage = (role: string) => role === 'SUPER_ADMIN' || role === 'MANAJER'

/** PATCH — ubah isi/keyword/deskripsi */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const { id } = await ctx.params
  const template = await db.quickTemplate.findUnique({ where: { id } })
  if (!template || !template.isActive) {
    return NextResponse.json({ error: 'Template tidak ditemukan' }, { status: 404 })
  }
  if (template.creatorId !== session.id && !canManage(session.role)) {
    return NextResponse.json({ error: 'Hanya pembuat template atau Super Admin/Manajer yang dapat mengubah' }, { status: 403 })
  }

  const payload = await req.json().catch(() => null)
  const data: Record<string, unknown> = {}
  const oldValue: Record<string, unknown> = {}
  const newValue: Record<string, unknown> = {}

  if (typeof payload?.keyword === 'string') {
    const keyword = payload.keyword.trim().toLowerCase()
    if (keyword !== template.keyword) {
      if (!KEYWORD_RE.test(keyword)) {
        return NextResponse.json({ error: 'Kata kunci 2–32 karakter, huruf kecil/angka/strip' }, { status: 400 })
      }
      const dup = await db.quickTemplate.findUnique({ where: { keyword } })
      if (dup && dup.isActive) {
        return NextResponse.json({ error: `Kata kunci "/${keyword}" sudah dipakai` }, { status: 409 })
      }
      data.keyword = keyword
      oldValue.keyword = template.keyword
      newValue.keyword = keyword
    }
  }
  if (typeof payload?.body === 'string') {
    const body = payload.body.trim()
    if (!body) return NextResponse.json({ error: 'Isi template tidak boleh kosong' }, { status: 400 })
    if (body !== template.body) {
      data.body = body
      oldValue.body = template.body
      newValue.body = body
    }
  }
  if (payload?.description !== undefined) {
    const description = typeof payload.description === 'string' && payload.description.trim() ? payload.description.trim() : null
    if (description !== template.description) {
      data.description = description
      oldValue.description = template.description
      newValue.description = description
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(mapQuickTemplate(template))
  }

  const updated = await db.quickTemplate.update({ where: { id }, data })

  await logAudit({
    userId: session.id, userName: session.name, action: 'UPDATE',
    entityType: 'QuickTemplate', entityId: updated.id, entityLabel: `/${updated.keyword}`,
    oldValue, newValue, req,
  })

  return NextResponse.json(mapQuickTemplate(updated))
}

/** DELETE — soft delete (isActive=false) agar /keyword lama bisa direaktivasi */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const { id } = await ctx.params
  const template = await db.quickTemplate.findUnique({ where: { id } })
  if (!template || !template.isActive) {
    return NextResponse.json({ error: 'Template tidak ditemukan' }, { status: 404 })
  }
  if (template.creatorId !== session.id && !canManage(session.role)) {
    return NextResponse.json({ error: 'Hanya pembuat template atau Super Admin/Manajer yang dapat menghapus' }, { status: 403 })
  }

  const updated = await db.quickTemplate.update({ where: { id }, data: { isActive: false } })

  await logAudit({
    userId: session.id, userName: session.name, action: 'DELETE',
    entityType: 'QuickTemplate', entityId: updated.id, entityLabel: `/${updated.keyword}`,
    oldValue: { keyword: updated.keyword }, req,
  })

  return NextResponse.json({ ok: true })
}
