# Worklog — Grupa Kreasi CRM

## Konteks Proyek
- CRM multi-brand: Unimasi / Segia Tech / Erfo Multimedia / Unicam Studio
- Next.js 16 App Router + TypeScript + Prisma (SQLite) + Tailwind 4 + shadcn/ui (New York)
- UI bahasa Indonesia, warna slate (tanpa indigo/biru), rounded-xl/2xl
- Dev server: `bun run dev` (port 3000, log di dev.log). JANGAN jalankan build. Jangan jalankan dev duplikat.
- Seed ulang bila perlu: `bun run db:seed` (user: owner@grupakreasi.id/owner123, manager@/manager123, marketing@/marketing123, finance@/finance123, klien@majubersama.co.id/klien123)

## Status Arsitektur (fokus fitur: Pengaturan Kanal)
- SEMUA halaman = satu route `/` (SPA view-switching di AppShell). Tidak boleh membuat route halaman lain.
- API route tersedia: /api/auth/*, /api/leads*, /api/channels*, /api/webhooks/{whatsapp,email,instagram,web-form}, /api/dashboard, /api/notifications, /api/contacts, /api/settings
- Kontrak frontend: src/lib/crm-types.ts + src/lib/api-client.ts
- Prisma models: User, Company, Contact, Lead, LeadMessage, ChannelConfig, Notification, AuditLog, AppSetting

---
Task ID: 1
Agent: main (orchestrator)
Task: Rebuild proyek dari nol (sandbox reset) + fondasi fitur Pengaturan Kanal

Work Log:
- Scaffold ulang: package.json, next.config.ts, tsconfig, postcss, eslint, globals.css (Tailwind 4 + tema slate)
- Komponen shadcn/ui dibuat manual: button, badge, card, input, label, textarea, select, dialog, switch, tabs, separator, dropdown-menu, avatar, table, sonner
- Prisma schema lengkap + db push + seed (7 user, 2 company, 5 kontak, 5 lead + pesan, 4 ChannelConfig, notifikasi, audit)
- Lib inti: db.ts, auth.ts (session HMAC cookie + scrypt), crm-types.ts, api-client.ts, audit.ts, channels.ts (field defs + DTO), lead-ingest.ts (dedupe kontak/lead, skor, notifikasi)
- API backend lengkap: auth, leads (list/detail/patch/messages), channels (GET/PUT, simulate, regenerate-key), webhooks 4 kanal (WA Cloud API format + hub verify, email inbound-parse token auth, IG messaging + hub verify, web-form api-key + CORS), dashboard, notifications, contacts, settings (SLA)

Stage Summary:
- Backend 100% siap; kontrak tipe stabil untuk frontend
- Berikutnya: frontend views (AppShell + view switching), verifikasi browser, worklog berkelanjutan

---
Task ID: 5-a
Agent: frontend-styling-expert (subagent)
Task: 4 view frontend (login, dashboard, kontak, portal klien)

Work Log:
- Baca worklog.md + kontrak wajib (src/lib/crm-types.ts, src/lib/api-client.ts); semua fetch memakai `api` dari "@/lib/api-client", tanpa fetch manual, tanpa route halaman baru
- Buat src/components/views/login-view.tsx: layar penuh bg-slate-950 dengan pola dot radial-gradient CSS, brand "Grupa Kreasi" + subtitle 4 brand, card login (email + password + toggle Eye/EyeOff), tombol "Masuk" ber-state loading (Loader2 spin, disabled), error/sukses via toast sonner, section collapsible "Akun Demo" berisi 5 tombol outline autofill kredensial (owner/manager/marketing/finance/klien), sukses → onLogin(user)
- Buat src/components/views/dashboard-view.tsx: fetch api.dashboard() saat mount dengan skeleton Card grid; header sapaan nama depan + tanggal id-ID (Intl.DateTimeFormat weekday long); banner amber SLA bila totals.new > 0; grid 4 KPI (Total Lead/Users slate, Lead Baru/Inbox amber, Sedang Diikuti/MessagesSquare violet, Menang/Trophy emerald, angka text-3xl font-bold); "Distribusi Kanal (7 hari)" bar chart CSS murni horizontal per kanal (whatsapp=emerald-500, email=amber-500, instagram=rose-500, web=stone-500, manual=slate-400, count di kanan); "Kesehatan Kanal" row dot status (enabled bg-emerald-500 animate-pulse, else bg-stone-300) + eventCount + timeAgo lokal (baru saja/Xm/Xj/Xh) + badge "Nonaktif"; "Responsivitas Tim" progress bar responseRatePct + avgFirstResponseMins "± X menit"/"—"; "Lead Terbaru" list 8 lead (nama, subject, ChannelBadge, badge status LEAD_STATUS_LABEL+LEAD_STATUS_BADGE, waktu relatif) dengan max-h-96 overflow-y-auto; state gagal muat → card error + tombol coba lagi
- Buat src/components/views/contacts-view.tsx: search input (ikon Search) dengan debounce 300ms → api.contacts(q); tabel shadcn 8 kolom (Nama, Email, Telepon, Instagram, Sumber, Perusahaan, "X lead", Bergabung tanggal id-ID pendek); kolom Instagram & Perusahaan hidden md:table-cell; sel kosong → "—" text-muted-foreground; Sumber → ChannelBadge bila termasuk CHANNELS else badge outline "Manual"; empty state ikon UserRound "Belum ada kontak yang cocok"; skeleton baris saat load pertama + spinner kecil saat mencari
- Buat src/components/views/client-portal-view.tsx: fetch api.leads() (endpoint sudah membatasi per klien, tanpa filter tambahan); header card Portal Klien (ikon Building2, "Ringkasan Proyek & Pengajuan Anda", nama user karena companyId tidak ada di DTO); statistik 3 kartu (total, sedang diproses = NEW+FOLLOW_UP+QUOTED amber, selesai = WON emerald); daftar lead card (kode font-mono, subject, badge status, ChannelBadge, brand BRAND_LABEL, pesan terakhir truncate 120 char + waktu relatif) dalam max-h-96 overflow-y-auto; info bantuan WhatsApp +62 811-2200-345; skeleton + empty state Inbox
- Jalankan `bunx tsc --noEmit`: 0 error di keempat file ini SELAIN 3× TS2307 "Cannot find module '@/components/channel-badge'" karena file tsb milik agent lain BELUM ada di disk saat pengecekan (sudah polling ±5 menit). Asumsi API yang dipakai: `import { ChannelBadge } from "@/components/channel-badge"` dengan prop `channel: ChannelType | "manual"` (untuk contacts-view manual dirender badge terpisah). Bila signature agent lain berbeda (mis. prop `type`), cukup sesuaikan 3 baris pemanggilan di dashboard-view/contacts-view/client-portal-view. Error lain di output tsc (next.config.ts, skills/*, lead-ingest.ts, api/channels simulate) milik agent lain, diabaikan sesuai instruksi

Stage Summary:
- 4 view frontend selesai & self-contained: login-view (auth + autofill demo), dashboard-view (KPI, distribusi kanal, kesehatan kanal, responsivitas, lead terbaru), contacts-view (tabel + pencarian debounce), client-portal-view (ringkasan + daftar pengajuan klien)
- Gaya konsisten: bahasa Indonesia, slate/emerald/amber/rose (violet hanya utk status Diikuti sesuai kontrak), rounded-xl/2xl, max-h-96 overflow-y-auto, mobile-first (sm:/md:/lg:), skeleton loading, empty state ikon lucide, toast error via sonner
- Tersisa 1 dependensi lintas-agent: src/components/channel-badge.tsx (agent lain) — 3 view mengimpor { ChannelBadge } prop `channel`

---
Task ID: 5-b (main) + E2E
Agent: main (orchestrator)
Task: Frontend inti (AppShell, ChannelBadge, ChannelsView, InboxView) + verifikasi browser menyeluruh

Work Log:
- src/components/channel-badge.tsx + src/lib/channel-meta.tsx (ikon & warna per kanal, re-export CHANNEL_LABEL)
- src/components/views/channels-view.tsx — Pengaturan Kanal: 4 kartu kanal (switch aktif w/ validasi field wajib, ringkasan identitas, webhook URL + copy, token mask/unmask + copy + regenerasi, dialog Konfigurasi berisi langkah setup provider + form field per kanal, tombol Uji Pesan Masuk, Snippet Embed untuk kanal web dengan kode siap tempel)
- src/components/views/inbox-view.tsx — filter tab status + filter kanal + search, daftar lead (badge kanal/status/kode/SLA), panel percakapan (bubble IN/OUT/note internal), komposer balas via kanal, catatan internal, tandai Menang / Hilang (dengan alasan), dropdown penugasan dari /api/users
- src/components/app-shell.tsx — sidebar slate-900 + topbar mobile + drawer, bel notifikasi (badge unread, tandai dibaca, polling 30s), view-switching tanpa route baru, effectiveView guard per role (CLIENT selalu → portal), footer sticky mt-auto
- src/app/layout.tsx + page.tsx (satu route /), metadata Indonesia
- Fix: app-shell import default vs named; api.regenerateChannelKey; lead-ingest subject→lead.subject; webhookUrlFor web→/api/webhooks/web-form; portal klien (403 dashboard→leads per-company, NOTE disembunyikan); devIndicators: false; eslint flat config defineConfig; exclude skills dari tsc
- E2E agent-browser: login owner/manager/client ✓, dashboard KPI ✓, Pengaturan Kanal render 4 kartu ✓, simulasi WA ✓, webhook nyata: WA hub.challenge + POST message → LD-000006 ✓, email token 401/200 → LD-000007 ✓, IG verify + DM → LD-000008 ✓, web-form API key + CORS 204 → LD-000009 ✓, inbox tampil 4 lead baru dgn badge kanal ✓, balasan → status FOLLOW_UP otomatis ✓, notifikasi per kanal (5 unread) ✓, kontak 9 baris ✓, portal klien hanya lead perusahaannya ✓, mobile 390px layout ✓, console bersih, dev.log tanpa error, tsc 0 error, lint bersih

Stage Summary:
- FITUR PENGATURAN KANAL SELESAI + terverifikasi end-to-end (WA/Email/IG/Web)
- Catatan tooling: klik koordinat agent-browser kadang meleset (dev overlay/geometry); workaround: eval JS / requestSubmit — bukan bug aplikasi
- Instagram sengaja nonaktif (seed) untuk mendemokan alur "menunggu konfigurasi"
- Kredensial demo: owner/manager/marketing/finance/klien (lihat atas)

---
Task ID: 6 (backend+kontrak)
Agent: main (orchestrator)
Task: Rebuild fitur hilang (funnel/lead, keuangan, produksi, petunjuk) + rebrand UDP — PT. Unicam Digital Pictvres

Work Log:
- Sandbox sebelumnya reset: hanya modul Pengaturan Kanal yang tersisa. Fitur funnel, keuangan, produksi, petunjuk dibangun ulang.
- Prisma schema +: Lead.stage (NEW|QUALIFIED|PROPOSAL|NEGOTIATION|WON|LOST), Lead.estValue; model baru Quotation, Project, Milestone, Invoice, Payment. db push OK.
- Lib ops.ts: nextDocNumber (QT/PRJ/INV-000x), effectiveInvoiceStatus (OVERDUE dihitung saat baca), mapper DTO, defaultMilestones, progressFromMilestones, lastMonths.
- API baru: /api/pipeline (GET stats+leads), /api/quotations (GET/POST), /api/quotations/[id] (PATCH send/approve/reject — approve otomatis: lead WON + Project + 5 milestone + Invoice DP 50%), /api/invoices (GET/POST), /api/invoices/[id]/payments (POST; lunas → notif manajer), /api/projects (GET/POST), /api/projects/[id] (PATCH status/milestone → progress auto dari bobot milestone), /api/reports/finance, /api/reports/production, /api/reports/overview (gabungan keuangan×produksi), /api/portal (CLIENT: proyek+invoice+penawaran perusahaannya).
- PATCH /api/leads/[id]: dukung stage+estValue, sync status↔stage dua arah. GET /api/leads kini menyertakan stage+estValue.
- REBRAND: semua "Grupa Kreasi" → "UDP" (PT. Unicam Digital Pictvres); domain udp.co.id; cookie udp_session; header X-UDP-Webhook-Token/X-UDP-Api-Key; seed email @udp.co.id.
- Seed ulang: 3 perusahaan, 7 user, 9 lead (funnel lengkap: NEW/QUALIFIED/PROPOSAL/NEGOTIATION/WON/LOST), 4 quotation, 2 project (1 DONE, 1 IN_PROGRESS) + milestone, 5 invoice + 3 payment tersebar 6 bulan utk chart, notifikasi, audit.
- Kontrak: crm-types.ts += LeadStage/Quotation/Invoice/Project/Milestone DTO, PipelineStats, FinanceStats, ProductionStats, OverviewStats, PortalSummaryDTO + label/badge. api-client.ts += pipeline, quotations, invoices, payments, projects, reports, portalSummary.

Stage Summary:
- Backend 100% selesai & seed OK. Kredensial: owner@udp.co.id/owner123, manager@/manager123, marketing@/marketing123, finance@/finance123, klien@majubersama.co.id/klien123.
- Berikutnya: 4 subagent frontend paralel (Task 6-a..6-d): pipeline-view, finance-view, production-view, guide-view. Main integrasi app-shell + dashboard + portal (Task 7), lalu E2E (Task 9).

---
Task ID: 6-b
Agent: frontend-styling-expert (subagent)
Task: View "Keuangan" — quotations + invoices (finance-view.tsx)

Work Log:
- Baca worklog.md + kontrak wajib (crm-types.ts, api-client.ts — tidak diubah) + contoh channels-view.tsx untuk meniru gaya (Dialog, Badge, Switch→tidak dipakai, Table, Tabs, Select)
- Buat src/components/views/finance-view.tsx (default export, prop { user }: { user: SessionUser }, "use client", bahasa Indonesia, tanpa mock — semua via api client):
  - Load paralel Promise.all saat mount: api.financeStats() + api.quotations() + api.invoices(); skeleton animate-pulse (4 KPI + 2 chart + tabel), error state card rose (TriangleAlert) + tombol "Coba Lagi", header tombol "Muat Ulang" (RefreshCw spin)
  - KPI row 4 card: Pendapatan (revenuePaid, Banknote emerald), Outstanding (outstanding + "x invoice", Wallet amber), Invoice Jatuh Tempo (overdueCount, AlarmClock; badge rose "Perlu tindakan" + border-rose bila >0), Tingkat Persetujuan (quotationApprovedPct%, CheckCircle2)
  - Chart Arus Kas 6 bulan: grouped bar vertikal CSS murni dari stats.monthly (revenue emerald-500 vs invoiced amber-400), tinggi proporsional max 160px (h-40), stub opacity utk nilai 0, label bulan singkat (label dari backend), tooltip via title attr, legend dot
  - Chart Pendapatan per Brand: bar horizontal stats.byBrand, warna per brand slate-500/emerald-500/amber-400/rose-500 (rotate), nilai Rp + "Outstanding: Rp x" kecil (rose bila >0)
  - Tab shadcn "Penawaran" | "Invoice", tabel dibungkus max-h-[480px] overflow-y-auto, TableHeader sticky
  - Tabel Penawaran: Nomor (font-mono), Judul+brand, Klien (lead.contactName + companyName), Nilai Rp, Status badge QUOTATION_STATUS_BADGE/LABEL (title=decidedNote), Proyek (projectCode font-mono), Aksi: "Kirim" (hanya DRAFT, OWNER/MANAGER/MARKETER), "Setujui" (DRAFT/SENT, OWNER/MANAGER/FINANCE) → api.updateQuotationStatus(id,"approve") → toast sukses MENYEBUT hasil: "Penawaran disetujui — Proyek {projectCode} & invoice {invoiceNumber} otomatis dibuat" → refetch quotations+invoices+stats; "Tolak" → dialog alasan opsional (Textarea) → action reject
  - Dialog "Buat Penawaran" (tombol header tab, hanya OWNER/MANAGER/MARKETER): pilih lead dari api.leads() (fetch SEKALI saat dialog pertama dibuka, cache di state, tampil "code · subject"), judul, items dinamis rows desc/qty/price + tambah/hapus baris (min 1), diskon % + PPN % (default 11), ringkasan total LIVE dihitung di klien (subtotal, diskon, ppn, grandTotal), validasi (lead, judul, desc item, qty≥1, subtotal>0) → api.createQuotation → toast nomor → refetch
  - Tabel Invoice: Nomor, Judul+brand, Perusahaan (companyName), Proyek, Total Rp, Terbayar Rp + progress bar kecil (h-1.5 w-24, emerald bila 100% else amber), Jatuh Tempo (id-ID day numeric/short month/numeric year), Status INVOICE_STATUS_BADGE/LABEL (OVERDUE = rose sesuai kontrak), Aksi "Catat Pembayaran" (hanya OWNER/FINANCE, disembunyikan bila lunas) → dialog nominal default = sisa tagihan + metode Select TRANSFER/CASH/QRIS/OTHER (label Indonesia) + catatan → validasi ≤ sisa → api.addPayment → toast → refetch
  - Helper lokal: formatRp (Intl id-ID currency IDR 0 desimal), formatDate (toLocaleDateString id-ID); role gating: canCreate/canSend=OWNER|MANAGER|MARKETER, canDecide=OWNER|MANAGER|FINANCE, canPay=OWNER|FINANCE
  - Gaya: slate/emerald/amber/rose/stone (tanpa indigo/biru), rounded-xl/2xl, badge kontrak crm-types, empty state ikon lucide, toast sonner
- `bunx tsc --noEmit`: 0 error di finance-view.tsx (grep finance-view = 0). 2 error tersisa milik agent lain (src/app/api/leads/route.ts TS2322 stage, src/lib/ops.ts TS2339 createdAt) — diabaikan sesuai instruksi. app-shell belum mereferensikan view ini (integrasi Task 7 oleh main)

Stage Summary:
- View Keuangan selesai & self-contained: KPI 4 kartu, chart cashflow CSS murni 6 bulan, revenue per brand, tab Penawaran (kirim/setujui+auto project+invoice toast/tolak/buat dengan items dinamis & total live) dan Invoice (progress terbayar + catat pembayaran)
- Semua data & mutasi via api-client (financeStats/quotations/invoices/leads/updateQuotationStatus/createQuotation/addPayment), tanpa mock, tanpa route baru
- Siap diintegrasikan app-shell (Task 7): `import FinanceView from "@/components/views/finance-view"` dengan prop user

---
Task ID: 6-c
Agent: frontend-styling-expert (subagent)
Task: View "Produksi" (src/components/views/production-view.tsx)

Work Log:
- Baca worklog.md + kontrak wajib (crm-types.ts, api-client.ts, contoh inbox-view.tsx); verifikasi PATCH /api/projects/[id] (milestoneId+milestoneStatus, status→progress auto) & GET /api/reports/production sebelum menulis
- Buat src/components/views/production-view.tsx (default export, prop { user: SessionUser }): load paralel Promise.all [api.productionStats(), api.projects(), api.overviewStats()] → skeleton (SkeletonBlock animate-pulse bg-slate-200/70, pola dashboard-view), state gagal → card AlertTriangle + tombol "Coba Lagi", tombol "Muat ulang" outline di header
- KPI row 4 card (grid-cols-2 lg:grid-cols-4, icon box rounded-xl): Proyek Aktif (Factory, slate), Selesai (CheckCircle2, emerald), Progress Rata-rata % (Gauge, teal), Milestone Selesai % (ListChecks, amber)
- Bagan gabungan "Pendapatan vs Proyek Selesai (6 bulan)" CSS murni dari overviewStats.monthly: dua bar berdampingan per bulan (emerald=skala revenue, amber=skala count) masing-masing dinormalisasi ke max-nya (h-40, height % + min 4%/6%), label count di atas bar amber, title+aria-label per bar (Rp lokal), legend dot; caption "Keuangan & produksi saling terhubung: penawaran disetujui otomatis membuka proyek & invoice DP" (ikon Info)
- Distribusi status: 5 bar horizontal PROJECT_STATUS_LABEL + count (warna bar per status: stone/amber/teal/violet/emerald); kartu per brand stats.byBrand: BRAND_LABEL, "X aktif · Y selesai", stacked bar teal vs emerald, total budget Rp (Intl id-ID)
- Daftar proyek grid md:grid-cols-2: kode font-mono badge + nama + badge status (PROJECT_STATUS_BADGE/LABEL) + brand; progress bar emerald h-2 + persen; meta budget Rp / perusahaan (Building2) / deadline id-ID + badge "Terlambat" rose bila lewat & belum DONE / "Terbit invoice: Rp x" (billedAmount); dropdown "Ubah status" (5 status) → api.updateProject(id,{status}) → toast → refetch; milestone list max-h-40 overflow-y-auto: baris button role=checkbox aria-checked, klik siklus PENDING→IN_PROGRESS→DONE→PENDING via api.updateProject(id,{milestoneId,milestoneStatus}) → toast → refetch, ikon Circle/CircleDashed/CheckCircle2(emerald), label + bobot weight%, counter "x/y selesai"
- Aksi (dropdown status + checkbox milestone) hanya OWNER/MANAGER/MARKETER; FINANCE read-only (baris milestone jadi div statis); empty state Factory "Belum ada proyek produksi" + hint "Proyek otomatis terbuka saat penawaran disetujui di menu Keuangan"
- `bunx tsc --noEmit`: 0 error di production-view.tsx; sisa 2 error (api/leads/route.ts TS2322, ops.ts TS2339) milik agent lain — diabaikan sesuai instruksi

Stage Summary:
- View Produksi selesai & self-contained (satu file baru, tidak mengubah kontrak): KPI 4, chart gabungan keuangan×produksi, distribusi status + per brand, daftar proyek dengan milestone checkbox siklus & ubah status proyek
- Gaya konsisten: bahasa Indonesia, slate/emerald/amber/teal/violet (tanpa biru/indigo), rounded-xl/2xl, responsive, aria-label, skeleton/error/empty state, toast sonner
- Menunggu integrasi app-shell (Task 7): import default dari "@/components/views/production-view"

---
Task ID: 6-a
Agent: frontend-styling-expert (subagent)
Task: View "Pipeline & Funnel" (src/components/views/pipeline-view.tsx)

Work Log:
- Baca worklog.md + kontrak wajib (crm-types.ts, api-client.ts — tidak diubah), channel-badge.tsx, contacts-view.tsx (pola gaya), plus ui/dropdown-menu, dialog, select, button, badge, card, sonner dan route /api/pipeline untuk memastikan bentuk DTO
- Buat src/components/views/pipeline-view.tsx (default export, prop { user: SessionUser }, bahasa Indonesia, warna slate + aksen stage, rounded-xl/2xl)
- Fetch api.pipeline() saat mount via useCallback load(); skeleton PipelineSkeleton (4 KPI + panel funnel + 5 kolom kanban, animate-pulse); error state penuh (AlertTriangle + pesan + tombol "Coba Lagi" → load ulang); tombol "Muat Ulang" outline di header; error aksi via toast sonner
- Bagan Funnel CSS murni (tanpa library chart): 5 bar horizontal bertingkat NEW/QUALIFIED/PROPOSAL/NEGOTIATION/WON dengan lebar % proporsional count terhadap stage terbesar (min 5% agar terlihat), warna NEW=amber-500, QUALIFIED=teal-500, PROPOSAL=violet-500, NEGOTIATION=orange-500, WON=emerald-500; tiap baris: dot + label LEAD_STAGE_LABEL, track h-9 bg-slate-100 berisi bar + overlay "N lead" (kiri) dan total nilai formatRupiah (kanan), pctOfWon di kolom kanan; LOST tidak masuk bar — tampil sebagai catatan kecil bawah funnel (ikon Info rose) berisi count + nilai + pct
- KPI row 4 card: Pipeline Terbuka (Filter, totalOpen + "Rp … potensi nilai"), Menang (Trophy, wonCount + wonValue), Konversi (Percent, conversionPct%), Rata-rata Deal (Banknote, avgDealSize Rp); grid 1 → sm:2 → xl:4
- Kanban 6 kolom LEAD_STAGES (termasuk LOST) dalam overflow-x-auto + flex min-w-max (scroll horizontal mobile), kolom min-w-[240px] lg:min-w-[260px], header = dot warna stage + LEAD_STAGE_LABEL + count badge (LEAD_STAGE_BADGE), body max-h-[420px] overflow-y-auto, empty state ikon Inbox
- Card lead: kode font-mono xs, subject truncate, nama kontak (+perusahaan), ChannelBadge, brand BRAND_LABEL (badge outline), estValue formatRupiah, badge "Hot · score" amber jika score ≥ 80 (ikon Flame); aksi: dropdown "Pindah" (ArrowLeftRight, aria-label, item = stage lain → api.updateLeadStage(id,{stage}); pilih LOST → wajib dialog pilih alasan dari LOST_REASONS via Select sebelum submit destructive) dan tombol "Nilai" (Tag → dialog Input type number + pratinjau Rp → api.updateLeadStage(id,{estValue}), validasi angka ≥ 0, Enter untuk simpan); busy per-card (Loader2, disabled); sukses → toast + refetch api.pipeline() di latar belakang
- Helper lokal formatRupiah: Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }) + prefix "Rp "
- aria-label pada semua tombol ikon/aksi; dialog Select & Input ber-Label + htmlFor; bunx tsc --noEmit → 0 error di pipeline-view.tsx (2 error tersisa milik main agent di src/app/api/leads/route.ts & src/lib/ops.ts, diabaikan sesuai instruksi)

Stage Summary:
- View Pipeline & Funnel selesai & self-contained: funnel CSS murni + KPI 4 card + kanban 6 kolom dengan aksi pindah tahap (LOST wajib alasan) dan atur nilai, semua lewat kontrak api.pipeline()/api.updateLeadStage()
- Siap diintegrasikan ke app-shell (import default PipelineView dari "@/components/views/pipeline-view", prop user: SessionUser); hanya untuk role internal (API menolak CLIENT 401)
- Dependen lintas-agent: tidak ada baru (ChannelBadge sudah ada)

---
Task ID: 6-d
Agent: frontend-styling-expert (subagent)
Task: Buat src/components/views/guide-view.tsx — view "Petunjuk Penggunaan" (konten statis resmi, tanpa fetch API)

Work Log:
- Baca worklog.md + kontrak wajib (crm-types.ts, contacts-view.tsx utk gaya dasar); verifikasi komponen ui (card/tabs/badge) & lucide-react 0.545
- Hero bg-slate-950 rounded-2xl dengan pola dot radial-gradient CSS + ikon BookOpen emerald: judul "Petunjuk Penggunaan — CRM UDP", subtitle "PT. Unicam Digital Pictvres · Unimasi · Segia Tech · Erfo Multimedia · Unicam Studio", 3 badge chip (4 Kanal Masuk / SLA Balas 2 Jam / PRJ & Invoice Otomatis)
- Tabs shadcn 4 bab (grid-cols-2 mobile → flex sm+): Alur Sistem (Route), Per Peran (Users), Menu & Fitur (LayoutGrid), FAQ (HelpCircle)
- Tab "Alur Sistem": diagram alur CSS murni — 9 FlowStep bernomor + konektor FlowArrow (ArrowDown mobile / ArrowRight md+/lg+, param `at`), 2 baris responsif (md:flex-row & lg:flex-row): 1 Kanal Masuk → 2 Inbox Lead (SLA 2 jam) → 3 Funnel Pipeline (chip mini LEAD_STAGES via LEAD_STAGE_LABEL/BADGE) → 4 Penawaran QT → 5 Disetujui? (amber, cabang Ya/Tidak) → 6 Proyek PRJ+Milestone+Invoice DP 50% (emerald, badge OTOMATIS) → 7 Produksi (bobot milestone → progress) → 8 Invoice Pelunasan → 9 Lunas & Serah Terima; cabang TIDAK = kartu rose dashed "Tandai Hilang + alasan" (list LOST_REASONS); legenda warna (manual/otomatis/keputusan/gagal)
- Tab "Per Peran": 5 kartu ROLE_GUIDES (Crown/Briefcase/Megaphone/Calculator/Building2) pakai ROLE_LABEL — daftar menu + tanggung jawab utama (Finance: setujui penawaran, catat pembayaran, outstanding; Client: Portal saja); kartu peran user aktif di-highlight ring emerald + badge "Peran Anda" (prop `user` dipakai)
- Tab "Menu & Fitur": 8 kartu menu (Dashboard, Inbox Lead, Pipeline & Funnel, Keuangan, Produksi, Pengaturan Kanal, Kontak, Portal Klien) — deskripsi + langkah bernomor 3-5 konkret (simulasi "Uji Pesan Masuk" di Pengaturan Kanal, pindah tahap pipeline, buat/kirim/setujui QT → otomatis PRJ+DP, toggle milestone produksi, catat pembayaran)
- Tab "FAQ": 8 Q&A memakai <details> native distyle (group-open:rotate-180 ChevronDown, open:shadow-sm) — SLA 2 jam, otomatis proyek+DP setelah approve, webhook 4 kanal URL+token, invoice jatuh tempo merah otomatis, progress = bobot milestone, lupa password → hubungi Owner, portal klien perusahaan sendiri, cara simulasi end-to-end
- Kotak tips emerald di bawah tabs (Lightbulb): 4 tips grid sm:grid-cols-2 (skor Hot ≥80, cek funnel tiap pagi, DP sebelum produksi, buka halaman Petunjuk saat bingung)
- Gaya: full slate/emerald/amber/rose (tanpa indigo/biru), rounded-xl/2xl, mobile-first, komponen shadcn Card/Tabs/Badge saja
- `bunx tsc --noEmit`: 0 error di guide-view.tsx; 2 error output milik agent lain (src/app/api/leads/route.ts stage:string, src/lib/ops.ts createdAt) — diabaikan

Stage Summary:
- View Petunjuk Penggunaan selesai & self-contained (statis, tanpa api-client): hero + 4 tab (alur CSS murni, per peran dgn highlight role, menu 8 kartu langkah bernomor, FAQ details native) + kotak tips emerald
- Default export GuideView({ user: SessionUser }) — siap dipasang di app-shell (Task 7); tsc bersih utk file ini

---
Task ID: 7 (integrasi frontend)
Agent: main (orchestrator)
Task: Integrasi app-shell + upgrade dashboard & portal klien + verifikasi E2E

Work Log:
- app-shell.tsx: nav baru — Pipeline & Funnel (KanbanSquare, internal), Keuangan (Banknote, OWNER/MANAGER/FINANCE), Produksi (Factory, internal), Petunjuk (BookOpen, SEMUA role termasuk CLIENT); urutan portal sebelum guide agar CLIENT default ke Portal; branding sidebar/topbar/footer "UDP CRM — PT. Unicam Digital Pictvres".
- dashboard-view.tsx: fetch paralel api.pipeline() + api.overviewStats() (overview hanya OWNER/MANAGER/FINANCE); 2 card baru — "Funnel Penjualan" (5 bar stage warna amber/teal/violet/orange/emerald + konversi) dan "Keuangan × Produksi" (pendapatan, proyek aktif/selesai + mini chart bulanan 2 seri).
- client-portal-view.tsx: pakai api.portalSummary() — KPI 4 card, Proyek Produksi (progress + milestone read-only), Tagihan (status + terbayar + progress bar), Penawaran, daftar pengajuan, total tagihan belum lunas.
- Fix backend: leads route cast LeadStage; ops.ts mapInvoice issuedAt Date; projects/[id] milestone IN_PROGRESS → proyek BRIEFED, DONE → IN_PROGRESS/REVIEW; lint (unescaped entities, purity Date.now dipindah ke useEffect).
- Terverifikasi browser (agent-browser): login owner ✓ dashboard 2 card baru ✓ Pipeline funnel+kanban ✓ Keuangan cashflow/per-brand/tabel ✓ APPROVE QT-0003 → PRJ-0003 + INV-0006 otomatis ✓ Produksi toggle milestone (progress 30%, status IN_PROGRESS) ✓ catat pembayaran INV-0006 → PAID ✓ Petunjuk 4 tab ✓ login klien → Portal (proyek+invoice+penawaran perusahaannya) ✓ mobile 390px ✓ console 0 error ✓ dev.log bersih ✓ lint 0 error (1 warning) ✓ tsc 0 error ✓
- Catatan tooling: dropdown Radix tak bisa dibuka agent-browser (butuh pointerdown asli) — verifikasi pindah tahap via API: LD-000009 NEW→QUALIFIED, status ikut FOLLOW_UP ✓ (bukan bug aplikasi; pola sama dgn worklog sebelumnya).

Stage Summary:
- SEMUA FITUR AKTIF KEMBALI: Dashboard+funnel+keuangan×produksi, Inbox, Pipeline & Funnel, Keuangan (QT→approve→auto PRJ+INV DP→payment), Produksi (milestone→progress→status), Kanal, Kontak, Portal Klien, Petunjuk Penggunaan.
- Rebrand lengkap UDP. Data demo kaya (chart 6 bulan hidup). Aksi browser tadi meninggalkan perubahan data yang konsisten: QT-0003 approved → PRJ-0003 + INV-0006 (PAID); LD-000009 → QUALIFIED.
- Risiko/berikutnya: kredensial klien lama masih grupakreasi? TIDAK — semua @udp.co.id kecuali klien eksternal (@majubersama.co.id, @kopikita.id). Saran lanjutan: export PDF quotation/invoice, notifikasi SLA escalation, drad&drop kanban.

---
Task ID: 12-a
Agent: frontend-styling-expert (subagent)
Task: View "Brief & Estimasi" (src/components/views/brief-view.tsx) — alur Lead → Brief → Estimasi → Penawaran

Work Log:
- Baca worklog.md + kontrak wajib (crm-types.ts, api-client.ts — tidak diubah) + contoh gaya finance-view.tsx (Dialog/Table/Tabs pattern) & pipeline-view.tsx; verifikasi backend /api/briefs, /api/briefs/[id], /api/estimates (role gating & bentuk DTO) sebelum menulis
- Buat src/components/views/brief-view.tsx (file BARU, default export, prop { user: SessionUser }, "use client", UI bahasa Indonesia, tanpa mock — semua via api client, tanpa fetch manual, tanpa route halaman baru):
  - Header card: judul "Brief & Estimasi Produksi" + deskripsi alur + tombol "Buat Brief dari Lead" (Dialog, hanya OWNER/MANAGER/MARKETER) + tombol "Muat Ulang" (RefreshCw spin saat load)
  - Alur strip 4 chip bernomor + ArrowRight (slate/amber/teal/emerald, grid-cols-2 mobile → flex sm+, arrow hidden mobile): 1 Lead Terpilih (count = briefs.length) → 2 Brief → 3 Estimasi Produksi (count ESTIMATED) → 4 Siap Ditawarkan (ESTIMATED belum QUOTED)
  - KPI 3 card: Brief Aktif (DRAFT+SUBMITTED+ESTIMATED, FileText slate), Menunggu Estimasi (SUBMITTED, Hourglass amber), Total Jam Ters Estimasi (Σ totalHours semua estimate, Timer teal)
  - Daftar brief grid md:grid-cols-2 dalam max-h-[680px] overflow-y-auto; kartu: kode font-mono + Badge BRIEF_STATUS_BADGE/LABEL + brand BRAND_LABEL; judul bold; lead info "code · contactName · companyName" + badge stage kecil (LEAD_STAGE_BADGE/LABEL); Tujuan line-clamp-2; deadline id-ID + badge rose "Lewat deadline" bila sebelum hari ini & status ≠ QUOTED (nowTs dihitung di useEffect agar aman aturan purity); deliverables split("\n") dengan CheckCircle2 emerald maks 3 + "+N lainnya"; referensi → link Link2 target _blank (deteksi http/www, teks biasa bila bukan URL); box teal estimasi "Estimasi: X jam · Rp Y" + "Dihitung oleh {nama}" + accordion ChevronDown berisi item (task, qty unit · jam, biaya) + notes; badge emerald "Proyek: PRJ-XXXX" bila projectCode
  - Aksi per role: DRAFT + OWNER/MANAGER/MARKETER → "Kirim untuk Estimasi" (dialog konfirmasi + Textarea catatan opsional → api.updateBrief(id,"submit",notes) → toast kode brief → refetch); DRAFT/SUBMITTED/ESTIMATED + PRODUCTION/OWNER/MANAGER → "Buat Estimasi" (dialog form baris dinamis: pekerjaan/qty/satuan Select[jam|hari|unit|paket|orang]/jam kerja/biaya per unit + tambah/hapus baris, layout mobile card vs desktop grid sm:contents 6 kolom, total live Σ jam & Σ qty×biaya format Rupiah, context box tujuan+deadline brief, Textarea catatan, validasi ≥1 baris valid → api.createEstimate → toast "Estimasi BRF-xxxx tersimpan — X jam · Rp Y" → refetch); ESTIMATED + OWNER/MANAGER/MARKETER → hint chip emerald "Siap dibuatkan penawaran di menu Keuangan" (bukan tombol). Fitur "Kembalikan ke Draf" DILEWATI sesuai instruksi (tidak ada UI & tidak ada panggilan API)
  - Empty state ClipboardList "Belum ada brief" + hint alur; skeleton animate-pulse (header, flow, 3 KPI, 4 kartu); error state card rose TriangleAlert + tombol "Coba Lagi"
  - Dialog Buat Brief: Select lead dari api.leads() (fetch sekali saat dialog dibuka, cache; filter UI stage/status ≠ LOST & ≠ WON), judul*, tujuan* (Textarea), audiens, deliverables (satu baris per item), referensi (type=url), deadline (type=date → ISO), catatan; validasi lead/judul/tujuan → api.createBrief → toast kode brief → refetch
  - Teknis: formatRupiah lokal Intl id-ID max 0 desimal prefix "Rp "; tanggal toLocaleDateString id-ID; busy per aksi (Loader2 + disabled); aria-label pada tombol ikon & select baris; Label+htmlFor semua input dialog; warna slate/emerald/amber/teal/rose/stone saja; rounded-xl/2xl; responsive sm:/md:/lg:
- VERIFIKASI RUNTIME: /api/briefs awalnya 500 ("db.brief is undefined") karena dev server (start 04:49) memegang Prisma client lama — client sudah diregenerasi 06:39 (model Brief/WorkEstimate baru). Restart dev server (kill proses lama + setsid nohup bun run dev, port 3000) → /api/briefs 200 dan payload sesuai kontrak (briefs[] + lead{code,subject,stage,contactName,companyName,estValue} + estimates[] + projectCode, deliverables multiline, references null-safe) — cocok persis dgn yang dikonsumsi view
- bunx tsc --noEmit: 0 error seluruh proyek. bunx eslint brief-view.tsx: bersih. bun run lint: 0 error (2 warning milik agent lain: prisma/seed.ts unused var, pipeline-view.tsx exhaustive-deps)

Stage Summary:
- View Brief & Estimasi selesai & self-contained (satu file baru, tidak mengubah kontrak): header + flow strip 4 langkah + KPI 3 + daftar brief card lengkap (status, lead, deliverables, referensi, estimasi accordion, badge proyek) + dialog Buat Brief / Kirim untuk Estimasi / Buat Estimasi (baris dinamis + total live) + skeleton/error/empty state
- Semua data & mutasi via api.briefs/createBrief/updateBrief/leads/createEstimate; role gating: canCreate/canSubmit=OWNER|MANAGER|MARKETER, canEstimate=PRODUCTION|OWNER|MANAGER; FINANCE read-only
- Dev server di-restart untuk memuat Prisma client baru (fix 500 /api/briefs & /api/estimates) — sekarang jalan normal di port 3000 (log dev.log); endpoint briefs diverifikasi 200 + payload benar
- Siap diintegrasikan app-shell oleh main: import default BriefView dari "@/components/views/brief-view" dengan prop user: SessionUser (nav mis. ikon ClipboardList/FileStack, hanya role internal — API menolak CLIENT 401)
- Catatan kecil: backend POST /api/estimates mengembalikan { estimate, briefCode } sedangkan tipe api-client menulis { estimate, brief } — view hanya memakai field `estimate` (kode brief diambil dari state target), jadi aman terhadap mismatch tsb

---
Task ID: 12-b
Agent: frontend-styling-expert (subagent)
Task: Upgrade view Produksi (role PRODUCTION + tab File & Google Drive) + portal klien (File dari Tim Produksi)

Work Log:
- Baca worklog.md + kontrak wajib (crm-types.ts, api-client.ts — tidak diubah); verifikasi route /api/deliverables (GET+POST JSON/multipart), /api/deliverables/[id]/download, gating role backend, seed deliverables & user produksi@udp.co.id, dan komponen ui (Tabs/Dialog/Input/Label/Textarea/Select asChild Button)
- production-view.tsx — role gating dipisah: canToggleMilestone=OWNER|MANAGER|MARKETER|PRODUCTION (siklus checkbox PENDING→IN_PROGRESS→DONE), canChangeStatus=OWNER|MANAGER|MARKETER (dropdown "Ubah status" disembunyikan untuk PRODUCTION & FINANCE), budget tetap tampil read-only untuk semua role; api.overviewStats() kini hanya di-fetch untuk OWNER|MANAGER|FINANCE (catch→null) sehingga MARKETER/PRODUCTION tidak lagi gagal load (401) — chart gabungan disembunyikan bila overview null
- production-view.tsx — Tabs shadcn di atas konten: tab "Proyek" (KPI + chart + distribusi + daftar proyek, konten existing utuh) dan tab "File & Google Drive" (baru); tab files lazy-load via api.deliverables() saat pertama dibuka (useEffect guard deliverables===null && !delLoading && !delFailed), cache di state, tombol "Muat ulang" header ikut refetch deliverables bila sudah dimuat
- Tab files: 4 kartu ringkasan (Total File/Tautan FolderOpen slate, Proyek dengan File Factory emerald, Tautan Link2 amber, File FileText teal); daftar dikelompokkan per proyek (section header Badge kode font-mono + nama + PROJECT_STATUS_BADGE dari projects + count), baris item: ikon Link2 amber/FileText teal, nama bold, fileName·sizeLabel untuk FILE, note kecil, badge outline milestoneLabel, "oleh {uploadedByName} · tanggal relatif id-ID" (timeAgoId pakai nowMs dari useEffect — purity), aksi LINK → Button asChild anchor "Buka Tautan" ExternalLink target _blank rel noreferrer, FILE → anchor "Unduh" Download href=/api/deliverables/{id}/download download; tombol hapus Trash2 icon-only aria-label untuk OWNER/MANAGER atau uploader sendiri (d.uploadedByName===user.name) → api.deleteDeliverable → toast → refetch, busy per-row Loader2; empty state FolderOpen "Belum ada file produksi" + hint; skeleton + error card "Coba Lagi" utk tab
- Dialog "Kirim File / Link" (tombol di header tab files, canSend=OWNER|MANAGER|MARKETER|PRODUCTION): Select proyek (tampil "PRJ-0002 · nama", ganti proyek reset milestone), toggle segmented aria-pressed "Tautan (Drive dll)" vs "Unggah File", Input nama (Label htmlFor), mode tautan: Input URL placeholder https://drive.google.com/... + validasi regex ^https?:// (error inline rose + aria-invalid), mode file: input type="file" native styled (file: utilities) + preview nama·ukuran + info amber "Maks 10 MB — file besar gunakan link Google Drive" (+validasi client 10MB), Select milestone opsional dari milestone titles proyek terpilih (item "— Tanpa milestone —"), Textarea catatan; submit LINK → api.addDeliverableLink({projectId,name,url,note,milestoneLabel}), FILE → FormData(projectId,name,note,milestoneLabel,file) → api.uploadDeliverableFile (tanpa Content-Type manual); sukses → toast menyebut kode proyek → reset form → close → refetch deliverables; busy Loader2 + disabled
- production-view.tsx — box Brief di card proyek bila p.brief: komponen BriefBox (ClipboardList, "Brief {code}: {title}", deadline CalendarDays, objective line-clamp-2 + toggle "Selengkapnya/Sembunyikan" aria-expanded)
- client-portal-view.tsx — di tiap card Proyek Produksi ditambah bagian "File dari Tim Produksi" (FolderOpen, border-t): p.deliverables.length>0 → baris ringkas per item (Link2 amber / FileText teal, nama truncate, sizeLabel bila FILE + tanggal id-ID, aksi LINK → anchor "Buka" target _blank rel noreferrer emerald, FILE → anchor "Unduh" href=/api/deliverables/{id}/download download teal); 0 deliverables → teks muted "Belum ada file yang dibagikan."; tanpa tombol hapus untuk klien
- E2E browser (agent-browser): owner — tab Proyek render KPI/chart/distribusi/daftar (Brief BRF-0003 tampil dgn deadline), tab files render 4 kartu ringkasan (4/2/3/1 sesuai seed) + list grouped per proyek dgn aksi; dialog submit tanpa proyek → toast "Pilih proyek tujuan"; POST link + multipart via curl 201 (sizeLabel benar) → refetch UI menampilkan item baru "oleh Andra Wijaya"; hapus via UI 2× → server kembali 4 item seed; siklus milestone Review & Revisi Dikerjakan→Selesai→…→Dikerjakan (dipulihkan); finance — tanpa dropdown status, 0 checkbox milestone, tanpa tombol Kirim, files tab read-only tanpa hapus; klien — card PRJ-0001 menampilkan "FILE DARI TIM PRODUKSI" + item "File Final Konten 3 Bulan" + link "Buka", tanpa hapus; tsc 0 error, eslint 2 file bersih, browser errors kosong
- Catatan lintas-agent: app-shell.tsx masih INTERNAL_ROLES=["OWNER","MANAGER","MARKETER","FINANCE"] sehingga login produksi@udp.co.id crash di app-shell (current.icon undefined, nav kosong utk PRODUCTION) sebelum sampai ke view — dibiarkan untuk Task 12-a/main (di luar file scope saya); view sendiri sudah mendukung user.role "PRODUCTION" penuh
- Selama E2E terjadi restart dev server oleh agent lain (EADDRINUSE sekali) — server akhirnya jalan normal di port 3000; tidak ada perubahan data demo yang tertinggal (milestone dipulihkan, 2 item tes dihapus)

Stage Summary:
- View Produksi: 2 tab (Proyek + File & Google Drive lazy-load+cache), role PRODUCTION didukung (toggle milestone boleh, ubah status disembunyikan, budget read-only tetap tampil), dialog Kirim File/Link (tautan tervalidasi http(s) & unggah file maks 10MB) dengan toast+refetch, list grouped per proyek dgn unduh/buka/hapus sesuai role, box Brief collapsible di card proyek
- Portal Klien: tiap card proyek kini menampilkan "File dari Tim Produksi" (Buka/Unduh read-only) atau teks muted bila kosong — tanpa aksi hapus
- Semua fetch via api.deliverables/addDeliverableLink/uploadDeliverableFile/deleteDeliverable (tanpa fetch manual, tanpa route baru); gaya konsisten slate/emerald/amber/teal/rose/stone, rounded-xl/2xl, mobile-first, aria-label & Label+htmlFor lengkap
- bunx tsc --noEmit: 0 error seluruh proyek; eslint kedua file: bersih
- Menunggu main (Task 12-a): tambahkan PRODUCTION ke nav app-shell (mis. INTERNAL_ROLES atau roles khusus menu Produksi) agar user produksi@ dapat menjangkau view; tanpa itu app-shell crash utk role PRODUCTION (bukan bug view)

---
Task ID: 12 (main orchestrator)
Agent: main (orchestrator)
Task: Hubungkan alur antar-role (Lead → Brief → Estimasi Produksi → Penawaran → Proyek → File/Drive → Pelunasan) + role PRODUCTION baru

Work Log:
- Prisma schema: model Brief (code BRF-xxxx, objective, audience, deliverables, references, deadline, status DRAFT|SUBMITTED|ESTIMATED|QUOTED), WorkEstimate (itemsJson [{task,qty,unit,hours,cost}], totalHours, totalCost), Deliverable (type FILE|LINK, url/filePath/fileName/sizeLabel, milestoneLabel, note); Project.briefId @unique + relasi deliverables; User role += PRODUCTION; db push + seed ulang.
- API baru: /api/briefs (GET list+lead+estimates, POST dari lead — tolak lead LOST/WON), /api/briefs/[id] (PATCH submit → notif PRODUCTION; reject-estimate khusus OWNER/MANAGER), /api/estimates (POST oleh PRODUCTION/OWNER/MANAGER → brief ESTIMATED + notif MANAGER/FINANCE/MARKETER), /api/deliverables (GET, POST JSON link w/ validasi http(s) + multipart FILE maks 10MB disimpan di uploads/), /api/deliverables/[id] (DELETE — uploader sendiri atau OWNER/MANAGER), /api/deliverables/[id]/download (GET; CLIENT hanya file proyek perusahaannya — fix bug 401 saat klien klik "Unduh" di portal).
- Integrasi alur: quotation approve kini menghubungkan brief terakhir lead → project.briefId + status BRIEFED + brief QUOTED + notif PRODUCTION "Proyek baru"; /api/projects & /api/portal menyertakan deliverables + brief; role PRODUCTION ditambahkan ke gating dashboard/pipeline/notifications/reports-production/projects/projects-[id].
- Kontrak: crm-types.ts += Role PRODUCTION, BRIEF_STATUS_*, EstimateItemDTO, WorkEstimateDTO, BriefDTO, DeliverableDTO(+DELIVERABLE_TYPE_LABEL), ProjectDTO.deliverables/.brief; api-client.ts += briefs/createBrief/updateBrief/createEstimate/deliverables/addDeliverableLink/uploadDeliverableFile(FormData tanpa Content-Type)/deleteDeliverable; fix tipe return createEstimate ({estimate, briefCode}).
- Frontend: app-shell — nav "Brief & Estimasi" (ClipboardList) + role PRODUCTION (nav: Dashboard, Brief & Estimasi, Produksi, Petunjuk); view baru brief-view.tsx (Task 12-a subagent); production-view.tsx tab "File & Google Drive" + gating PRODUCTION + brief box (Task 12-b subagent); client-portal-view bagian "File dari Tim Produksi" (Buka/Unduh); finance-view dialog Buat Penawaran menampilkan kotak referensi estimasi produksi (BRF + jam + biaya) saat lead punya estimasi; guide-view alur 10 langkah (Brief & Estimasi, Produksi + File) + kartu role PRODUCTION + menu "Brief & Estimasi"; login-view akun demo Produksi (produksi@udp.co.id/produksi123).
- Seed: Bayu Aji Saputra (PRODUCTION), BRF-0001 (ESTIMATED, 180 jam/Rp 19,8 jt), BRF-0002 (SUBMITTED), BRF-0003/0004 (QUOTED, terhubung PRJ-0001/0002), 4 deliverable (3 link Drive + 1 file txt fisik di uploads/), notifikasi PRODUCTION.
- E2E browser: Marketing buat BRF-0005 dari LD-000004 → Kirim untuk Estimasi ✓; Produksi login (nav terbatas OK, dashboard tak crash) → Buat Estimasi 2 baris total live 96 jam/Rp 15 jt → BRF-0005 ESTIMATED ✓; Finance read-only + Keuangan tanpa tombol Buat ✓; Owner → dialog penawaran menampilkan kotak "Estimasi produksi tersedia — BRF-0005 · 96 jam · Rp 15.000.000" ✓; Produksi tab File & Google Drive → kirim link Drive → muncul ✓; Portal klien Kopi Kita → FILE DARI TIM PRODUKSI + Unduh 200 ✓; mobile 390px tanpa overflow ✓; console & dev.log bersih; tsc 0 error; lint 0 error (1 warning lama).

Stage Summary:
- ALUR ANTAR-ROLE KINI TERHUBUNG PENUH: Lead (Marketing/Inbox) → Brief (Marketing/Manajer, notif Produksi) → Estimasi Pengerjaan (Produksi, notif Finance/Manajer) → Penawaran (Keuangan, referensi estimasi otomatis) → Approve → Proyek+Brief terhubung+Invoice DP (otomatis) → Produksi kerjakan milestone + kirim File/Google Drive → File tampil di Portal Klien → Pelunasan.
- Role baru PRODUCTION dengan akses tepat (Dashboard/Brief/Produksi/Petunjuk; tidak bisa keuangan/inbox/kanal).
- Catatan tooling: klik koordinat agent-browser sering meleset pada Radix (tab/select/nav) — workaround sekuens pointerdown/up/click via eval; bukan bug aplikasi.
- Saran lanjutan: form upload multiple file, preview file gambar di portal, approval estimasi oleh manajer sebelum penawaran, export PDF quotation/invoice.

---
Task ID: 13 (main orchestrator)
Agent: main (orchestrator)
Task: UX Produksi — deliverable dibuat dari DETAIL PROYEK (per milestone), bukan modul file terpisah

Work Log:
- Keluhan user: anak produksi kesulitan karena harus membuka tab "File & Google Drive" lalu memilih proyek dari dropdown. Harusnya: masuk ke detail proyek → di sana buat deliverable berdasarkan milestone.
- production-view.tsx di-refactor besar:
  - Komponen baru `ProjectDetailView` (drill-down): tombol "Detail Proyek" pada tiap kartu daftar → panel detail (header kembali + kode/status/brand, progress proyek + N/M milestone, meta budget/perusahaan/deadline/invoice, BriefBox, lalu bagian inti "Milestone & Deliverable").
  - Bagian "Milestone & Deliverable": tiap milestone = grup berisi baris toggle status (checkbox siklus, badge status MS_LABEL, bobot %), badge "N file", dan tombol "+" (aria-label per milestone) untuk tambah file/tautan TERKAIT milestone itu; deliverable milik milestone ditampilkan di bawah barisnya; grup "Tanpa milestone" (border-dashed) menampung deliverable tanpa/gagal cocok milestone; tombol "Tambah File / Tautan" di header card.
  - Dialog Kirim File/Link kini punya mode project-locked: dibuka dari detail → proyek dikunci (tampil statis "PRJ-XXXX · nama", select disembunyikan), judul dialog "Kirim File / Link — PRJ-XXXX", milestone terisi otomatis bila dibuka dari tombol "+" milestone; dari tab file global tombol jadi "Kirim ke Proyek Lain" (select proyek tetap ada).
  - Komponen `DeliverableRow` dipakai bersama (overview & detail); responsif: mobile konten atas + aksi (Buka Tautan/Unduh/Hapus) di baris bawah, desktop baris tunggal; nama break-words.
  - Tab "File & Google Drive" tetap jadi overview semua file; header grup proyek dapat tombol "Detail" → pindah ke tab Proyek + buka detail proyek tsb (navigasi silang).
  - Kartu proyek di daftar: badge "N file" per milestone + footer "N file/tautan produksi" + tombol "Detail Proyek"; judul milestone sm:truncate (wrap di mobile).
  - Mutasi refresh ganda: submit/hapus deliverable → Promise.all([fetchDeliverables(), load()]) agar detail (payload projects) & overview file sinkron.
- E2E browser (produksi@udp.co.id): daftar → Detail Proyek PRJ-0002 ✓; tombol "+" milestone "Review & Revisi" → dialog proyek terkunci + milestone terisi ✓; kirim tautan "Mockup Final Booth Revisi 2" → langsung tampil di bawah milestone tsb ("baru saja") ✓; toggle milestone IN_PROGRESS→DONE→PENDING→IN_PROGRESS dipulihkan ✓; tombol Kembali ✓; tab file → tombol Detail grup → detail ✓; login klien@kopikita.id → Portal tampil "Mockup Final Booth Revisi 2" + tombol Buka ✓.
- Mobile 390px: tanpa overflow horizontal; screenshot sebelum/sesudah fix DeliverableRow (aksi pindah ke bawah di mobile); milestone wrap rapi.
- tsc 0 error; eslint file bersih; console browser bersih; dev.log tanpa error.
- Catatan tooling: klik Radix (tab/nav) butuh sekuens mousedown+mouseup+click + focus via eval — bukan bug aplikasi.

Stage Summary:
- Alur kerja produksi kini berpusat di DETAIL PROYEK: pilih proyek → lihat brief + milestone → toggle status milestone → tambah file/link per milestone (proyek terkunci, milestone terisi otomatis) → file langsung terlihat di overview & Portal Klien. Tab file tinggal overview lintas proyek dengan jalan pintas "Detail".
- File berubah: src/components/views/production-view.tsx (satu-satunya; kontrak API/tipe tidak diubah).
- Saran lanjutan: multi-file upload, preview thumbnail gambar di detail, komentar klien per deliverable di portal.

---
Task ID: 2-a
Agent: frontend-styling-expert
Task: Tambah tombol "Dokumen" (pratinjau dokumen ter-brand/kop surat) di finance-view (per Quotation) & brief-view (per Brief)

Work Log:
- Baca worklog + komponen kontrak src/components/brand-document.tsx (BrandDocDialog, fmtDocRupiah, fmtDocDate) & src/components/doc-content.tsx (QuotationDocContent, BriefDocContent) — tidak diubah, hanya dipakai.
- Baca kedua view: finance-view.tsx (tabel penawaran dgn aksi Kirim/Setujui/Tolak di tab Penawaran) & brief-view.tsx (BriefCard dgn aksi Kirim untuk Estimasi/Buat Estimasi di footer kartu).
- finance-view.tsx: import FileText (lucide-react), BrandDocDialog, QuotationDocContent; tambah state `docQuotation: QuotationDTO | null`; tambah tombol "Dokumen" (size sm, variant outline, ikon FileText, aria-label `Buka dokumen ${q.number}`) di kolom Aksi tiap baris penawaran, berdampingan dgn aksi existing; hapus fallback "—" + variabel `canAct` (kini kolom aksi selalu berisi tombol Dokumen minimal); render SATU BrandDocDialog di akhir komponen (docLabel="SURAT PENAWARAN", showBankInfo, signatureName=user.name, children=<QuotationDocContent q={docQuotation}/>).
- brief-view.tsx: import BrandDocDialog, BriefDocContent (FileText sudah ada); BriefCard dapat prop baru `onOpenDoc(brief)`; tombol "Dokumen" (sm/outline/FileText, aria-label `Buka dokumen ${b.code}`) di footer kartu setelah aksi existing; `hasFooter` dibuat selalu true agar tombol Dokumen tersedia di semua kartu brief tanpa syarat role; BriefView punya state `docBrief: BriefDTO | null` + SATU BrandDocDialog di akhir komponen (docLabel="BRIEF PROYEK", docNumber=b.code, TANPA showBankInfo, signatureName=b.createdByName, children=<BriefDocContent b={b}/>).
- `estimates` pada data brief dipastikan tersedia (BriefDTO.estimates sudah dipakai view; BriefDocContent membaca estimates[0]).
- Gaya konsisten slate (tanpa indigo/biru), tanpa perubahan warna baru.
- Verifikasi: `bunx tsc --noEmit` = 0 error; `bunx eslint src/components/views/finance-view.tsx src/components/views/brief-view.tsx` = bersih (exit 0). Prettier check sengaja tidak dijalankan sebagai gate (file view lain di baseline juga tidak prettier-clean; tidak ada formatting ulang massal).

Stage Summary:
- Setiap baris penawaran di Keuangan & setiap kartu Brief kini punya tombol "Dokumen" yang membuka pratinjau dokumen A4 ter-brand (kop surat via BrandDocDialog + QuotationDocContent/BriefDocContent) lengkap dgn tombol "Cetak / Simpan PDF".
- Aksi lama (Kirim/Setujui/Tolak penawaran; Kirim untuk Estimasi/Buat Estimasi brief) tidak digantikan — tombol Dokumen hanya ditambahkan berdampingan.
- File berubah: src/components/views/finance-view.tsx, src/components/views/brief-view.tsx. Kontrak komponen (brand-document.tsx, doc-content.tsx) tidak diubah.

---
Task ID: 2-b
Agent: frontend-styling-expert
Task: View "Identitas Brand" (brand-view.tsx) + integrasi nav app-shell (kontrak /api/brands)

Work Log:
- Baca worklog (entri terbawah: Task 13) + kontrak: crm-types.ts (BrandProfileDTO), api-client.ts (api.brands/updateBrand/uploadBrandLogo), brand-document.tsx (pemakai field identitas), app-shell.tsx, channels-view.tsx (pola referensi), ui/input|textarea|dialog|button|badge
- File BARU src/components/views/brand-view.tsx (default export BrandView({ user }), "use client"):
  - Header "Identitas Brand" + deskripsi + tombol "Muat Ulang" (Loader2 saat loading); fetch api.brands() saat mount; skeleton animate-pulse 4 kartu; error card rose (AlertTriangle) + tombol "Coba Lagi"
  - Info box ikon Info (teal): "Identitas ini otomatis dipakai pada dokumen Surat Penawaran & Brief Proyek (kop surat, warna, logo, rekening)."
  - Grid kartu grid-cols-1 md:grid-cols-2 gap-4 per brand: Badge kode font-mono outline, komponen LetterheadPreview = pratinjau MINI KOP SURAT (logo via <img> dgn eslint-disable-next-line @next/next/no-img-element, fallback monogram huruf pertama bg primaryColor via BrandLogo; nama besar warna primaryColor; tagline uppercase; alamat/telp/email/website baris kecil dgn ikon; letterheadNote italic center; garis tebal warna primary), daftar field (baris legal FileText / footer StickyNote / rekening Landmark) dgn max-h-44 overflow-y-auto + empty "Belum diisi"
  - Tombol "Edit" (Pencil) hanya OWNER/MANAGER; role lain lihat chip "Hanya Owner/Manajer dapat mengubah"
  - Dialog Edit (sm:max-w-2xl): pratinjau kop surat LIVE di atas form (mengikuti form.name/tagline/address/primaryColor + logoPreview), field lengkap Label+htmlFor: name, tagline, address(Textarea), phone, email, website, letterheadNote, footerNote, bankInfo(Textarea); primaryColor = input type="color" + Input teks hex TERSINKRONISASI DUA ARAH (validasi ^#[0-9A-Fa-f]{6}$, error inline rose, aria-invalid; tombol Simpan disabled bila hex invalid)
  - Bagian Logo: logo saat ini + keterangan fallback monogram, input file (accept PNG/JPG/WEBP/SVG) + validasi client tipe & maks 2MB + info amber "Maks 2 MB", tombol "Unggah Logo" → FormData fd.set("file", f) → api.uploadBrandLogo (tanpa Content-Type manual) → toast sukses, pratinjau dgn cache-bust dari logoUrl respons (server juga menyertakan ?v=), list lokal di-update; Loader2 + disabled saat busy
  - Simpan → api.updateBrand(brand, patch 10 field) → toast "Identitas {nama} tersimpan" → dialog tutup → refetch list; error → toast error
- app-shell.tsx: ViewKey += "brand"; NAV entri { key:"brand", label:"Identitas Brand", icon: Palette, roles: ALL_ROLES } SETELAH "Pengaturan Kanal" SEBELUM "Kontak"; import default BrandView; render {effectiveView === "brand" && <BrandView user={user} />} setelah channels; bagian lain tidak diubah
- VERIFIKASI API end-to-end (curl, owner@udp.co.id): GET /api/brands 200 = 4 brand (unimasi,segia,erfo,unicam); PUT patch penuh 200 + echo benar; PUT primaryColor "merah" → 400; login MARKETER → PUT 401 (gating); POST logo PNG 1x1 → 200 + logoUrl "/api/brands/unimasi/logo?v=…" + GET logo served 200; POST logo text/plain → 400 (format ditolak); data uji dipulihkan penuh (restore field + logoPath NULL via prisma db execute + file uji dihapus) → final diff = kosong, logoUrl kembali null
- INFRA: GET /api/brands awalnya 500 (TypeError db.brandProfile.upsert) — dev server lama (start 07:04) memegang Prisma client STALE (model BrandProfile ditambahkan 14:15); db push (sudah in-sync) + prisma generate, lalu RESTART dev server (proses lama di-kill, `bun run dev` dijalankan ulang persis sama, log tetap dev.log) — server kini sehat dan dibiarkan berjalan untuk agent lain
- bunx tsc --noEmit: 0 error; bunx eslint brand-view.tsx + app-shell.tsx: 0 error 0 warning

Stage Summary:
- Menu "Identitas Brand" (Palette) kini ada di sidebar utk SEMUA role internal, view menampilkan 4 kartu brand dgn pratinjau kop surat mini + field legal/footer/rekening; OWNER/MANAGER bisa edit semua field (termasuk warna picker+hex dua arah) & unggah logo ≤2MB; role lain read-only dgn chip penjelas
- Perubahan identitas langsung memengaruhi kop surat dokumen (BrandDocument) karena membaca field BrandProfileDTO yang sama
- Temuan penting: server menyertakan cache-bust (?v=) pada logoUrl; client tetap cache-bust ulang dari logoUrl respons sesuai spec
- Artefak: src/components/views/brand-view.tsx (baru), src/components/app-shell.tsx (nav + render); tidak ada perubahan backend/kontrak; dev server direstart (sehat, port 3000)
- Saran lanjutan: pratinjau dokumen penuh per brand dari view ini, kompres/resize logo saat upload, tombol hapus logo

---
Task ID: 1, 3, 4 (main orchestrator)
Agent: main (orchestrator)
Task: Dokumen ter-format identitas brand (kop surat) + Buat Brief/Penawaran dari percakapan lead + editor Identitas Brand

Work Log:
- Permintaan user: (a) di lead (inbox percakapan) bisa langsung buat penawaran & brief, (b) hasilnya dokumen terformat sesuai logo & identitas brand, (c) user bisa edit brand terutama template kop surat.
- PRISMA: model BrandProfile (brand unique, name, tagline, logoPath, address, phone, email, website, primaryColor hex, letterheadNote, footerNote, bankInfo) + db push. TANPA seed ulang — auto-create default via src/lib/brands.ts (DEFAULT_BRAND_PROFILES utk unimasi emerald/segia teal/erfo amber/unicam violet, getOrCreateBrandProfiles upsert, mapBrandProfile dengan logoUrl cache-bust ?v=updatedAt).
- API BARU: GET /api/brands (semua role internal; auto-create), PUT /api/brands (OWNER/MANAGER; validasi hex ^#RRGGBB$, name wajib; logAudit), POST/GET /api/brands/[brand]/logo (multipart PNG/JPG/WEBP/SVG maks 2MB → uploads/brand-<key>-<ts>.<ext>; GET menyajikan file utk <img> kop).
- KONTRAK: crm-types += BrandProfileDTO, BrandDocType; api-client += brands()/updateBrand()/uploadBrandLogo().
- KOMPONEN BARU src/components/brand-document.tsx: BrandDocument (lembar A4: kop logo/monogram + nama berwarna primary + tagline + kontak + baris legal + garis tebal warna brand, judul dokumen + nomor/tanggal, "Kepada Yth.", children isi, box PEMBAYARAN opsional, blok tanda tangan, footer) + BrandDocDialog (overlay + toolbar no-print "Cetak / Simpan PDF" window.print + brand autofetch by brandKey) + fmtDocRupiah/fmtDocDate. Print CSS di globals.css (@media print: hanya .brand-doc terlihat, .no-print hidden).
- KOMPONEN BARU src/components/doc-content.tsx: QuotationDocContent (intro + tabel item + subtotal/diskon/PPN/TOTAL + catatan + ketentuan 30 hari) & BriefDocContent (chips permintaan+deadline, Latar & Tujuan, Audiens, Deliverables list, Referensi, tabel Estimasi Produksi dgn total jam/biaya).
- INBOX (src/components/views/inbox-view.tsx + src/components/lead-doc-dialogs.tsx BARU): LeadDetailPanel dapat prop user; tombol "Buat Brief" & "Buat Penawaran" di header lead (canAct, disembunyikan utk status LOST/WON); dialog brief (judul prefill subjek, tujuan*, audiens, deliverables multiline, referensi, deadline) & dialog penawaran (judul prefill, item dinamis desc/qty/harga + tambah/hapus baris, diskon%, PPN%, ringkasan total live, catatan); setelah sukses → list di-refresh + PRATINJAU DOKUMEN TER-BRAND langsung terbuka. API sudah auto-sync lead (QT → stage PROPOSAL/status QUOTED + notif FINANCE; brief tolak LOST).
- Task 2-a (subagent): tombol "Dokumen" per baris penawaran di finance-view & per kartu brief di brief-view (aria-label "Buka dokumen …"), masing-masing satu BrandDocDialog (penawaran showBankInfo + signatureName=user.name; brief signatureName=createdByName).
- Task 2-b (subagent): view BARU brand-view.tsx "Identitas Brand" (kartu 4 brand dgn pratinjau mini kop: logo/monogram, nama berwarna, kontak, baris legal/footer/rekening; dialog Edit lengkap + color picker & hex dua arah + pratinjau kop live + upload logo validasi client; gating OWNER/MANAGER — role lain chip "Hanya Owner/Manajer") + nav app-shell "Identitas Brand" (Palette) utk ALL_ROLES setelah Pengaturan Kanal. Subagent juga fix Prisma client stale dgn restart dev server.
- E2E browser (owner): Identitas Brand render 4 kartu ✓; edit baris legal Unimasi → tersimpan + kartu update (lalu dipulihkan) ✓; produksi lihat read-only chip ✓; inbox LD-000009 → Buat Penawaran 2 item → QT-0005 + pratinjau SURAT PENAWARAN (kop Segia teal, tabel, TOTAL, rekening) ✓; Buat Brief → BRF-0006 + pratinjau BRIEF PROYEK ✓; status lead otomatis jadi "Penawaran" ✓; Keuangan → Dokumen QT-0004 → kop Erfo amber ✓; Brief → Dokumen BRF-0003 ✓; upload logo SVG Unimasi via UI → toast + preview ✓; QT-0006 dari LD-000001 (Unimasi) → kop memakai LOGO asli hasil unggahan ✓; mobile 390px brand view tanpa overflow ✓.
- tsc 0 error; bun run lint 0 error (2 warning lama); dev.log tanpa error kompilasi (entry "Unexpected token" di buffer console agent-browser adalah sisa state antara saat subagent menyimpan file — terbukti hilang: touch file → kompilasi sukses, page 200, seluruh alur jalan).

Stage Summary:
- FITUR BARU UTUH: (1) Buat Brief & Penawaran langsung dari percakapan lead → dokumen ter-brand otomatis terbuka; (2) Semua Penawaran/Brief bisa dicetak jadi PDF dgn kop surat sesuai brand (logo, warna, alamat, rekening, baris legal); (3) Editor Identitas Brand (Owner/Manajer) — logo, warna, kontak, baris legal kop, footer, rekening — perubahan langsung dipakai semua dokumen.
- Data demo bertambah konsisten: QT-0005/QT-0006 (ld LD-000009 & LD-000001 kini QUOTED), BRF-0006 (DRAFT), logo Unimasi terunggah.
- Saran lanjutan: kirim dokumen via email/WhatsApp dari dialog (attach), invoice & kwitansi ter-brand, upload logo per brand lengkap 4-4, preview PDF asli (server-side render), histori kirim dokumen.

---
Task ID: 14 (main orchestrator)
Agent: main (orchestrator)
Task: Mekanisme lead masuk REAL (bukan dummy) + identifikasi kontak anti-duplikat + routing balasan ke kanal yang tepat + dukungan lead mancanegara

Work Log:
- Permintaan user: (a) lead masuk harus real input — form kontak lengkap (nama lengkap, perusahaan, jabatan, kontak: email/IG/dll sesuai sumber lead), (b) hindari duplikat data, (c) pastikan alur data lead benar-benar masuk dari DM Instagram/WhatsApp, (d) balasan harus mengarah ke kanal yang TEPAT (IG → DM IG, WA → nomor WA), (e) dukung lead mancanegara.
- PRISMA: Contact += position (jabatan), companyName (teks bebas — lead mancanegara belum tentu match record Company), country (default "Indonesia"). db push OK.
- FILE BARU src/lib/countries.ts: 30 negara (Indonesia default + mancanegara: SG/MY/AU/US/UK/AE/JP/KR/DE/dll) dgn dial code + emoji bendera; normalizePhoneGlobal (0→62, internasional dipertahankan); formatPhoneDisplay (+62 8xx-xxxx-xxxx / +prefix lain).
- KONTRAK: crm-types += ContactDTO.position/companyName/country/notes, LeadDTO.contact diperluas, IntakeLeadInput/IntakeLeadResult (matchedBy: phone|email|instagram), ReplyChannel + REPLY_CHANNEL_LABEL, ChannelAvailability, LeadMessageDTO.destination. api-client += intakeLead, createContact (kembalikan payload 409 utk UI merge), updateContact (PUT), sendLeadMessage kini terima channel; ContactDuplicateInfo/CreateContactResult.
- INGEST (lead-ingest.ts): dedupe kontak berurutan phone → email → IG + matchedBy; enrichment identitas (jabatan/perusahaan/negara/catatan diisi bila kosong — lead pindah kanal tetap satu profil); channel diperlebar ke manual; statistik kanal hanya utk kanal nyata.
- API BARU POST /api/leads/intake (OWNER/MANAGER/MARKETER): validasi channel/nama/subjek/pesan + minimal 1 handle (kecuali web/manual) → pipeline ingest SAMA dengan webhook kanal (dedupe, merge lead terbuka ≤14 hari kanal sama, skor, notif, audit). POST /api/leads (manual) kini juga lewat pipeline ingest.
- API contacts: GET menyertakan identitas baru + company = companyName ?? Company; POST dgn dedupe 409 + payload existing; PUT edit (validasi antar-kontak: nomor/email/IG tidak boleh milik kontak lain).
- API messages (ROUTING BALASAN — inti permintaan): OUT kini WAJIB channel tervalidasi terhadap handle kontak nyata — whatsapp→phone, email→email, instagram→ig, web→butuh email (forward); kanal tanpa tujuan ditolak 400 dgn pesan jelas + daftar kanal yang tersedia; audit mencatat "Kirim via X ke Y".
- UI BARU intake-lead-dialog.tsx ("Lead Masuk" di header Inbox): pilih kanal sumber (chip WhatsApp/IG/Email/Web/Manual dgn ikon), nama*, perusahaan, jabatan, negara (30 pilihan + dial), WA/telepon (prefix dial + preview format tersimpan), email, IG, subjek*, isi pesan* (placeholder contoh per kanal), brand, sumber detail. Toast hasil BERSARANG: lead baru + kontak baru / lead baru + kontak existing (cocok via X) / pesan nempel ke lead terbuka (kanal sama). List reload + lead langsung terpilih.
- UI BARU contact-form-dialog.tsx (dipakai Kontak & Inbox): tambah/edit kontak lengkap dgn negara+dial, preview nomor, catatan; dedupe → box amber "Tidak jadi duplikat — kontak sudah ada" + tombol "Gunakan kontak <nama>".
- INBOX: header + tombol "Lead Masuk" (juga di empty-state); detail lead menampilkan identitas kontak lengkap (nama — jabatan · perusahaan · bendera negara) + chip kanal tersedia (+nomor/email/@IG) + tombol Edit Kontak; KOMPOSER ROUTING KANAL: Select "Kanal balasan" (default = kanal asal lead bila handle tersedia, else kanal pertama tersedia, else catatan) — opsi tanpa handle DISABLED dgn alasan ("belum ada nomor WhatsApp"), opsi tersedia menampilkan tujuan ("→ +62…"), hint bawah "Balasan diarahkan ke <tujuan> via <kanal>", peringatan amber bila kanal asal lead tak tersedia dgn tombol Edit Kontak inline; bubble OUT menampilkan "dikirim via <kanal> → <tujuan>"; note mode = pilihan "Catatan internal" di select yang sama.
- KONTAK view: tombol "Tambah Kontak", aksi Edit per baris, kolom Nama+Jabatan & Negara (bendera), telepon terformat, gating OWNER/MANAGER/MARKETER.
- E2E API (curl): intake IG Amerika Serikat → LD-000010 kontak baru ✓; DM kedua → append LD-000010 (matchedBy instagram) ✓; intake WA +1 415 555 0188 + IG handle → kontak existing cocok via IG, nomor diperkaya, lead baru LD-00011 kanal WA ✓; balas via WA → 201 destination +14155550188 ✓; balas via email (tak ada email) → 400 dgn daftar kanal tersedia ✓; kontak duplikat email seed → 409 + existing "Melisa Tanujaya" ✓; kontak baru Jerman (+49…) tersimpan 49301234567/Jerman ✓; edit kontak tambah email → 200 ✓; validasi (tanpa nama / kanal ngawur) → 400 ✓.
- E2E browser (marketing@udp.co.id): Lead Masuk → Oliver Bennett (UK, Email) → LD-000012 tampil, identitas "Oliver Bennett — Event Manager · Brighton Events Co — 🇬🇧 Inggris Raya" ✓; lead Emma Laurent (IG, Prancis) → badge Instagram DM ✓ komposer default "Instagram DM → @emma.beaute" ✓ balas → toast "terkirim via Instagram DM ke @emma.beaute" + bubble "dikirim via instagram" ✓; Oliver (lead WA tanpa nomor) → peringatan amber + opsi WA/IG disabled dgn alasan ✓; Edit Kontak → isi +44 & IG → peringatan HILANG, default balas kembali ke WhatsApp "→ +442079460958" ✓ balas → "terkirim via WhatsApp ke +442079460958" ✓; Kontak: Tambah dgn email duplikat → box dedupe + tombol "Gunakan kontak" ✓; tabel menampilkan jabatan/negara/telepon terformat ✓; mobile 390px tanpa overflow, footer nempel ✓.
- INFRA: restart dev server diperlukan (Prisma client stale pasca db push — pola berulang). CARA YANG BERHASIL: `cd /home/z/my-project && (setsid bun run dev &)`. Pola `nohup … &` biasa MATI saat sesi shell tool berakhir; `next` tak ada di PATH langsung (pakai bun run dev).
- Catatan tooling: agent-browser click koordinat sering meleset pada tombol chip di dialog (klik "Email" tak efek) — gunakan eval dispatch mousedown/mouseup/click; verifikasi state via aria-pressed/combobox text.
- tsc 0 error; eslint 0 error (2 warning lama di logo route & pipeline-view); console browser bersih; dev.log bersih.
- Data demo baru: LD-000010..13 (Sarah Johnson US — IG+WA lintas kanal satu kontak; Oliver Bennett UK; Emma Laurent Prancis; Hans Müller DE di Kontak).

Stage Summary:
- LEAD MASUK KINI REAL: tombol "Lead Masuk" mencatat percakapan nyata dari kanal apa pun dgn identitas kontak lengkap (nama, perusahaan, jabatan, negara, WA/email/IG) — lewat pipeline dedupe yang sama dgn webhook: kontak ganda terdeteksi via nomor/email/IG, pesan lanjutan otomatis nyambung ke lead terbuka, identitas kontak diperkaya otomatis.
- ROUTING BALASAN DIJAMIN: balasan WA hanya bisa ke kontak yang punya nomor, DM hanya ke yang punya IG, dst — kanal tanpa tujuan ditolak di UI (disabled + alasan) DAN server (400); tujuan tampil eksplisit sebelum & sesudah kirim; lead lintas kanal (IG → WA) otomatis menyatu satu profil kontak.
- LEAD MANCANEGARA DIDUKUNG: negara + dial code 30 negara, normalisasi nomor internasional, bendera di UI.
- Saran lanjutan: merge kontak manual (2 profil orang sama), deteksi duplikat berbasis nama mirip saat intake, lampiran gambar pada pesan inbox, status kirim nyata per kanal (queued/delivered/read) saat kredensial kanal live diisi.

---
Task ID: 15 (main orchestrator)
Agent: main (orchestrator)
Task: Pipeline funnel → lompat ke Inbox Lead (follow-up cepat) + push project ke GitHub

Work Log:
- Permintaan user: (a) di pipeline funnel harus bisa menuju inbox lead yang dimaksud untuk mempermudah follow up, (b) push repo ke github.com/Muh-Adib/udp-1.
- NAVIGASI DEEP-LINK internal (tanpa route baru, AppShell tetap satu state view):
  - app-shell.tsx: state inboxLeadId + openLeadInInbox(leadId) → set id + pindah view "inbox"; dipass ke PipelineView (onOpenInbox), InboxView (initialLeadId), DashboardView (onOpenLead), dan NotifBell (onOpenLead).
  - pipeline-view.tsx: tiap kartu kanban dapat tombol "Follow Up" (MessageSquare, emerald, ml-auto; aria-label "Follow up lead <kode> di Inbox") → membuka Inbox pada lead tsb; deskripsi card kanban diperbarui.
  - inbox-view.tsx: prop initialLeadId; saat terisi, filter status awal = "ALL" (agar lead tujuan pasti muncul walau statusnya LOST/WON) + effect setSelectedId(initialLeadId).
  - NotifBell: notifikasi dengan link /inbox?lead=<id> kini bisa diklik (role=button, keyboard accessible) → langsung buka percakapan lead di Inbox; hint "klik untuk buka di Inbox".
  - Dashboard "Lead Terbaru": baris lead bisa diklik untuk follow up di Inbox (hover state + title).
- E2E browser (marketing): Pipeline → Follow Up LD-000003 → Inbox terbuka, filter "Semua", detail panel menampilkan "Rebranding brand skincare" (LD-000003) ✓; notifikasi "Lead baru dari Instagram Emma Laurent" diklik → Inbox membuka LD-000013 (detail "Stand vitrine …") ✓; tsc 0 error; eslint 0 error (2 warning lama); console bersih (warning Fast Refresh hanya efek hot reload saat file diedit).
- Catatan tooling: klik elemen div role=button di dalam dropdown Radix butuh element.click() NATIVE (dispatch synthetic pointer/mouse sequence tidak selalu memicu handler React pada kasus ini) — pelengkap catatan sebelumnya.
- PUSH GITHUB: repo https://github.com/Muh-Adib/udp-1.git (sebelumnya kosong).
  - HOUSEKEEPING SEBELUM PUSH: .env ternyata TERLACAK git → untrack (git rm --cached .env) + .gitignore diperbarui (.env, *.tsbuildinfo, dsb); tsconfig.tsbuildinfo ikut di-untrack. Verifikasi: .env TIDAK ikut terpush. uploads/ sengaja tetap dilacak (berisi logo brand + file demo yang direferensikan seed).
  - Commit 88b0a2f "feat: navigasi follow-up pipeline/notifikasi ke Inbox Lead + housekeeping repo" → push main → remote HEAD = 88b0a2f ✓; upstream main→origin/main diset.
  - PAT user dipakai via URL push (tidak ikut tercommit). CATATAN KEAMANAN: PAT diketahui via chat — disarankan user rotate/revoke setelah pakai bila ingin aman; remote origin disimpan TANPA token (push berikutnya butuh kredensial).

Stage Summary:
- Alur follow-up kini tanpa gesekan: Pipeline kanban → tombol "Follow Up" → Inbox Lead terbuka tepat pada percakapan lead tersebut (juga dari notifikasi & dashboard). Klien mancanegara/lintas kanal tetap satu profil kontak.
- Project terpush ke GitHub: https://github.com/Muh-Adib/udp-1 (branch main, commit 88b0a2f) dengan .env & artefak build di luar repo.
- Saran lanjutan: workflow GitHub Actions untuk lint otomatis, badge build di README, merge kontak manual, lampiran gambar pada pesan inbox.

---
Task ID: 16-b
Agent: frontend-styling-expert
Task: "Kirim Dokumen (Secure Link)" dari lead di Inbox + penjelasan transparan skor lead di Pipeline

Work Log:
- Baca worklog (entri terbawah: Task 15) + kontrak: secure-link-dialog.tsx (SecureLinkDialog — named export, props lead/historyFor/onCreated), crm-types.ts (SCORE_RULES 4 aturan dgn points/label/detail; CHANNEL_BASE_SCORE whatsapp 35/instagram 30/email 25/web 20/manual 15), ui/dialog.tsx (DialogContent sudah default max-h + overflow-y-auto). Kedua komponen kontrak TIDAK diubah, hanya dipakai.
- inbox-view.tsx (LeadDetailPanel): import SendHorizonal (lucide) + SecureLinkDialog; state baru `secureOpen`; tombol "Kirim Dokumen" (size sm, variant outline, ikon SendHorizonal, aria-label `Kirim dokumen untuk lead <lead.code>`) di header lead baris aksi yang sama dgn Buat Brief/Buat Penawaran — gating hanya `canAct` (tanpa blokir status LOST/WON agar file deliverable tetap bisa dikirim utk lead Menang); flex-wrap header dipertahankan sehingga tombol wrap rapi di 390px tanpa overflow horizontal. Render SATU instance SecureLinkDialog di fragmen `{lead && (<>…)}` bersama dialog brief/penawaran: lead={id, code, subject, contactName}, historyFor={leadId}, onCreated → onChanged() + void load() (refresh callback sama dgn pasca-buat brief/penawaran agar list & skor sinkron).
- pipeline-view.tsx: import HelpCircle (lucide) + SCORE_RULES & CHANNEL_BASE_SCORE (crm-types); state `scoreOpen`; tombol "Bagaimana skor terbentuk?" (size sm, variant ghost, ikon HelpCircle, aria-label "Penjelasan cara skor lead terbentuk") di header sisi kanan — dibungkus flex flex-wrap items-center gap-2 bersama tombol "Muat Ulang" (aman mobile). Dialog baru (max-w-lg, rounded-2xl) "Bagaimana Skor Lead Terbentuk?" + deskripsi "Skor 0–100 membantu tim memprioritaskan follow-up. Skor naik otomatis:"; isi = SCORE_RULES dipetakan jadi baris rounded-xl bg-slate-50: kiri Badge outline mono teal (points, mis. "15–35", "+5 / pesan (maks +25)"), kanan label (font-semibold text-sm) + detail (text-xs text-muted-foreground). Footer note box teal: "Nilai kanal awal: {CHANNEL_SCORE_NOTE} — dinilai dari kehangatan kanal: chat personal lebih hangat daripada form pasif." — CHANNEL_SCORE_NOTE dipetakan dari CHANNEL_BASE_SCORE via CHANNEL_SCORE_LABEL (hasil: "WhatsApp 35 · Instagram 30 · Email 25 · Form Web 20 · Manual 15"). Dialog dirender di akhir root div (di luar branch loading/error) sehingga tersedia saat memuat data; konten stack vertikal aman mobile (DialogContent default max-h + overflow-y-auto).
- Palet slate/teal saja (tanpa indigo/biru), teks Indonesia, ikon aria-hidden, aria-label di tombol, tanpa route baru, tanpa restrukturisasi kode lain.
- Verifikasi: `bunx tsc --noEmit` = 0 error; `bunx eslint src/components/views/inbox-view.tsx src/components/views/pipeline-view.tsx` = 0 error (1 warning pre-existing lama di pipeline-view soal useMemo `leads` — kode baseline, tidak disentuh); dev server port 3000 sehat, GET / 200, tanpa error kompilasi.

Stage Summary:
- Inbox: header detail lead kini punya "Kirim Dokumen" → SecureLinkDialog (pilih dokumen milik lead: Penawaran/Brief/File produksi, atur password + kedaluwarsa, salin link & pesan berbagi, kelola riwayat tautan aktif/nonaktif/reset/hapus). Setelah tautan dibuat, list lead + skor langsung di-refresh via callback yang sama dgn pembuatan brief/penawaran.
- Pipeline: tombol "Bagaimana skor terbentuk?" membuka dialog penjelasan skor yang transparan — 4 aturan pembentukan skor (basis kanal 15–35, pesan lanjutan +5/maks +25, balasan sales +5, WON = 100) plus catatan nilai kanal awal — menjawab pertanyaan user "jelaskan bagaimana skor terbentuk?".
- File berubah: src/components/views/inbox-view.tsx, src/components/views/pipeline-view.tsx. Kontrak SecureLinkDialog & crm-types tidak diubah.
- Saran lanjutan: badge jumlah secure link aktif di header lead, aksi "kirim via WA/email" langsung dari dialog, statistik dokumen yang paling sering dibagikan.

---
Task ID: 16-a
Agent: frontend-styling-expert
Task: UI milestone management (tambah/hapus) di detail proyek + kirim secure link per deliverable di ProductionView

Work Log:
- Satu-satunya file diubah: src/components/views/production-view.tsx (+225/-4). API/types/dialog secure-link sudah ada dari agent lain — hanya dikonsumsi, tidak diubah.
- DeliverableRow: props baru `canShareSecure` + `onShareSecure`; tombol compact KeyRound (size icon-sm, ghost, teal, aria-label "Kirim secure link untuk <nama>") di actions row sebelum tombol hapus.
- ProjectDetailView (drill-down detail proyek):
  - Props baru: `busyMsDelId`, `canShareSecure`, `onCreateMilestone(input) => Promise<boolean>`, `onRemoveMilestone(ms)`, `onSecureCreated()`.
  - Card header "Milestone & Deliverable": tombol "Tambah File / Tautan" + tombol baru "Tambah Milestone" (ListPlus, outline, tampil saat canToggleMilestone) dibungkus wrapper responsif `flex flex-col gap-2 sm:flex-row`.
  - Dialog "Tambah Milestone" (sm:max-w-md, state msDlgOpen/msTitle/msWeight default "10"/msDue): Label htmlFor SELALU tampil di semua breakpoint (ms-title "Judul milestone" placeholder "mis. Desain Konsep 3D"; ms-weight "Bobot (%)" number 0–100 + helper "Total bobot semua milestone menjadi 100% progress."; ms-due "Tenggat (opsional)" type date). Submit → api.createMilestone → toast `Milestone "<judul>" ditambahkan` → tutup & reset → refresh via onCreateMilestone (ProductionView `load()`, list & detail sinkron); gagal → dialog tetap terbuka. Weight di-clamp 0–100; dueDate → new Date(iso).toISOString().
  - Hapus milestone per-baris: tombol Trash2 (icon-sm ghost, rose, aria-label "Hapus milestone <judul>") di sebelah tombol "+", HANYA role OWNER/MANAGER, window.confirm("Hapus milestone "<judul>"? File/tautan terkait tetap tersimpan di 'Tanpa milestone'.") → api.deleteMilestone → toast + load(); spinner via busyMsDelId.
  - Secure link: SATU instance SecureLinkDialog di level ProjectDetailView (state secureTarget/secureOpen, target fixed {targetType:"DELIVERABLE", targetId, title, projectId, label} dari deliverable), onCreated → reloadAll. Row layout milestone tetap mobile-safe 390px (title min-w-0 flex-1 wrap, badge/tombol shrink-0, tanpa overflow horizontal).
- ProductionView: `canShareSecure` = OWNER/MANAGER/MARKETER/FINANCE/PRODUCTION (CLIENT tidak melihat); handler `createMilestone` (return boolean utk kontrol dialog) & `removeMilestone` (confirm + toast + load); props dipass ke ProjectDetailView; baris DeliverableRow di tab "File & Google Drive" juga dapat tombol secure link dengan SATU instance SecureLinkDialog di level ProductionView (openSecureDialogFor + secureTarget, onCreated → reloadAll) — tidak ada instance dialog per-baris.
- INSIDEN TOOLING (penting): MultiEdit ternyata TIDAK atomic di environment ini — attempt yang gagal di tengah meninggalkan edit parsial & duplikasi deklarasi (file korup). Pemulihan: backup ke /tmp → `git checkout -- src/components/views/production-view.tsx` (HEAD terverifikasi identik dgn file asli 1472 baris, belum tersentuh sejak Task 15) → semua edit diulang satu-per-satu via Edit individual + verifikasi grep. Pelajaran: utk file besar, gunakan Edit tunggal atau pastikan old_str unik & validasi tiap step.
- Verifikasi: `bunx tsc --noEmit` → 0 error; `bunx eslint src/components/views/production-view.tsx` → 0 error; dev server TIDAK di-restart; tidak ada route baru.

Stage Summary:
- Milestone kini bisa dikelola langsung dari detail proyek: tambah (judul/bobot/tenggat) & hapus (OWNER/MANAGER) dengan konfirmasi, refresh otomatis ke list & detail sekaligus.
- Keluhan "label tidak terlihat di mobile" diperbaiki: semua field dialog pakai Label htmlFor yang selalu tampak di semua breakpoint, layout header tombol responsif (stack di mobile, berdampingan di sm+).
- Setiap file/tautan produksi (detail proyek & tab File) bisa dikirim sebagai Secure Link berpassword via dialog bersama (password, kedaluwarsa, pesan siap kirim, riwayat ditangani komponen shared) — CLIENT tidak melihat aksi ini.
- Saran lanjutan: validasi total bobot milestone = 100% di server + peringatan UI saat melebihi; preview penerima secure link sebelum kirim.

---
Task ID: 16 (main orchestrator)
Agent: main (orchestrator) + subagent 16-a (production-view) + subagent 16-b (inbox/pipeline)
Task: Distribusi dokumen via SECURE LINK + password (dari lead & file produksi) + buat/hapus milestone manual (fix label mobile) + kartu penjelasan skor lead

Work Log:
- Permintaan user: (a) push ke GitHub agar tidak hilang, (b) perbaiki membuat milestone — label tidak terlihat di versi mobile, (c) pastikan semua alur tersinkron & bukan dummy, (d) jelaskan bagaimana skor lead terbentuk, (e) dari lead bisa kirim dokumen administratif (brief, penawaran, dll), (f) mekanisme kirim = secure link + password untuk membuka/preview dokumen — semua via secure link untuk distribusi file ke klien.
- PRISMA: model SecureLink (token URL-safe unique, title, targetType QUOTATION|BRIEF|DELIVERABLE, targetId, leadId?, projectId?, brand, passwordHash scrypt, active, expiresAt, accessCount, lastAccessAt, createdBy) + db push + generate + RESTART dev server (pola `(setsid bun run dev &)`).
- LIB BARU src/lib/secure-links.ts: generateToken (22 char), generatePassword (format XXXX-XXXX tanpa karakter ambigu), grant cookie HMAC (`sl_<token>`, httpOnly, 4 jam) untuk unduhan file TANPA password di URL, buildShareMessage (pesan siap salin utk WA/Email/IG).
- API BARU: POST/GET /api/secure-links (buat + riwayat; brand/lead/judul diambil otomatis dari target; password PLAIN hanya di respons create), PATCH/DELETE /api/secure-links/[id] (aktif/nonaktif, reset password, hapus; audit lengkap), POST /api/secure/access (PUBLIK — verifikasi password → cookie grant + payload dokumen ter-brand; 401 salah, 410 nonaktif/kedaluwarsa), GET /api/secure/file (PUBLIK unduhan file wajib cookie grant — tanpa grant 401, cegah path traversal).
- HALAMAN PUBLIK BARU /s/[token] (src/app/s/[token]/page.tsx + src/components/secure-doc-view.tsx): klien TANPA LOGIN — form password ("Dokumen Terproteksi") → pratinjau dokumen A4 ter-brand IDENTIK dgn pratinjau internal (BrandDocument + QuotationDocContent/BriefDocContent) + tombol Cetak/Simpan PDF + Unduh File (FILE) / Buka Tautan (LINK eksternal) + catatan kerahasiaan. Print CSS global otomatis berlaku.
- KONTRAK: crm-types += SecureTargetType/SECURE_TARGET_LABEL, SecureLinkDTO, SecureLinkCreateInput, SecureAccessResult, ScoreRule + SCORE_RULES; api-client += secureLinks/createSecureLink/updateSecureLink/deleteSecureLink/secureAccess + createMilestone/updateMilestone/deleteMilestone.
- API MILESTONE: POST /api/projects/[id]/milestones (OWNER/MANAGER/MARKETER/PRODUCTION; title wajib, bobot 0-100 default 10, dueDate; orderIdx otomatis; progress proyek dihitung ulang), PATCH/DELETE /api/milestones/[id] (edit judul/bobot/tenggat/status; delete hanya OWNER/MANAGER; audit).
- KOMPONEN BERSAMA BARU src/components/secure-link-dialog.tsx: 2 mode — (1) target tetap (file produksi), (2) pilih dokumen milik lead (quota Penawaran + Brief + File produksi proyek terkait leadCode). Password otomatis/manual + dice, masa berlaku 7/30/90/tanpa, hasil = panel sukses dgn Salin Tautan / Salin Password / Salin Pesan siap kirim, RIWAYAT tautan (status Aktif/Mati, N× dibuka, kadaluarsa, Nonaktifkan/Aktifkan, Reset Password, Hapus, Uji buka).
- SUBAGENT 16-a (production-view.tsx): "Tambah Milestone" dialog dgn Label htmlFor TERLIHAT di semua breakpoint (keluhan user) + helper total bobot; hapus milestone per-baris (OWNER/MANAGER, confirm); DeliverableRow dapat tombol KeyRound "Kirim secure link" → dialog bersama target tetap; 1 instance dialog per level view; refresh ganda list+detail.
- SUBAGENT 16-b (inbox-view.tsx + pipeline-view.tsx): tombol "Kirim Dokumen" di header lead (sejajar Buat Brief/Penawaran; tetap tampil utk WON agar file tetap bisa dikirim) → dialog pilih dokumen lead + riwayat; Pipeline dapat tombol "Bagaimana skor terbentuk?" → dialog 4 aturan skor (SCORE_RULES) + catatan nilai kanal (CHANNEL_BASE_SCORE).
- E2E BROWSER (marketing & manager): Kirim Dokumen LD-000009 → QT-0005 → tautan /s/v00Z… + password UJI123AB ✓; LOGOUT → halaman publik: password salah → "Password salah" ✓; benar → SURAT PENAWARAN ter-brand kop Unimasi, Kepada Yth. Kopi Kita Group u.p. Budi Santoso, TOTAL ✓; file LINK deliverable → pratinjau DOKUMEN PROYEK + Buka Tautan ✓; file FILE deliverable → Unduh File: fetch dgn cookie grant 200 attachment, TANPA grant 401 ✓; Tambah Milestone "Uji Coba QA Internal" → muncul + 10% ✓ lalu dihapus ✓; dialog skor: 4 aturan + nilai kanal ✓.
- MOBILE 390px (screenshot): dialog Tambah Milestone — semua label terlihat, tanpa overflow (perbaikan keluhan utama); Inbox header — Buat Brief/Penawaran/Kirim Dokumen wrap rapi, footer nempel; dialog skor — chip poin + aturan stack rapi.
- GIT: commit lokal selesai. PUSH ke github.com/Muh-Adib/udp-1 GAGAL — kredensial tidak tersedia lagi (PAT sebelumnya tidak disimpan di remote/env/history; remote disimpan tanpa token). BUTuh PAT dari user untuk push (atau user push manual: `git push origin main`).
- tsc 0 error; eslint 0 error (2 warning baseline lama); dev.log sehat (error transient saat subagent mengedit file — sudah pulih, kompilasi terakhir bersih).

Stage Summary:
- FITUR BARU UTUH: distribusi dokumen aman — penawaran/brief/file produksi dikirim sebagai tautan + password; klien membuka TANPA login di /s/<token>, pratinjau dokumen ter-brand identik dgn internal, bisa cetak PDF/unduh; link bisa dinonaktifkan, password direset, kedaluwarsa otomatis, jumlah akses tercatat, semua ter-audit.
- Milestone kini bisa DIBUAT & DIHAPUS manual dari detail proyek (sebelumnya hanya otomatis) dengan label yang terlihat di mobile.
- Skor lead transparan: dialog "Bagaimana skor terbentuk?" di Pipeline (basis kanal 15-35, +5/pesan masuk maks +25, +5/balasan, WON=100).
- Saran lanjutan: kirim otomatis pesan secure link ke kanal lead (WA/IG/email) sekali klik, total bobot milestone = 100% divalidasi server, notifikasi ke sales saat klien membuka dokumen, password expiry hint di halaman publik.

---
Task ID: 17 (main orchestrator)
Agent: main (orchestrator)
Task: Push GitHub dengan PAT user + identitas kanal per brand (Instagram/web/email masing-masing brand) + lead wajib ter-identifikasi brand (tidak boleh kosong)

Work Log:
- GIT PUSH BERHASIL: user kirim PAT (github_pat_...). Verifikasi via API: token milik Muh-Adib, akses push penuh ke Muh-Adib/udp-1. `git remote set-url origin <token>@github.com/Muh-Adib/udp-1.git` + push 3 commit tertahan (693493f..04063bb). Commit 04063bb = hasil Task 16 (secure link, milestone manual, kartu skor). Semua kerja sebelumnya kini aman di GitHub.
- Keluhan user: "masing masing brand memiliki instagram dan juga webnya sendiri jadi lead sudah ter identifikasi brand mana yang nyantol tidak blank kosongan, termasuk email nya".
- AKAR MASALAH DITEMUKAN: `normalizeBrand()` di lead-ingest.ts diam-diam fallback ke "unimasi" untuk lead tanpa brand — lead tidak benar-benar ter-identifikasi brand (persis "blank kosongan" yang dirasakan user). BrandProfile juga belum punya field Instagram.
- PRISMA: BrandProfile += `instagram String @default("")` + db push + generate.
- RESTART DEV SERVER 2x: setelah generate pertama, Next.js masih memakai Prisma client lama dari cache (dev.log: "Unknown argument `instagram`") → fix final: `pkill next dev` + `rm -rf .next` + restart. Pelajaran: perubahan schema Prisma = restart + clear .next bila muncul Unknown argument.
- LIB brands.ts: DEFAULT_BRAND_PROFILES += instagram per brand (@unimasi.id, @segia.tech, @erfo.id, @unicam.studio); getOrCreateBrandProfiles kini BACKFILL field kanal kosong (instagram/email/website/phone) tanpa menimpa editan user (patch hanya utk field kosong); mapBrandProfile += instagram.
- KONTRAK: BrandProfileDTO += instagram; api-client updateBrand += instagram; /api/brands PUT strFields += instagram.
- INTAKE API (/api/leads/intake): brand kini WAJIB — kosong → 400 "Pilih brand yang dituju lead", tidak dikenal → 400 (tanpa default senyap).
- LEAD-INGEST: normalizeBrand diganti resolveBrand async — 1) brand eksplisit, 2) defaultBrand dari configJson ChannelConfig kanal (akun resmi terpasang), 3) fallback unimasi hanya agar kolom non-null terpenuhi (webhook). brandKey dihitung sekali, dipakai lead.create + notifikasi.
- KOMPONEN BARU brand-chip.tsx: BrandChip — badge brand berdot warna identitas (unimasi emerald/segia teal/erfo amber/unicam violet). Dipasang di: baris list Inbox (paling depan), header detail lead, kartu Pipeline (menggantikan badge BRAND_LABEL polos).
- INTAKE DIALOG (intake-lead-dialog.tsx): brand state default "" (tanpa default senyap) + marker wajib merah + placeholder "Pilih brand…"; canSubmit menuntut brand terisi; load api.brands() saat dialog dibuka → helper box "Percakapan tercatat atas akun resmi brand ini:" menampilkan IG + email + website brand terpilih + catatan "Kop dokumen otomatis mengikuti identitas brand ini"; placeholder Sumber detail dinamis per kanal dari akun brand (IG → "DM masuk ke @segia.tech", email → "masuk ke halo@...", web → "form di www...", WA → "WA bisnis +62...").
- BRAND VIEW (brand-view.tsx): form state + input Instagram (ikon AtSign) di dialog edit (sebaris Website); kartu brand += baris Instagram; LetterheadPreview baris kontak kedua = "IG · website" (kartu + live preview edit).
- KOP SURAT (brand-document.tsx): baris kontak kop += "[instagram · website]"; footer dokumen += instagram. Semua dokumen ter-brand (penawaran/brief/internal + halaman publik /s/token) otomatis menampilkan IG brand.
- E2E BROWSER (Sinta/marketing): Login persist ✓ → Inbox → Catat Lead Masuk: brand kosong + tombol Catat DISABLED ✓ → pilih Segia Tech → helper "@segia.tech · hello@segia.tech · www.segia.tech" ✓ → isi form (Ayu Lestari, Skincare Global Pte Ltd, WA 812…) → submit → LD-000014 muncul di list dgn chip "Segia Tech" ✓ → detail header "LD-000014 · Segia Tech · WhatsApp Business · Baru · Skor 35/100" (35 = basis kanal WA, skor nyata) ✓.
- E2E IDENTITAS BRAND: kartu menampilkan @unimasi.id/@segia.tech/@erfo.id/@unicam.studio ✓ → dialog Edit: field Instagram terisi @unimasi.id ✓, live preview kop mengandung IG ✓.
- MOBILE 390px screenshot: label "Brand yang dituju *" merah + helper akun brand rapi + placeholder sumber detail dinamis ("mis. WA bisnis +62 21 5150 3311") + TANPA overflow horizontal ✓.
- Verifikasi: bunx tsc --noEmit = 0 error; eslint file tersentuh = 0 error (warning baseline lama pipeline-view); bun run lint = 0 error/2 warning baseline; /api/brands pulih (401 tanpa cookie, 200 dgn sesi).

Stage Summary:
- PUSH GITHUB AMAN: semua commit tertahan sudah di github.com/Muh-Adib/udp-1 (remote kini menyimpan PAT untuk push berikutnya tanpa input ulang).
- Setiap brand kini punya identitas kanal lengkap yang bisa diedit Owner/Manajer: Instagram + email + website + telepon (salinan default realistis, backfill otomatis, tidak menimpa editan).
- LEAD TIDAK LAGI "BLANK KOSONGAN": form intake mewajibkan pilih brand eksplisit (API menolak kosong), staf langsung melihat akun resmi brand (IG/email/web) saat mencatat percakapan, dan chip brand berwarna tampil di daftar/detail Inbox + kartu Pipeline + notifikasi.
- Kop surat semua dokumen (termasuk halaman secure link publik) kini mencantumkan Instagram brand di samping email & website.
- Saran lanjutan: filter daftar lead per brand di Inbox; webhook IG memetakan handle via data BrandProfile.instagram (bukan hardcode brandMap); statistik lead per brand di Reports.
