"use client";

/**
 * GuideView — Petunjuk Penggunaan CRM UDP (PT. Unicam Digital Pictvres).
 * Konten statis resmi (tanpa fetch API): alur sistem, panduan per peran,
 * menu & fitur, FAQ, dan tips praktis.
 */

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  BookUser,
  Briefcase,
  Building2,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Crown,
  Factory,
  Filter,
  Globe,
  HardHat,
  HelpCircle,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  Lightbulb,
  Megaphone,
  ReceiptText,
  Route,
  Users,
  Webhook,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  LEAD_STAGE_BADGE,
  LEAD_STAGE_LABEL,
  LEAD_STAGES,
  ROLE_LABEL,
  type Role,
  type SessionUser,
} from "@/lib/crm-types";

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

type Tone = "slate" | "amber" | "emerald";

const FLOW_TONES: Record<Tone, { card: string; chip: string; badge: string }> = {
  slate: { card: "border-slate-200 bg-white", chip: "bg-slate-900 text-white", badge: "border-slate-300 bg-slate-100 text-slate-700" },
  amber: { card: "border-amber-300 bg-amber-50", chip: "bg-amber-500 text-white", badge: "border-amber-300 bg-amber-100 text-amber-800" },
  emerald: { card: "border-emerald-300 bg-emerald-50", chip: "bg-emerald-600 text-white", badge: "border-emerald-300 bg-emerald-100 text-emerald-800" },
};

interface RoleGuide {
  role: Role;
  icon: LucideIcon;
  menus: string[];
  duties: string[];
}

const ROLE_GUIDES: RoleGuide[] = [
  {
    role: "OWNER",
    icon: Crown,
    menus: ["Semua menu (Dashboard s.d. Portal Klien)", "Pengaturan sistem: SLA balasan & kanal"],
    duties: [
      "Mengatur SLA balasan pertama & pengaturan sistem",
      "Mengelola pengguna dan mereset password akun",
      "Memantau kinerja penjualan & produksi semua brand",
      "Mengawasi arus kas lewat ringkasan Keuangan",
    ],
  },
  {
    role: "MANAGER",
    icon: Briefcase,
    menus: ["Dashboard", "Inbox Lead", "Pipeline & Funnel", "Brief & Estimasi", "Keuangan", "Produksi", "Kontak"],
    duties: [
      "Memantau funnel & kepatuhan SLA tim",
      "Menugaskan lead ke marketer yang sesuai",
      "Membuat & mengirim brief ke tim produksi",
      "Mengawasi proyek, milestone, dan progress produksi",
      "Meninjau penawaran sebelum dikirim ke klien",
    ],
  },
  {
    role: "MARKETER",
    icon: Megaphone,
    menus: ["Dashboard", "Inbox Lead", "Pipeline & Funnel", "Brief & Estimasi", "Kontak"],
    duties: [
      "Membalas pesan pertama lead ≤ SLA 2 jam",
      "Menggeser tahap funnel: kualifikasi → usulan penawaran → negosiasi",
      "Membuat brief dari lead terkualifikasi dan mengirimnya untuk estimasi",
      "Memprioritaskan lead Hot (skor ≥ 80)",
      "Menandai lead Menang / Hilang beserta alasannya",
    ],
  },
  {
    role: "PRODUCTION",
    icon: HardHat,
    menus: ["Dashboard", "Brief & Estimasi", "Produksi", "Petunjuk"],
    duties: [
      "Menghitung estimasi pengerjaan dari brief (jam & biaya)",
      "Mengerjakan milestone proyek sesuai urutan & bobot",
      "Mengirim file produksi atau link Google Drive ke proyek",
      "Menjaga progress proyek tetap akurat di menu Produksi",
    ],
  },
  {
    role: "FINANCE",
    icon: Calculator,
    menus: ["Dashboard", "Brief & Estimasi", "Keuangan", "Pipeline & Funnel"],
    duties: [
      "Membuat & mengirim penawaran (QT) — pakai estimasi produksi sebagai dasar harga",
      "Menyetujui penawaran — otomatis membuat proyek + invoice DP",
      "Mencatat pembayaran invoice (DP & pelunasan)",
      "Memantau outstanding & invoice jatuh tempo",
    ],
  },
  {
    role: "CLIENT",
    icon: Building2,
    menus: ["Portal Klien"],
    duties: [
      "Melihat proyek & progress milik perusahaannya",
      "Mengunduh file produksi atau membuka link Google Drive dari Portal",
      "Melihat invoice dan penawaran di Portal",
      "Mengajukan permintaan baru lewat kanal (WA / Email / IG / Web)",
    ],
  },
];

