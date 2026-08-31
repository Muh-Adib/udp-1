/* ============ /api/notifications — aggregated in-app notification feed (R10+R12) ============ *
 * GET → NotificationsResponseDTO. Digabung dari 6 grup: SLA, APPROVAL, INVOICE_DUE,
 * TASK_DUE, QUOTATION_EXPIRY, PORTAL_COMMENT (komentar client belum dibalas +
 * keputusan penawaran ACC/Tolak dalam 48 jam terakhir). Di-poll sering oleh bell
 * di nav → sengaja TANPA logAudit.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, taskInclude } from '@/lib/crm-server'
import type {
  NotificationDTO, NotificationsResponseDTO, NotificationSeverity,
} from '@/lib/crm-types'

export const dynamic = 'force-dynamic'

const DAY = 86400000
const HOUR = 3600000
const round1 = (n: number) => Math.round(n * 10) / 10

/** Uang ringkas utk description notification: "Rp 70 jt" / "Rp 1,2 M" / "SGD 450" */
const CURRENCY_SYMBOL: Record<string, string> = { IDR: 'Rp', MYR: 'RM', SGD: 'S$', USD: '$' }
function formatMoneyShort(v: number, currency: string): string {
  const sym = CURRENCY_SYMBOL[currency] ?? currency
  if (Math.abs(v) >= 1e9) return `${sym} ${round1(v / 1e9)} M`
  if (Math.abs(v) >= 1e6) return `${sym} ${round1(v / 1e6)} jt`
  return `${sym} ${Math.round(v).toLocaleString('id-ID')}`
}

