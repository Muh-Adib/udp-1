/* ============ /api/analytics/conversations — analitik percakapan omnichannel (R11) ============ *
 * GET → ConversationAnalyticsDTO. Role internal saja (CLIENT → 403).
 * Jendela analisis: 90 hari terakhir (interaksi sentAt >= now-90d).
 * Endpoint di-poll → sengaja TANPA logAudit (mengikuti pola /api/notifications).
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/crm-server'
import type { ConversationAnalyticsDTO } from '@/lib/crm-types'

export const dynamic = 'force-dynamic'

const DAY = 86400000
const HOUR = 3600000
const round1 = (n: number) => Math.round(n * 10) / 10

const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

/** Senin 00:00:00.000 lokal dari sebuah tanggal */
function mondayStart(d: Date): Date {
  const m = new Date(d)
  m.setHours(0, 0, 0, 0)
  const day = m.getDay() // 0=Minggu..6=Sabtu
  const diff = day === 0 ? 6 : day - 1
  m.setDate(m.getDate() - diff)
  return m
}

/** Label "DD MMM" gaya Indonesia tanpa library */
function labelDdMmm(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS_ID[d.getMonth()]}`
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

interface OppStat {
  oppId: string
  brandId: string | null // sourceBrandId ?? executingBrandId
  slaHours: number
  firstResponseHours: number | null
  slaMet: boolean
  unanswered: boolean
}

/** GET → ConversationAnalyticsDTO */
export async function GET() {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })
  if (session.role === 'CLIENT') {
    return NextResponse.json(
      { error: 'Hanya tim internal yang dapat mengakses analitik' },
      { status: 403 },
    )
  }

  try {
    const now = new Date()
    const since90 = new Date(now.getTime() - 90 * DAY)

    const [interactions, opportunities, brands] = await Promise.all([
      db.interaction.findMany({
        where: { sentAt: { gte: since90 } },
        select: {
          id: true,
          opportunityId: true,
          brandId: true,
          channel: true,
          direction: true,
          sentAt: true,
          respondedById: true,
          responder: { select: { name: true, avatarColor: true } },
        },
      }),
      db.opportunity.findMany({
        where: { isDeleted: false },
        select: {
          id: true,
          stage: true,
          createdAt: true,
          sourceBrandId: true,
          executingBrandId: true,
          sourceBrand: { select: { id: true, name: true, color: true, slaHours: true } },
          executingBrand: { select: { id: true, name: true, color: true, slaHours: true } },
        },
      }),
      db.brand.findMany({ select: { id: true, name: true, color: true, slaHours: true } }),
    ])

    const brandMap = new Map(brands.map((b) => [b.id, b]))
    const oppMap = new Map(opportunities.map((o) => [o.id, o]))

    /* ---------- Group interaksi per opportunity (sorted sentAt asc) ---------- */
    const byOpp = new Map<string, typeof interactions>()
    for (const it of interactions) {
      if (!it.opportunityId) continue
      const arr = byOpp.get(it.opportunityId)
      if (arr) arr.push(it)
      else byOpp.set(it.opportunityId, [it])
    }
    for (const arr of byOpp.values()) arr.sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime())

    /* ---------- Statistik per opportunity ---------- */
    const oppStats: OppStat[] = []
    for (const [oppId, list] of byOpp) {
      const opp = oppMap.get(oppId)
      if (!opp) continue // opportunity terhapus — tidak masuk statistik percakapan

      const firstIn = list.find((it) => it.direction === 'IN')
      let firstResponseHours: number | null = null
      if (firstIn) {
        const firstOutAfter = list.find(
          (it) => it.direction === 'OUT' && it.sentAt.getTime() > firstIn.sentAt.getTime(),
        )
        if (firstOutAfter) {
          const hours = (firstOutAfter.sentAt.getTime() - firstIn.sentAt.getTime()) / HOUR
          if (hours >= 0) firstResponseHours = round1(hours)
        }
      }

      const brand = opp.sourceBrand ?? opp.executingBrand
      const slaHours = brand?.slaHours ?? 24
      const slaMet = firstResponseHours != null && firstResponseHours <= slaHours

      const lastInteraction = list[list.length - 1]
      const unanswered =
        lastInteraction.direction === 'IN' && opp.stage !== 'WON' && opp.stage !== 'LOST'

      oppStats.push({
        oppId,
        brandId: opp.sourceBrandId ?? opp.executingBrandId,
        slaHours,
        firstResponseHours,
        slaMet,
        unanswered,
      })
    }

    /* ---------- KPI ---------- */
    const firstResponses = oppStats
      .map((s) => s.firstResponseHours)
      .filter((h): h is number => h != null)
    const totalFirstResponses = firstResponses.length
    const avgFirstResponseHours =
      totalFirstResponses > 0
        ? round1(firstResponses.reduce((s, h) => s + h, 0) / totalFirstResponses)
        : null
    const medianFirstResponseHours = (() => {
      const m = median(firstResponses)
      return m == null ? null : round1(m)
    })()
    // slaMet hanya true bila firstResponseHours != null → count = opps ter-met
    const slaMetCount = oppStats.filter((s) => s.slaMet).length
    const slaCompliancePct =
      totalFirstResponses > 0 ? Math.round((slaMetCount / totalFirstResponses) * 100) : null

    /* ---------- Per brand ---------- */
    interface BrandBucket {
      brandId: string
      oppStats: OppStat[]
    }
    const brandBuckets = new Map<string, BrandBucket>()
    for (const stat of oppStats) {
      if (!stat.brandId) continue
      const bucket = brandBuckets.get(stat.brandId)
      if (bucket) bucket.oppStats.push(stat)
      else brandBuckets.set(stat.brandId, { brandId: stat.brandId, oppStats: [stat] })
    }
    const interactionsCountByBrand = new Map<string, number>()
    for (const it of interactions) {
      interactionsCountByBrand.set(it.brandId, (interactionsCountByBrand.get(it.brandId) ?? 0) + 1)
    }

    const perBrand: ConversationAnalyticsDTO['perBrand'] = []
    for (const { brandId, oppStats: stats } of brandBuckets.values()) {
      const hours = stats.map((s) => s.firstResponseHours).filter((h): h is number => h != null)
      const metCount = stats.filter((s) => s.slaMet).length
      const brand = brandMap.get(brandId)
      perBrand.push({
        brandId,
        brandName: brand?.name ?? brandId,
        brandColor: brand?.color ?? '#94a3b8',
        firstResponseHours:
          hours.length > 0 ? round1(hours.reduce((s, h) => s + h, 0) / hours.length) : null,
        slaPct: hours.length > 0 ? Math.round((metCount / hours.length) * 100) : null,
        interactions: interactionsCountByBrand.get(brandId) ?? 0,
      })
    }
    perBrand.sort((a, b) => b.interactions - a.interactions)

    /* ---------- Per marketer (responder OUT) ---------- */
    interface MarketerAcc {
      userId: string
      userName: string
      avatarColor: string | null
      replies: number
      hoursSum: number
      hoursCount: number
    }
    const marketerAcc = new Map<string, MarketerAcc>()
    for (const it of interactions) {
      if (it.direction !== 'OUT' || !it.respondedById) continue
      let acc = marketerAcc.get(it.respondedById)
      if (!acc) {
        acc = {
          userId: it.respondedById,
          userName: it.responder?.name ?? 'Tidak diketahui',
          avatarColor: it.responder?.avatarColor ?? null,
          replies: 0,
          hoursSum: 0,
          hoursCount: 0,
        }
        marketerAcc.set(it.respondedById, acc)
      }
      acc.replies++

      // dasar respons: IN terakhir pada opportunity yang sama sebelum OUT ini
      if (it.opportunityId) {
        const list = byOpp.get(it.opportunityId)
        if (list) {
          let priorIn: (typeof interactions)[number] | null = null
          for (const cand of list) {
            if (cand.sentAt.getTime() >= it.sentAt.getTime()) break
            if (cand.direction === 'IN') priorIn = cand
          }
          if (priorIn) {
            const hours = (it.sentAt.getTime() - priorIn.sentAt.getTime()) / HOUR
            if (hours >= 0) {
              acc.hoursSum += hours
              acc.hoursCount++
            }
          }
        }
      }
    }
    const perMarketer: ConversationAnalyticsDTO['perMarketer'] = [...marketerAcc.values()]
      .map((acc) => ({
        userId: acc.userId,
        userName: acc.userName,
        avatarColor: acc.avatarColor,
        replies: acc.replies,
        avgResponseHours:
          acc.hoursCount > 0 ? round1(acc.hoursSum / acc.hoursCount) : null,
      }))
      .sort((a, b) => b.replies - a.replies)
      .slice(0, 8)

    /* ---------- Channel mix (semua interaksi 90 hari) ---------- */
    const channelCount = new Map<string, number>()
    for (const it of interactions) {
      channelCount.set(it.channel, (channelCount.get(it.channel) ?? 0) + 1)
    }
    const channelMix = [...channelCount.entries()]
      .map(([channel, count]) => ({ channel, count }))
      .sort((a, b) => b.count - a.count || a.channel.localeCompare(b.channel))

    /* ---------- 8 minggu terakhir (Senin 00:00 lokal) ---------- */
    const thisWeek = mondayStart(now)
    const weekStarts: { start: Date; end: Date }[] = []
    for (let i = 7; i >= 0; i--) {
      const start = new Date(thisWeek.getTime() - i * 7 * DAY)
      weekStarts.push({ start, end: new Date(start.getTime() + 7 * DAY) })
    }
    const weekly = weekStarts.map(({ start, end }) => {
      let inbound = 0
      let outbound = 0
      for (const it of interactions) {
        const t = it.sentAt.getTime()
        if (t >= start.getTime() && t < end.getTime()) {
          if (it.direction === 'IN') inbound++
          else outbound++
        }
      }
      return { weekStart: start.toISOString(), label: labelDdMmm(start), inbound, outbound }
    })

    const data: ConversationAnalyticsDTO = {
      generatedAt: now.toISOString(),
      kpi: {
        totalConversations: oppStats.length,
        avgFirstResponseHours,
        medianFirstResponseHours,
        slaCompliancePct,
        unansweredNow: oppStats.filter((s) => s.unanswered).length,
      },
      perBrand,
      perMarketer,
      channelMix,
      weekly,
    }
    return NextResponse.json(data)
  } catch (err) {
    console.error('[analytics/conversations] gagal memuat analitik percakapan:', err)
    return NextResponse.json({ error: 'Gagal memuat analitik percakapan' }, { status: 500 })
  }
}