interface MenuGuide {
  icon: LucideIcon;
  name: string;
  desc: string;
  steps: string[];
}

const MENU_GUIDES: MenuGuide[] = [
  {
    icon: LayoutDashboard,
    name: "Dashboard",
    desc: "Ringkasan harian: KPI lead, distribusi kanal, kesehatan kanal, dan responsivitas tim.",
    steps: [
      "Buka Dashboard untuk melihat total lead, lead baru, dan lead menang.",
      "Perhatikan banner peringatan SLA — muncul bila ada lead baru yang belum dibalas.",
      "Cek 'Kesehatan Kanal': kanal aktif bertanda titik hijau dan mencatat jumlah event.",
      "Gulir ke 'Lead Terbaru' untuk melihat lead yang baru masuk hari ini.",
    ],
  },
  {
    icon: Inbox,
    name: "Inbox Lead",
    desc: "Kotak masuk terpusat untuk membalas lead dari semua kanal dalam satu tempat.",
    steps: [
      "Pilih lead dari daftar (filter status/kanal atau gunakan pencarian).",
      "Baca riwayat percakapan, lalu balas lewat komposer — pesan terkirim via kanal asal lead.",
      "Gunakan 'Catatan Internal' untuk koordinasi tim (tidak terkirim ke klien).",
      "Selesai ditangani? Tandai 'Menang' atau 'Hilang' (wajib pilih alasan bila hilang).",
    ],
  },
  {
    icon: Filter,
    name: "Pipeline & Funnel",
    desc: "Papan tahapan penjualan: dari Lead Baru hingga Menang, lengkap dengan statistik konversi.",
    steps: [
      "Buka Pipeline & Funnel untuk melihat jumlah dan nilai tiap tahap.",
      "Pilih lead, lalu pindahkan tahapnya — status lead ikut tersinkron otomatis.",
      "Isi nilai estimasi (estValue) agar nilai pipeline akurat.",
      "Pantau rasio konversi dan nilai rata-rata deal pada ringkasan funnel.",
    ],
  },
  {
    icon: ClipboardList,
    name: "Brief & Estimasi",
    desc: "Penghubung antar tim: Marketing membuat brief, Produksi menghitung estimasi, Keuangan menyusun penawaran.",
    steps: [
      "Buat brief dari lead terkualifikasi: tujuan, target audiens, deliverable, deadline, dan referensi.",
      "Klik 'Kirim untuk Estimasi' — tim Produksi mendapat notifikasi.",
      "Role Produksi membuka brief dan mengisi 'Buat Estimasi': pekerjaan, qty, jam, biaya — total live.",
      "Setelah ters estimasi, brief berstatus 'Siap Ditawarkan' — lanjutkan di menu Keuangan.",
    ],
  },
  {
    icon: ReceiptText,
    name: "Keuangan",
    desc: "Penawaran (QT), invoice, pembayaran, dan pemantauan outstanding per brand.",
    steps: [
      "Klik 'Penawaran Baru', pilih lead — bila ada estimasi produksi, kotak referensi jam & biaya tampil otomatis.",
      "Isi rincian item, diskon, dan PPN — nomor QT dibuat otomatis.",
      "Kirim penawaran ke klien (status berubah menjadi 'Terkirim').",
      "Saat klien setuju, tekan 'Setujui' — sistem otomatis membuat Proyek PRJ + milestone + Invoice DP 50%, dan brief terhubung ke proyek.",
      "Catat pembayaran pada invoice; status Lunas terdeteksi otomatis.",
    ],
  },
  {
    icon: Factory,
    name: "Produksi",
    desc: "Proyek berjalan, milestone berbobot, progress otomatis, plus kirim file / link Google Drive.",
    steps: [
      "Buka menu Produksi dan pilih proyek yang sedang berjalan.",
      "Kerjakan sesuai urutan milestone; centang (toggle) milestone saat tahap itu selesai.",
      "Tab 'File & Google Drive': kirim file final (maks 10 MB) atau tempel link Google Drive per milestone.",
      "File yang dikirim otomatis tampil di Portal Klien untuk diserahkan ke pelanggan.",
    ],
  },
  {
    icon: Webhook,
    name: "Pengaturan Kanal",
    desc: "Konfigurasi webhook WhatsApp, Email, Instagram, dan Form Web — pintu masuk lead otomatis.",
    steps: [
      "Aktifkan kanal, lalu isi kredensial provider pada dialog 'Konfigurasi'.",
      "Salin URL Webhook & Token di tiap kartu untuk dipasang di provider (Meta, email forwarding, dsb.).",
      "Gunakan tombol 'Uji Pesan Masuk' untuk mensimulasikan pesan — lead baru langsung muncul di Inbox Lead.",
      "Pantau jumlah event & waktu event terakhir sebagai bukti kanal berjalan normal.",
      "Untuk Form Web, salin Snippet Embed dan tempel di website brand Anda.",
    ],
  },
  {
    icon: BookUser,
    name: "Kontak",
    desc: "Basis data kontak gabungan dari semua kanal, terdedupe otomatis.",
    steps: [
      "Gunakan kolom pencarian (nama, email, telepon) — hasil muncul otomatis tanpa tombol.",
      "Kolom 'Sumber' menunjukkan kanal pertama kali kontak dikenal.",
      "Kolom 'Lead' menampilkan berapa lead yang pernah terkait kontak tersebut.",
    ],
  },
  {
    icon: Globe,
    name: "Portal Klien",
    desc: "Akses khusus klien untuk memantau pekerjaan, tagihan, dan penawarannya.",
    steps: [
      "Klien login dengan akun yang diberikan perusahaan.",
      "Lihat daftar proyek beserta progress dan status terkini.",
      "Periksa invoice (belum dibayar / sebagian / lunas / jatuh tempo) dan penawaran.",
      "Klien hanya dapat melihat data milik perusahaannya sendiri.",
    ],
  },
];

