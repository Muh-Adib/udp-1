/* ============ Multi-Brand CRM — Constants & Metadata ============ */
import type { Stage, Priority, Temperature, Role } from './crm-types'

export const STAGES: { key: Stage; label: string; probability: number; group: 'open' | 'won' | 'lost' | 'nurture'; color: string; bg: string; dot: string }[] = [
  { key: 'NEW', label: 'New', probability: 10, group: 'open', color: 'text-slate-700', bg: 'bg-slate-100', dot: 'bg-slate-400' },
  { key: 'CONTACT_ATTEMPTED', label: 'Contact Attempted', probability: 15, group: 'open', color: 'text-slate-700', bg: 'bg-slate-100', dot: 'bg-slate-500' },
  { key: 'CONNECTED', label: 'Connected', probability: 25, group: 'open', color: 'text-teal-700', bg: 'bg-teal-50', dot: 'bg-teal-500' },
  { key: 'QUALIFIED', label: 'Qualified', probability: 35, group: 'open', color: 'text-teal-700', bg: 'bg-teal-50', dot: 'bg-teal-600' },
  { key: 'DISCOVERY', label: 'Discovery', probability: 45, group: 'open', color: 'text-amber-700', bg: 'bg-amber-50', dot: 'bg-amber-500' },
  { key: 'ESTIMATION', label: 'Estimation', probability: 55, group: 'open', color: 'text-amber-700', bg: 'bg-amber-50', dot: 'bg-amber-600' },
  { key: 'PROPOSAL_SENT', label: 'Proposal Sent', probability: 60, group: 'open', color: 'text-orange-700', bg: 'bg-orange-50', dot: 'bg-orange-500' },
  { key: 'NEGOTIATION', label: 'Negotiation', probability: 70, group: 'open', color: 'text-orange-700', bg: 'bg-orange-50', dot: 'bg-orange-600' },
  { key: 'VERBAL_AGREEMENT', label: 'Verbal Agreement', probability: 85, group: 'open', color: 'text-lime-700', bg: 'bg-lime-50', dot: 'bg-lime-600' },
  { key: 'WON', label: 'Won', probability: 100, group: 'won', color: 'text-emerald-700', bg: 'bg-emerald-50', dot: 'bg-emerald-600' },
  { key: 'LOST', label: 'Lost', probability: 0, group: 'lost', color: 'text-rose-700', bg: 'bg-rose-50', dot: 'bg-rose-500' },
  { key: 'NURTURE', label: 'Nurture', probability: 25, group: 'nurture', color: 'text-cyan-700', bg: 'bg-cyan-50', dot: 'bg-cyan-500' },
]

export const stageMeta = (key: string) => STAGES.find(s => s.key === key) ?? STAGES[0]
export const OPEN_STAGES = STAGES.filter(s => s.group === 'open')

export const LOST_REASONS: { key: string; label: string; needsNote?: boolean }[] = [
  { key: 'PRICE_TOO_HIGH', label: 'Harga terlalu tinggi' },
  { key: 'NO_BUDGET', label: 'Tidak ada budget' },
  { key: 'CHOSE_COMPETITOR', label: 'Memilih kompetitor' },
  { key: 'TIMELINE_MISMATCH', label: 'Timeline tidak sesuai' },
  { key: 'NEEDS_CHANGED', label: 'Kebutuhan berubah' },
  { key: 'NO_RESPONSE', label: 'Tidak mendapat respons' },
  { key: 'SCOPE_MISMATCH', label: 'Scope tidak cocok' },
  { key: 'CLIENT_POSTPONED', label: 'Ditunda internal klien' },
  { key: 'INVALID_CONTACT', label: 'Kontak tidak valid' },
  { key: 'DUPLICATE', label: 'Duplikat' },
  { key: 'NOT_TARGET_MARKET', label: 'Tidak sesuai target pasar' },
  { key: 'OTHER', label: 'Alasan lainnya', needsNote: true },
]
export const lostReasonLabel = (key?: string | null) => LOST_REASONS.find(r => r.key === key)?.label ?? key

