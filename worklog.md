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
