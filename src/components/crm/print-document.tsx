/* ============ Print Document — Cetak / Simpan PDF (Quotation & Invoice) ============ */
'use client'

import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Printer, X } from 'lucide-react'
import { formatDate, formatMoney, initials } from '@/lib/crm-constants'
import type { QuotationDetailDTO, InvoiceDTO } from '@/lib/crm-types'

/* ---------------- Overlay (portal ke body; print CSS menyembunyikan sisanya) ---------------- */

export function PrintOverlay({
  open,
  docTitle,
  onClose,
  children,
}: {
  open: boolean
  docTitle: string
  onClose: () => void
  children: React.ReactNode
}) {
  /* Judul tab browser = nama dokumen saat preview terbuka (jadi nama default file PDF-nya benar) */
  useEffect(() => {
    if (!open) return
    const prev = document.title
    document.title = docTitle
    /* Capture phase + stopPropagation agar Esc hanya menutup overlay paling atas, bukan dialog di bawahnya */
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.title = prev
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open, docTitle, onClose])

  if (!open) return null

  return createPortal(
    <div className="print-overlay-root pointer-events-auto fixed inset-0 z-[100] overflow-y-auto bg-slate-900/60 backdrop-blur-sm print:static print:overflow-visible print:bg-white">
      {/* Toolbar — hanya di layar */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/10 bg-slate-900/95 px-5 py-3 print:hidden">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">Pratinjau Cetak — {docTitle}</p>
          <p className="text-[11px] text-slate-400">Gunakan &ldquo;Cetak / Simpan PDF&rdquo;, lalu pilih tujuan <span className="font-medium text-slate-200">Save as PDF</span>.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" onClick={() => window.print()} className="gap-1.5">
            <Printer className="h-4 w-4" /> Cetak / Simpan PDF
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose} className="gap-1.5 text-slate-200 hover:bg-white/10 hover:text-white">
            <X className="h-4 w-4" /> Tutup
          </Button>
        </div>
      </div>

      {/* Lembar A4 (relative — bar aksen brand di DocHeader melebar penuh ke tepi lembar) */}
      <div className="relative mx-auto my-5 w-[210mm] max-w-[94vw] bg-white p-[14mm] shadow-2xl print:my-0 print:w-auto print:max-w-none print:p-0 print:shadow-none">
        {children}
      </div>
    </div>,
    document.body,
  )
}

/* ---------------- Shared dokumen bits ---------------- */

/* Label status utk stempel dokumen — bahasa Indonesia, border + uppercase (aman utk cetak B/W,
   tidak mengandalkan warna semata). */
const QUO_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draf', SENT: 'Terkirim', ACCEPTED: 'Disetujui', REJECTED: 'Ditolak', EXPIRED: 'Kedaluwarsa',
}
const INV_STATUS_LABEL: Record<string, string> = {
  UNPAID: 'Belum Dibayar', PARTIAL: 'Dibayar Sebagian', PAID: 'Lunas', CANCELLED: 'Dibatalkan',
}

function DocHeader({ brandName, brandColor, brandLogoSquare, brandLogoWide, docLabel, docLabelEn, code, statusLabel, dateLabel }: {
  brandName: string
  brandColor: string
  brandLogoSquare?: string | null
  brandLogoWide?: string | null
  docLabel: string
  docLabelEn: string
  code: string
  statusLabel?: string
  dateLabel: string
}) {
  return (
    <div className="border-b border-slate-200 pb-5">
      {/* Bar aksen brand 4px — full-bleed ke tepi lembar (parent relative di PrintOverlay), tetap terlihat saat cetak B/W */}
      <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: brandColor }} aria-hidden />
      <div className="flex items-start justify-between gap-6">
        {/* Letterhead pengirim — R19: logo lebar mengikuti proporsi aslinya (object-contain, tidak gepeng);
            fallback ke logo persegi, lalu ke inisial dalam kotak warna brand */}
        <div className="flex items-center gap-3">
          {brandLogoWide ? (
            <img src={brandLogoWide} alt={`Logo ${brandName}`} className="h-12 w-auto max-w-[88mm] object-contain object-left" />
          ) : (
            <>
              {brandLogoSquare ? (
                <img src={brandLogoSquare} alt={`Logo ${brandName}`} className="h-12 w-12 shrink-0 object-contain" />
              ) : (
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-xl text-base font-bold text-white"
                  style={{ backgroundColor: brandColor }}
                >
                  {initials(brandName)}
                </div>
              )}
              <div>
                <p className="text-lg font-bold leading-tight tracking-tight text-slate-900">{brandName}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-slate-500">Grupa Kreasi Media · Creative &amp; Multimedia Group</p>
              </div>
            </>
          )}
        </div>
        {/* Judul dokumen: label kecil, kode besar, stempel status berbingkai */}
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {docLabel} / {docLabelEn}
          </p>
          <p className="mt-1 text-xl font-bold tracking-tight text-slate-900">{code}</p>
          {statusLabel && (
            <span className="mt-1.5 inline-flex rounded-md border-2 border-slate-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-900">
              {statusLabel}
            </span>
          )}
          <p className="mt-1.5 text-[11px] tabular-nums text-slate-500">{dateLabel}</p>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, labelEn, value }: { label: string; labelEn?: string; value?: string | null }) {
  return (
    <div className="flex gap-2 text-[11.5px]">
      <span className="w-[128px] shrink-0 text-slate-500">
        {label}{labelEn ? <span className="text-slate-400"> / {labelEn}</span> : null}
      </span>
      <span className="font-medium text-slate-800">{value || '—'}</span>
    </div>
  )
}