export const REACTIVATION_OPTIONS: { key: string; label: string }[] = [
  { key: 'REOFFER_30', label: 'Re-offer 30 hari' },
  { key: 'REOFFER_90', label: 'Re-offer 90 hari' },
  { key: 'BUDGET_PERIOD', label: 'Re-offer menjelang periode anggaran' },
  { key: 'CROSS_SELL', label: 'Cross-sell ke brand lain' },
  { key: 'SMALLER_PACKAGE', label: 'Penawaran paket lebih kecil' },
  { key: 'ALTERNATIVE_SERVICE', label: 'Penawaran layanan alternatif' },
]
export const reactivationLabel = (key?: string | null) => REACTIVATION_OPTIONS.find(r => r.key === key)?.label ?? key

export const CHANNELS: { key: string; label: string; icon: string; color: string; bg: string }[] = [
  { key: 'WHATSAPP', label: 'WhatsApp', icon: 'MessageCircle', color: 'text-emerald-700', bg: 'bg-emerald-50' },
  { key: 'EMAIL', label: 'Email', icon: 'Mail', color: 'text-amber-700', bg: 'bg-amber-50' },
  { key: 'INSTAGRAM', label: 'Instagram', icon: 'Instagram', color: 'text-rose-600', bg: 'bg-rose-50' },
  { key: 'THREADS', label: 'Threads', icon: 'AtSign', color: 'text-slate-700', bg: 'bg-slate-100' },
  { key: 'WEBSITE', label: 'Website', icon: 'Globe', color: 'text-teal-700', bg: 'bg-teal-50' },
  { key: 'PHONE', label: 'Telepon', icon: 'Phone', color: 'text-orange-700', bg: 'bg-orange-50' },
  { key: 'MEETING', label: 'Meeting', icon: 'Users', color: 'text-violet-700', bg: 'bg-violet-50' },
]
export const channelMeta = (key: string) => CHANNELS.find(c => c.key === key) ?? CHANNELS[4]

export const LEAD_SOURCES: { key: string; label: string }[] = [
  { key: 'WEBSITE', label: 'Website Form' },
  { key: 'WHATSAPP', label: 'WhatsApp' },
  { key: 'INSTAGRAM', label: 'Instagram DM' },
  { key: 'EMAIL', label: 'Email' },
  { key: 'REFERRAL', label: 'Referral' },
  { key: 'COLD_CALL', label: 'Cold Call' },
  { key: 'EVENT', label: 'Event/Exhibition' },
]
export const leadSourceLabel = (key?: string | null) => LEAD_SOURCES.find(s => s.key === key)?.label ?? key

export const PRIORITIES: { key: Priority; label: string; color: string; bg: string }[] = [
  { key: 'LOW', label: 'Low', color: 'text-slate-600', bg: 'bg-slate-100' },
  { key: 'MEDIUM', label: 'Medium', color: 'text-amber-700', bg: 'bg-amber-50' },
  { key: 'HIGH', label: 'High', color: 'text-orange-700', bg: 'bg-orange-50' },
  { key: 'URGENT', label: 'Urgent', color: 'text-rose-700', bg: 'bg-rose-50' },
]
export const priorityMeta = (key: string) => PRIORITIES.find(p => p.key === key) ?? PRIORITIES[1]

export const TEMPERATURES: { key: Temperature; label: string; emoji: string; color: string; bg: string }[] = [
  { key: 'HOT', label: 'Hot', emoji: '🔥', color: 'text-rose-700', bg: 'bg-rose-50' },
  { key: 'WARM', label: 'Warm', emoji: '🌤️', color: 'text-amber-700', bg: 'bg-amber-50' },
  { key: 'COLD', label: 'Cold', emoji: '❄️', color: 'text-teal-700', bg: 'bg-teal-50' },
]
export const temperatureMeta = (key: string) => TEMPERATURES.find(t => t.key === key) ?? TEMPERATURES[1]

