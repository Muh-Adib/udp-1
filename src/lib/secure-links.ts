/**
 * Utilitas Secure Link — distribusi dokumen (penawaran, brief, file produksi)
 * melalui tautan aman + password. Password diverifikasi server (scrypt), tidak
 * pernah dikirim ulang. Setelah akses valid, cookie grant singkat memungkinkan
 * unduhan file tanpa menulis password di URL.
 */
import { createHmac, randomBytes } from "crypto";

const SECRET = process.env.SESSION_SECRET || "udp-dev-secret-change-me";

/** URL bagian token: /s/<token> — relative path (gateway preview). */
export function secureLinkPath(token: string): string {
  return `/s/${token}`;
}

/** Token URL-safe acak (≈24 karakter, tanpa karakter ambigu). */
export function generateToken(): string {
  const raw = randomBytes(18).toString("base64url").replace(/[-_]/g, "");
  return raw.slice(0, 22);
}

/** Password otomatis yang mudah dibaca/dikirim via chat (tanpa 0/O/1/l/I). */
export function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i] % alphabet.length];
  return out.slice(0, 4) + "-" + out.slice(4);
}

/** Cookie grant setelah password terverifikasi (berlaku 4 jam). */
export function grantCookieName(token: string): string {
  return `sl_${token.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20)}`;
}

export function grantValue(token: string): string {
  return createHmac("sha256", SECRET).update(`secure:${token}`).digest("base64url");
}

export function grantMaxAgeSeconds(): number {
  return 60 * 60 * 4;
}

/** Verifikasi cookie grant pada endpoint unduhan file. */
export function verifyGrant(token: string, cookieValue: string | undefined): boolean {
  return !!cookieValue && cookieValue === grantValue(token);
}

/** Pesan ajakan berisi tautan + password — siap salin ke WhatsApp/Email/IG. */
export function buildShareMessage(docTitle: string, url: string, password: string, senderName?: string | null): string {
  return [
    `Dokumen: ${docTitle}`,
    "",
    `Buka via tautan aman: ${url}`,
    `Password: ${password}`,
    "",
    "Tautan ini bersifat pribadi — mohon tidak diteruskan ke pihak lain.",
    senderName ? `Terima kasih, ${senderName}` : "Terima kasih.",
  ].join("\n");
}
