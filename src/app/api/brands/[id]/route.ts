/* ============ /api/brands/[id] — pengaturan brand (SUPER_ADMIN & DIREKTUR) ============ *
 * R15: brand sebelumnya read-only penuh (GET saja). Route ini menambah PATCH utk
 * konfigurasi & identitas brand: kontak (email/telepon/instagram/alamat), warna,
 * SLA, mata uang, prefix dokumen, workflow, dan status aktif.
 * R19: dua varian logo (logoSquare 1:1 & logoWide horizontal) sebagai data-URL —
 * divalidasi mime + panjang; audit hanya mencatat placeholder (bukan base64 penuh).
 * name & slug sengaja TIDAK bisa diubah dari sini (identitas data + FK berantai). */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, mapBrand } from '@/lib/crm-server'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const STRING_FIELDS = [
  'tagline', 'description', 'website', 'email', 'phone', 'instagram', 'address',
] as const

/* R19 — logo: data-URL gambar; base64 tidak masuk audit log (cukup placeholder) */
const LOGO_FIELDS = ['logoSquare', 'logoWide'] as const
const LOGO_MIME_RE = /^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/
const LOGO_MAX_CHARS = 900_000 // ≈ 660 KB biner per logo

const CURRENCIES = ['IDR', 'SGD', 'USD']
const WORKFLOWS = ['website', 'video', 'animation', 'livestream', 'generic']
const PREFIX_RE = /^[A-Z]{2,6}$/
const COLOR_RE = /^#[0-9a-fA-F]{6}$/