export const ROLES: { key: Role; label: string; description: string; color: string; bg: string }[] = [
  { key: 'SUPER_ADMIN', label: 'Super Admin', description: 'Brand, user, role, permission, master data, audit log', color: 'text-teal-700', bg: 'bg-teal-50' },
  { key: 'DIREKTUR', label: 'Direktur', description: 'Semua dashboard, forecast, approval, komentar', color: 'text-amber-700', bg: 'bg-amber-50' },
  { key: 'MANAJER', label: 'Manajer', description: 'Supervisi operasional, approval diskon, pantau tim & pipeline', color: 'text-emerald-700', bg: 'bg-emerald-50' },
  { key: 'MARKETING', label: 'Marketing', description: 'Lead inbox, contact, opportunity, follow-up', color: 'text-violet-700', bg: 'bg-violet-50' },
  { key: 'KEUANGAN', label: 'Keuangan', description: 'Estimasi, budget, quotation, invoice, pembayaran', color: 'text-rose-700', bg: 'bg-rose-50' },
  { key: 'PRODUKSI', label: 'Produksi', description: 'Brief, scope, timeline, milestone, deliverable', color: 'text-lime-700', bg: 'bg-lime-50' },
  { key: 'HR', label: 'HR', description: 'Data tim, tugas internal, kehadiran & administrasi SDM', color: 'text-orange-700', bg: 'bg-orange-50' },
  { key: 'CLIENT', label: 'Client', description: 'Client Portal — proyek, penawaran, invoice perusahaan sendiri', color: 'text-teal-700', bg: 'bg-teal-50' },
]
export const roleMeta = (key: string) => ROLES.find(r => r.key === key) ?? ROLES[2]

export const WORKFLOW_MILESTONES: Record<string, string[]> = {
  website: ['Discovery & Requirement', 'Sitemap & Wireframe', 'UI/UX Design', 'Development', 'QA & Testing', 'Launch & Handover'],
  video: ['Pre-Production', 'Shooting', 'Editing', 'Revision Round', 'Final Delivery'],
  animation: ['Script', 'Storyboard', 'Asset Production', 'Animation', 'Sound Design', 'Revision & Final'],
  livestream: ['Survey Lokasi', 'Technical Plan', 'Setup & Rehearsal', 'Event Day', 'Archive & Handover'],
  generic: ['Kick-off', 'Production', 'Review', 'Handover'],
}

export const PROJECT_STATUSES: { key: string; label: string; color: string; bg: string }[] = [
  { key: 'PLANNING', label: 'Planning', color: 'text-amber-700', bg: 'bg-amber-50' },
  { key: 'IN_PROGRESS', label: 'In Progress', color: 'text-teal-700', bg: 'bg-teal-50' },
  { key: 'REVIEW', label: 'Review', color: 'text-violet-700', bg: 'bg-violet-50' },
  { key: 'COMPLETED', label: 'Completed', color: 'text-emerald-700', bg: 'bg-emerald-50' },
  { key: 'ON_HOLD', label: 'On Hold', color: 'text-rose-700', bg: 'bg-rose-50' },
]
export const projectStatusMeta = (key: string) => PROJECT_STATUSES.find(s => s.key === key) ?? PROJECT_STATUSES[0]

export const TASK_TYPES: { key: string; label: string }[] = [
  { key: 'FOLLOW_UP', label: 'Follow-up' },
  { key: 'MEETING', label: 'Meeting' },
  { key: 'BRIEF', label: 'Brief' },
  { key: 'INTERNAL', label: 'Internal' },
  { key: 'OTHER', label: 'Lainnya' },
]

/* ---------------- Formatters ---------------- */
export function formatMoney(value: number | null | undefined, currency = 'IDR', compact = false): string {
  if (value === null || value === undefined) return '—'
  if (compact) {
    if (currency === 'IDR') {
      if (Math.abs(value) >= 1_000_000_000) return `Rp ${(value / 1_000_000_000).toFixed(1)} M`
      if (Math.abs(value) >= 1_000_000) return `Rp ${(value / 1_000_000).toFixed(0)} jt`
      if (Math.abs(value) >= 1_000) return `Rp ${(value / 1_000).toFixed(0)} rb`
      return `Rp ${value}`
    }
    return `${currency} ${value.toFixed(0)}`
  }
  try {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)
  } catch {
    return `${currency} ${value.toLocaleString('id-ID')}`
  }
}

export function formatDate(iso?: string | null, withTime = false): string {
  if (!iso) return '—'
  const dt = new Date(iso)
  return dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) })
}

export function timeAgo(iso?: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'baru saja'
  if (mins < 60) return `${mins} menit lalu`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} jam lalu`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} hari lalu`
  const months = Math.floor(days / 30)
  return `${months} bulan lalu`
}

export function daysUntil(iso?: string | null): number | null {
  if (!iso) return null
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)
}

/** Overdue berbasis timestamp — task hari ini yang sudah lewat jam-nya juga terlambat. */
export function isOverdueNow(iso?: string | null): boolean {
  if (!iso) return false
  return new Date(iso).getTime() < Date.now()
}

export const initials = (name: string) => name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
