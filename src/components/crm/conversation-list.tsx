/* ============ Daftar Percakapan — komponen bersama (R21) ============
   Baris ringkas gaya messenger. Dipakai di TIGA tempat sekaligus:
   (1) halaman Lead Inbox (entry point), (2) sidebar switcher di dalam
   chat fokus full-screen (desktop ≥xl), (3) drawer switcher
   (mobile/tablet <xl) — sehingga marketing bisa berganti percakapan
   tanpa keluar dari mode fokus.                                      */
'use client'

import { EmptyState, LoadingRows, StageBadge } from './shared'
import { formatDate, initials } from '@/lib/crm-constants'
import type { ConversationListItemDTO } from '@/lib/crm-types'
import { cn } from '@/lib/utils'
import { Flame, MessagesSquare } from 'lucide-react'

const SCROLLBAR = '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-transparent'

/* ---------- Chip SLA + tingkat eskalasi (solid rose + Flame bila menunggu > 2× sla) ---------- */
export type SlaBreach = { over: number; sla: number; brandName: string }

function SlaChip({ breach }: { breach: SlaBreach }) {
  const escalated = breach.over > breach.sla
  if (escalated) {
    return (
      <span
        title={`Melewati ${breach.sla * 2} jam — eskalasi ke pemberi lead`}
        className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-rose-600 px-1.5 py-0.5 text-[9px] font-semibold text-white"
      >
        <Flame className="h-2.5 w-2.5" /> ESKALASI
      </span>
    )
  }
  return (
    <span
      title={`Melewati SLA respons ${breach.brandName} (${breach.sla} jam)`}
      className="shrink-0 rounded-full bg-rose-50 px-1.5 py-0.5 text-[9px] font-semibold text-rose-700"
    >
      SLA +{breach.over}j
    </span>
  )
}

/* ---------- Satu baris percakapan (ringkas, gaya messenger) ---------- */
function ConvRow({ conv, active, onSelect }: {
  conv: ConversationListItemDTO
  active: boolean
  onSelect: () => void
}) {
  // Won/Lost = pertanyaan SLA tak relevan lagi → chip disembunyikan (hindari "ESKALASI +291j" pada deal selesai).
  const closed = conv.stage === 'WON' || conv.stage === 'LOST'
  const breach: SlaBreach | undefined =
    !closed && conv.slaOverHours != null
      ? { over: conv.slaOverHours, sla: conv.slaHours ?? 24, brandName: conv.brandName }
      : undefined
  return (
    <div role="listitem">
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        title={`${conv.contactName} · ${conv.opportunityCode} — ${conv.lastBody}`}
        className={cn(
          'flex w-full items-start gap-2.5 border-l-2 px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400/70 sm:px-4',
          active
            ? 'border-l-teal-600 bg-slate-100'
            : 'border-l-transparent hover:bg-slate-50',
        )}
      >
        <div className="relative shrink-0">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full text-[11px] font-semibold text-white"
            style={{ backgroundColor: conv.brandColor }}
            aria-hidden
          >
            {initials(conv.contactName)}
          </div>
          {conv.unanswered && (
            <span
              className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500"
              aria-hidden
              title="Belum dibalas"
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className={cn('min-w-0 flex-1 truncate text-[13px]', active ? 'font-semibold text-slate-900' : 'font-medium text-slate-800')}>
              {conv.contactName}
            </p>
            <span className={cn('shrink-0 text-[10px] tabular-nums', active ? 'font-medium text-slate-600' : 'text-slate-400')}>
              {formatDate(conv.lastSentAt, true)}
            </span>
          </div>
          <p className={cn('mt-0.5 truncate text-xs leading-relaxed', conv.unanswered ? 'text-slate-700' : 'text-slate-500')}>
            {conv.lastDirection === 'OUT' && <span className="font-medium text-emerald-600">Anda: </span>}
            {conv.lastBody || '—'}
          </p>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-[10px] text-slate-400">
              {conv.companyName ?? 'Tanpa perusahaan'} · <span className="font-mono">{conv.opportunityCode}</span>
            </span>
            {breach && <SlaChip breach={breach} />}
            <StageBadge stage={conv.stage} />
          </div>
        </div>
      </button>
    </div>
  )
}

/* ================================================================== */
/* Daftar percakapan                                                   */
/* ================================================================== */
export function ConversationList({ rows, activeId, onSelect, toolbar, loading, emptyTitle = 'Belum ada percakapan', emptyDescription = 'Belum ada pesan yang terhubung ke opportunity.', ariaLabel = 'Daftar percakapan', className }: {
  /** Baris sudah ter-filter dari parent (filter state diangkat ke inbox-view agar konsisten di semua penempatan) */
  rows: ConversationListItemDTO[]
  activeId?: string | null
  onSelect: (id: string) => void
  /** Slot UI filter (search, chip brand, kanal, belum-dibalas) — dirender di atas list */
  toolbar?: React.ReactNode
  loading?: boolean
  emptyTitle?: string
  emptyDescription?: string
  ariaLabel?: string
  className?: string
}) {
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      {toolbar && <div className="shrink-0 border-b border-slate-100">{toolbar}</div>}
      <div className={cn('min-h-0 flex-1 overflow-y-auto', SCROLLBAR)} role="list" aria-label={ariaLabel}>
        {loading ? (
          <div className="p-3 sm:p-4">
            <LoadingRows rows={6} />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<MessagesSquare className="h-6 w-6" />}
              title={emptyTitle}
              description={emptyDescription}
            />
          </div>
        ) : (
          rows.map((c) => (
            <ConvRow key={c.opportunityId} conv={c} active={c.opportunityId === activeId} onSelect={() => onSelect(c.opportunityId)} />
          ))
        )}
      </div>
    </div>
  )
}