const FAQS: { q: string; a: string }[] = [
  {
    q: "Berapa SLA balasan pertama?",
    a: "2 jam pada pengaturan default. Batas ini dapat diubah oleh Owner di pengaturan sistem. Lead yang melewati batas ditandai 'Terlambat SLA' di Inbox Lead dan Dashboard.",
  },
  {
    q: "Apa yang terjadi setelah penawaran disetujui?",
    a: "Sistem bekerja otomatis: lead menjadi 'Menang', dibuat Proyek PRJ beserta milestone default, dan Invoice DP 50% langsung terbit — siap dicatat pembayarannya oleh Finance.",
  },
  {
    q: "Bagaimana lead bisa masuk otomatis?",
    a: "Empat kanal (WhatsApp, Email, Instagram, Form Web) terhubung lewat webhook. URL webhook + token tiap kanal tersedia di halaman Pengaturan Kanal. Gunakan tombol 'Uji Pesan Masuk' di halaman tersebut untuk simulasi tanpa menunggu pesan asli.",
  },
  {
    q: "Bagaimana jika invoice terlambat dibayar?",
    a: "Begitu melewati tanggal jatuh tempo, status invoice berubah otomatis menjadi 'Jatuh Tempo' (badge merah) dan tetap masuk perhitungan outstanding di dashboard Keuangan.",
  },
  {
    q: "Bagaimana progress proyek dihitung?",
    a: "Dari bobot milestone. Setiap milestone memiliki bobot (persentase); progress proyek = penjumlahan bobot milestone yang sudah selesai. Toggle milestone di menu Produksi dan progress langsung diperbarui.",
  },
  {
    q: "Lupa password?",
    a: "Hubungi Owner / Dirut untuk mereset password akun Anda. Demi keamanan, CRM tidak menyediakan reset mandiri lewat email.",
  },
  {
    q: "Bisakah klien melihat proyek?",
    a: "Ya. Klien mengakses Portal Klien untuk melihat proyek, progress, invoice, serta penawaran — namun hanya milik perusahaannya sendiri.",
  },
  {
    q: "Bagaimana cara mencoba sistem tanpa data asli?",
    a: "Buka Pengaturan Kanal lalu tekan 'Uji Pesan Masuk' pada salah satu kanal. Lead simulasi akan muncul di Inbox Lead sehingga seluruh alur (balas → funnel → penawaran → proyek) bisa dicoba end-to-end.",
  },
];

