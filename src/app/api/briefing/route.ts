/* ============ /api/briefing — Briefing Pagi AI digest (R14) ============ *
 * POST → BriefingDTO (body { refresh?: boolean }).
 * Server menghitung SEMUA angka secara deterministik (SLA, hot leads, task,
 * quotation, invoice); LLM HANYA menulis narasi (headline, priorities, risks,
 * focus). Cache server 10 menit di globalThis; refresh:true bypass.
 * Greeting disusun server-side (cache-safe) per jam Asia/Jakarta.
 * Backend only: memakai z-ai-web-dev-sdk — pola sama dgn ai-summary route.
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/crm-server'
import { computeLeadScore } from '@/lib/lead-score'
import { logAudit } from '@/lib/audit'
import type { BriefingDTO, BriefingStatDTO, OpportunityDTO } from '@/lib/crm-types'
import ZAI from 'z-ai-web-dev-sdk'

export const dynamic = 'force-dynamic'

const DAY = 86400000
const HOUR = 3600000
const round1 = (n: number) => Math.round(n * 10) / 10
const PAYLOAD_LIMIT = 6000
const CACHE_TTL = 10 * 60 * 1000 // 10 menit

/* ---------------- Cache 10 menit (globalThis — aman antar request dev) ---------------- */
type BriefingCachePayload = Omit<BriefingDTO, 'greeting' | 'cached' | 'generatedAt'>
const g = globalThis as unknown as { __crmBriefingCache?: { at: number; payload: BriefingCachePayload } }

/* ---------------- Greeting per jam Asia/Jakarta (pagi 4-10, siang 10-15, sore 15-18, malam else) ---------------- */
const TZ = 'Asia/Jakarta'
function jakartaHour(d: Date): number {
  try {
    const h = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: TZ }).format(d)
    return parseInt(h, 10)
  } catch {
    return d.getHours()
  }
}
function composeGreeting(name: string, now: Date): string {
  const h = jakartaHour(now)
  const part = h >= 4 && h < 10 ? 'pagi' : h >= 10 && h < 15 ? 'siang' : h >= 15 && h < 18 ? 'sore' : 'malam'
  const firstName = name.trim().split(/\s+/)[0] || name
  return `Selamat ${part}, ${firstName}`
}

/* ---------------- Uang ringkas Indonesia: "Rp 70 jt" / "Rp 1,2 M" / "S$ 450" ---------------- */
const CURRENCY_SYMBOL: Record<string, string> = { IDR: 'Rp', MYR: 'RM', SGD: 'S$', USD: '$' }
function formatMoneyShort(v: number, currency: string): string {
  const sym = CURRENCY_SYMBOL[currency] ?? currency
  if (Math.abs(v) >= 1e9) return `${sym} ${round1(v / 1e9)} M`
  if (Math.abs(v) >= 1e6) return `${sym} ${round1(v / 1e6)} jt`
  return `${sym} ${Math.round(v).toLocaleString('id-ID')}`
}

/* ---------------- LLM helpers (pola ai-summary) ---------------- */
const SYSTEM_PROMPT =
  'Anda asisten sales CRM. Buat briefing pagi singkat untuk direktur dari data digest berikut. ' +
  'Balas HANYA JSON valid tanpa teks lain (tanpa markdown fence) dengan bentuk: ' +
  '{"headline": string (1 kalimat kondisi pipeline hari ini, Bahasa Indonesia), ' +
  '"priorities": array 3-5 item berbentuk {"title": string (maks 80 karakter), ' +
  '"reason": string (1 kalimat mengapa penting), "action": string (1 kalimat aksi konkret), ' +
  '"source": "SLA"|"LEAD"|"TASK"|"QUOTATION"|"INVOICE"|"OTHER", ' +
  '"opportunityId": string id dari daftar OPPORTUNITY yang diberikan atau null}, ' +
  '"risks": array 0-3 string singkat, "focus": string (1 kalimat fokus hari ini)}'

const SOURCES: readonly string[] = ['SLA', 'LEAD', 'TASK', 'QUOTATION', 'INVOICE', 'OTHER']

