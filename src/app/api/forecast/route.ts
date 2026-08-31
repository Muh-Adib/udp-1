/* ============ /api/forecast — Proyeksi pipeline berbobot (R14) ============ *
 * GET → ForecastDTO. weight = blend 60% stage probability + 40% lead score
 * (computeLeadScore), di-clamp 0.05-0.95. Penjumlahan nilai hanya IDR
 * (kebijakan mata uang MVP — campuran menyesatkan); deal non-IDR dilaporkan
 * terpisah di excludedNonIdr. Read-only → tanpa logAudit (konsisten dashboard).
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/crm-server'
import { computeLeadScore } from '@/lib/lead-score'
import type { ForecastDTO, ForecastDealDTO, OpportunityDTO, Stage } from '@/lib/crm-types'

export const dynamic = 'force-dynamic'

const DAY = 86400000
const round1 = (n: number) => Math.round(n * 10) / 10
const TZ = 'Asia/Jakarta'

/** "2026-08" — kunci tahun-bulan kalender Asia/Jakarta untuk sebuah tanggal. */
function jakartaMonthKey(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit',
  }).format(d)
}

/** GET → ForecastDTO */
export async function GET() {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })
  if (session.role === 'CLIENT') {
    return NextResponse.json({ error: 'Hanya tim internal yang dapat mengakses proyeksi' }, { status: 403 })
  }

  const now = new Date()
  const since90 = new Date(now.getTime() - 90 * DAY)

  const [openOppRows, won90, lost90Count] = await Promise.all([
    // Semua opportunity open — bentuk select sama dgn briefing (cukup utk skor & bobot)
    db.opportunity.findMany({
      where: { isDeleted: false, stage: { notIn: ['WON', 'LOST'] } },
      select: {
        id: true, code: true, title: true, stage: true, estimatedValue: true, currency: true,
        probability: true, expectedCloseDate: true, stageUpdatedAt: true, createdAt: true, nextAction: true,
        company: { select: { name: true } },
        executingBrand: { select: { id: true, name: true, color: true } },
        owner: { select: { name: true } },
        tasks: { where: { status: { in: ['OPEN', 'IN_PROGRESS'] } }, select: { id: true } },
        interactions: { select: { direction: true, sentAt: true }, orderBy: { sentAt: 'desc' }, take: 10 },
        _count: { select: { interactions: true } },
      },
    }),
    // Baseline 90 hari — won (nilai hanya IDR, kebijakan mata uang MVP)
    db.opportunity.findMany({
      where: { isDeleted: false, stage: 'WON', wonAt: { gte: since90 } },
      select: { estimatedValue: true, currency: true },
    }),
    db.opportunity.count({ where: { isDeleted: false, stage: 'LOST', lostAt: { gte: since90 } } }),
  ])

  /* ---------- skor & bobot per deal ---------- */
  const deals = openOppRows.map((o) => {
    const result = computeLeadScore({
      stage: o.stage,
      interactionsCount: o._count.interactions,
      lastInteractionAt: o.interactions[0]?.sentAt ?? null,
      lastInboundAt: o.interactions.find((i) => i.direction === 'IN')?.sentAt ?? null,
      estimatedValue: o.estimatedValue,
      expectedCloseDate: o.expectedCloseDate,
      stageUpdatedAt: o.stageUpdatedAt,
      openTasksCount: o.tasks.length,
    } as unknown as OpportunityDTO, now)
    const score = result.score
    const weight = Math.round(Math.min(0.95, Math.max(0.05, (0.6 * o.probability + 0.4 * score) / 100)) * 1000) / 1000
    const weightedValue = o.estimatedValue * weight
    const expectedClose = o.expectedCloseDate ?? new Date(o.createdAt.getTime() + 45 * DAY)
    return { o, score, grade: result.grade, weight, weightedValue, expectedClose }
  })

  /* ---------- skenario (IDR saja) ---------- */
  const idrDeals = deals.filter((d) => d.o.currency === 'IDR')
  const scenarios: ForecastDTO['scenarios'] = {
    conservative: Math.round(idrDeals.reduce((s, d) => s + d.o.estimatedValue * Math.max(d.weight - 0.15, 0.05), 0)),
    realistic: Math.round(idrDeals.reduce((s, d) => s + d.weightedValue, 0)),
    optimistic: Math.round(idrDeals.reduce((s, d) => s + d.o.estimatedValue * Math.min(d.weight + 0.15, 1), 0)),
  }

  /* ---------- monthly: 6 bucket mulai bulan berjalan (Asia/Jakarta) ---------- */
  const [curY, curM] = jakartaMonthKey(now).split('-').map(Number)
  const monthMeta = new Map<string, { label: string; count: number; total: number; weighted: number }>()
  for (let i = 0; i < 6; i++) {
    const t = curY * 12 + (curM - 1) + i
    const y = Math.floor(t / 12)
    const m = (t % 12) + 1
    const key = `${y}-${String(m).padStart(2, '0')}`
    const monthLabel = new Intl.DateTimeFormat('id-ID', { month: 'short', timeZone: TZ })
      .format(new Date(Date.UTC(y, m - 1, 1)))
    monthMeta.set(key, { label: `${monthLabel} ${y}`, count: 0, total: 0, weighted: 0 })
  }
  for (const d of deals) {
    const key = jakartaMonthKey(d.expectedClose)
    const bucket = monthMeta.get(key)
    if (!bucket) continue // di luar window 6 bulan → tak tampil di monthly (tetap dihitung di skenario dll.)
    bucket.count += 1 // hitung SEMUA deal (termasuk non-IDR)
    if (d.o.currency === 'IDR') {
      bucket.total += d.o.estimatedValue
      bucket.weighted += d.weightedValue
    }
  }
  const monthly: ForecastDTO['monthly'] = [...monthMeta.entries()].map(([month, b]) => ({
    month,
    label: b.label,
    count: b.count,
    total: Math.round(b.total),
    weighted: Math.round(b.weighted),
  }))

  /* ---------- byBrand (IDR saja utk total/weighted; count semua deal) ---------- */
  const brandMap = new Map<string, { brandId: string; name: string; color: string; count: number; total: number; weighted: number }>()
  for (const d of deals) {
    const e = brandMap.get(d.o.executingBrand.id) ?? {
      brandId: d.o.executingBrand.id,
      name: d.o.executingBrand.name,
      color: d.o.executingBrand.color,
      count: 0, total: 0, weighted: 0,
    }
    e.count += 1
    if (d.o.currency === 'IDR') {
      e.total += d.o.estimatedValue
      e.weighted += d.weightedValue
    }
    brandMap.set(d.o.executingBrand.id, e)
  }
  const byBrand: ForecastDTO['byBrand'] = [...brandMap.values()]
    .map((b) => ({ ...b, total: Math.round(b.total), weighted: Math.round(b.weighted) }))
    .sort((a, b) => b.weighted - a.weighted)

  /* ---------- topDeals: semua deal open (termasuk non-IDR), weighted desc ---------- */
  const topDeals: ForecastDealDTO[] = [...deals]
    .sort((a, b) => b.weightedValue - a.weightedValue)
    .slice(0, 8)
    .map((d) => ({
      opportunityId: d.o.id,
      code: d.o.code,
      title: d.o.title,
      companyName: d.o.company.name,
      brandName: d.o.executingBrand.name,
      brandColor: d.o.executingBrand.color,
      ownerName: d.o.owner?.name ?? null,
      stage: d.o.stage as Stage,
      value: d.o.estimatedValue,
      currency: d.o.currency,
      weight: d.weight,
      weightedValue: Math.round(d.weightedValue),
      score: d.score,
      grade: d.grade,
      expectedClose: d.expectedClose.toISOString(),
    }))

  /* ---------- baseline 90 hari ---------- */
  const won90dCount = won90.length
  const won90dValue = Math.round(won90.filter((w) => w.currency === 'IDR').reduce((s, w) => s + w.estimatedValue, 0))
  const closed90 = won90dCount + lost90Count
  const baseline: ForecastDTO['baseline'] = {
    won90dCount,
    won90dValue,
    winRate: closed90 > 0 ? round1((won90dCount / closed90) * 100) : 0,
    avgDealSize: won90dCount > 0 ? Math.round(won90dValue / won90dCount) : 0,
  }

  /* ---------- non-IDR dilaporkan terpisah ---------- */
  const currMap = new Map<string, { currency: string; count: number; total: number }>()
  for (const d of deals) {
    if (d.o.currency === 'IDR') continue
    const e = currMap.get(d.o.currency) ?? { currency: d.o.currency, count: 0, total: 0 }
    e.count += 1
    e.total += d.o.estimatedValue
    currMap.set(d.o.currency, e)
  }

  const dto: ForecastDTO = {
    scenarios,
    monthly,
    byBrand,
    topDeals,
    baseline,
    excludedNonIdr: [...currMap.values()].map((e) => ({ ...e, total: Math.round(e.total) })),
    openDealsCount: openOppRows.length,
    generatedAt: now.toISOString(),
  }
  return NextResponse.json(dto)
}