/** PATCH — partial update konfigurasi brand (audit: per-field diff). */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Belum login' }, { status: 401 })
  if (!['SUPER_ADMIN', 'DIREKTUR', 'MANAJER'].includes(session.role)) {
    return NextResponse.json(
      { error: 'Hanya Super Admin / Direktur yang dapat mengubah pengaturan brand' },
      { status: 403 },
    )
  }

  const { id } = await ctx.params
  const brand = await db.brand.findUnique({
    where: { id },
    include: { services: { orderBy: [{ category: 'asc' }, { name: 'asc' }] } },
  })
  if (!brand) return NextResponse.json({ error: 'Brand tidak ditemukan' }, { status: 404 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Body tidak valid' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  const oldValue: Record<string, unknown> = {}
  const newValue: Record<string, unknown> = {}
  const current = brand as unknown as Record<string, unknown>

  /* String fields — kosong → null (bersih), trim input; normalisasi SEBELUM diff
     agar audit mencatat nilai yang benar-benar tersimpan (fix R15 QA). */
  for (const key of STRING_FIELDS) {
    if (body[key] === undefined) continue
    const raw = body[key]
    if (raw !== null && typeof raw !== 'string') {
      return NextResponse.json({ error: `Kolom ${key} harus teks` }, { status: 400 })
    }
    let next: string | null = typeof raw === 'string' && raw.trim() === '' ? null : (raw as string).trim()
    if (next !== null) {
      if (key === 'website' && !/^https?:\/\//i.test(next)) next = `https://${next}`
      if (key === 'instagram') {
        const ig = next.replace(/^@/, '')
        if (ig && !/^[A-Za-z0-9._]+$/.test(ig)) {
          return NextResponse.json({ error: 'Instagram hanya boleh huruf, angka, titik, underscore' }, { status: 400 })
        }
        next = ig ? `@${ig}` : null
      }
      if (key === 'email' && next !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
        return NextResponse.json({ error: 'Format email tidak valid' }, { status: 400 })
      }
    }
    if (next === current[key]) continue
    data[key] = next
    oldValue[key] = current[key]
    newValue[key] = next
  }

  /* R19 — logo (persegi / lebar): null atau '' = hapus; selain itu wajib data-URL gambar valid.
     Audit memakai placeholder supaya tabel AuditLog tidak menelan ratusan KB base64. */
  for (const key of LOGO_FIELDS) {
    if (body[key] === undefined) continue
    const raw = body[key]
    if (raw !== null && typeof raw !== 'string') {
      return NextResponse.json({ error: `Kolom ${key} harus berupa data-URL gambar` }, { status: 400 })
    }
    const trimmed = typeof raw === 'string' ? raw.trim() : ''
    let next: string | null = trimmed === '' ? null : trimmed
    if (next !== null) {
      if (!LOGO_MIME_RE.test(next)) {
        return NextResponse.json(
          { error: 'Logo harus berupa data-URL gambar (PNG, JPG, WebP, atau SVG)' },
          { status: 400 },
        )
      }
      if (next.length > LOGO_MAX_CHARS) {
        return NextResponse.json(
          { error: 'Ukuran logo terlalu besar — gunakan gambar maksimal ±600 KB' },
          { status: 400 },
        )
      }
    }
    if (next === current[key]) continue
    data[key] = next
    oldValue[key] = current[key] ? '(logo terpasang)' : null
    newValue[key] = next ? '(logo terpasang)' : null
  }

  /* color — hex 6 digit */
  if (body.color !== undefined) {
    const color = String(body.color).trim().toLowerCase()
    if (!COLOR_RE.test(color)) {
      return NextResponse.json({ error: 'Warna harus kode hex #rrggbb' }, { status: 400 })
    }
    if (color !== brand.color) {
      data.color = color
      oldValue.color = brand.color
      newValue.color = color
    }
  }

  /* slaHours — 1..168 */
  if (body.slaHours !== undefined) {
    const n = Number(body.slaHours)
    if (!Number.isFinite(n) || n < 1 || n > 168) {
      return NextResponse.json({ error: 'SLA harus 1–168 jam' }, { status: 400 })
    }
    const next = Math.round(n)
    if (next !== brand.slaHours) {
      data.slaHours = next
      oldValue.slaHours = brand.slaHours
      newValue.slaHours = next
    }
  }

  /* primaryCurrency */
  if (body.primaryCurrency !== undefined) {
    const cur = String(body.primaryCurrency).toUpperCase()
    if (!CURRENCIES.includes(cur)) {
      return NextResponse.json({ error: 'Mata uang harus IDR / SGD / USD' }, { status: 400 })
    }
    if (cur !== brand.primaryCurrency) {
      data.primaryCurrency = cur
      oldValue.primaryCurrency = brand.primaryCurrency
      newValue.primaryCurrency = cur
    }
  }

  /* invoicePrefix / quotationPrefix — 2–6 huruf kapital */
  for (const key of ['invoicePrefix', 'quotationPrefix'] as const) {
    if (body[key] === undefined) continue
    const next = String(body[key]).trim().toUpperCase()
    if (!PREFIX_RE.test(next)) {
      return NextResponse.json({ error: `${key === 'invoicePrefix' ? 'Prefix invoice' : 'Prefix quotation'} harus 2–6 huruf kapital (mis. INV)` }, { status: 400 })
    }
    if (next !== current[key]) {
      data[key] = next
      oldValue[key] = current[key]
      newValue[key] = next
    }
  }

  /* workflowType */
  if (body.workflowType !== undefined) {
    const wf = String(body.workflowType)
    if (!WORKFLOWS.includes(wf)) {
      return NextResponse.json({ error: 'Workflow tidak dikenal' }, { status: 400 })
    }
    if (wf !== brand.workflowType) {
      data.workflowType = wf
      oldValue.workflowType = brand.workflowType
      newValue.workflowType = wf
    }
  }

  /* isActive */
  if (typeof body.isActive === 'boolean' && body.isActive !== brand.isActive) {
    data.isActive = body.isActive
    oldValue.isActive = brand.isActive
    newValue.isActive = body.isActive
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Tidak ada perubahan' }, { status: 400 })
  }

  const updated = await db.brand.update({
    where: { id },
    data,
    include: { services: { orderBy: [{ category: 'asc' }, { name: 'asc' }] } },
  })

  await logAudit({
    userId: session.id,
    userName: session.name,
    action: 'UPDATE',
    entityType: 'Brand',
    entityId: id,
    entityLabel: updated.name,
    oldValue,
    newValue,
    req,
  })

  return NextResponse.json(mapBrand(updated))
}
