"use client";

import { CalendarDays, FileText, ListChecks, Link2, Target, Users } from "lucide-react";
import type { BriefDTO, QuotationDTO } from "@/lib/crm-types";
import { fmtDocDate, fmtDocRupiah } from "@/components/brand-document";

/**
 * Isi dokumen SURAT PENAWARAN — tabel item + subtotal/diskon/PPN/total.
 * Dipakai di dalam BrandDocDialog (finance, inbox).
 */
export function QuotationDocContent({ q }: { q: QuotationDTO }) {
  const afterDiscount = Math.round(q.subtotal * (1 - q.discountPct / 100));
  const ppn = Math.round(afterDiscount * (q.ppnPct / 100));
  return (
    <div className="space-y-5 text-sm">
      <p className="leading-relaxed text-slate-700">
        Berdasarkan percakapan dan kebutuhan yang Anda sampaikan, dengan hormat kami sampaikan{" "}
        <span className="font-semibold">penawaran harga</span> untuk pekerjaan <span className="font-semibold">“{q.title}”</span>
        {q.lead?.subject ? ` (terkait permintaan: ${q.lead.subject})` : ""} sebagai berikut:
      </p>

      {/* Tabel item */}
      <table className="w-full border-collapse text-xs sm:text-sm">
        <thead>
          <tr className="bg-slate-100 text-left">
            <th className="w-8 border border-slate-200 px-2 py-2 font-semibold">No</th>
            <th className="border border-slate-200 px-2 py-2 font-semibold">Uraian Pekerjaan</th>
            <th className="w-14 border border-slate-200 px-2 py-2 text-center font-semibold">Qty</th>
            <th className="w-32 border border-slate-200 px-2 py-2 text-right font-semibold">Harga</th>
            <th className="w-36 border border-slate-200 px-2 py-2 text-right font-semibold">Jumlah</th>
          </tr>
        </thead>
        <tbody>
          {q.items.map((it, i) => (
            <tr key={`${i}-${it.desc}`} className="align-top">
              <td className="border border-slate-200 px-2 py-2 text-center text-slate-500">{i + 1}</td>
              <td className="border border-slate-200 px-2 py-2">{it.desc}</td>
              <td className="border border-slate-200 px-2 py-2 text-center tabular-nums">{it.qty}</td>
              <td className="border border-slate-200 px-2 py-2 text-right tabular-nums">{fmtDocRupiah(it.price)}</td>
              <td className="border border-slate-200 px-2 py-2 text-right tabular-nums">{fmtDocRupiah(it.qty * it.price)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Total */}
      <div className="flex justify-end">
        <div className="w-full max-w-xs space-y-1 text-xs sm:text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600">Subtotal</span>
            <span className="font-medium tabular-nums">{fmtDocRupiah(q.subtotal)}</span>
          </div>
          {q.discountPct > 0 && (
            <div className="flex justify-between">
              <span className="text-slate-600">Diskon {q.discountPct}%</span>
              <span className="font-medium tabular-nums text-rose-600">-{fmtDocRupiah(q.subtotal - afterDiscount)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-slate-600">PPN {q.ppnPct}%</span>
            <span className="font-medium tabular-nums">{fmtDocRupiah(ppn)}</span>
          </div>
          <div className="flex justify-between border-t-2 border-slate-800 pt-1.5 text-sm font-black sm:text-base">
            <span>TOTAL</span>
            <span className="tabular-nums">{fmtDocRupiah(q.grandTotal)}</span>
          </div>
        </div>
      </div>

      {q.notes && (
        <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
          <p className="font-bold uppercase tracking-wide text-slate-700">Catatan</p>
          <p className="mt-1 whitespace-pre-wrap">{q.notes}</p>
        </div>
      )}

      <p className="text-xs leading-relaxed text-slate-500">
        Penawaran ini berlaku 30 hari kalender sejak tanggal dokumen. Demikian kami sampaikan; atas perhatian dan
        kepercayaan Anda, kami ucapkan terima kasih.
      </p>
    </div>
  );
}

/**
 * Isi dokumen BRIEF PROYEK — tujuan, audiens, deliverables, referensi, deadline,
 * dan estimasi pengerjaan dari tim produksi (bila sudah ada).
 * Dipakai di dalam BrandDocDialog (brief-view, inbox).
 */
export function BriefDocContent({ b }: { b: BriefDTO }) {
  const deliverableLines = b.deliverables.split("\n").map((s) => s.trim()).filter(Boolean);
  const est = b.estimates?.[0] ?? null;
  return (
    <div className="space-y-5 text-sm">
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <FileText className="size-3.5 shrink-0" /> Permintaan {b.lead?.code ?? "—"} · {b.lead?.subject ?? b.title}
        </span>
        <span className="flex items-center gap-1.5">
          <CalendarDays className="size-3.5 shrink-0" /> Deadline: {fmtDocDate(b.deadline)}
        </span>
      </div>

      <section>
        <h3 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-slate-800">
          <Target className="size-4 shrink-0" /> Latar &amp; Tujuan
        </h3>
        <p className="mt-1.5 whitespace-pre-wrap leading-relaxed text-slate-700">{b.objective || "—"}</p>
      </section>

      {b.audience && (
        <section>
          <h3 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-slate-800">
            <Users className="size-4 shrink-0" /> Target Audiens
          </h3>
          <p className="mt-1.5 whitespace-pre-wrap leading-relaxed text-slate-700">{b.audience}</p>
        </section>
      )}

      {deliverableLines.length > 0 && (
        <section>
          <h3 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-slate-800">
            <ListChecks className="size-4 shrink-0" /> Deliverables
          </h3>
          <ul className="mt-1.5 space-y-1">
            {deliverableLines.map((d) => (
              <li key={d} className="flex items-start gap-2 text-slate-700">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-slate-400" aria-hidden />
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {b.references && (
        <section>
          <h3 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-slate-800">
            <Link2 className="size-4 shrink-0" /> Referensi
          </h3>
          <p className="mt-1.5 break-words text-slate-700">{b.references}</p>
        </section>
      )}

      {est && est.items.length > 0 && (
        <section>
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800">Estimasi Pengerjaan (Tim Produksi)</h3>
          <table className="mt-2 w-full border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-100 text-left">
                <th className="border border-slate-200 px-2 py-2 font-semibold">Pekerjaan</th>
                <th className="w-24 border border-slate-200 px-2 py-2 text-center font-semibold">Vol</th>
                <th className="w-20 border border-slate-200 px-2 py-2 text-center font-semibold">Jam</th>
                <th className="w-32 border border-slate-200 px-2 py-2 text-right font-semibold">Biaya</th>
              </tr>
            </thead>
            <tbody>
              {est.items.map((it, i) => (
                <tr key={`${i}-${it.task}`}>
                  <td className="border border-slate-200 px-2 py-2">{it.task}</td>
                  <td className="border border-slate-200 px-2 py-2 text-center tabular-nums">
                    {it.qty} {it.unit}
                  </td>
                  <td className="border border-slate-200 px-2 py-2 text-center tabular-nums">{it.hours}</td>
                  <td className="border border-slate-200 px-2 py-2 text-right tabular-nums">{fmtDocRupiah(it.qty * it.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1.5 text-right text-xs font-semibold text-slate-700 tabular-nums">
            Total: {est.totalHours} jam · {fmtDocRupiah(est.totalCost)}
          </p>
        </section>
      )}
    </div>
  );
}
