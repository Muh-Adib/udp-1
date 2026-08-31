# Task ID: 11-b — full-stack-developer — Portal UI decisions + comment threads

## Scope
Only modified: `src/components/crm/portal-view.tsx` + `src/components/crm/quotations-view.tsx`.
Did NOT touch: api-client.ts, crm-types.ts, page.tsx, shared.tsx, other views, schema/seed.

## Changes — portal-view.tsx
- Decision actions on Penawaran cards (status SENT): "Setujui Penawaran" (emerald solid) + "Tolak" (rose outline).
  - Approve → AlertDialog "Setujui penawaran ini?" (code + formatMoney total + teks tim {brandName}); Batal / "Ya, Setujui" (emerald). AlertDialogAction pakai e.preventDefault() agar dialog tidak auto-close saat await.
  - Reject → Dialog dengan Textarea opsional placeholder "Alasan penolakan (opsional)…" + Batal / "Kirim Penolakan" (rose).
  - `handleDecision`: portalApi.decide(id, { decision, note }) → toast success (res.message) → `await load()` (mekanisme refresh existing; summary/KPI ikut ter-update). Error → toast destructive. State `deciding` men-disable semua tombol keputusan + Loader2 animate-spin.
  - Card non-SENT dengan decidedAt → info line kecil "Diputuskan {formatDate(decidedAt)}".
- Comment threads ("Diskusi"): chip ghost MessageSquare + badge count untuk SEMUA kartu (Quotation, Invoice, Project) via komponen lokal `DiskusiChip`.
  - Count di-fetch paralel (Promise.all portalApi.comments per dokumen) setiap kali data portal berubah; gagal → 0 (graceful bila backend 11-a belum live).
  - `CommentThreadDialog({ entityType, entityId, title, open, onOpenChange, onCountChange })` — satu instance di root view. max-h-[70vh] w-full max-w-lg p-0 flex-col; list pesan flex-1 overflow-y-auto + SCROLLBAR, auto-scroll ke bawah; skeleton saat load; empty state "Belum ada diskusi".
  - Bubble (`CommentBubble`): client kanan bg-slate-900 text-white; staff kiri bg-white border slate-200; nama + ROLE_LABEL (CLIENT→Client, MARKETING→Marketing, DIREKTUR→Direktur, KEUANGAN→Keuangan, PRODUKSI→Produksi, SUPER_ADMIN→Admin) + body whitespace-pre-wrap + formatDate(createdAt, true).
  - Input: Textarea auto-height (min-h-[2.5rem] max-h-24) + tombol Send icon slate-900 h-10; disabled saat kosong/over limit/sending; counter tampil >1800 char (merah >2000); Ctrl/Cmd+Enter kirim; toast subtle "Pesan terkirim"; onCountChange menaikkan badge chip.

## Changes — quotations-view.tsx
- Komponen lokal `DiscussionSection` + `CommentBubble` (client kanan TEAL bg-teal-600 agar staff mudah membedakan; staff kiri putih border).
- Sisipan di dialog detail penawaran yang SUDAH ADA: `{detail && <DiscussionSection quotationId={detail.id} />}` — di antara konten detail dan action bar. Tidak ada refactor lain.
- Header "Diskusi Client" + icon tile + badge "{n} pesan"; list max-h-64 scroll + SCROLLBAR; load saat dialog terbuka (portalApi.comments('QUOTATION', id)); error → toast destructive + list kosong.
- Staff reply: Textarea + tombol "Kirim" slate-900 via portalApi.addComment — identitas user di-set server dari session (store user tidak dikirim).
- Tambah: import portalApi, PortalCommentDTO, MessageSquare; konstanta ROLE_LABEL/MAX_COMMENT_LEN (duplikasi sadar — helper tidak boleh diexport lintas file sesuai constraint).

## Verification
- `bunx tsc --noEmit` → 0 error di src/ (sisa hanya examples/ & skills/ bawaan template); `bun run lint` exit 0.
- Browser test (agent-browser):
  1. Login Daniel Oei (Client) → portal → tab Penawaran: QUO-2026-0001 (Terkirim) menampilkan Setujui Penawaran/Tolak; QUO-2026-0002 (Disetujui) menampilkan "Diputuskan 31 Agu 2026" tanpa tombol.
  2. Diskusi dialog terbuka; posting "Mohon info timeline pengerjaan" → bubble kanan slate-900 (VLM-verified) + toast; chip badge naik.
  3. Setujui → AlertDialog (code + Rp285.936.000 + teks brand) → "Ya, Setujui" → badge card jadi "Disetujui", tombol keputusan hilang, "Diputuskan 29 Agu 2026" muncul; KPI "Penawaran Menunggu Keputusan" 1 → 0.
  4. Logout → login Dewi Lestari (Marketing) → Quotations → detail QUO-2026-0001 → "Diskusi Client" (2 pesan) menampilkan komentar client (bubble teal kanan, VLM-verified); posting "Baik, timeline kami kirim besok" → muncul kiri putih "Dewi Lestari · Marketing".
  5. `agent-browser errors` bersih; console hanya Fast Refresh.
- Catatan: route keputusan 11-a otomatis menambah komentar client "Penawaran ini kami setujui." saat ACCEPTED → count 2 (perilaku backend, bukan bug UI).

## Cleanup (one-off `bun -e` Prisma, seed.ts tidak diubah)
- Quotation QUO-2026-0001 → status 'SENT', decidedAt null.
- Delete PortalComment (3 rows test pada quotation tsb, createdAt >= test window) → sisa 0.
- Delete AuditLog action IN ('PORTAL_QUOTATION_DECISION','PORTAL_COMMENT_ADDED') dalam test window → sisa 0.
- Verifikasi ulang UI: portal kembali "Terkirim" + tombol keputusan tampil + KPI 1 + chip 0 pesan.