/** Ekstrak objek JSON dari raw LLM output: buang code fence, ambil '{' pertama s/d '}' terakhir. */
function extractJsonObject(raw: string): Record<string, unknown> | null {
  const t = raw.trim().replace(/```(?:json)?/gi, '')
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    const parsed: unknown = JSON.parse(t.slice(start, end + 1))
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return null
  } catch {
    return null
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** POST /api/briefing → BriefingDTO */
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser()
    if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })
    if (session.role === 'CLIENT') {
      return NextResponse.json({ error: 'Hanya tim internal yang dapat mengakses briefing' }, { status: 403 })
    }

    const now = new Date()

    /* ---------------- 0. Cache hit (kecuali refresh:true) ---------------- */
    let refresh = false
    try {
      const body = (await req.json()) as { refresh?: boolean } | null
      refresh = body?.refresh === true
    } catch {
      /* body kosong/tidak valid → treat sbg tanpa refresh */
    }
    const cache = g.__crmBriefingCache
    if (!refresh && cache && now.getTime() - cache.at < CACHE_TTL) {
      const dto: BriefingDTO = {
        ...cache.payload,
        greeting: composeGreeting(session.name, now),
        cached: true,
        generatedAt: new Date(cache.at).toISOString(),
      }
      return NextResponse.json(dto)
    }

    /* ---------------- 1. Basis data (deterministik, Promise.all) ---------------- */
    const startOfToday = (() => {
      // tengah malam Asia/Jakarta hari ini — tanpa dependensi zona waktu penuh
      const dateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(now)
      return new Date(`${dateStr}T00:00:00.000+07:00`)
    })()
    const endOfToday = new Date(startOfToday.getTime() + DAY - 1)
    const since7 = new Date(now.getTime() - 7 * DAY)
    const since30 = new Date(now.getTime() - 30 * DAY)
    const since60 = new Date(now.getTime() - 60 * DAY)

    const [slaLeads, openOppRows, dueTasks, sentQuotations, overdueInvoices, newLeads7d, won30] = await Promise.all([
      // SLA — lead NEW/CONTACT_ATTEMPTED menunggu balasan > SLA jam brand (pola dashboard/notifications)
      db.opportunity.findMany({
        where: { isDeleted: false, stage: { in: ['NEW', 'CONTACT_ATTEMPTED'] } },
        select: {
          id: true, code: true, title: true, createdAt: true, ownerId: true,
          company: { select: { name: true } },
          sourceBrand: { select: { name: true, slaHours: true } },
          executingBrand: { select: { name: true, slaHours: true } },
          owner: { select: { name: true } },
          interactions: { select: { direction: true, sentAt: true }, orderBy: { sentAt: 'desc' } },
        },
      }),
      // open opportunities — basis skor lead, unanswered, hot leads
      db.opportunity.findMany({
        where: { isDeleted: false, stage: { notIn: ['WON', 'LOST'] } },
        select: {
          id: true, code: true, title: true, stage: true, estimatedValue: true, currency: true,
          probability: true, expectedCloseDate: true, stageUpdatedAt: true, createdAt: true, nextAction: true,
          company: { select: { name: true } },
          executingBrand: { select: { name: true, color: true } },
          owner: { select: { name: true } },
          tasks: { where: { status: { in: ['OPEN', 'IN_PROGRESS'] } }, select: { id: true } },
          interactions: { select: { direction: true, sentAt: true }, orderBy: { sentAt: 'desc' }, take: 10 },
          _count: { select: { interactions: true } },
        },
      }),
      // task jatuh tempo milik session (due ≤ akhir hari ini)
      db.task.findMany({
        where: {
          status: { in: ['OPEN', 'IN_PROGRESS'] },
          assigneeId: session.id,
          dueDate: { not: null, lte: endOfToday },
        },
        orderBy: { dueDate: 'asc' },
        select: {
          id: true, title: true, dueDate: true,
          opportunity: { select: { company: { select: { name: true } } } },
        },
      }),
      // quotation SENT menunggu keputusan client
      db.quotation.findMany({
        where: { status: 'SENT' },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true, code: true, total: true, currency: true, createdAt: true, sentAt: true,
          opportunityId: true,
          company: { select: { name: true } },
        },
      }),
      // invoice outstanding lewat jatuh tempo
      db.invoice.findMany({
        where: { status: { in: ['UNPAID', 'PARTIAL'] }, dueDate: { lt: startOfToday } },
        select: { id: true, code: true, total: true, paidAmount: true, currency: true, dueDate: true },
      }),
      // lead baru 7 hari terakhir (semua stage)
      db.opportunity.count({ where: { isDeleted: false, createdAt: { gte: since7 } } }),
      // deal won 30 hari terakhir
      db.opportunity.findMany({
        where: { isDeleted: false, stage: 'WON', wonAt: { gte: since30 } },
        select: { estimatedValue: true, currency: true },
      }),
    ])

    /* ---------- SLA breaches ---------- */
    const slaAll = slaLeads
      .map((o) => {
        const brand = o.sourceBrand ?? o.executingBrand
        const slaHours = brand?.slaHours ?? 24
        // interactions desc → find pertama direction IN = inbound terbaru
        const waitingSince = o.interactions.find((i) => i.direction === 'IN')?.sentAt ?? o.createdAt
        const waitingHours = (now.getTime() - waitingSince.getTime()) / HOUR
        return { o, brand, slaHours, waitingHours }
      })
      .filter((b) => b.waitingHours > b.slaHours)
      .sort((a, b) => b.waitingHours - a.waitingHours)
    const slaTop3 = slaAll.slice(0, 3).map((b) => ({
      code: b.o.code,
      companyName: b.o.company.name,
      brandName: b.brand?.name ?? '—',
      ownerName: b.o.owner?.name ?? null,
      waitingHours: round1(b.waitingHours),
      slaHours: b.slaHours,
    }))

    /* ---------- skor lead per open opp (lib hanya membaca field minimal ini — jaga sinkron) ---------- */
    const scored = openOppRows.map((o) => {
      const score = computeLeadScore({
        stage: o.stage,
        interactionsCount: o._count.interactions,
        lastInteractionAt: o.interactions[0]?.sentAt ?? null,
        lastInboundAt: o.interactions.find((i) => i.direction === 'IN')?.sentAt ?? null,
        estimatedValue: o.estimatedValue,
        expectedCloseDate: o.expectedCloseDate,
        stageUpdatedAt: o.stageUpdatedAt,
        openTasksCount: o.tasks.length,
      } as unknown as OpportunityDTO, now)
      return { o, score: score.score, grade: score.grade }
    })
    const hotLeads = scored
      .filter((s) => s.score >= 70)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((s) => ({
        id: s.o.id,
        code: s.o.code,
        companyName: s.o.company.name,
        stage: s.o.stage,
        estimatedValue: s.o.estimatedValue,
        currency: s.o.currency,
        score: s.score,
        ownerName: s.o.owner?.name ?? null,
        nextAction: s.o.nextAction,
      }))

    /* ---------- unanswered: interaksi terakhir open opp adalah IN (≤60 hari; take 10 menutup window) ---------- */
    const unansweredAll = openOppRows
      .map((o) => {
        const last = o.interactions[0]
        if (!last || last.direction !== 'IN') return null
        if (last.sentAt < since60) return null
        return { o, lastIn: last.sentAt, waitingHours: (now.getTime() - last.sentAt.getTime()) / HOUR }
      })
      .filter((u): u is NonNullable<typeof u> => u !== null)
      .sort((a, b) => a.lastIn.getTime() - b.lastIn.getTime()) // terlama dulu
    const unansweredTop3 = unansweredAll.slice(0, 3).map((u) => ({
      companyName: u.o.company.name,
      waitingHours: round1(u.waitingHours),
    }))

    /* ---------- task jatuh tempo (milik session) ---------- */
    const tasksDueTop5 = dueTasks.slice(0, 5).map((t) => ({
      title: t.title,
      companyName: t.opportunity?.company?.name ?? null,
    }))
    const overdueTaskCount = dueTasks.filter((t) => t.dueDate && t.dueDate < now).length

    /* ---------- quotation SENT menunggu ---------- */
    const quotationsAwaitingTop3 = sentQuotations.slice(0, 3).map((q) => {
      const sentRef = q.sentAt ?? q.createdAt
      return {
        code: q.code,
        companyName: q.company.name,
        total: q.total,
        currency: q.currency,
        daysSinceSent: Math.max(0, Math.floor((now.getTime() - sentRef.getTime()) / DAY)),
      }
    })

    /* ---------- invoice overdue ---------- */
    const invoiceRows = overdueInvoices
      .map((inv) => {
        const daysOverdue = Math.floor((now.getTime() - inv.dueDate!.getTime()) / DAY)
        return { code: inv.code, daysOverdue, remaining: inv.total - inv.paidAmount, currency: inv.currency }
      })
      .sort((a, b) => b.daysOverdue - a.daysOverdue)
    const invoiceWorst = invoiceRows[0] ?? null

    /* ---------- won 30 hari ---------- */
    const won30Count = won30.length
    // Kebijakan mata uang (MVP): penjumlahan nilai global hanya IDR — campuran menyesatkan.
    const won30Value = won30.filter((w) => w.currency === 'IDR').reduce((s, w) => s + w.estimatedValue, 0)

    const basis: BriefingDTO['basis'] = {
      slaBreaches: slaAll.length,
      hotLeads: hotLeads.length,
      unanswered: unansweredAll.length,
      tasksDue: dueTasks.length,
      quotationsAwaiting: sentQuotations.length,
      invoicesOverdue: invoiceRows.length,
    }

    /* ---------------- 2. Stats deterministik (label Indonesia, nilai ringkas) ---------------- */
    const stats: BriefingStatDTO[] = [
      {
        label: 'SLA terlampaui',
        value: basis.slaBreaches > 0 ? `${basis.slaBreaches} lead` : '0 lead',
        tone: basis.slaBreaches > 0 ? 'bad' : 'good',
      },
      {
        label: 'Hot lead skor ≥70',
        value: `${basis.hotLeads} lead`,
        tone: basis.hotLeads > 0 ? 'warn' : 'default',
      },
      {
        label: 'Tugas jatuh tempo',
        value: `${basis.tasksDue} task`,
        tone: basis.tasksDue === 0 ? 'default' : overdueTaskCount > 0 ? 'bad' : 'warn',
      },
      {
        label: 'Penawaran menunggu',
        value: `${basis.quotationsAwaiting} penawaran`,
        tone: 'default',
      },
      {
        label: 'Invoice telat',
        value: `${basis.invoicesOverdue} invoice`,
        tone: basis.invoicesOverdue > 0 ? 'bad' : 'good',
      },
      {
        label: 'Won 30 hari',
        value: won30Count > 0
          ? `${won30Count} deal${won30Value > 0 ? ` · ${formatMoneyShort(won30Value, 'IDR')}` : ''}`
          : '0 deal',
        tone: won30Count > 0 ? 'good' : 'default',
      },
    ]

    /* ---------------- 3. Narasi LLM (hanya headline/priorities/risks/focus) ---------------- */
    // Daftar opportunity yang BOLEH dikutip LLM (id + code + company) — sumber: SLA, hot leads,
    // unanswered, quotation SENT (opportunityId-nya).
    const allowedIds: { id: string; label: string }[] = []
    for (const b of slaAll) allowedIds.push({ id: b.o.id, label: `${b.o.code} ${b.o.company.name}` })
    for (const h of hotLeads) allowedIds.push({ id: h.id, label: `${h.code} ${h.companyName}` })
    for (const u of unansweredAll) allowedIds.push({ id: u.o.id, label: `${u.o.code} ${u.o.company.name}` })
    for (const q of sentQuotations) {
      if (q.opportunityId) {
        allowedIds.push({ id: q.opportunityId, label: `${q.code} ${q.company.name}` })
      }
    }
    const allowedSet = new Set(allowedIds.map((a) => a.id))
    const refLines = [
      'OPPORTUNITY (boleh dikutip sbg opportunityId):',
      ...allowedIds.map((a) => `- ${a.id} = ${a.label}`),
    ]

    const digestLines: string[] = [
      `DIGEST CRM ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeZone: TZ }).format(now)}:`,
      `SLA terlampaui: ${slaAll.length} lead.`,
      ...slaTop3.map((b) => `- SLA ${b.code} ${b.companyName} menunggu ${b.waitingHours} jam (SLA ${b.slaHours} jam), brand ${b.brandName}, owner ${b.ownerName ?? '—'}`),
      `Hot lead skor ≥70: ${hotLeads.length}.`,
      ...hotLeads.map((h) => `- Hot ${h.code} ${h.companyName} stage ${h.stage} nilai ${formatMoneyShort(h.estimatedValue, h.currency)} skor ${h.score}, owner ${h.ownerName ?? '—'}${h.nextAction ? `, next: ${h.nextAction}` : ''}`),
      `Belum dibalas (pesan terakhir dari client): ${unansweredAll.length}.`,
      ...unansweredTop3.map((u) => `- Belum dibalas ${u.companyName} menunggu ${u.waitingHours} jam`),
      `Task jatuh tempo milik ${session.name}: ${dueTasks.length}.`,
      ...tasksDueTop5.map((t) => `- Task "${t.title}" (${t.companyName ?? 'tanpa opportunity'})`),
      `Penawaran SENT menunggu keputusan: ${sentQuotations.length}.`,
      ...quotationsAwaitingTop3.map((q) => `- Penawaran ${q.code} ${q.companyName} ${formatMoneyShort(q.total, q.currency)} terkirim ${q.daysSinceSent} hari lalu`),
      `Invoice lewat jatuh tempo: ${invoiceRows.length}.`,
      ...(invoiceWorst
        ? [`- Invoice ${invoiceWorst.code} terlambat ${invoiceWorst.daysOverdue} hari sisa ${formatMoneyShort(invoiceWorst.remaining, invoiceWorst.currency)}`]
        : []),
      `Lead baru 7 hari terakhir: ${newLeads7d}.`,
      `Deal won 30 hari terakhir: ${won30Count} (${formatMoneyShort(won30Value, 'IDR')}).`,
    ]

    // Jaga budget payload: buang baris digest terakhir (seksi paling rendah prioritas)
    // sampai digest + daftar referensi ≤ 6000 char. Daftar referensi selalu dipertahankan.
    const totalLen = () => [...digestLines, '', ...refLines].join('\n').length
    while (digestLines.length > 1 && totalLen() > PAYLOAD_LIMIT) {
      digestLines.pop()
    }
    const userPayload = [...digestLines, '', ...refLines].join('\n').slice(0, PAYLOAD_LIMIT)

    let raw = ''
    let model = 'glm-4.6'
    try {
      const zai = await ZAI.create()
      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'assistant', content: SYSTEM_PROMPT },
          { role: 'user', content: userPayload },
        ],
        thinking: { type: 'disabled' },
      })
      raw = completion?.choices?.[0]?.message?.content ?? ''
      if (typeof completion?.model === 'string' && completion.model) model = completion.model
    } catch (err) {
      console.error('[briefing] LLM gagal:', err)
      return NextResponse.json({ error: 'Gagal menghasilkan briefing — coba lagi' }, { status: 502 })
    }
    if (!raw.trim()) {
      return NextResponse.json({ error: 'Gagal menghasilkan briefing — coba lagi' }, { status: 502 })
    }

    /* ---------------- Parse & validasi defensif ---------------- */
    const parsed = extractJsonObject(raw)
    const headline = asString(parsed?.headline)
    const focus = asString(parsed?.focus)
    const rawPriorities = Array.isArray(parsed?.priorities) ? parsed?.priorities : null
    if (!headline || !focus || !rawPriorities) {
      // parse gagal total → jangan sajikan briefing setengah jadi
      return NextResponse.json({ error: 'Gagal menghasilkan briefing — coba lagi' }, { status: 502 })
    }
    const priorities = rawPriorities
      .map((p) => (typeof p === 'object' && p !== null ? (p as Record<string, unknown>) : null))
      .filter((p): p is Record<string, unknown> => p !== null)
      .map((p) => {
        const title = asString(p.title).slice(0, 80)
        const source = asString(p.source).toUpperCase()
        const opportunityId = asString(p.opportunityId)
        return {
          title,
          reason: asString(p.reason),
          action: asString(p.action),
          source: (SOURCES as readonly string[]).includes(source) ? source : 'OTHER',
          opportunityId: allowedSet.has(opportunityId) ? opportunityId : null,
        }
      })
      .filter((p) => p.title.length > 0)
      .slice(0, 5)
    if (priorities.length === 0) {
      return NextResponse.json({ error: 'Gagal menghasilkan briefing — coba lagi' }, { status: 502 })
    }
    const risks = (Array.isArray(parsed?.risks) ? parsed.risks : [])
      .filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
      .map((r) => r.trim())
      .slice(0, 3)

    const payload: BriefingCachePayload = { headline, priorities, risks, focus, stats, basis, model }
    g.__crmBriefingCache = { at: now.getTime(), payload }

    // Audit hanya pada generate fresh — cache hit tidak diulang.
    try {
      await logAudit({
        userId: session.id,
        userName: session.name,
        action: 'BRIEFING_GENERATED',
        entityType: 'SYSTEM',
        newValue: { slaBreaches: basis.slaBreaches, hotLeads: basis.hotLeads, model },
        req,
      })
    } catch {
      /* ignore */
    }

    const dto: BriefingDTO = {
      ...payload,
      greeting: composeGreeting(session.name, now),
      generatedAt: now.toISOString(),
      cached: false,
    }
    return NextResponse.json(dto)
  } catch (err) {
    console.error('[briefing] gagal memuat briefing:', err)
    return NextResponse.json({ error: 'Gagal memuat briefing' }, { status: 500 })
  }
}
