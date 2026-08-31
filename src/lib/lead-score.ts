/* ============ Lead Scoring (rule-based, Phase 4) ============ */
/* Skor 0-100 murni dari data OpportunityDTO — tanpa efek samping, dipakai
   di pipeline (tabel & kanban) untuk memprioritaskan follow-up. */

import type { OpportunityDTO } from '@/lib/crm-types'

export type LeadGrade = 'A' | 'B' | 'C' | 'D'

export interface ScoreFactor {
  label: string
  points: number
  max: number
  note?: string
}

export interface LeadScoreResult {
  score: number // 0-100, sudah di-clamp
  grade: LeadGrade
  factors: ScoreFactor[]
  penalties: ScoreFactor[]
}

const HOUR = 3600000
const DAY = 24 * HOUR

const jt = 1_000_000
const miliar = 1_000_000_000

/** Bobot momentum per stage (0-30) — makin maju pipeline makin tinggi. */
const STAGE_POINTS: Record<string, number> = {
  NEW: 4,
  CONTACT_ATTEMPTED: 7,
  CONNECTED: 11,
  QUALIFIED: 14,
  DISCOVERY: 17,
  ESTIMATION: 20,
  PROPOSAL_SENT: 23,
  NEGOTIATION: 27,
  VERBAL_AGREEMENT: 30,
  NURTURE: 8,
}

const fmtValue = (v: number) =>
  v >= miliar ? `${Math.round((v / miliar) * 10) / 10} M` : `${Math.round(v / jt)} jt`

/** Hitung skor lead. Hanya untuk stage open/nurture — WON/LOST tetap boleh dipanggil (hasil statis). */
export function computeLeadScore(o: OpportunityDTO, now: Date = new Date()): LeadScoreResult {
  const factors: ScoreFactor[] = []
  const penalties: ScoreFactor[] = []

  /* 1. Momentum stage (0-30) */
  const stagePoints = STAGE_POINTS[o.stage] ?? 5
  factors.push({ label: 'Tahap pipeline', points: stagePoints, max: 30, note: o.stage })

  /* 2. Engagement — jumlah interaksi (0-20) */
  const n = o.interactionsCount
  const engPoints = n === 0 ? 0 : n <= 2 ? 6 : n <= 4 ? 12 : n <= 6 ? 16 : 20
  factors.push({
    label: 'Engagement',
    points: engPoints,
    max: 20,
    note: n === 0 ? 'Belum ada interaksi' : `${n} interaksi`,
  })

  /* 3. Recency — sejak interaksi terakhir (0-20) */
  let recPoints = 0
  let recNote = 'Belum ada interaksi'
  if (o.lastInteractionAt) {
    const ageDays = (now.getTime() - new Date(o.lastInteractionAt).getTime()) / DAY
    if (ageDays < 1) { recPoints = 20; recNote = '< 24 jam lalu' }
    else if (ageDays < 3) { recPoints = 16; recNote = '< 3 hari lalu' }
    else if (ageDays < 7) { recPoints = 12; recNote = '< 7 hari lalu' }
    else if (ageDays < 14) { recPoints = 7; recNote = '< 14 hari lalu' }
    else if (ageDays < 30) { recPoints = 3; recNote = '< 30 hari lalu' }
    else { recPoints = 0; recNote = '≥ 30 hari lalu' }
  }
  factors.push({ label: 'Interaksi terakhir', points: recPoints, max: 20, note: recNote })

  /* 4. Nilai deal (0-15) */
  const v = o.estimatedValue
  const valPoints = v >= 500 * jt ? 15 : v >= 250 * jt ? 12 : v >= 100 * jt ? 9 : v > 0 ? 5 : 0
  factors.push({
    label: 'Nilai deal',
    points: valPoints,
    max: 15,
    note: v > 0 ? fmtValue(v) : 'Belum diestimasi',
  })

  /* 5. Urgensi — expected close date (0-15) */
  let urgPoints = 0
  let urgNote = 'Tanpa target closing'
  if (o.expectedCloseDate) {
    const days = (new Date(o.expectedCloseDate).getTime() - now.getTime()) / DAY
    if (days < 0) { urgPoints = 2; urgNote = 'Sudah lewat target' }
    else if (days <= 14) { urgPoints = 15; urgNote = '≤ 14 hari lagi' }
    else if (days <= 30) { urgPoints = 11; urgNote = '≤ 30 hari lagi' }
    else if (days <= 60) { urgPoints = 6; urgNote = '≤ 60 hari lagi' }
    else { urgPoints = 3; urgNote = '> 60 hari' }
  }
  factors.push({ label: 'Urgensi closing', points: urgPoints, max: 15, note: urgNote })

  /* Penalti A: task terbuka overdue (maks -8) */
  const overdueTasks = o.openTasksCount // dihitung dari task OPEN; detail overdue ada di follow-up view
  const lateSinceInbound = o.lastInboundAt
    ? (now.getTime() - new Date(o.lastInboundAt).getTime()) / HOUR
    : null
  if (lateSinceInbound !== null && lateSinceInbound > 72) {
    penalties.push({
      label: 'Balasan menunggu lama',
      points: -6,
      max: -6,
      note: `Inbound terakhir ${Math.round(lateSinceInbound / 24)} hari lalu`,
    })
  }

  /* Penalti B: stage mandek (maks -7) */
  const stageAgeDays = (now.getTime() - new Date(o.stageUpdatedAt).getTime()) / DAY
  if (stageAgeDays > 21 && o.stage !== 'NURTURE' && o.stage !== 'WON' && o.stage !== 'LOST') {
    penalties.push({
      label: 'Stage mandek',
      points: -7,
      max: -7,
      note: `${Math.round(stageAgeDays)} hari di tahap ini`,
    })
  }

  if (overdueTasks > 0 && penalties.length === 0) {
    penalties.push({ label: 'Ada task terbuka', points: -3, max: -3, note: `${overdueTasks} task belum selesai` })
  }

  const raw =
    factors.reduce((s, f) => s + f.points, 0) + penalties.reduce((s, f) => s + f.points, 0)
  const score = Math.max(0, Math.min(100, raw))
  const grade: LeadGrade = score >= 70 ? 'A' : score >= 55 ? 'B' : score >= 40 ? 'C' : 'D'
  return { score, grade, factors, penalties }
}

/** Warna & label per grade — konsisten dgn palet slate/teal/amber/rose. */
export const GRADE_META: Record<LeadGrade, { label: string; cls: string; ring: string }> = {
  A: { label: 'Panas', cls: 'bg-emerald-50 text-emerald-700', ring: 'ring-emerald-200' },
  B: { label: 'Hangat', cls: 'bg-lime-50 text-lime-700', ring: 'ring-lime-200' },
  C: { label: 'Lumayan', cls: 'bg-amber-50 text-amber-700', ring: 'ring-amber-200' },
  D: { label: 'Dingin', cls: 'bg-slate-100 text-slate-500', ring: 'ring-slate-200' },
}
