/* ============ /api/projects — list ============ */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, mapProject, projectInclude } from '@/lib/crm-server'

export const dynamic = 'force-dynamic'

/** GET ?status= → ProjectDTO[] */
export async function GET(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') ?? ''

  const projects = await db.project.findMany({
    where: status ? { status } : {},
    include: projectInclude,
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(projects.map(mapProject))
}
