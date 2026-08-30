"use client";

import { useEffect, useState } from "react";
import { Loader2, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { BRAND_LABEL, type BrandProfileDTO } from "@/lib/crm-types";

const rpFmt = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" });

/** Format Rupiah utk isi dokumen. */
export function fmtDocRupiah(n: number): string {
  return rpFmt.format(n);
}

/** Format tanggal panjang id-ID utk kop dokumen. */
export function fmtDocDate(iso?: string | null): string {
  return iso ? dateFmt.format(new Date(iso)) : "—";
}

function Monogram({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="flex size-14 shrink-0 items-center justify-center rounded-xl text-xl font-black text-white"
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/**
 * Lembar dokumen A4 dengan kop surat brand (logo, nama, alamat, warna identitas).
 * Dipakai di dalam BrandDocDialog; saat dicetak, CSS @media print menyembunyikan
 * seluruh halaman dan hanya menampilkan lembar ini (class `brand-doc`).
 */
export function BrandDocument({
  brand,
  docLabel,
  docNumber,
  dateIso,
  toName,
  toCompany,
  showBankInfo = false,
  signatureName,
  children,
}: {
  brand: BrandProfileDTO;
  docLabel: string;
  docNumber: string;
  dateIso: string;
  toName?: string | null;
  toCompany?: string | null;
  showBankInfo?: boolean;
  signatureName?: string | null;
  children: React.ReactNode;
}) {
  const c = brand.primaryColor || "#059669";
  const contactLines = [brand.address, [brand.phone, brand.email].filter(Boolean).join(" · "), brand.website].filter(Boolean);
  return (
    <div
      className="brand-doc mx-auto flex w-full max-w-[800px] flex-col rounded-2xl bg-white p-6 text-slate-900 shadow-2xl sm:p-10"
      style={{ minHeight: "1000px" }}
    >
      {/* ===== KOP SURAT ===== */}
      <header>
        <div className="flex items-center gap-4">
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoUrl} alt={`Logo ${brand.name}`} className="h-14 w-14 shrink-0 rounded-xl object-contain sm:h-16 sm:w-16" />
          ) : (
            <Monogram name={brand.name} color={c} />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xl font-black tracking-tight sm:text-2xl" style={{ color: c }}>
              {brand.name}
            </p>
            {brand.tagline && <p className="truncate text-xs font-medium uppercase tracking-widest text-slate-500">{brand.tagline}</p>}
          </div>
          <div className="hidden shrink-0 text-right text-[10px] leading-relaxed text-slate-500 sm:block">
            {contactLines.map((l) => (
              <p key={l}>{l}</p>
            ))}
          </div>
        </div>
        <div className="mt-2 text-[10px] leading-relaxed text-slate-500 sm:hidden">
          {contactLines.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
        {brand.letterheadNote && (
          <p className="mt-1.5 text-center text-[10px] italic text-slate-500">{brand.letterheadNote}</p>
        )}
        <div className="mt-2 h-1.5 rounded-full" style={{ backgroundColor: c }} aria-hidden />
      </header>

      {/* ===== JUDUL DOKUMEN ===== */}
      <div className="mt-7 text-center">
        <h2 className="text-lg font-black uppercase tracking-[0.2em] sm:text-xl">{docLabel}</h2>
        <p className="mt-1 text-xs font-semibold tracking-wide text-slate-600">
          {docNumber} · {fmtDocDate(dateIso)}
        </p>
      </div>

      {/* ===== TUJUAN ===== */}
      {(toName || toCompany) && (
        <div className="mt-6 text-sm">
          <p className="font-semibold">Kepada Yth.</p>
          <p className="font-bold">{toCompany || toName}</p>
          {toCompany && toName && <p className="text-slate-600">u.p. {toName}</p>}
        </div>
      )}

      {/* ===== ISI (dari pemanggil) ===== */}
      <div className="mt-5 flex-1">{children}</div>

      {/* ===== BANK (opsional — penawaran/invoice) ===== */}
      {showBankInfo && brand.bankInfo && (
        <div className="mt-6 rounded-xl border px-4 py-3 text-xs" style={{ borderColor: c, backgroundColor: `${c}0D` }}>
          <p className="font-bold uppercase tracking-wide" style={{ color: c }}>
            Pembayaran
          </p>
          <p className="mt-0.5 text-slate-700">{brand.bankInfo}</p>
        </div>
      )}

      {/* ===== TANDA TANGAN ===== */}
      <div className="mt-8 flex justify-end">
        <div className="text-center text-xs">
          <p className="text-slate-600">Hormat kami,</p>
          <p className="mt-0.5 font-bold" style={{ color: c }}>
            {brand.name}
          </p>
          <div className="mt-12 w-48 border-t border-slate-300 pt-1.5">
            <p className="font-semibold text-slate-800">{signatureName || "Tim " + brand.name}</p>
          </div>
        </div>
      </div>

      {/* ===== FOOTER ===== */}
      <footer className="mt-8 border-t pt-3 text-center text-[10px] text-slate-400">
        <p>{brand.footerNote || brand.name}</p>
        <p>
          {[brand.address, brand.phone, brand.email].filter(Boolean).join(" · ")}
        </p>
      </footer>
    </div>
  );
}

/**
 * Dialog pratinjau dokumen brand + tombol "Cetak / Simpan PDF" (window.print).
 * Brand diambil otomatis dari `brandKey` (cache selama dialog terpasang).
 */
export function BrandDocDialog({
  open,
  onOpenChange,
  brandKey,
  docLabel,
  docNumber,
  dateIso,
  toName,
  toCompany,
  showBankInfo = false,
  signatureName,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  brandKey: string; // unimasi | segia | erfo | unicam
  docLabel: string;
  docNumber: string;
  dateIso: string;
  toName?: string | null;
  toCompany?: string | null;
  showBankInfo?: boolean;
  signatureName?: string | null;
  children: React.ReactNode;
}) {
  const [brand, setBrand] = useState<BrandProfileDTO | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFailed(false);
    let alive = true;
    api
      .brands()
      .then((r) => {
        if (!alive) return;
        const found = r.brands.find((b) => b.brand === brandKey) ?? null;
        setBrand(found);
        if (!found) setFailed(true);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [open, brandKey]);

  useEffect(() => {
    if (!open) document.body.style.overflow = "";
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={`Pratinjau dokumen ${docLabel}`}>
      {/* Toolbar (tidak ikut tercetak) */}
      <div className="no-print sticky top-0 z-10 mx-auto flex w-full max-w-[800px] items-center justify-between gap-2 rounded-b-2xl bg-slate-900/95 px-4 py-2.5 text-white backdrop-blur">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">
            {docLabel} · {docNumber}
          </p>
          <p className="truncate text-[10px] text-slate-400">Brand: {BRAND_LABEL[brandKey] ?? brandKey}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" onClick={() => window.print()} className="gap-1.5">
            <Printer className="size-3.5" /> Cetak / Simpan PDF
          </Button>
          <Button size="icon" variant="ghost" aria-label="Tutup dokumen" className="text-slate-300 hover:bg-white/10 hover:text-white" onClick={() => onOpenChange(false)}>
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {failed ? (
        <p className="no-print mx-auto mt-10 max-w-md rounded-2xl bg-white p-5 text-center text-sm text-slate-600">
          Gagal memuat identitas brand. Tutup dialog lalu coba lagi.
        </p>
      ) : !brand ? (
        <div className="no-print flex items-center justify-center gap-2 py-20 text-sm text-white">
          <Loader2 className="size-4 animate-spin" /> Menyiapkan dokumen…
        </div>
      ) : (
        <div className="py-4">
          <BrandDocument
            brand={brand}
            docLabel={docLabel}
            docNumber={docNumber}
            dateIso={dateIso}
            toName={toName}
            toCompany={toCompany}
            showBankInfo={showBankInfo}
            signatureName={signatureName}
          >
            {children}
          </BrandDocument>
        </div>
      )}
    </div>
  );
}
