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
