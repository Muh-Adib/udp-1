import SecureDocView from "@/components/secure-doc-view";

/**
 * Halaman PUBLIK tautan aman: /s/<token>
 * Klien membuka dokumen (penawaran, brief, file produksi) tanpa login —
 * cukup password dari pengirim. Dipakai bersama "Kirim Dokumen (Secure Link)".
 */
export default async function SecureLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SecureDocView token={token} />;
}
