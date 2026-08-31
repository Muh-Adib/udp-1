/* ============ /api/opportunities/[id]/ai-summary — ringkasan deal via LLM (R13) ============ *
 * POST → OpportunityAiSummaryDTO. Backend only: memakai z-ai-web-dev-sdk.
 * Menganalisis riwayat percakapan IN+OUT + konteks deal (task, quotation, brief)
 * lalu menghasilkan summary/sentiment/interests/risks/suggestedActions/follow-up
 * dalam Bahasa Indonesia. Hasil parse JSON divalidasi defensif (selalu aman utk UI). */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/crm-server'
import { stageMeta } from '@/lib/crm-constants'
import { logAudit } from '@/lib/audit'
import type { AiSentiment, OpportunityAiSummaryDTO } from '@/lib/crm-types'
import ZAI from 'z-ai-web-dev-sdk'

export const dynamic = 'force-dynamic'

const INTERNAL_ROLES = ['SUPER_ADMIN', 'DIREKTUR', 'MARKETING', 'KEUANGAN', 'PRODUKSI']

const MAX_INTERACTIONS = 30
const BODY_SLICE = 300
const PAYLOAD_LIMIT = 6000

const SYSTEM_PROMPT =
  'Anda asisten sales CRM. Analisis riwayat percakapan & konteks deal berikut. ' +
  'Balas HANYA JSON valid tanpa teks lain dengan bentuk: ' +
  '{"summary": string (2-4 kalimat kondisi deal & minat client), ' +
  '"sentiment": "POSITIVE"|"NEUTRAL"|"NEGATIVE"|"MIXED", ' +
  '"interests": string[] (poin yang diminati client, maks 4, ringkas), ' +
  '"risks": string[] (risiko/blocker, maks 3), ' +
  '"suggestedActions": string[] (2-3 aksi konkret tim sales), ' +
  '"suggestedFollowUp": string (draft pesan balasan singkat sopan dalam Bahasa Indonesia, siap kirim, maks 400 char)}'

const SENTIMENTS: readonly string[] = ['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'MIXED']

/** "12 Agu" — tanggal singkat Indonesia utk prompt LLM. */
function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
  } catch {
    return '—'
  }
}

/** One-line body: rapikan whitespace + slice 300 char. */
function sliceBody(body: string): string {
  return body.replace(/\s+/g, ' ').trim().slice(0, BODY_SLICE)
}

function asStringArray(value: unknown, cap: number): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map((s) => s.trim())
    .slice(0, cap)
}

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

