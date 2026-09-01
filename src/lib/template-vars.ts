/* ============ Template balasan cepat — sumber variabel & interpolasi ============
 * Semua variabel {{key}} WAJIB punya sumber data nyata (tanpa hardcode):
 *  - contact_name        → Contact (firstName + lastName)
 *  - company_name        → Company.name dari opportunity
 *  - brand_name          → Brand.name (sourceBrand ?? executingBrand)
 *  - marketing_name      → user yang sedang login (pengirim)
 *  - service_name        → Service.name dari opportunity; fallback: judul opportunity
 *  - estimated_timeline  → Opportunity.estimatedTimeline (diisi marketing di panel konteks
 *                          chat / form opportunity); fallback: Brief.timeline → deadline
 *  - owner_name          → owner opportunity (bila beda dari pengirim)
 *  - next_action         → Opportunity.nextAction
 */

export interface TemplateVarContext {
  contactName: string
  companyName?: string | null
  brandName?: string | null
  senderName: string
  serviceName?: string | null
  opportunityTitle?: string | null
  estimatedTimeline?: string | null
  briefTimeline?: string | null
  deadline?: string | null
  ownerName?: string | null
  nextAction?: string | null
}

export interface TemplateVarMeta {
  key: string
  label: string
  /** Dari mana nilai variabel berasal — ditampilkan di dialog kelola template */
  source: string
}

/** Metadata variabel — dipakai UI (helper chip saat membuat template) */
export const TEMPLATE_VARS: TemplateVarMeta[] = [
  { key: 'contact_name', label: 'Nama kontak', source: 'Kontak — nama depan + belakang' },
  { key: 'company_name', label: 'Nama perusahaan', source: 'Perusahaan pada opportunity' },
  { key: 'service_name', label: 'Nama layanan', source: 'Layanan pada opportunity (fallback: judul opportunity)' },
  { key: 'brand_name', label: 'Nama brand', source: 'Brand lead (Unimasi / Segia Tech / Erfo / Unicam)' },
  { key: 'marketing_name', label: 'Nama Anda', source: 'User yang sedang login (pengirim pesan)' },
  { key: 'estimated_timeline', label: 'Estimasi timeline', source: 'Field "Estimasi timeline" di panel konteks lead; fallback: timeline Brief → deadline' },
  { key: 'owner_name', label: 'Owner opportunity', source: 'PIC deal pada opportunity' },
  { key: 'next_action', label: 'Aksi berikutnya', source: 'Field "Aksi berikutnya" pada opportunity' },
]

const dash = (v: string | null | undefined) => {
  const t = (v ?? '').trim()
  return t.length > 0 ? t : null
}

/** Format tanggal singkat id-ID utk fallback deadline (mis. "12 Mar 2026") */
const formatDeadline = (iso: string | null | undefined) => {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Nilai variabel dari konteks — TANPA nilai hardcode; key tanpa sumber → null */
export function resolveTemplateValue(key: string, ctx: TemplateVarContext): string | null {
  switch (key) {
    case 'contact_name': return dash(ctx.contactName)
    case 'company_name': return dash(ctx.companyName)
    case 'brand_name': return dash(ctx.brandName)
    case 'marketing_name': return dash(ctx.senderName)
    case 'service_name': return dash(ctx.serviceName) ?? dash(ctx.opportunityTitle)
    // Rantai sumber estimasi timeline: opportunity.estimatedTimeline → brief.timeline → deadline
    case 'estimated_timeline':
      return dash(ctx.estimatedTimeline) ?? dash(ctx.briefTimeline) ?? formatDeadline(ctx.deadline)
    case 'owner_name': return dash(ctx.ownerName)
    case 'next_action': return dash(ctx.nextAction)
    default: return null
  }
}

/** Interpolasi isi template. Kembalikan hasil + daftar key yang tidak punya sumber
 * (dibiarkan apa adanya sebagai {{key}} agar pengirim sadar & bisa mengisi manual). */
export function interpolateTemplate(body: string, ctx: TemplateVarContext): { text: string; missing: string[] } {
  const missing: string[] = []
  const text = body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, rawKey: string) => {
    const key = rawKey.toLowerCase()
    const value = resolveTemplateValue(key, ctx)
    if (value === null) {
      if (!missing.includes(key)) missing.push(key)
      return `{{${key}}}`
    }
    return value
  })
  return { text, missing }
}

/** Deteksi token slash terakhir pada input ("body … /kata") utk popup autocomplete */
export function extractSlashToken(text: string): { token: string; startPos: number } | null {
  const upTo = text.slice(0, text.length)
  const m = /(?:^|\s)\/([a-zA-Z0-9_-]*)$/.exec(upTo)
  if (!m) return null
  return { token: m[1], startPos: m.index + m[0].indexOf('/') }
}