/** GET → NotificationsResponseDTO */
export async function GET() {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })
  // portal client tidak punya bell → feed kosong
  if (session.role === 'CLIENT') {
    const empty: NotificationsResponseDTO = { items: [], counts: { total: 0, critical: 0 } }
    return NextResponse.json(empty)
  }

  const now = new Date()
  const in7d = new Date(now.getTime() + 7 * DAY)
  const since48h = new Date(now.getTime() - 48 * HOUR)

  const [slaLeads, approvalQuos, dueInvoices, myTasks, expiringQuos, portalComments, decidedQuos] = await Promise.all([
    /* ---------- 1. SLA — lead NEW/CONTACT_ATTEMPTED menunggu balasan > SLA jam brand ---------- */
    db.opportunity.findMany({
      where: { isDeleted: false, stage: { in: ['NEW', 'CONTACT_ATTEMPTED'] } },
      select: {
        id: true, code: true, title: true, createdAt: true,
        company: { select: { name: true } },
        sourceBrand: { select: { name: true, slaHours: true } },
        executingBrand: { select: { name: true, slaHours: true } },
        // beberapa interaksi terakhir (desc) → find pertama direction IN = inbound terbaru
        interactions: { select: { direction: true, sentAt: true }, orderBy: { sentAt: 'desc' }, take: 10 },
      },
    }),
    /* ---------- 2. APPROVAL — quotation SENT berdiskon belum disetujui Direktur ---------- */
    db.quotation.findMany({
      where: { status: 'SENT', discountPct: { gt: 0 }, discountApprovedById: null },
      orderBy: { updatedAt: 'asc' },
      take: 5,
      select: {
        id: true, code: true, title: true, discountPct: true,
        updatedAt: true, opportunityId: true,
        company: { select: { name: true } },
      },
    }),
    /* ---------- 3. INVOICE_DUE — outstanding (sisa > 0) dengan dueDate ---------- */
    db.invoice.findMany({
      where: { status: { in: ['UNPAID', 'PARTIAL'] } },
      select: {
        id: true, code: true, title: true, total: true, paidAmount: true, currency: true,
        dueDate: true, issuedAt: true, opportunityId: true,
        company: { select: { name: true } },
      },
    }),
    /* ---------- 4. TASK_DUE — task open milik saya yang berdueDate ---------- */
    db.task.findMany({
      where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, assigneeId: session.id, dueDate: { not: null } },
      include: taskInclude,
      orderBy: { dueDate: 'asc' },
      take: 20,
    }),
    /* ---------- 5. QUOTATION_EXPIRY — quotation SENT berakhir ≤ 7 hari ---------- */
    db.quotation.findMany({
      where: { status: 'SENT', validUntil: { gte: now, lte: in7d } },
      orderBy: { validUntil: 'asc' },
      take: 5,
      select: {
        id: true, code: true, title: true, total: true, currency: true,
        validUntil: true, opportunityId: true,
        company: { select: { name: true } },
      },
    }),
    /* ---------- 6. PORTAL_COMMENT — semua komentar portal 48 jam terakhir (asc) ---------- */
    // Tanpa filter userRole: balasan staff SETELAH komentar client pasti juga berada
    // dalam window 48 jam → aturan "sudah dibalas staff" bisa dicek in-memory dgn 1 query.
    db.portalComment.findMany({
      where: { createdAt: { gte: since48h } },
      orderBy: { createdAt: 'asc' as const },
    }),
    /* ---------- 7. Keputusan client — quotation ACC/Tolak dalam 48 jam terakhir ---------- */
    db.quotation.findMany({
      where: { decidedAt: { gte: since48h }, status: { in: ['ACCEPTED', 'REJECTED'] } },
      orderBy: { decidedAt: 'asc' },
      select: {
        id: true, code: true, title: true, status: true, total: true, currency: true,
        decidedAt: true, opportunityId: true,
        company: { select: { name: true } },
      },
    }),
  ])

  const items: NotificationDTO[] = []

  /* ---------- grup 1: SLA breaches (critical → inbox) ---------- */
  // waitingSince = inbound terakhir ?? opportunity.createdAt; brand = sourceBrand ?? executingBrand;
  // slaHours fallback 24 jam — pola identik dengan route dashboard.
  items.push(
    ...slaLeads
      .map((o) => {
        const brand = o.sourceBrand ?? o.executingBrand
        const slaHours = brand?.slaHours ?? 24
        const lastInbound = o.interactions.find((i) => i.direction === 'IN')?.sentAt ?? o.createdAt
        const waitingHours = (now.getTime() - lastInbound.getTime()) / HOUR
        return { o, slaHours, lastInbound, waitingHours }
      })
      .filter((b) => b.waitingHours > b.slaHours)
      .sort((a, b) => b.waitingHours - a.waitingHours)
      .slice(0, 5)
      .map((b): NotificationDTO => ({
        key: `sla:${b.o.id}`,
        type: 'SLA',
        severity: 'critical',
        title: `SLA respons terlewati — ${b.o.code}`,
        description: `${b.o.company.name} — ${b.o.title}`,
        metric: `${round1(b.waitingHours)} jam / SLA ${b.slaHours} jam`,
        opportunityId: b.o.id,
        targetView: 'inbox',
        createdAt: b.lastInbound.toISOString(),
      })),
  )

  /* ---------- grup 2: approval diskon (warning → quotations) ---------- */
  // Semua role internal ikut melihat (marketing perlu tahu status persetujuan juga)
  items.push(
    ...approvalQuos.map((q): NotificationDTO => ({
      key: `approval:${q.id}`,
      type: 'APPROVAL',
      severity: 'warning',
      title: `Diskon menunggu persetujuan — ${q.code}`,
      description: `${q.company.name} — ${q.title} · diskon ${q.discountPct}%`,
      metric: `Diskon ${q.discountPct}%`,
      opportunityId: q.opportunityId,
      targetView: 'quotations',
      createdAt: q.updatedAt.toISOString(),
    })),
  )

  /* ---------- grup 3: invoice jatuh tempo (critical/warning → finance) ---------- */
  items.push(
    ...dueInvoices
      .filter((inv) => inv.dueDate && inv.total - inv.paidAmount > 0)
      .map((inv) => {
        const remaining = inv.total - inv.paidAmount
        const daysUntilDue = Math.ceil((inv.dueDate!.getTime() - now.getTime()) / DAY)
        return { inv, remaining, daysUntilDue }
      })
      .filter(({ daysUntilDue }) => daysUntilDue < 0 || daysUntilDue <= 3)
      .sort((a, b) => a.daysUntilDue - b.daysUntilDue)
      .slice(0, 5)
      .map(({ inv, remaining, daysUntilDue }): NotificationDTO => {
        const overdue = daysUntilDue < 0
        const absDays = Math.abs(daysUntilDue)
        return {
          key: `invoice:${inv.id}`,
          type: 'INVOICE_DUE',
          severity: overdue ? 'critical' : 'warning',
          title: overdue
            ? `Invoice lewat jatuh tempo — ${inv.code}`
            : `Invoice segera jatuh tempo — ${inv.code}`,
          description: `${inv.company.name} — ${inv.title} · sisa ${formatMoneyShort(remaining, inv.currency)}`,
          metric: overdue
            ? `Terlambat ${absDays} hari`
            : `Jatuh tempo ${daysUntilDue === 0 ? 'hari ini' : `${daysUntilDue} hari lagi`}`,
          opportunityId: inv.opportunityId,
          targetView: 'finance',
          createdAt: inv.issuedAt.toISOString(),
        }
      }),
  )

  /* ---------- grup 4: task saya overdue / ≤48 jam (warning/info → followup) ---------- */
  items.push(
    ...myTasks
      .filter((t) => t.dueDate)
      .map((t) => ({ t, hoursUntil: (t.dueDate!.getTime() - now.getTime()) / HOUR }))
      .filter(({ hoursUntil }) => hoursUntil < 0 || hoursUntil <= 48)
      .sort((a, b) => a.hoursUntil - b.hoursUntil)
      .slice(0, 5)
      .map(({ t, hoursUntil }): NotificationDTO => {
        const overdue = hoursUntil < 0
        const absHours = Math.abs(hoursUntil)
        const companyName = t.opportunity?.company?.name ?? null
        const oppTitle = t.opportunity?.title ?? null
        return {
          key: `task:${t.id}`,
          type: 'TASK_DUE',
          severity: overdue ? 'warning' : 'info',
          title: overdue ? `Task terlambat — ${t.title}` : `Task jatuh tempo — ${t.title}`,
          description: companyName
            ? `${companyName} — ${oppTitle ?? 'Tanpa opportunity'}`
            : oppTitle ?? 'Tanpa opportunity',
          metric: overdue
            ? absHours < 48 ? `${Math.round(absHours)} jam` : `${Math.round(absHours / 24)} hari`
            : hoursUntil < 12 ? 'hari ini' : `${Math.ceil(hoursUntil)} jam lagi`,
          opportunityId: t.opportunityId,
          targetView: 'followup',
          createdAt: t.dueDate!.toISOString(),
        }
      }),
  )

  /* ---------- grup 5: quotation mendekati kedaluwarsa (info → quotations) ---------- */
  items.push(
    ...expiringQuos.map((q): NotificationDTO => {
      const days = Math.ceil((q.validUntil!.getTime() - now.getTime()) / DAY)
      return {
        key: `quoexpiry:${q.id}`,
        type: 'QUOTATION_EXPIRY',
        severity: 'info',
        title: `Penawaran mendekati kedaluwarsa — ${q.code}`,
        description: `${q.company.name} — ${q.title} · ${formatMoneyShort(q.total, q.currency)}`,
        metric: days === 0 ? 'berakhir hari ini' : `${days} hari lagi`,
        opportunityId: q.opportunityId,
        targetView: 'quotations',
        createdAt: q.validUntil!.toISOString(),
      }
    }),
  )

  /* ---------- grup 6: PORTAL_COMMENT — komentar client belum dibalas (R12, warning → quotations) ---------- */
  // Ambil komentar client TERBARU per entityId (query asc → set terakhir per key = terbaru),
  // lalu buang yg sudah dibalas staff (ada komentar userRole != 'CLIENT' SETELAH komentar tsb).
  const latestClientByEntity = new Map<string, (typeof portalComments)[number]>()
  for (const c of portalComments) {
    if (c.userRole === 'CLIENT') latestClientByEntity.set(c.entityId, c)
  }
  const unansweredComments = [...latestClientByEntity.values()].filter(
    (c) => !portalComments.some((r) => r.userRole !== 'CLIENT' && r.entityId === c.entityId && r.createdAt > c.createdAt),
  )
  // Muat quotation utk entityId yang lolos — entity tanpa quotation (mis. invoice/project
  // atau quotation yg sudah terhapus) dilewati.
  const commentQuos = unansweredComments.length
    ? await db.quotation.findMany({
        where: { id: { in: unansweredComments.map((c) => c.entityId) } },
        select: { id: true, code: true, title: true, opportunityId: true },
      })
    : []
  const commentQuoById = new Map(commentQuos.map((q) => [q.id, q]))
  items.push(
    ...unansweredComments
      .map((c) => ({ c, quo: commentQuoById.get(c.entityId) }))
      .filter((row) => Boolean(row.quo))
      .map(({ c, quo }): NotificationDTO => {
        const q = quo! // sudah difilter di atas
        const snippet = c.body.replace(/\s+/g, ' ').trim() // strip newline → spasi
        return {
          key: `PORTAL_COMMENT:${c.id}`,
          type: 'PORTAL_COMMENT',
          severity: 'warning',
          title: 'Komentar baru dari client',
          description: `${c.userName} mengomentari ${q.code} — ${q.title}`,
          metric: snippet.length > 60 ? `${snippet.slice(0, 60)}…` : snippet,
          opportunityId: q.opportunityId,
          targetView: 'quotations',
          createdAt: c.createdAt.toISOString(),
        }
      }),
  )

  /* ---------- grup 6b: PORTAL_COMMENT — keputusan client 48 jam terakhir (info ACC / critical Tolak) ---------- */
  items.push(
    ...decidedQuos.map((q): NotificationDTO => ({
      key: `PORTAL_DECISION:${q.id}`,
      type: 'PORTAL_COMMENT',
      severity: q.status === 'ACCEPTED' ? 'info' : 'critical',
      title: q.status === 'ACCEPTED' ? 'Client menyetujui penawaran' : 'Client menolak penawaran',
      description: `${q.company.name} memutuskan ${q.code} — ${q.title}`,
      metric: formatMoneyShort(q.total, q.currency),
      opportunityId: q.opportunityId,
      targetView: 'quotations',
      createdAt: q.decidedAt!.toISOString(),
    })),
  )

  /* ---------- sort: severity critical→warning→info, lalu createdAt desc ---------- */
  const sevRank: Record<NotificationSeverity, number> = { critical: 0, warning: 1, info: 2 }
  items.sort((a, b) => {
    const bySev = sevRank[a.severity] - sevRank[b.severity]
    if (bySev !== 0) return bySev
    return b.createdAt.localeCompare(a.createdAt)
  })

  const data: NotificationsResponseDTO = {
    items,
    counts: { total: items.length, critical: items.filter((i) => i.severity === 'critical').length },
  }
  return NextResponse.json(data)
}
