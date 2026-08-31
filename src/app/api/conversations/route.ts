/* ============ /api/conversations — daftar percakapan inbox (server-side group) ============ *
 * GET → ConversationListItemDTO[] — satu baris per opportunity yang punya ≥1 interaksi
 * dalam 60 hari terakhir. Preview/lastMessage dihitung server-side agar daftar chat akurat
 * (fix temuan R12: preview daftar kembali ke pesan IN setelah reload krn grouping client
 * IN-only). WON/LOST tetap disertakan agar riwayat chat lead selesai tetap terjangkau —
 * hanya ditandai unanswered=false. Read-only, TANPA logAudit (di-poll oleh chat view).   */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, fullNameOf } from '@/lib/crm-server'
import type { ConversationListItemDTO } from '@/lib/crm-types'

export const dynamic = 'force-dynamic'

const INTERNAL_ROLES = ['SUPER_ADMIN', 'DIREKTUR', 'MARKETING', 'KEUANGAN', 'PRODUKSI']
const DAY = 86400000
const round1 = (n: number) => Math.round(n * 10) / 10
const CLOSED_STAGES = new Set(['WON', 'LOST'])

/** Preview pesan: trim + potong 140 char + '…' bila terpotong. */
const preview = (body: string): string => {
  const raw = body.trim()
  return raw.length > 140 ? `${raw.slice(0, 140)}…` : raw
}

/** GET → ConversationListItemDTO[] (sorted lastSentAt desc) */
export async function GET() {
  try {
    const session = await getSessionUser()
    if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

    // Hanya tim internal — role CLIENT memakai portal (thread diskusi portal, bukan inbox CRM).
    if (!INTERNAL_ROLES.includes(session.role)) {
      return NextResponse.json(
        { error: 'Hanya tim internal yang dapat mengakses percakapan' },
        { status: 403 },
      )
    }

    // Brand access mengikuti rule route detail/thread opportunity: tanpa gate per-brand
    // utk role internal (konsisten dgn seluruh endpoint opportunity yang sudah ada).

    const now = new Date()
    const since = new Date(now.getTime() - 60 * DAY)

    // Semua opportunity non-deleted (WON/LOST ikut — riwayat chat tetap reachable);
    // interaksi hanya window 60 hari, asc by sentAt (elemen terakhir = terbaru).
    const opps = await db.opportunity.findMany({
      where: { isDeleted: false },
      select: {
        id: true, code: true, title: true, stage: true, createdAt: true,
        company: { select: { name: true } },
        sourceBrand: { select: { id: true, name: true, color: true, slaHours: true } },
        executingBrand: { select: { id: true, name: true, color: true, slaHours: true } },
        owner: { select: { name: true } },
        interactions: {
          where: { sentAt: { gte: since } },
          select: {
            direction: true, body: true, sentAt: true, channel: true,
            contact: { select: { firstName: true, lastName: true } },
          },
          orderBy: { sentAt: 'asc' },
        },
      },
    })

    const conversations: ConversationListItemDTO[] = []

    for (const o of opps) {
      const msgs = o.interactions
      if (msgs.length === 0) continue

      const last = msgs[msgs.length - 1]
      const brand = o.sourceBrand ?? o.executingBrand
      const slaHours = brand?.slaHours ?? 24

      // SLA respons (pola /api/dashboard): waitingSince = inbound terakhir ??
      // opportunity.createdAt; brand = sourceBrand ?? executingBrand (fallback 24 jam).
      let lastInAt: Date | null = null
      for (const m of msgs) if (m.direction === 'IN') lastInAt = m.sentAt
      const waitingSince = lastInAt ?? o.createdAt
      const waitingHours = (now.getTime() - waitingSince.getTime()) / 3600000
      const slaOverHours = waitingHours > slaHours ? round1(waitingHours - slaHours) : null

      conversations.push({
        opportunityId: o.id,
        opportunityCode: o.code,
        opportunityTitle: o.title,
        stage: o.stage,
        contactName: fullNameOf(last.contact?.firstName ?? '', last.contact?.lastName ?? '') || 'Kontak',
        companyName: o.company?.name ?? null,
        brandId: brand?.id ?? null,
        brandName: brand?.name ?? '—',
        brandColor: brand?.color ?? '#94a3b8',
        lastDirection: last.direction as ConversationListItemDTO['lastDirection'],
        lastBody: preview(last.body),
        lastSentAt: last.sentAt.toISOString(),
        lastChannel: last.channel,
        messageCount: msgs.length,
        unanswered: last.direction === 'IN' && !CLOSED_STAGES.has(o.stage),
        slaOverHours,
        slaHours,
        escalated: slaOverHours !== null && slaOverHours > slaHours,
        ownerName: o.owner?.name ?? null,
      })
    }

    conversations.sort((a, b) => b.lastSentAt.localeCompare(a.lastSentAt))
    return NextResponse.json(conversations)
  } catch (err) {
    console.error('[conversations] gagal memuat percakapan:', err)
    return NextResponse.json({ error: 'Gagal memuat percakapan' }, { status: 500 })
  }
}