const TIPS: { title: string; desc: string }[] = [
  {
    title: "Prioritaskan lead Hot",
    desc: "Skor lead ≥ 80 (Hot) berarti prospek paling hangat — hubungi lebih dulu sebelum skor dan minatnya menurun.",
  },
  {
    title: "Rutinitas pagi: cek funnel",
    desc: "Luangkan 5 menit tiap pagi membuka Pipeline & Funnel agar tidak ada lead mengendap terlalu lama di satu tahap.",
  },
  {
    title: "DP dulu, produksi kemudian",
    desc: "Pastikan Invoice DP 50% sudah terbit — dan idealnya dibayar — sebelum tim produksi mulai mengerjakan proyek.",
  },
  {
    title: "Bingung? Kembali ke sini",
    desc: "Halaman Petunjuk Penggunaan selalu tersedia: berisi alur, peran, langkah tiap menu, dan FAQ resmi sistem.",
  },
];

/* ------------------------------------------------------------------ */
/* Sub-komponen kecil                                                  */
/* ------------------------------------------------------------------ */

function SectionHeading({ icon: Icon, title, desc }: { icon: LucideIcon; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 ring-1 ring-slate-200">
        <Icon className="size-4.5 text-slate-600" />
      </div>
      <div>
        <h2 className="text-base font-semibold tracking-tight text-slate-900">{title}</h2>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}

/** Konektor alur: panah ke bawah di mobile, ke kanan di md/lg ke atas. */
function FlowArrow({ at = "md" }: { at?: "md" | "lg" }) {
  const downCls = at === "md" ? "md:hidden" : "lg:hidden";
  const rightCls = at === "md" ? "hidden md:block" : "hidden lg:block";
  return (
    <div className="flex shrink-0 items-center justify-center py-1 md:py-0 lg:py-0 md:px-1">
      <ArrowDown className={cn("size-4 text-slate-400", downCls)} />
      <ArrowRight className={cn("size-4 text-slate-400", rightCls)} />
    </div>
  );
}

/** Satu kotak langkah pada diagram alur. */
function FlowStep({
  step,
  title,
  desc,
  tone = "slate",
  badge,
  children,
}: {
  step: string;
  title: string;
  desc?: string;
  tone?: Tone;
  badge?: string;
  children?: ReactNode;
}) {
  const t = FLOW_TONES[tone];
  return (
    <div className={cn("flex-1 rounded-xl border p-3.5 shadow-sm", t.card)}>
      <div className="flex items-center gap-2">
        <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold", t.chip)}>
          {step}
        </span>
        <span className="text-sm font-semibold leading-tight text-slate-900">{title}</span>
        {badge && <Badge className={cn("ml-auto hidden sm:inline-flex", t.badge)}>{badge}</Badge>}
      </div>
      {desc && <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{desc}</p>}
      {children}
    </div>
  );
}

/** Chip tahapan funnel kecil (memakai kontrak LEAD_STAGES). */
function FunnelMini() {
  const stages = LEAD_STAGES.filter((s) => s !== "LOST");
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      {stages.map((s, i) => (
        <span key={s} className="flex items-center gap-1">
          <Badge className={cn("px-1.5 py-0 text-[10px]", LEAD_STAGE_BADGE[s])}>{LEAD_STAGE_LABEL[s]}</Badge>
          {i < stages.length - 1 && <ArrowRight className="size-3 shrink-0 text-slate-400" />}
        </span>
      ))}
    </div>
  );
}

