/* ============ /api/audit-logs — activity trail (auth) ============ */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, mapAuditLog } from '@/lib/crm-server'

export const dynamic = 'force-dynamic'

/** GET ?action=&entityType=&limit=100 → AuditLogDTO[] */
export async function GET(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action') ?? ''
  const entityType = searchParams.get('entityType') ?? ''
  const limitParam = Number(searchParams.get('limit'))
  const limit = limitParam > 0 ? Math.min(limitParam, 500) : 100

  const logs = await db.auditLog.findMany({
    where: {
      ...(action ? { action } : {}),
      ...(entityType ? { entityType } : {}),
    },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return NextResponse.json(logs.map(mapAuditLog))
}
