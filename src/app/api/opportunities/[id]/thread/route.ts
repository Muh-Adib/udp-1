/* ============ /api/opportunities/[id]/thread — percakapan penuh IN+OUT ============ *
 * Dipakai chat view inbox (mode Chat): GET seluruh interaksi satu opportunity
 * (semua direction, asc by sentAt) — fix utk bubble OUT yang hilang setelah reload
 * krn /api/interactions hanya mengembalikan IN. Read-only, TANPA logAudit
 * (di-poll oleh chat view).                                                        */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, mapInteraction, interactionInclude } from '@/lib/crm-server'

export const dynamic = 'force-dynamic'

const INTERNAL_ROLES = ['SUPER_ADMIN', 'DIREKTUR', 'MARKETING', 'KEUANGAN', 'PRODUKSI']

/** GET → InteractionDTO[] (semua direction, ascending by sentAt) */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser()
    if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

    const { id } = await ctx.params
    const opp = await db.opportunity.findFirst({
      where: { id, isDeleted: false },
      select: { id: true },
    })
    if (!opp) return NextResponse.json({ error: 'Opportunity tidak ditemukan' }, { status: 404 })

    // Hanya tim internal — role CLIENT memakai portal (thread diskusi portal, bukan thread CRM).
    if (!INTERNAL_ROLES.includes(session.role)) {
      return NextResponse.json(
        { error: 'Hanya tim internal yang dapat mengakses thread' },
        { status: 403 },
      )
    }

    // Brand access mengikuti rule route detail opportunity: tidak ada gate per-brand
    // utk role internal (SUPER_ADMIN/DIREKTUR otomatis lolos; role internal lain sama
    // seperti detail — konsisten dgn seluruh endpoint opportunity yang sudah ada).

    const interactions = await db.interaction.findMany({
      where: { opportunityId: id },
      include: interactionInclude,
      orderBy: { sentAt: 'asc' },
    })

    return NextResponse.json(interactions.map((i) => mapInteraction(i)))
  } catch (err) {
    console.error('[opportunities/thread] gagal memuat thread percakapan:', err)
    return NextResponse.json({ error: 'Gagal memuat thread percakapan' }, { status: 500 })
  }
}