/** Item FAQ memakai <details> native HTML yang distyle rapi. */
function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="group rounded-xl border border-slate-200 bg-white open:shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
        <span>{q}</span>
        <ChevronDown className="size-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-slate-100 px-4 py-3 text-sm leading-relaxed text-slate-600">{a}</div>
    </details>
  );
}

/* ------------------------------------------------------------------ */
/* View utama                                                          */
/* ------------------------------------------------------------------ */

export default function GuideView({ user }: { user: SessionUser }) {
  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-slate-950 px-5 py-6 sm:px-8 sm:py-8">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{ backgroundImage: "radial-gradient(rgba(148,163,184,0.25) 1px, transparent 1px)", backgroundSize: "18px 18px" }}
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 ring-1 ring-emerald-400/30">
            <BookOpen className="size-6 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
              Petunjuk Penggunaan — CRM UDP
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              PT. Unicam Digital Pictvres · Unimasi · Segia Tech · Erfo Multimedia · Unicam Studio
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge className="border-slate-700 bg-slate-800/80 text-slate-200">4 Kanal Masuk</Badge>
              <Badge className="border-slate-700 bg-slate-800/80 text-slate-200">SLA Balas 2 Jam</Badge>
              <Badge className="border-emerald-500/40 bg-emerald-500/15 text-emerald-300">PRJ &amp; Invoice Otomatis</Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs per bab */}
      <Tabs defaultValue="alur" className="gap-4">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 sm:flex sm:flex-row">
          <TabsTrigger value="alur" className="w-full gap-1.5 sm:w-auto sm:flex-1">
            <Route className="size-4" /> Alur Sistem
          </TabsTrigger>
          <TabsTrigger value="peran" className="w-full gap-1.5 sm:w-auto sm:flex-1">
            <Users className="size-4" /> Per Peran
          </TabsTrigger>
          <TabsTrigger value="menu" className="w-full gap-1.5 sm:w-auto sm:flex-1">
            <LayoutGrid className="size-4" /> Menu &amp; Fitur
          </TabsTrigger>
          <TabsTrigger value="faq" className="w-full gap-1.5 sm:w-auto sm:flex-1">
            <HelpCircle className="size-4" /> FAQ
          </TabsTrigger>
        </TabsList>

        {/* ------------------------- Alur Sistem ------------------------- */}
        <TabsContent value="alur" className="mt-2 space-y-4">
          <SectionHeading
            icon={Route}
            title="Alur Sistem End-to-End"
            desc="Ikuti jalur lead: dari pesan masuk di kanal sampai lunas & serah terima — sebagian langkah otomatis oleh sistem."
          />
          <Card className="rounded-2xl">
            <CardContent className="pt-1">
              {/* Legenda */}
              <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-500">
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-slate-900" /> Langkah tim (manual)</span>
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-emerald-600" /> Otomatis oleh sistem</span>
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-amber-500" /> Titik keputusan</span>
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-rose-400" /> Cabang tidak disetujui</span>
              </div>

              {/* Baris 1: masuk → funnel → penawaran */}
              <div className="flex flex-col md:flex-row md:items-stretch">
                <FlowStep
                  step="1"
                  title="Kanal Masuk"
                  desc="Pesan prospek datang dari WhatsApp, Email, Instagram DM, atau Form Web di website brand."
                />
                <FlowArrow />
                <FlowStep
                  step="2"
                  title="Inbox Lead"
                  desc="Semua pesan terkumpul di satu inbox — balas pesan pertama maksimal ≤ SLA 2 jam."
                />
                <FlowArrow />
                <FlowStep step="3" title="Funnel Pipeline" desc="Kualifikasi dan geser lead melalui tahapan funnel:">
                  <FunnelMini />
                </FlowStep>
                <FlowArrow />
                <FlowStep
                  step="4"
                  title="Brief & Estimasi"
                  desc="Marketing membuat brief dari lead terkualifikasi, lalu Produksi menghitung estimasi jam & biaya."
                />
                <FlowArrow />
                <FlowStep
                  step="5"
                  title="Penawaran QT"
                  desc="Finance menyusun penawaran (QT) memakai estimasi produksi sebagai dasar harga, lalu mengirimkannya ke klien."
                />
              </div>

              <div className="flex justify-center py-1">
                <ArrowDown className="size-4 text-slate-400" />
              </div>

              {/* Baris 2: keputusan → otomatis → produksi → lunas */}
              <div className="flex flex-col lg:flex-row lg:items-stretch">
                <FlowStep
                  step="6"
                  title="Disetujui?"
                  tone="amber"
                  desc="Keputusan klien atas penawaran QT yang dikirim."
                >
                  <div className="mt-2 space-y-1 text-[11px] font-medium">
                    <p className="flex items-center gap-1 text-emerald-700">
                      <CheckCircle2 className="size-3 shrink-0" /> Ya → lanjut ke langkah 7 (otomatis)
                    </p>
                    <p className="flex items-center gap-1 text-rose-600">
                      <XCircle className="size-3 shrink-0" /> Tidak → cabang &quot;Tandai Hilang&quot; (lihat bawah)
                    </p>
                  </div>
                </FlowStep>
                <FlowArrow at="lg" />
                <FlowStep
                  step="7"
                  title="Proyek PRJ + Milestone"
                  tone="emerald"
                  badge="OTOMATIS"
                  desc="Sistem membuat Proyek PRJ, menghubungkan brief, milestone default, dan Invoice DP 50%."
                />
                <FlowArrow at="lg" />
                <FlowStep
                  step="8"
                  title="Produksi + File"
                  desc="Tim mengerjakan milestone berbobot dan mengirim file produksi / link Google Drive — tampil di Portal Klien."
                />
                <FlowArrow at="lg" />
                <FlowStep
                  step="9"
                  title="Invoice Pelunasan"
                  desc="Finance menerbitkan invoice pelunasan dan mencatat pembayarannya."
                />
                <FlowArrow at="lg" />
                <FlowStep
                  step="10"
                  title="Lunas & Serah Terima"
                  tone="emerald"
                  desc="Invoice lunas, proyek berstatus Selesai, file final diserahkan via Portal."
                />
              </div>

              <div className="flex justify-center py-1">
                <ArrowDown className="size-4 text-rose-400" />
              </div>

              {/* Cabang TIDAK */}
              <div className="rounded-xl border border-dashed border-rose-300 bg-rose-50/70 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="border-rose-200 bg-rose-100 text-rose-700">TIDAK</Badge>
                  <span className="text-sm font-semibold text-slate-900">Tandai Hilang + alasan</span>
                  <span className="text-xs text-slate-500">(cabang dari langkah 5 — Disetujui?)</span>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                  Pilih alasan: Harga, Kompetitor, Budget tidak ada, Timing, Tidak ada balasan, atau Lainnya.
                  Lead keluar dari pipeline dan ikut terhitung dalam laporan konversi funnel.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------- Per Peran --------------------------- */}
        <TabsContent value="peran" className="mt-2 space-y-4">
          <SectionHeading
            icon={Users}
            title="Panduan Per Peran"
            desc="Menu yang bisa diakses dan tanggung jawab utama tiap peran. Peran Anda ditandai hijau."
          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {ROLE_GUIDES.map((r) => {
              const isMe = r.role === user.role;
              const Icon = r.icon;
              return (
                <Card key={r.role} className={cn("rounded-2xl", isMe && "border-emerald-300 ring-2 ring-emerald-500/50")}>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className={cn("flex size-9 items-center justify-center rounded-xl ring-1", isMe ? "bg-emerald-100 ring-emerald-200" : "bg-slate-100 ring-slate-200")}>
                          <Icon className={cn("size-4.5", isMe ? "text-emerald-700" : "text-slate-600")} />
                        </div>
                        <CardTitle className="text-sm">{ROLE_LABEL[r.role]}</CardTitle>
                      </div>
                      {isMe && (
                        <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800">Peran Anda</Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Menu yang bisa diakses</p>
                      <ul className="mt-1.5 space-y-1">
                        {r.menus.map((m) => (
                          <li key={m} className="flex items-start gap-1.5 text-sm text-slate-700">
                            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                            <span>{m}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tanggung jawab utama</p>
                      <ul className="mt-1.5 space-y-1">
                        {r.duties.map((d) => (
                          <li key={d} className="flex items-start gap-1.5 text-sm text-slate-600">
                            <span className="mt-2 size-1 shrink-0 rounded-full bg-slate-400" />
                            <span>{d}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ------------------------- Menu & Fitur ------------------------ */}
        <TabsContent value="menu" className="mt-2 space-y-4">
          <SectionHeading
            icon={LayoutGrid}
            title="Menu & Fitur"
            desc="Cara memakai tiap menu — langkah demi langkah yang konkret."
          />
          <div className="grid gap-4 md:grid-cols-2">
            {MENU_GUIDES.map((m) => {
              const Icon = m.icon;
              return (
                <Card key={m.name} className="rounded-2xl">
                  <CardHeader>
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 ring-1 ring-slate-200">
                        <Icon className="size-4.5 text-slate-600" />
                      </div>
                      <div>
                        <CardTitle className="text-sm">{m.name}</CardTitle>
                        <CardDescription className="mt-0.5 text-xs leading-relaxed">{m.desc}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ol className="space-y-2">
                      {m.steps.map((s, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-sm text-slate-600">
                          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">
                            {i + 1}
                          </span>
                          <span className="leading-relaxed">{s}</span>
                        </li>
                      ))}
                    </ol>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ---------------------------- FAQ ------------------------------ */}
        <TabsContent value="faq" className="mt-2 space-y-4">
          <SectionHeading
            icon={HelpCircle}
            title="Pertanyaan Umum (FAQ)"
            desc="Jawaban singkat atas pertanyaan yang paling sering muncul. Klik untuk membuka."
          />
          <Card className="rounded-2xl">
            <CardContent className="space-y-2">
              {FAQS.map((f) => (
                <FaqItem key={f.q} q={f.q} a={f.a} />
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Kotak tips emerald */}
      <Card className="rounded-2xl border-emerald-200 bg-emerald-50/60">
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-100 ring-1 ring-emerald-200">
              <Lightbulb className="size-4.5 text-emerald-700" />
            </div>
            <div>
              <CardTitle className="text-base text-emerald-900">Tips Praktis</CardTitle>
              <CardDescription className="text-emerald-800/70">Empat kebiasaan kecil yang menjaga CRM UDP tetap sehat.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {TIPS.map((t, i) => (
              <div key={t.title} className="flex items-start gap-3 rounded-xl border border-emerald-200/80 bg-white/70 p-3.5">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-xs font-bold text-white">
                  {i + 1}
                </span>
                <div>
                  <p className="text-sm font-semibold text-emerald-900">{t.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-emerald-800/80">{t.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <p className="pb-2 text-center text-xs text-slate-400">
        Panduan resmi sistem CRM UDP — PT. Unicam Digital Pictvres. Halaman ini diperbarui mengikuti perkembangan fitur.
      </p>
    </div>
  );
}
