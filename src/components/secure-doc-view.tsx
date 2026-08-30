"use client";

import { useState } from "react";
import {
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Lock,
  LockKeyhole,
  Printer,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { BrandDocument, fmtDocDate } from "@/components/brand-document";
import { BriefDocContent, QuotationDocContent } from "@/components/doc-content";
import type { SecureAccessResult } from "@/lib/crm-types";

/**
 * Halaman publik tautan aman (/s/<token>) — klien membuka dokumen TANPA login:
 * masukkan password → pratinjau dokumen ter-brand (sama seperti pratinjau internal),
 * bisa dicetak jadi PDF atau diunduh (untuk file produksi).
 */
export default function SecureDocView({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doc, setDoc] = useState<SecureAccessResult | null>(null);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.secureAccess(token, password.trim());
      setDoc(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuka dokumen");
    } finally {
      setBusy(false);
    }
  }

  // ---------- SUKSES: pratinjau dokumen ----------
  if (doc) {
    return (
      <div className="min-h-screen bg-slate-100 px-4 py-6 sm:py-10">
        {/* Toolbar — tidak ikut tercetak */}
        <div className="no-print mx-auto mb-4 flex w-full max-w-[800px] flex-col gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-white sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
              <ShieldCheck className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{doc.docLabel} · {doc.docNumber}</p>
              <p className="truncate text-[11px] text-slate-400">
                Tautan aman terverifikasi · Dibuka {fmtDocDate(doc.dateIso)}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {doc.deliverable?.type === "FILE" && doc.deliverable.downloadUrl && (
              <Button size="sm" variant="secondary" asChild>
                <a href={doc.deliverable.downloadUrl} aria-label={`Unduh file ${doc.deliverable.name}`}>
                  <Download className="size-3.5" aria-hidden /> Unduh File
                </a>
              </Button>
            )}
            {doc.deliverable?.type === "LINK" && doc.deliverable.externalUrl && (
              <Button size="sm" variant="secondary" asChild>
                <a href={doc.deliverable.externalUrl} target="_blank" rel="noopener noreferrer" aria-label={`Buka tautan ${doc.deliverable.name}`}>
                  <ExternalLink className="size-3.5" aria-hidden /> Buka Tautan
                </a>
              </Button>
            )}
            <Button size="sm" onClick={() => window.print()} className="gap-1.5">
              <Printer className="size-3.5" aria-hidden /> Cetak / Simpan PDF
            </Button>
          </div>
        </div>

        <div className="py-1">
          <BrandDocument
            brand={doc.brand}
            docLabel={doc.docLabel}
            docNumber={doc.docNumber}
            dateIso={doc.dateIso}
            toName={doc.toName}
            toCompany={doc.toCompany}
            showBankInfo={doc.showBankInfo}
            signatureName={doc.senderName}
          >
            {doc.kind === "QUOTATION" && doc.quotation && <QuotationDocContent q={doc.quotation} />}
            {doc.kind === "BRIEF" && doc.brief && <BriefDocContent b={doc.brief} />}
            {doc.kind === "DELIVERABLE" && doc.deliverable && (
              <div className="space-y-5 text-sm">
                <div className="flex items-start gap-3 rounded-xl bg-slate-50 px-4 py-3.5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
                    <FileText className="size-5 text-slate-600" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 break-words">{doc.deliverable.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {doc.deliverable.type === "FILE"
                        ? `File${doc.deliverable.sizeLabel ? ` · ${doc.deliverable.sizeLabel}` : ""}${doc.deliverable.fileName ? ` · ${doc.deliverable.fileName}` : ""}`
                        : "Tautan eksternal (mis. Google Drive)"}
                    </p>
                  </div>
                </div>
                {doc.deliverable.note && (
                  <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
                    <p className="font-bold uppercase tracking-wide text-slate-700">Catatan</p>
                    <p className="mt-1 whitespace-pre-wrap">{doc.deliverable.note}</p>
                  </div>
                )}
                <p className="text-xs leading-relaxed text-slate-500">
                  {doc.deliverable.type === "FILE"
                    ? "Gunakan tombol “Unduh File” di bagian atas untuk mengunduh dokumen ini."
                    : "Gunakan tombol “Buka Tautan” di bagian atas untuk membuka dokumen di layanan eksternal."}
                </p>
              </div>
            )}
          </BrandDocument>
        </div>

        <p className="no-print mx-auto mt-4 max-w-[800px] text-center text-[11px] text-slate-500">
          Dokumen ini dibagikan melalui tautan aman berpassword oleh tim pengirim. Mohon tidak meneruskan tautan ini
          ke pihak yang tidak berkepentingan.
        </p>
      </div>
    );
  }

  // ---------- FORM PASSWORD ----------
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
          <div className="flex flex-col items-center text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-slate-900 text-white">
              <LockKeyhole className="size-7" aria-hidden />
            </span>
            <h1 className="mt-4 text-lg font-black tracking-tight text-slate-900">Dokumen Terproteksi</h1>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">
              Dokumen ini dikirim melalui tautan aman. Masukkan password dari pengirim untuk membukanya.
            </p>
          </div>

          <form onSubmit={unlock} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="secure-password" className="text-sm font-medium text-slate-700">
                Password dokumen
              </label>
              <Input
                id="secure-password"
                type="text"
                autoComplete="off"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mis. K7PM-XR2T"
                aria-invalid={!!error}
                aria-describedby={error ? "secure-error" : undefined}
                className={error ? "border-rose-400 focus-visible:ring-rose-300" : ""}
              />
            </div>

            {error && (
              <p id="secure-error" role="alert" className="flex items-start gap-1.5 rounded-xl bg-rose-50 px-3 py-2.5 text-xs leading-relaxed text-rose-700">
                <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {error}
              </p>
            )}

            <Button type="submit" disabled={busy || !password.trim()} className="w-full gap-2">
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ShieldCheck className="size-4" aria-hidden />}
              {busy ? "Memverifikasi…" : "Buka Dokumen"}
            </Button>
          </form>

          <p className="mt-5 border-t pt-4 text-center text-[11px] leading-relaxed text-slate-400">
            Tidak punya password? Hubungi tim pengirim melalui kanal tempat Anda dihubungi (WhatsApp / Instagram /
            Email) untuk meminta kredensial dokumen.
          </p>
        </div>
      </div>
    </div>
  );
}