/** POST /api/opportunities/[id]/ai-summary → OpportunityAiSummaryDTO */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser()
    if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

    const { id } = await ctx.params
    const opp = await db.opportunity.findFirst({
      where: { id, isDeleted: false },
      include: {
        company: { select: { name: true, industry: true, country: true } },
        contact: { select: { firstName: true, lastName: true, position: true } },
        owner: { select: { name: true } },
      },
    })
    if (!opp) return NextResponse.json({ error: 'Opportunity tidak ditemukan' }, { status: 404 })

    // Hanya tim internal — role CLIENT memakai portal.
    if (!INTERNAL_ROLES.includes(session.role)) {
      return NextResponse.json(
        { error: 'Hanya tim internal yang dapat membuat ringkasan AI' },
        { status: 403 },
      )
    }

    // Brand access mengikuti rule route detail opportunity: tidak ada gate per-brand
    // utk role internal (SUPER_ADMIN/DIREKTUR otomatis lolos; role internal lain sama
    // seperti detail — konsisten dgn seluruh endpoint opportunity yang sudah ada).

    const [interactionsDesc, openTasks, quotations, brief] = await Promise.all([
      db.interaction.findMany({
        where: { opportunityId: id },
        orderBy: { sentAt: 'desc' },
        take: MAX_INTERACTIONS,
        select: { subject: true, body: true, direction: true, channel: true, sentAt: true },
      }),
      db.task.findMany({
        where: { opportunityId: id, status: { in: ['OPEN', 'IN_PROGRESS'] } },
        orderBy: { dueDate: 'asc' },
        select: { title: true, dueDate: true, status: true },
      }),
      db.quotation.findMany({
        where: { opportunityId: id },
        orderBy: { createdAt: 'desc' },
        select: { code: true, status: true, total: true, currency: true },
      }),
      db.brief.findUnique({ where: { opportunityId: id }, select: { serviceScope: true } }),
    ])

    // Kronologis (asc) — diambil desc lalu dibalik agar hemat roundtrip.
    const interactions = [...interactionsDesc].reverse()

    /* ---------------- Bangun payload Bahasa Indonesia (maks ~6000 char) ---------------- */
    const contactName = [opp.contact.firstName, opp.contact.lastName].filter(Boolean).join(' ').trim() || '—'
    const industry = opp.company.industry || '—'
    const country = opp.company.country || '—'
    const stageLabel = stageMeta(opp.stage).label

    const headerLines = [
      `DEAL: ${opp.code} — ${opp.title}`,
      `Perusahaan: ${opp.company.name} (${industry}, ${country})`,
      `Kontak: ${contactName} (${opp.contact.position || '—'})`,
      `Stage: ${stageLabel} | Nilai estimasi: ${opp.estimatedValue} ${opp.currency} | Probabilitas: ${opp.probability}%`,
      `Owner: ${opp.owner.name}`,
    ]
    if (brief?.serviceScope?.trim()) headerLines.push(`Lingkup layanan: ${sliceBody(brief.serviceScope)}`)

    const messageLines = interactions.map((it) => {
      const body = sliceBody(it.body)
      return `[${it.direction} via ${it.channel} ${fmtDate(it.sentAt)}] ${body}`
    })

    const taskLines =
      openTasks.length > 0
        ? openTasks.map((t) => `- ${t.title} (due ${fmtDate(t.dueDate)}, ${t.status})`)
        : ['- (tidak ada task terbuka)']

    const quotationLines =
      quotations.length > 0
        ? quotations.map((q) => `- ${q.code} — ${q.status} — total ${q.total} ${q.currency}`)
        : ['- (belum ada penawaran)']

    const lines = [
      ...headerLines,
      `RIWAYAT PERCAKAPAN (${interactions.length} pesan, kronologis):`,
      ...messageLines,
      'TASK TERBUKA:',
      ...taskLines,
      'PENAWARAN:',
      ...quotationLines,
    ]

    // Jaga budget payload: buang pesan terlama dulu (baris pertama setelah label RIWAYAT)
    // sampai total ≤ 6000 char. Baris header/task/penawaran selalu dipertahankan.
    const firstMessageIdx = headerLines.length + 1
    let keptMessages = messageLines.length
    while (keptMessages > 0 && lines.join('\n').length > PAYLOAD_LIMIT) {
      lines.splice(firstMessageIdx, 1)
      keptMessages--
    }
    const userPayload = lines.join('\n').slice(0, PAYLOAD_LIMIT)

    /* ---------------- Panggil LLM (latensi beberapa detik wajar) ---------------- */
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
      console.error('[opportunities/ai-summary] LLM gagal:', err)
      return NextResponse.json(
        { error: 'Gagal menghasilkan ringkasan AI — coba lagi' },
        { status: 502 },
      )
    }
    if (!raw.trim()) {
      return NextResponse.json(
        { error: 'Gagal menghasilkan ringkasan AI — coba lagi' },
        { status: 502 },
      )
    }

    /* ---------------- Parse & validasi defensif ---------------- */
    const parsed = extractJsonObject(raw)
    const fallbackSummary = raw.replace(/\s+/g, ' ').trim().slice(0, 300)

    const rawSentiment = typeof parsed?.sentiment === 'string' ? parsed.sentiment.toUpperCase() : ''
    const sentiment: AiSentiment = (SENTIMENTS as readonly string[]).includes(rawSentiment)
      ? (rawSentiment as AiSentiment)
      : 'NEUTRAL'

    const summary =
      typeof parsed?.summary === 'string' && parsed.summary.trim().length > 0
        ? parsed.summary.trim()
        : fallbackSummary

    const interests = asStringArray(parsed?.interests, 4)
    const risks = asStringArray(parsed?.risks, 3)
    const suggestedActions = asStringArray(parsed?.suggestedActions, 3)
    const suggestedFollowUp =
      typeof parsed?.suggestedFollowUp === 'string' && parsed.suggestedFollowUp.trim().length > 0
        ? parsed.suggestedFollowUp.trim().slice(0, 400)
        : null

    const dto: OpportunityAiSummaryDTO = {
      generatedAt: new Date().toISOString(),
      summary,
      sentiment,
      interests,
      risks,
      suggestedActions,
      suggestedFollowUp,
      messageCount: interactions.length,
      model,
    }

    // Audit — fail-safe (logAudit sendiri sudah menelan error internal).
    try {
      await logAudit({
        userId: session.id,
        userName: session.name,
        action: 'AI_SUMMARY_GENERATED',
        entityType: 'Opportunity',
        entityId: id,
        entityLabel: `${opp.code} — ${opp.title}`,
        newValue: { sentiment: dto.sentiment, messages: dto.messageCount },
        req,
      })
    } catch {
      /* ignore */
    }

    return NextResponse.json(dto)
  } catch (err) {
    console.error('[opportunities/ai-summary] gagal membuat ringkasan AI:', err)
    return NextResponse.json({ error: 'Gagal membuat ringkasan AI' }, { status: 500 })
  }
}
