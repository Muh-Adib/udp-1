/* ============ /api/templates — follow-up templates (list + create SUPER_ADMIN) ============ */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, mapTemplate } from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/** GET ?brandId= → TemplateDTO[] */
export async function GET(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const brandId = searchParams.get('brandId') ?? ''

  const templates = await db.followUpTemplate.findMany({
    where: brandId ? { brandId } : {},
    orderBy: [{ brandId: 'asc' }, { step: 'asc' }],
  })

  return NextResponse.json(templates.map(mapTemplate))
}

/** POST { brandId, name, step?, delayDays?, channel?, language?, subject?, body, purpose? } */
export async function POST(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })
  if (session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Hanya Super Admin yang dapat membuat template' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const brandId = typeof body?.brandId === 'string' ? body.brandId : ''
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const text = typeof body?.body === 'string' ? body.body.trim() : ''
  if (!brandId || !name || !text) {
    return NextResponse.json({ error: 'Brand, nama, dan isi template wajib diisi' }, { status: 400 })
  }
  const brand = await db.brand.findUnique({ where: { id: brandId } })
  if (!brand) return NextResponse.json({ error: 'Brand tidak ditemukan' }, { status: 404 })

  const template = await db.followUpTemplate.create({
    data: {
      brandId,
      name,
      body: text,
      step: typeof body?.step === 'number' ? body.step : 1,
      delayDays: typeof body?.delayDays === 'number' ? body.delayDays : 1,
      channel: typeof body?.channel === 'string' && body.channel ? body.channel : 'WHATSAPP',
      language: typeof body?.language === 'string' && body.language ? body.language : 'id',
      subject: typeof body?.subject === 'string' && body.subject ? body.subject : null,
      purpose: typeof body?.purpose === 'string' && body.purpose ? body.purpose : null,
      isActive: true,
    },
  })

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'CREATE',
    entityType: 'Template',
    entityId: template.id,
    entityLabel: template.name,
    newValue: { name, brandId, channel: template.channel },
    req,
  })

  return NextResponse.json(mapTemplate(template))
}
