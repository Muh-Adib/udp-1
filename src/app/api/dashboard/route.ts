/* ============ /api/dashboard — aggregated KPIs & breakdowns ============ */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  getSessionUser, mapTask, mapInteraction, interactionInclude, taskInclude,
} from '@/lib/crm-server'
import { STAGES, PROJECT_STATUSES } from '@/lib/crm-constants'
import type { DashboardDTO, Stage } from '@/lib/crm-types'

export const dynamic = 'force-dynamic'

const DAY = 86400000
const round1 = (n: number) => Math.round(n * 10) / 10

/** GET → DashboardDTO */
export async function GET() {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const now = new Date()
  const since90 = new Date(now.getTime() - 90 * DAY)
  const since60 = new Date(now.getTime() - 60 * DAY)
  const since30 = new Date(now.getTime() - 30 * DAY)
  const since7 = new Date(now.getTime() - 7 * DAY)

  const [opps, interactions, openTasks, projects, marketingUsers, slaLeads] = await Promise.all([
    db.opportunity.findMany({
      where: { isDeleted: false },
      select: {
        id: true, code: true, title: true, stage: true, channel: true,
        estimatedValue: true, currency: true, probability: true,
        expectedCloseDate: true, createdAt: true, wonAt: true, lostReason: true,
        ownerId: true, companyId: true, executingBrandId: true,
        company: { select: { id: true, name: true, country: true } },
        executingBrand: { select: { id: true, name: true, color: true } },
      },
    }),
    db.interaction.findMany({
      where: { sentAt: { gte: since90 } },
      include: interactionInclude,
      orderBy: { sentAt: 'desc' },
    }),
    db.task.findMany({
      where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
      include: taskInclude,
      orderBy: { dueDate: 'asc' },
    }),
    db.project.findMany({ select: { id: true, status: true } }),
    db.user.findMany({
      where: { role: 'MARKETING', isActive: true },
      select: { id: true, name: true, avatarColor: true },
    }),
    // lead yang belum terlayani (NEW/CONTACT_ATTEMPTED) — basis komputasi SLA respons
    db.opportunity.findMany({
      where: { isDeleted: false, stage: { in: ['NEW', 'CONTACT_ATTEMPTED'] } },
      select: {
        id: true, code: true, title: true, createdAt: true, ownerId: true,
        company: { select: { name: true } },
        sourceBrand: { select: { name: true, color: true, slaHours: true } },
        executingBrand: { select: { name: true, color: true, slaHours: true } },
        owner: { select: { name: true } },
        interactions: { select: { direction: true, sentAt: true }, orderBy: { sentAt: 'desc' } },
      },
    }),
  ])

  /* ---------- helpers ---------- */
  const isOpen = (stage: string) => stage !== 'WON' && stage !== 'LOST'
  const openOpps = opps.filter((o) => isOpen(o.stage))
  // NOTE: currency policy (MVP) — global KPI value sums use IDR opps only, because
  // aggregating mixed currencies would be misleading. Breakdown `value` fields
  // (funnel/brand/company) sum raw values as-is.
  const idrOpen = openOpps.filter((o) => o.currency === 'IDR')
  const sum = (arr: { estimatedValue: number }[]) => arr.reduce((s, o) => s + o.estimatedValue, 0)

  // group IN interactions per opportunity (asc) for response-time matching
  const inByOpp = new Map<string, Date[]>()
  for (const i of interactions) {
    if (i.direction !== 'IN' || !i.opportunityId) continue
    const list = inByOpp.get(i.opportunityId) ?? []
    list.push(i.sentAt)
    inByOpp.set(i.opportunityId, list)
  }
  for (const list of inByOpp.values()) list.sort((a, b) => a.getTime() - b.getTime())

  // OUT interactions in the last 60 days that have a respondedAt
  const outs60 = interactions.filter(
    (i) => i.direction === 'OUT' && i.respondedAt && i.sentAt >= since60,
  )
  const matchHours = (outs: typeof outs60): number[] => {
    const hours: number[] = []
    for (const o of outs) {
      const respondedAt = o.respondedAt
      if (!respondedAt || !o.opportunityId) continue
      const ins = inByOpp.get(o.opportunityId)
      if (!ins || ins.length === 0) continue
      let prev: Date | null = null
      for (const d of ins) {
        if (d.getTime() <= respondedAt.getTime()) prev = d
        else break
      }
      if (prev) hours.push((respondedAt.getTime() - prev.getTime()) / 3600000)
    }
    return hours
  }
  const avg = (arr: number[]) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0)

  /* ---------- KPIs ---------- */
  const wonOpps = opps.filter((o) => o.stage === 'WON')
  const lostOpps = opps.filter((o) => o.stage === 'LOST')

  // unread inbound: IN (last 30d) in an open opportunity with no OUT after it, unique per opportunity
  const unreadOppIds = new Set<string>()
  for (const i of interactions) {
    if (i.direction !== 'IN' || !i.opportunityId) continue
    if (i.sentAt < since30) continue
    const opp = opps.find((o) => o.id === i.opportunityId)
    if (!opp || !isOpen(opp.stage)) continue
    const hasReply = interactions.some(
      (o) => o.direction === 'OUT' && o.opportunityId === i.opportunityId && o.sentAt.getTime() > i.sentAt.getTime(),
    )
    if (!hasReply) unreadOppIds.add(i.opportunityId)
  }

  const forecast = (days: number) =>
    idrOpen
      .filter((o) => o.expectedCloseDate && o.expectedCloseDate.getTime() <= now.getTime() + days * DAY)
      .reduce((s, o) => s + (o.estimatedValue * o.probability) / 100, 0)

  const kpis: DashboardDTO['kpis'] = {
    totalOpenLeads: openOpps.length,
    newThisWeek: opps.filter((o) => o.createdAt >= since7).length,
    unreadInbound: unreadOppIds.size,
    pipelineValue: sum(idrOpen),
    weightedPipeline: idrOpen.reduce((s, o) => s + (o.estimatedValue * o.probability) / 100, 0),
    winRate: wonOpps.length + lostOpps.length > 0
      ? round1((wonOpps.length / (wonOpps.length + lostOpps.length)) * 100)
      : 0,
    avgResponseHours: round1(avg(matchHours(outs60))),
    avgSalesCycleDays: round1(
      avg(
        wonOpps
          .filter((o) => o.wonAt)
          .map((o) => (o.wonAt!.getTime() - o.createdAt.getTime()) / DAY),
      ),
    ),
    forecast30: forecast(30),
    forecast60: forecast(60),
    forecast90: forecast(90),
    overdueTasks: openTasks.filter((t) => t.dueDate && t.dueDate < now).length,
    activeProjects: projects.filter((p) => p.status !== 'COMPLETED').length,
  }

  /* ---------- breakdowns ---------- */
  const groupCount = <T extends string>(items: T[]) => {
    const m = new Map<T, number>()
    for (const it of items) m.set(it, (m.get(it) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }

  const brandMap = new Map<string, { brandId: string; name: string; color: string; count: number; value: number }>()
  for (const o of opps) {
    const e = brandMap.get(o.executingBrandId) ?? {
      brandId: o.executingBrandId, name: o.executingBrand.name, color: o.executingBrand.color, count: 0, value: 0,
    }
    e.count += 1
    e.value += o.estimatedValue
    brandMap.set(o.executingBrandId, e)
  }

  const companyMap = new Map<string, { companyId: string; name: string; country: string; openOpps: number; totalValue: number }>()
  for (const o of openOpps) {
    const e = companyMap.get(o.companyId) ?? {
      companyId: o.companyId, name: o.company.name, country: o.company.country, openOpps: 0, totalValue: 0,
    }
    e.openOpps += 1
    e.totalValue += o.estimatedValue
    companyMap.set(o.companyId, e)
  }

  const marketingPerf: DashboardDTO['marketingPerf'] = marketingUsers.map((u) => {
    const owned = opps.filter((o) => o.ownerId === u.id)
    return {
      userId: u.id,
      name: u.name,
      color: u.avatarColor,
      open: owned.filter((o) => isOpen(o.stage)).length,
      won: owned.filter((o) => o.stage === 'WON').length,
      lost: owned.filter((o) => o.stage === 'LOST').length,
      avgResponseHours: round1(avg(matchHours(outs60.filter((o) => o.respondedById === u.id)))),
    }
  })

  const projectsStatus = PROJECT_STATUSES.map((s) => ({
    status: s.key,
    count: projects.filter((p) => p.status === s.key).length,
  }))

  const upcomingSorted = [...openTasks].sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return 0
    if (!a.dueDate) return 1
    if (!b.dueDate) return -1
    return a.dueDate.getTime() - b.dueDate.getTime()
  })

  /* ---------- SLA breaches — lead NEW/CONTACT_ATTEMPTED menunggu > slaHours brand ---------- */
  // waitingSince = inbound terakhir (interactions sudah orderBy desc → find pertama = terbaru);
  // tanpa inbound → fallback opportunity.createdAt. Breach bila waitingHours > slaHours brand
  // (sourceBrand ?? executingBrand, fallback 24 jam bila brand tak tersedia).
  const slaBreaches: DashboardDTO['slaBreaches'] = slaLeads
    .map((o) => {
      const brand = o.sourceBrand ?? o.executingBrand
      const slaHours = brand?.slaHours ?? 24
      const lastInbound = o.interactions.find((i) => i.direction === 'IN')?.sentAt ?? o.createdAt
      const waitingHours = (now.getTime() - lastInbound.getTime()) / 3600000
      return { o, brand, slaHours, lastInbound, waitingHours }
    })
    .filter((b) => b.waitingHours > b.slaHours)
    .sort((a, b) => b.waitingHours - a.waitingHours)
    .slice(0, 5)
    .map((b) => ({
      opportunityId: b.o.id,
      code: b.o.code,
      title: b.o.title,
      companyName: b.o.company.name,
      brandName: b.brand?.name ?? '—',
      brandColor: b.brand?.color ?? '#94a3b8',
      ownerName: b.o.owner?.name ?? null,
      ownerId: b.o.ownerId,
      slaHours: b.slaHours,
      waitingHours: round1(b.waitingHours),
      waitingSince: b.lastInbound.toISOString(),
    }))

  const dashboard: DashboardDTO = {
    kpis,
    leadsByBrand: [...brandMap.values()].sort((a, b) => b.count - a.count),
    leadsByChannel: groupCount(opps.map((o) => o.channel)).map(([channel, count]) => ({ channel, count })),
    leadsByCountry: groupCount(opps.map((o) => o.company.country)).map(([country, count]) => ({ country, count })),
    funnel: STAGES.map((s) => {
      const inStage = opps.filter((o) => o.stage === s.key)
      return { stage: s.key as Stage, count: inStage.length, value: sum(inStage) }
    }),
    lostReasons: groupCount(lostOpps.map((o) => o.lostReason).filter((r): r is string => !!r))
      .map(([reason, count]) => ({ reason, count })),
    wonLost: { won: wonOpps.length, lost: lostOpps.length },
    marketingPerf,
    upcomingTasks: upcomingSorted.slice(0, 8).map(mapTask),
    recentInteractions: interactions.slice(0, 8).map((i) => mapInteraction(i)),
    topCompanies: [...companyMap.values()]
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 5),
    projectsStatus,
    slaBreaches,
  }

  return NextResponse.json(dashboard)
}