function TotalsRow({ label, labelEn, value, strong }: {
  label: string
  labelEn?: string
  value: string
  strong?: boolean
}) {
  return (
    <div className={`flex items-center justify-between gap-4 px-3 py-1.5 ${strong ? 'border-t-[3px] border-double border-slate-900 text-[13px] font-bold text-slate-900' : 'text-[12px] text-slate-600'}`}>
      <span>
        {label}{labelEn ? <span className="font-normal text-slate-400"> / {labelEn}</span> : null}
      </span>
      <span className={`tabular-nums ${strong ? '' : 'font-semibold text-slate-800'}`}>{value}</span>
    </div>
  )
}

function DocFooter({ code, note }: { code: string; note: string }) {
  return (
    <div className="mt-8 border-t border-slate-200 pt-3 text-center text-[10px] text-slate-400">
      <p className="font-medium text-slate-500">Terima kasih atas kepercayaan Anda — kami menantikan kesempatan bekerja sama.</p>
      <p className="mt-1">{note}</p>
      <p className="mt-1.5 tabular-nums">
        Dicetak pada {formatDate(new Date().toISOString(), true)} · {code} · Grupa Kreasi CRM
      </p>
    </div>
  )
}

/* ---------------- Quotation (Penawaran) ---------------- */

export function QuotationPrintBody({ q }: { q: QuotationDetailDTO }) {
  const accent = q.brandColor || '#0f172a'
  return (
    <div className="text-slate-900">
      <DocHeader
        brandName={q.brandName}
        brandColor={accent}
        brandLogoSquare={q.brandLogoSquare}
        brandLogoWide={q.brandLogoWide}
        docLabel="Penawaran"
        docLabelEn="Quotation"
        code={q.code}
        statusLabel={QUO_STATUS_LABEL[q.status] ?? q.status}
        dateLabel={`Tanggal / Date: ${formatDate(q.createdAt)}`}
      />

      {/* Penerima + ringkasan */}
      <div className="mt-5 grid grid-cols-2 gap-6">
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Kepada / To</p>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-sm font-bold tracking-tight text-slate-900">{q.companyName}</p>
            <div className="mt-1.5 space-y-0.5">
              <InfoRow label="Perihal" labelEn="Subject" value={q.title} />
              <InfoRow label="Opportunity" value={q.opportunityCode} />
              <InfoRow label="Masa Berlaku" labelEn="Valid Until" value={q.validUntil ? formatDate(q.validUntil) : '—'} />
            </div>
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Ringkasan / Summary</p>
          <div className="rounded-lg border border-slate-200 p-3">
            <InfoRow label="Status" value={q.status} />
            <InfoRow label="Versi" labelEn="Version" value={`v${q.version}`} />
            <InfoRow label="Mata Uang" labelEn="Currency" value={q.currency} />
            <InfoRow label="Jumlah Item" labelEn="Items" value={String(q.items.length)} />
          </div>
        </div>
      </div>

      {/* Item — header gelap monokrom (kontras aman saat cetak B/W), grid border-slate-300, angka tabular */}
      <table className="mt-5 w-full border-collapse text-[12px]">
        <thead>
          <tr className="bg-slate-900">
            <th className="border border-slate-300 px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-white">No</th>
            <th className="border border-slate-300 px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-white">Deskripsi / Description</th>
            <th className="border border-slate-300 px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-white">Qty</th>
            <th className="border border-slate-300 px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-white">Harga / Price</th>
            <th className="border border-slate-300 px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-white">Jumlah / Amount</th>
          </tr>
        </thead>
        <tbody>
          {q.items.map((it, i) => (
            <tr key={it.id ?? i} className={i % 2 ? 'bg-slate-50' : 'bg-white'}>
              <td className="border border-slate-300 px-3 py-2 tabular-nums text-slate-500">{i + 1}</td>
              <td className="border border-slate-300 px-3 py-2 font-medium text-slate-800">{it.description}</td>
              <td className="border border-slate-300 px-3 py-2 text-right tabular-nums text-slate-600">{it.qty}</td>
              <td className="border border-slate-300 px-3 py-2 text-right tabular-nums text-slate-600">{formatMoney(it.unitPrice, q.currency)}</td>
              <td className="border border-slate-300 px-3 py-2 text-right font-semibold tabular-nums text-slate-800">{formatMoney(it.lineTotal, q.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="mt-4 ml-auto w-[62%] rounded-lg border border-slate-200">
        <TotalsRow label="Subtotal" value={formatMoney(q.subtotal, q.currency)} />
        {q.discountPct > 0 && (
          <TotalsRow label={`Diskon / Discount (${q.discountPct}%)`} value={`- ${formatMoney(q.discountAmount, q.currency)}`} />
        )}
        <TotalsRow label={`PPN / VAT (${q.taxPct}%)`} value={formatMoney(q.taxAmount, q.currency)} />
        <div className="rounded-b-lg" style={{ backgroundColor: `${accent}14` }}>
          <TotalsRow label="Total" value={formatMoney(q.total, q.currency)} strong />
        </div>
      </div>

      {/* Catatan */}
      {q.notes && (
        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Catatan / Notes</p>
          <p className="mt-1 whitespace-pre-wrap text-[11.5px] text-slate-700">{q.notes}</p>
        </div>
      )}

      {/* Tanda tangan */}
      <div className="mt-8 flex justify-end">
        <div className="text-center">
          <p className="text-[11px] text-slate-500">Hormat kami / Best regards,</p>
          <div className="mt-10 w-44 border-t border-slate-300 pt-1.5">
            <p className="text-[11.5px] font-semibold text-slate-800">{q.createdByName ?? brandFallback(q.brandName)}</p>
            <p className="text-[10px] text-slate-400">{q.brandName}</p>
          </div>
        </div>
      </div>

      <DocFooter
        code={q.code}
        note="Penawaran ini berlaku hingga tanggal valid until di atas. Harga sudah/belum termasuk PPN sesuai rincian."
      />
    </div>
  )
}

function brandFallback(brandName: string) {
  return `Tim ${brandName}`
}

/* ---------------- Invoice (Faktur) ---------------- */

export function InvoicePrintBody({ inv }: { inv: InvoiceDTO }) {
  const accent = inv.brandColor || '#0f172a'
  const remaining = inv.total - inv.paidAmount
  return (
    <div className="text-slate-900">
      <DocHeader
        brandName={inv.brandName}
        brandColor={accent}
        brandLogoSquare={inv.brandLogoSquare}
        brandLogoWide={inv.brandLogoWide}
        docLabel="Faktur"
        docLabelEn="Invoice"
        code={inv.code}
        statusLabel={INV_STATUS_LABEL[inv.status] ?? inv.status}
        dateLabel={`Tanggal / Date: ${formatDate(inv.issuedAt)}`}
      />

      <div className="mt-5 grid grid-cols-2 gap-6">
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Ditagihkan kepada / Bill To</p>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-sm font-bold tracking-tight text-slate-900">{inv.companyName}</p>
            <div className="mt-1.5 space-y-0.5">
              <InfoRow label="Perihal" labelEn="Subject" value={inv.title} />
              <InfoRow label="Opportunity" value={inv.opportunityCode} />
              {inv.projectCode && <InfoRow label="Proyek" labelEn="Project" value={inv.projectCode} />}
              <InfoRow label="Jatuh Tempo" labelEn="Due Date" value={inv.dueDate ? formatDate(inv.dueDate) : '—'} />
            </div>
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Status Pembayaran / Payment Status</p>
          <div className="rounded-lg border border-slate-200 p-3">
            <InfoRow label="Status" value={inv.status} />
            <InfoRow label="Terbayar" labelEn="Paid" value={formatMoney(inv.paidAmount, inv.currency)} />
            <InfoRow label="Sisa" labelEn="Remaining" value={formatMoney(remaining, inv.currency)} />
            <InfoRow label="Mata Uang" labelEn="Currency" value={inv.currency} />
          </div>
        </div>
      </div>

      {/* Item tunggal (invoice = 1 nilai) — header gelap monokrom, grid border-slate-300, angka tabular */}
      <table className="mt-5 w-full border-collapse text-[12px]">
        <thead>
          <tr className="bg-slate-900">
            <th className="border border-slate-300 px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-white">No</th>
            <th className="border border-slate-300 px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-white">Deskripsi / Description</th>
            <th className="border border-slate-300 px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-white">Jumlah / Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-slate-300 px-3 py-2 tabular-nums text-slate-500">1</td>
            <td className="border border-slate-300 px-3 py-2 font-medium text-slate-800">
              {inv.title}
              {inv.taxPct > 0 && <span className="ml-1.5 text-[10px] text-slate-400">(sebelum PPN {inv.taxPct}%)</span>}
            </td>
            <td className="border border-slate-300 px-3 py-2 text-right font-semibold tabular-nums text-slate-800">{formatMoney(inv.amount, inv.currency)}</td>
          </tr>
          {inv.taxPct > 0 && (
            <tr className="bg-slate-50">
              <td className="border border-slate-300 px-3 py-2" />
              <td className="border border-slate-300 px-3 py-2 text-slate-600">PPN / VAT {inv.taxPct}%</td>
              <td className="border border-slate-300 px-3 py-2 text-right font-semibold tabular-nums text-slate-800">{formatMoney(inv.total - inv.amount, inv.currency)}</td>
            </tr>
          )}
          <tr className="border-t-[3px] border-double border-slate-900" style={{ backgroundColor: `${accent}14` }}>
            <td className="px-3 py-2" />
            <td className="px-3 py-2 text-[13px] font-bold text-slate-900">Total / Total</td>
            <td className="px-3 py-2 text-right text-[13px] font-bold tabular-nums text-slate-900">{formatMoney(inv.total, inv.currency)}</td>
          </tr>
        </tbody>
      </table>

      {/* Riwayat pembayaran */}
      {inv.payments.length > 0 && (
        <div className="mt-5">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Riwayat Pembayaran / Payment History</p>
          <table className="w-full border-collapse text-[11.5px]">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-600">Tanggal / Date</th>
                <th className="border border-slate-300 px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-600">Metode / Method</th>
                <th className="border border-slate-300 px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-600">Referensi / Reference</th>
                <th className="border border-slate-300 px-3 py-1.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-600">Jumlah / Amount</th>
              </tr>
            </thead>
            <tbody>
              {inv.payments.map((p, i) => (
                <tr key={p.id} className={i % 2 ? 'bg-slate-50' : 'bg-white'}>
                  <td className="border border-slate-300 px-3 py-1.5 tabular-nums text-slate-600">{formatDate(p.paidAt)}</td>
                  <td className="border border-slate-300 px-3 py-1.5 text-slate-600">{p.method}</td>
                  <td className="border border-slate-300 px-3 py-1.5 text-slate-500">{p.reference || '—'}</td>
                  <td className="border border-slate-300 px-3 py-1.5 text-right font-semibold tabular-nums text-emerald-700">{formatMoney(p.amount, inv.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Rekening + catatan */}
      <div className="mt-5 grid grid-cols-2 gap-6">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Pembayaran / Payment</p>
          <p className="mt-1 text-[11.5px] text-slate-700">Transfer ke rekening {inv.brandName}.</p>
          <p className="text-[11px] text-slate-500">Cantumkan {inv.code} pada berita transfer agar pembayaran terverifikasi lebih cepat.</p>
        </div>
        {inv.notes && (
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Catatan / Notes</p>
            <p className="mt-1 whitespace-pre-wrap text-[11.5px] text-slate-700">{inv.notes}</p>
          </div>
        )}
      </div>

      <DocFooter
        code={inv.code}
        note="Faktur ini sah tanpa tanda tangan basah. Mohon segera lakukan pembayaran sesuai jatuh tempo untuk menghindari keterlambatan."
      />
    </div>
  )
}
