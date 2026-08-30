import { db } from "@/lib/db";
import type { BrandProfile } from "@prisma/client";
import type { BrandProfileDTO } from "@/lib/crm-types";

/** Profil default — dipakai untuk auto-create saat pertama kali diakses (tanpa perlu seed ulang). */
export const DEFAULT_BRAND_PROFILES: Record<
  string,
  {
    name: string;
    tagline: string;
    address: string;
    phone: string;
    email: string;
    website: string;
    primaryColor: string;
    letterheadNote: string;
    footerNote: string;
    bankInfo: string;
  }
> = {
  unimasi: {
    name: "Unimasi",
    tagline: "Media & Activation",
    address: "Jl. Cendrawasih No. 21, Kebayoran Baru, Jakarta Selatan 12180",
    phone: "+62 21 5150 3311",
    email: "halo@unimasi.id",
    website: "www.unimasi.id",
    primaryColor: "#059669",
    letterheadNote: "Bagian dari PT. Unicam Digital Pictvres",
    footerNote: "Unimasi — divisi media & activation PT. Unicam Digital Pictvres",
    bankInfo: "BCA 5410 112 899 a/n PT. Unicam Digital Pictvres",
  },
  segia: {
    name: "Segia Tech",
    tagline: "Digital Agency & Performance",
    address: "Jl. Gatot Subroto Kav. 45, Gumaya Tower Lt. 12, Semarang 50249",
    phone: "+62 24 7610 8842",
    email: "hello@segia.tech",
    website: "www.segia.tech",
    primaryColor: "#0D9488",
    letterheadNote: "Bagian dari PT. Unicam Digital Pictvres",
    footerNote: "Segia Tech — divisi digital agency PT. Unicam Digital Pictvres",
    bankInfo: "Mandiri 1230 009 887 21 a/n PT. Unicam Digital Pictvres",
  },
  erfo: {
    name: "Erfo Multimedia",
    tagline: "Event & Creative Production",
    address: "Jl. Diponegoro No. 88, Dago, Bandung 40115",
    phone: "+62 22 2504 7788",
    email: "info@erfo.id",
    website: "www.erfo.id",
    primaryColor: "#D97706",
    letterheadNote: "Bagian dari PT. Unicam Digital Pictvres",
    footerNote: "Erfo Multimedia — divisi event & production PT. Unicam Digital Pictvres",
    bankInfo: "BNI 088 4451 221 a/n PT. Unicam Digital Pictvres",
  },
  unicam: {
    name: "Unicam Studio",
    tagline: "Video & Content Studio",
    address: "Jl. Kalibata Raya No. 10, Pancoran, Jakarta Selatan 12740",
    phone: "+62 21 7980 1120",
    email: "studio@unicam.co.id",
    website: "www.unicam.co.id",
    primaryColor: "#7C3AED",
    letterheadNote: "Bagian dari PT. Unicam Digital Pictvres",
    footerNote: "Unicam Studio — divisi video & content PT. Unicam Digital Pictvres",
    bankInfo: "BRI 0341 0100 2299 a/n PT. Unicam Digital Pictvres",
  },
};

/** Ambil semua profil brand; buat otomatis dengan nilai default bila belum ada. */
export async function getOrCreateBrandProfiles(): Promise<BrandProfile[]> {
  for (const [brand, def] of Object.entries(DEFAULT_BRAND_PROFILES)) {
    await db.brandProfile.upsert({
      where: { brand },
      update: {},
      create: { brand, ...def },
    });
  }
  const rows = await db.brandProfile.findMany({ orderBy: { createdAt: "asc" } });
  // Urutkan sesuai BRANDS agar UI stabil: unimasi, segia, erfo, unicam
  const order = ["unimasi", "segia", "erfo", "unicam"];
  return rows.sort((a, b) => order.indexOf(a.brand) - order.indexOf(b.brand));
}

export function mapBrandProfile(b: BrandProfile): BrandProfileDTO {
  return {
    brand: b.brand,
    name: b.name,
    tagline: b.tagline,
    logoUrl: b.logoPath ? `/api/brands/${b.brand}/logo?v=${b.updatedAt.getTime()}` : null,
    address: b.address,
    phone: b.phone,
    email: b.email,
    website: b.website,
    primaryColor: b.primaryColor,
    letterheadNote: b.letterheadNote,
    footerNote: b.footerNote,
    bankInfo: b.bankInfo,
  };
}

/** Ambil satu profil brand (auto-create bila belum ada). */
export async function getBrandProfile(brand: string): Promise<BrandProfile | null> {
  const all = await getOrCreateBrandProfiles();
  return all.find((b) => b.brand === brand) ?? null;
}
