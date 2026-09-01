/* ============ /api/quick-templates — template balasan cepat inbox (slash command) ============
 * Template TIDAK ditampilkan sebagai chip di UI — dipanggil dari composer dengan "/keyword".
 * GET  → QuickTemplateDTO[] (semua user internal)
 * POST { keyword, body, description? } — semua role internal boleh membuat (template tim).
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, mapQuickTemplate } from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const KEYWORD_RE = /^[a-z0-9][a-z0-9_-]{1,31}$/

const INTERNAL_ROLES = ['SUPER_ADMIN', 'DIREKTUR', 'MANAJER', 'MARKETING', 'KEUANGAN', 'PRODUKSI', 'HR']

/** GET → QuickTemplateDTO[] (keyword asc) */
export async function GET() {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })
  if (!INTERNAL_ROLES.includes(session.role)) {
    return NextResponse.json({ error: 'Hanya tim internal yang dapat mengakses template' }, { status: 403 })
  }

  const templates = await db.quickTemplate.findMany({
    where: { isActive: true },
    orderBy: { keyword: 'asc' },
  })
  return NextResponse.json(templates.map(mapQuickTemplate))
}

/** POST { keyword, body, description? } → QuickTemplateDTO */
export async function POST(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })
  if (!INTERNAL_ROLES.includes(session.role)) {
    return NextResponse.json({ error: 'Hanya tim internal yang dapat membuat template' }, { status: 403 })
  }

  const payload = await req.json().catch(() => null)
  const keyword = typeof payload?.keyword === 'string' ? payload.keyword.trim().toLowerCase() : ''
  const body = typeof payload?.body === 'string' ? payload.body.trim() : ''
  const description = typeof payload?.description === 'string' && payload.description.trim() ? payload.description.trim() : null

  if (!keyword || !body) {
    return NextResponse.json({ error: 'Kata kunci dan isi template wajib diisi' }, { status: 400 })
  }
  if (!KEYWORD_RE.test(keyword)) {
    return NextResponse.json(
      { error: 'Kata kunci 2–32 karakter, huruf kecil/angka/strip (contoh: terimakasih, followup)' },
      { status: 400 },
    )
  }

  const dup = await db.quickTemplate.findUnique({ where: { keyword } })
  if (dup) {
    if (dup.isActive) {
      return NextResponse.json({ error: `Kata kunci "/${keyword}" sudah dipakai` }, { status: 409 })
    }
    // Reaktivasi template non-aktif dgn isi baru
    const revived = await db.quickTemplate.update({
      where: { id: dup.id },
      data: { body, description, isActive: true, creatorId: session.id, creatorName: session.name },
    })
    await logAudit({
      userId: session.id, userName: session.name, action: 'UPDATE',
      entityType: 'QuickTemplate', entityId: revived.id, entityLabel: `/${keyword}`,
      newValue: { keyword, reactivated: true }, req,
    })
    return NextResponse.json(mapQuickTemplate(revived))
  }

  const template = await db.quickTemplate.create({
    data: {
      keyword,
      body,
      description,
      creatorId: session.id,
      creatorName: session.name,
      isActive: true,
    },
  })

  await logAudit({
    userId: session.id, userName: session.name, action: 'CREATE',
    entityType: 'QuickTemplate', entityId: template.id, entityLabel: `/${keyword}`,
    newValue: { keyword, length: body.length }, req,
  })

  return NextResponse.json(mapQuickTemplate(template))
}
