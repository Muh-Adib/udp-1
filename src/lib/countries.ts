/**
 * Daftar negara untuk kontak lead — Indonesia default, lengkap kode telepon internasional
 * agar lead mancanegara tercatat dengan benar (negara + dial code).
 */

export interface Country {
  code: string; // ISO 3166-1 alpha-2
  name: string; // nama dalam bahasa Indonesia
  dial: string; // kode telepon tanpa "+"
  flag: string; // emoji bendera
}

export const COUNTRIES: Country[] = [
  { code: "ID", name: "Indonesia", dial: "62", flag: "🇮🇩" },
  { code: "SG", name: "Singapura", dial: "65", flag: "🇸🇬" },
  { code: "MY", name: "Malaysia", dial: "60", flag: "🇲🇾" },
  { code: "TH", name: "Thailand", dial: "66", flag: "🇹🇭" },
  { code: "PH", name: "Filipina", dial: "63", flag: "🇵🇭" },
  { code: "VN", name: "Vietnam", dial: "84", flag: "🇻🇳" },
  { code: "AU", name: "Australia", dial: "61", flag: "🇦🇺" },
  { code: "NZ", name: "Selandia Baru", dial: "64", flag: "🇳🇿" },
  { code: "JP", name: "Jepang", dial: "81", flag: "🇯🇵" },
  { code: "KR", name: "Korea Selatan", dial: "82", flag: "🇰🇷" },
  { code: "CN", name: "Tiongkok", dial: "86", flag: "🇨🇳" },
  { code: "HK", name: "Hong Kong", dial: "852", flag: "🇭🇰" },
  { code: "TW", name: "Taiwan", dial: "886", flag: "🇹🇼" },
  { code: "IN", name: "India", dial: "91", flag: "🇮🇳" },
  { code: "AE", name: "Uni Emirat Arab", dial: "971", flag: "🇦🇪" },
  { code: "SA", name: "Arab Saudi", dial: "966", flag: "🇸🇦" },
  { code: "QA", name: "Qatar", dial: "974", flag: "🇶🇦" },
  { code: "TR", name: "Turki", dial: "90", flag: "🇹🇷" },
  { code: "GB", name: "Inggris Raya", dial: "44", flag: "🇬🇧" },
  { code: "US", name: "Amerika Serikat", dial: "1", flag: "🇺🇸" },
  { code: "CA", name: "Kanada", dial: "1", flag: "🇨🇦" },
  { code: "DE", name: "Jerman", dial: "49", flag: "🇩🇪" },
  { code: "NL", name: "Belanda", dial: "31", flag: "🇳🇱" },
  { code: "FR", name: "Prancis", dial: "33", flag: "🇫🇷" },
  { code: "ES", name: "Spanyol", dial: "34", flag: "🇪🇸" },
  { code: "IT", name: "Italia", dial: "39", flag: "🇮🇹" },
  { code: "CH", name: "Swiss", dial: "41", flag: "🇨🇭" },
  { code: "SE", name: "Swedia", dial: "46", flag: "🇸🇪" },
  { code: "BR", name: "Brasil", dial: "55", flag: "🇧🇷" },
  { code: "ZA", name: "Afrika Selatan", dial: "27", flag: "🇿🇦" },
];

export const DEFAULT_COUNTRY = "Indonesia";

export function findCountry(name: string | null | undefined): Country {
  return COUNTRIES.find((c) => c.name === name) ?? COUNTRIES[0];
}

/**
 * Normalisasi nomor telepon lintas negara ke digit murni (tanpa "+").
 * - "0" awalan (format lokal Indonesia) → 62
 * - Selain itu digit dipertahankan apa adanya (mis. 442079460958 untuk UK)
 */
export function normalizePhoneGlobal(p?: string | null): string | null {
  if (!p) return null;
  const digits = p.replace(/[^0-9]/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
}

/** Tampilan ramah: 628123456789 → +62 812-3456-789 (best effort, aman untuk semua negara). */
export function formatPhoneDisplay(digits?: string | null): string {
  if (!digits) return "";
  const d = digits.replace(/[^0-9]/g, "");
  if (!d) return digits;
  // Indonesia: +62 8xx-xxxx-xxxx(…)
  if (d.startsWith("62") && d.length >= 10) {
    const rest = d.slice(2);
    if (rest.length >= 9) return `+62 ${rest.slice(0, 3)}-${rest.slice(3, 7)}-${rest.slice(7)}`;
    return `+62 ${rest}`;
  }
  if (d.length >= 8) return `+${d}`;
  return d;
}
